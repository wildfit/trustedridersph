/**
 * Server functions for the first-sign-in wizard.
 * All run as the authenticated driver via requireSupabaseAuth — RLS applies.
 * Password changes need supabaseAdmin (the user's Supabase client cannot
 * call updateUser without re-auth on every refresh), so those go through
 * the admin client but are scoped to the caller's own auth.uid().
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------------------------------------------------------------------
// Step 1 — change password.
// ---------------------------------------------------------------------------
export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ newPassword: z.string().min(6).max(72) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Step 2 — save security questions + answers (answers stored hashed).
// ---------------------------------------------------------------------------
export const saveSecurityAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        answers: z
          .array(
            z.object({
              questionId: z.string().uuid(),
              answer: z.string().min(1).max(200),
            }),
          )
          .min(2)
          .max(5),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Clear previous answers (in case the user is re-running setup).
    await supabaseAdmin.from("user_security_answers").delete().eq("user_id", userId);

    // Hash each answer via pgcrypto and insert.
    const rows: { user_id: string; question_id: string; answer_hash: string }[] = [];
    for (const a of data.answers) {
      const { data: hash, error } = await supabaseAdmin.rpc(
        "hash_security_answer",
        { _answer: a.answer },
      );
      if (error) throw new Error(error.message);
      rows.push({ user_id: userId, question_id: a.questionId, answer_hash: hash as string });
    }
    const { error: insErr } = await supabaseAdmin
      .from("user_security_answers")
      .insert(rows);
    if (insErr) throw new Error(insErr.message);

    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Step 3 — bike details, and mark wizard complete.
// ---------------------------------------------------------------------------
export const completeBikeSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        fuelTankLiters: z.number().min(1).max(40),
        motorcycleBrand: z.string().min(1).max(60),
        motorcycleModel: z.string().min(1).max(60),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { error } = await supabase
      .from("profiles")
      .update({
        fuel_tank_liters: data.fuelTankLiters,
        motorcycle_brand: data.motorcycleBrand,
        motorcycle_model: data.motorcycleModel,
        first_sign_in_completed: true,
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
