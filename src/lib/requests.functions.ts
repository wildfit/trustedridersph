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

/** Admin/superadmin: list every request, newest first. */
export const listAllRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: z.enum(["pending", "approved", "rejected", "all"]).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId);
    const r = (roles ?? []).map((x) => x.role);
    if (!r.includes("admin") && !r.includes("superadmin")) {
      throw new Error("Forbidden");
    }

    let q = supabaseAdmin
      .from("user_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const driverIds = [...new Set((rows ?? []).map((x) => x.driver_id))];
    const { data: profs } = driverIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, full_name, phone, motorcycle_brand, motorcycle_model, fuel_tank_liters, access_ends_at")
          .in("id", driverIds)
      : { data: [] as Array<{ id: string; full_name: string | null; phone: string | null; motorcycle_brand: string | null; motorcycle_model: string | null; fuel_tank_liters: number | null; access_ends_at: string | null }> };
    const byId = new Map((profs ?? []).map((p) => [p.id, p]));

    return (rows ?? []).map((row) => ({
      ...row,
      driver: byId.get(row.driver_id) ?? null,
    }));
  });

/** Admin/superadmin: approve or reject a request. Approving a profile_change
 *  applies the proposed values to the driver's profile. Approving a resubscribe
 *  extends access_ends_at by 30 days from today. */
export const resolveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["approve", "reject"]),
        adminNote: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId);
    const r = (roles ?? []).map((x) => x.role);
    if (!r.includes("admin") && !r.includes("superadmin")) {
      throw new Error("Forbidden");
    }

    const { data: req, error: rErr } = await supabaseAdmin
      .from("user_requests").select("*").eq("id", data.id).maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error("Already resolved");

    if (data.action === "approve") {
      if (req.type === "profile_change" && req.proposed) {
        const proposed = req.proposed as Record<string, unknown>;
        const allowed: Record<string, unknown> = {};
        for (const k of [
          "full_name", "phone", "motorcycle_brand",
          "motorcycle_model", "fuel_tank_liters",
        ]) {
          if (k in proposed) allowed[k] = proposed[k];
        }
        if (Object.keys(allowed).length) {
          const { error: uErr } = await supabaseAdmin
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from("profiles").update(allowed as any).eq("id", req.driver_id);
          if (uErr) throw new Error(uErr.message);
        }
      }
      if (req.type === "resubscribe") {
        const newEnd = new Date();
        newEnd.setDate(newEnd.getDate() + 30);
        const { error: uErr } = await supabaseAdmin
          .from("profiles")
          .update({
            is_enabled: true,
            access_mode: "subscription",
            access_ends_at: newEnd.toISOString(),
          })
          .eq("id", req.driver_id);
        if (uErr) throw new Error(uErr.message);
      }
    }

    const { error: upErr } = await supabaseAdmin
      .from("user_requests")
      .update({
        status: data.action === "approve" ? "approved" : "rejected",
        admin_note: data.adminNote ?? null,
        resolved_by: context.userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

/** Admin/superadmin: list drivers active in the last `withinMinutes` minutes. */
export const listLiveDrivers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ withinMinutes: z.number().min(1).max(1440).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId);
    const r = (roles ?? []).map((x) => x.role);
    if (!r.includes("admin") && !r.includes("superadmin")) {
      throw new Error("Forbidden");
    }
    const since = new Date();
    since.setMinutes(since.getMinutes() - (data.withinMinutes ?? 5));

    const { data: profs, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone, motorcycle_brand, motorcycle_model, last_seen_at")
      .gte("last_seen_at", since.toISOString())
      .order("last_seen_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (profs ?? []).map((p) => p.id);
    if (ids.length === 0) return [];

    // attach active shift (if any)
    const { data: shifts } = await supabaseAdmin
      .from("shifts")
      .select("id, driver_id, started_at, ended_at")
      .in("driver_id", ids)
      .is("ended_at", null);
    const activeByDriver = new Map((shifts ?? []).map((s) => [s.driver_id, s]));

    return (profs ?? []).map((p) => ({
      ...p,
      active_shift: activeByDriver.get(p.id) ?? null,
    }));
  });
