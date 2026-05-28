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
      questions: (rows ?? []).map((r) => {
        const sq = r.security_questions as unknown as
          | { question_text: string }
          | { question_text: string }[]
          | null;
        const text = Array.isArray(sq) ? sq[0]?.question_text : sq?.question_text;
        return { id: r.question_id as string, text: text ?? "" };
      }),
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
// ---------------------------------------------------------------------------
// Seed the Superadmin account.
// Requires the caller to supply the SUPERADMIN_DEFAULT_PASSWORD secret value
// as a bootstrap token, so this endpoint cannot be invoked anonymously by
// internet callers. Idempotent.
// ---------------------------------------------------------------------------
export const ensureSuperadminSeeded = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ bootstrapToken: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const password = process.env.SUPERADMIN_DEFAULT_PASSWORD;
    if (!password) {
      return { ok: false as const, reason: "missing-secret" as const };
    }
    if (data.bootstrapToken !== password) {
      return { ok: false as const, reason: "forbidden" as const };
    }

    const email =
      (await getSetting<string>("superadmin_email")) ?? "admin@trustedriders.ph";
    const username =
      (await getSetting<string>("superadmin_username")) ?? "Admin";

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

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "superadmin" }, { onConflict: "user_id,role" });

    await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: userId, full_name: username, first_sign_in_completed: true },
        { onConflict: "id" },
      );

    // Do not return the user id — callers don't need it and exposing it
    // leaks the admin account identifier.
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Seed two sample driver accounts. Admin/superadmin only; never returns the
// plaintext password in the response.
// ---------------------------------------------------------------------------
export const seedSampleDrivers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Authorize: caller must be admin/superadmin.
    const { data: roleRows, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleErr) throw new Error(roleErr.message);
    const roles = (roleRows ?? []).map((r) => r.role);
    if (!roles.includes("admin") && !roles.includes("superadmin")) {
      throw new Error("Forbidden");
    }

    const password =
      (await getSetting<string>("default_driver_password")) ?? "Welcome312";

    const samples = [
      { email: "driver1@trustedriders.ph", full_name: "Juan dela Cruz" },
      { email: "driver2@trustedriders.ph", full_name: "Maria Santos" },
    ];

    const { data: list, error: listErr } =
      await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) throw new Error(listErr.message);

    const results: { email: string; created: boolean }[] = [];
    for (const s of samples) {
      const existing = list.users.find(
        (u) => u.email?.toLowerCase() === s.email.toLowerCase(),
      );
      if (existing) {
        results.push({ email: s.email, created: false });
        continue;
      }
      const { data: _created, error } = await supabaseAdmin.auth.admin.createUser({
        email: s.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: s.full_name },
      });
      if (error) throw new Error(error.message);
      results.push({ email: s.email, created: true });
    }

    // Do NOT return the plaintext default password. Admins can retrieve/rotate
    // it through dedicated admin settings endpoints.
    return { ok: true as const, drivers: results };
  });

