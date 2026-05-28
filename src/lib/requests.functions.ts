/**
 * Driver-facing server functions for profile-change & resubscribe requests,
 * and a presence heartbeat used by the admin Live View.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ProposedSchema = z
  .object({
    full_name: z.string().min(1).max(120).optional(),
    phone: z.string().min(1).max(40).optional(),
    motorcycle_brand: z.string().max(80).optional(),
    motorcycle_model: z.string().max(80).optional(),
    fuel_tank_liters: z.number().min(0).max(100).optional(),
  })
  .strict();

export const submitProfileChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        proposed: ProposedSchema,
        message: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("user_requests").insert({
      driver_id: context.userId,
      type: "profile_change",
      proposed: data.proposed,
      message: data.message ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitResubscribeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ message: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("user_requests").insert({
      driver_id: context.userId,
      type: "resubscribe",
      message: data.message ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("user_requests")
      .select("*")
      .eq("driver_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Presence heartbeat. Called periodically by the driver UI. */
export const heartbeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await supabaseAdmin
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", context.userId);
    return { ok: true };
  });
