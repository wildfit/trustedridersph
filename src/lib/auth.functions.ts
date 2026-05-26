/**
 * Server functions for auth flows that need elevated privileges:
 *  - reading the default driver password from app_settings
 *  - looking up which security questions a user picked (by email)
 *  - verifying hashed security answers
 *  - resetting a user's password back to the default
 *  - seeding the superadmin account on first boot
 *
 * All of these use the admin Supabase client and the service-role key —
 * which is why they live in a server function and NEVER in the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------------------------------------------------------------------
// Helper: read a value from app_settings (server-only).
// ---------------------------------------------------------------------------
async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.value as T) ?? null;
}

// ---------------------------------------------------------------------------
// Look up a user's chosen security questions by email.
// Returns a generic empty list if the user does not exist — never leaks PII.
// ---------------------------------------------------------------------------
export const getSecurityQuestionsForEmail = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().email().max(255) }).parse(d))
  .handler(async ({ data }) => {
    // Find user id by email via admin listUsers (filtered server-side)
    const { data: list, error: listErr } =
      await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) throw new Error(listErr.message);
    const user = list.users.find(
      (u) => u.email?.toLowerCase() === data.email.toLowerCase(),
    );
    if (!user) return { userId: null, questions: [] as { id: string; text: string }[] };

    const { data: rows, error } = await supabaseAdmin
      .from("user_security_answers")
      .select("question_id, security_questions(question_text)")
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);

    return {
      userId: user.id,
      questions: (rows ?? []).map((r) => ({
        id: r.question_id as string,
        // @ts-expect-error — joined column shape
        text: r.security_questions?.question_text as string,
      })),
    };
  });

// ---------------------------------------------------------------------------
// Verify the user's security answers. If all correct, reset their password
// to the configured default and clear first_sign_in_completed so they're
// forced through the setup wizard again.
// ---------------------------------------------------------------------------
export const resetPasswordWithAnswers = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        answers: z
          .array(
            z.object({
              questionId: z.string().uuid(),
              answer: z.string().min(1).max(200),
            }),
          )
          .min(1)
          .max(10),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    // Load this user's stored hashes
    const { data: stored, error } = await supabaseAdmin
      .from("user_security_answers")
      .select("question_id, answer_hash")
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    if (!stored || stored.length === 0) {
      return { ok: false, reason: "no-questions" as const };
    }

    // Verify each provided answer against the stored hash via pgcrypto.
    for (const provided of data.answers) {
      const row = stored.find((s) => s.question_id === provided.questionId);
      if (!row) return { ok: false, reason: "wrong" as const };
      const { data: ok, error: vErr } = await supabaseAdmin.rpc(
        "verify_security_answer",
        { _answer: provided.answer, _hash: row.answer_hash },
      );
      if (vErr) throw new Error(vErr.message);
      if (!ok) return { ok: false, reason: "wrong" as const };
    }

    // All correct — reset to default password.
    const defaultPw =
      (await getSetting<string>("default_driver_password")) ?? "Welcome312";

    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      { password: defaultPw },
    );
    if (updErr) throw new Error(updErr.message);

    // Force them through first-sign-in wizard again.
    await supabaseAdmin
      .from("profiles")
      .update({ first_sign_in_completed: false })
      .eq("id", data.userId);

    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Seed the Superadmin account on first run.
// Reads SUPERADMIN_DEFAULT_PASSWORD from env (set as a project secret).
// Idempotent — safe to call multiple times.
// ---------------------------------------------------------------------------
export const ensureSuperadminSeeded = createServerFn({ method: "POST" }).handler(
  async () => {
    const email =
      (await getSetting<string>("superadmin_email")) ?? "admin@trustedriders.ph";
    const username =
      (await getSetting<string>("superadmin_username")) ?? "Admin";
    const password = process.env.SUPERADMIN_DEFAULT_PASSWORD;
    if (!password) {
      return { ok: false as const, reason: "missing-secret" as const };
    }

    // Already exists?
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const existing = list?.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );

    let userId: string;
    if (existing) {
      userId = existing.id;
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: username },
      });
      if (error) throw new Error(error.message);
      userId = created.user!.id;
    }

    // Ensure superadmin role is assigned.
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "superadmin" }, { onConflict: "user_id,role" });

    // Mark wizard complete for admin so they don't go through driver onboarding.
    await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: userId, full_name: username, first_sign_in_completed: true },
        { onConflict: "id" },
      );

    return { ok: true as const, userId };
  },
);
