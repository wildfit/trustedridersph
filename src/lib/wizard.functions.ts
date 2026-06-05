/**
 * Server functions for the first-sign-in wizard.
 *
 * Password changes are NOT in this file anymore — they happen client-side
 * via `supabase.auth.updateUser({ password })` so the user's session
 * remains valid (admin updateUserById would rotate the refresh token and
 * sign the user out mid-wizard, sending them through setup twice).
 *
 * The other steps run as the authenticated driver via requireSupabaseAuth.
 * `completeBikeSetup` writes `first_sign_in_completed` with the service-role
 * admin client because drivers no longer have direct write access to that
 * column (see profiles_guard_protected_columns trigger).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

    await supabaseAdmin.from("user_security_answers").delete().eq("user_id", userId);

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
// Step 3 — bike details, mark wizard complete.
// Uses supabaseAdmin so that first_sign_in_completed (a protected column)
// is writable even though the driver's own client can't update it.
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
    const { userId } = context;
    const { error } = await supabaseAdmin
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
