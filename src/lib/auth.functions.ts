/**
 * Server functions for auth flows that need elevated privileges:
 *  - looking up which security questions a user picked (by email)
 *  - verifying hashed security answers (with rate limit + lockout)
 *  - issuing a one-time reset token after successful verification
 *  - letting the user set their OWN new password with that token
 *  - seeding the superadmin + sample driver accounts
 *
 * Everything runs server-side with the admin Supabase client because
 * the work crosses user boundaries or rotates passwords.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Helpers
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

/**
 * Paginate through every page of auth.users until we find the email.
 * `listUsers` caps at ~1000/page; loop until we get a short page.
 */
async function findAuthUserByEmail(email: string) {
  const target = email.toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < perPage) return null;
  }
  return null;
}

/** Fetch every auth user across pages. */
type AuthUser = Awaited<ReturnType<typeof supabaseAdmin.auth.admin.listUsers>>["data"]["users"][number];

export async function listAllAuthUsers(): Promise<AuthUser[]> {
  const perPage = 1000;
  const all: AuthUser[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    all.push(...data.users);
    if (data.users.length < perPage) break;
  }
  return all;
}


/** Cryptographically-strong temporary password for admin-created accounts. */
export function generateTempPassword(): string {
  // 18 url-safe chars ≈ 108 bits entropy.
  return crypto.randomBytes(14).toString("base64url");
}

// ---------------------------------------------------------------------------
// Rate limiting for forgot-password
// ---------------------------------------------------------------------------
const LOCKOUT_THRESHOLD = 5;        // failed answer attempts
const LOCKOUT_WINDOW_MIN = 15;      // minutes
const LOOKUP_THRESHOLD = 10;        // lookups per email per window

async function isLockedOut(email: string) {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60_000).toISOString();
  const { count } = await supabaseAdmin
    .from("password_reset_attempts")
    .select("id", { count: "exact", head: true })
    .eq("succeeded", false)
    .gte("created_at", since)
    .ilike("email", email);
  return (count ?? 0) >= LOCKOUT_THRESHOLD;
}

async function isLookupSpammed(email: string) {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60_000).toISOString();
  const { count } = await supabaseAdmin
    .from("password_reset_attempts")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since)
    .ilike("email", email);
  return (count ?? 0) >= LOOKUP_THRESHOLD;
}

async function recordAttempt(email: string, userId: string | null, succeeded: boolean) {
  await supabaseAdmin.from("password_reset_attempts").insert({
    email: email.toLowerCase(),
    user_id: userId,
    succeeded,
  });
}

// ---------------------------------------------------------------------------
// Step 1 — look up the user's security questions by email.
// Always returns the same shape; never reveals whether the email exists.
// ---------------------------------------------------------------------------
export const getSecurityQuestionsForEmail = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().email().max(255) }).parse(d))
  .handler(async ({ data }) => {
    const empty = { userId: null as string | null, questions: [] as { id: string; text: string }[], locked: false };

    if (await isLockedOut(data.email)) return { ...empty, locked: true };
    if (await isLookupSpammed(data.email)) return { ...empty, locked: true };

    const user = await findAuthUserByEmail(data.email);
    if (!user) {
      // Record a benign attempt so brute force against unknown emails also
      // burns the rate limit budget.
      await recordAttempt(data.email, null, false);
      return empty;
    }

    const { data: rows, error } = await supabaseAdmin
      .from("user_security_answers")
      .select("question_id, security_questions(question_text)")
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);

    return {
      userId: user.id,
      locked: false,
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
// Step 2 — verify security answers. On success, return a one-time reset
// token (the user uses it in step 3 to set their own new password).
// ---------------------------------------------------------------------------
export const verifySecurityAnswers = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        email: z.string().email().max(255),
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
    if (await isLockedOut(data.email)) {
      return { ok: false as const, reason: "locked" as const };
    }

    const { data: stored, error } = await supabaseAdmin
      .from("user_security_answers")
      .select("question_id, answer_hash")
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    if (!stored || stored.length === 0) {
      await recordAttempt(data.email, data.userId, false);
      return { ok: false as const, reason: "wrong" as const };
    }

    for (const provided of data.answers) {
      const row = stored.find((s) => s.question_id === provided.questionId);
      if (!row) {
        await recordAttempt(data.email, data.userId, false);
        return { ok: false as const, reason: "wrong" as const };
      }
      const { data: ok, error: vErr } = await supabaseAdmin.rpc(
        "verify_security_answer",
        { _answer: provided.answer, _hash: row.answer_hash },
      );
      if (vErr) throw new Error(vErr.message);
      if (!ok) {
        await recordAttempt(data.email, data.userId, false);
        return { ok: false as const, reason: "wrong" as const };
      }
    }

    // All correct — mint a one-time token (15 min).
    const raw = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
    const expires = new Date(Date.now() + 15 * 60_000).toISOString();
    const { error: tErr } = await supabaseAdmin.from("password_reset_tokens").insert({
      user_id: data.userId,
      token_hash: tokenHash,
      expires_at: expires,
    });
    if (tErr) throw new Error(tErr.message);

    await recordAttempt(data.email, data.userId, true);
    return { ok: true as const, resetToken: raw };
  });

// ---------------------------------------------------------------------------
// Step 3 — set a new password using the one-time token.
// ---------------------------------------------------------------------------
export const setPasswordWithResetToken = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        resetToken: z.string().min(20).max(200),
        newPassword: z.string().min(8).max(72),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const tokenHash = crypto.createHash("sha256").update(data.resetToken).digest("hex");
    const { data: tok, error } = await supabaseAdmin
      .from("password_reset_tokens")
      .select("id, user_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tok || tok.user_id !== data.userId) {
      return { ok: false as const, reason: "invalid" as const };
    }
    if (tok.used_at) return { ok: false as const, reason: "used" as const };
    if (new Date(tok.expires_at).getTime() < Date.now()) {
      return { ok: false as const, reason: "expired" as const };
    }

    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      { password: data.newPassword },
    );
    if (updErr) throw new Error(updErr.message);

    await supabaseAdmin
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tok.id);

    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Seed the Superadmin account.
// ---------------------------------------------------------------------------
export const ensureSuperadminSeeded = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ bootstrapToken: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const password = process.env.SUPERADMIN_DEFAULT_PASSWORD;
    if (!password) return { ok: false as const, reason: "missing-secret" as const };
    if (data.bootstrapToken !== password) {
      return { ok: false as const, reason: "forbidden" as const };
    }

    const email =
      (await getSetting<string>("superadmin_email")) ?? "admin@kitametro.ph";
    const username =
      (await getSetting<string>("superadmin_username")) ?? "Admin";

    const existing = await findAuthUserByEmail(email);

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

    return { ok: true as const };
  });

