/**
 * Driver/admin messaging server functions for the `driver_messages` table.
 * Admin → driver only (one-way). Driver→admin uses requests.functions.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("admin") && !roles.includes("superadmin")) {
    throw new Error("Forbidden");
  }
}

// ---------- Admin: send message ----------
export const sendDriverMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        driverId: z.string().uuid(),
        subject: z.string().max(200).optional(),
        body: z.string().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("driver_messages")
      .insert({
        driver_id: data.driverId,
        sender_id: context.userId,
        subject: data.subject ?? null,
        body: data.body,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      entity_type: "driver_messages",
      entity_id: row.id,
      action: "send",
      before: null,
      after: { driver_id: data.driverId, subject: data.subject ?? null } as never,
    });
    return { ok: true, id: row.id };
  });

// ---------- Admin: list (optionally filtered by driver) ----------
export const listDriverMessagesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ driverId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("driver_messages")
      .select("id, driver_id, sender_id, subject, body, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.driverId) q = q.eq("driver_id", data.driverId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const driverIds = [...new Set((rows ?? []).map((r) => r.driver_id))];
    const { data: profs } = driverIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, full_name")
          .in("id", driverIds)
      : { data: [] as Array<{ id: string; full_name: string | null }> };
    const byId = new Map((profs ?? []).map((p) => [p.id, p.full_name ?? ""]));
    return (rows ?? []).map((r) => ({
      ...r,
      driver_name: byId.get(r.driver_id) ?? "Driver",
    }));
  });

// ---------- Driver: list own messages ----------
export const listMyMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("driver_messages")
      .select("id, sender_id, subject, body, created_at, read_at")
      .eq("driver_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- Driver: mark read ----------
export const markMessageRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("driver_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("driver_id", context.userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Driver: unread count ----------
export const unreadMessageCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await supabaseAdmin
      .from("driver_messages")
      .select("id", { count: "exact", head: true })
      .eq("driver_id", context.userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });
