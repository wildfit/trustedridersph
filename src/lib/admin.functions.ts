/**
 * Admin / Superadmin server functions. Every handler validates the caller
 * has 'admin' or 'superadmin' role; writes are recorded to public.audit_log.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateTempPassword, listAllAuthUsers } from "@/lib/auth.functions";


// ---------- helpers ----------
async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("admin") && !roles.includes("superadmin")) {
    throw new Error("Forbidden");
  }
  return { roles, isSuper: roles.includes("superadmin") };
}

async function logAudit(args: {
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
}) {
  await supabaseAdmin.from("audit_log").insert({
    actor_id: args.actorId,
    entity_type: args.entityType,
    entity_id: args.entityId,
    action: args.action,
    before: (args.before ?? null) as never,
    after: (args.after ?? null) as never,
  });
}

// ---------- current user role (for client gates) ----------
export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (data ?? []).map((r) => r.role);
    return {
      roles,
      isAdmin: roles.includes("admin") || roles.includes("superadmin"),
      isSuper: roles.includes("superadmin"),
    };
  });

// ============================================================
// DRIVERS
// ============================================================
export const listDrivers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    // driver user_ids
    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "driver");
    if (rErr) throw new Error(rErr.message);
    const ids = (roles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [];

    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, full_name, phone, motorcycle_brand, motorcycle_model, is_enabled, access_mode, access_starts_at, access_ends_at, first_sign_in_completed, created_at",
      )
      .in("id", ids)
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message);

    // emails via auth admin — paginate ALL pages.
    const users = await listAllAuthUsers();
    const emailById = new Map(users.map((u) => [u.id, u.email ?? ""]));


    return (profiles ?? []).map((p) => ({
      ...p,
      email: emailById.get(p.id) ?? "",
    }));
  });

export const setDriverEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ driverId: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: before } = await supabaseAdmin
      .from("profiles").select("is_enabled").eq("id", data.driverId).single();
    const { error } = await supabaseAdmin
      .from("profiles").update({ is_enabled: data.enabled }).eq("id", data.driverId);
    if (error) throw new Error(error.message);
    // Block sign-in by banning at the auth layer too.
    await supabaseAdmin.auth.admin.updateUserById(data.driverId, {
      ban_duration: data.enabled ? "none" : "876000h",
    });
    await logAudit({
      actorId: context.userId,
      entityType: "profile",
      entityId: data.driverId,
      action: data.enabled ? "enable" : "disable",
      before, after: { is_enabled: data.enabled },
    });
    return { ok: true };
  });

export const setDriverAccessWindow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        driverId: z.string().uuid(),
        mode: z.enum(["indefinite", "duration"]),
        startsAt: z.string().datetime().nullable().optional(),
        endsAt: z.string().datetime().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const patch = {
      access_mode: data.mode,
      access_starts_at: data.mode === "duration" ? data.startsAt ?? null : null,
      access_ends_at: data.mode === "duration" ? data.endsAt ?? null : null,
    };
    const { data: before } = await supabaseAdmin
      .from("profiles")
      .select("access_mode, access_starts_at, access_ends_at")
      .eq("id", data.driverId).single();
    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.driverId);
    if (error) throw new Error(error.message);
    await logAudit({
      actorId: context.userId, entityType: "profile", entityId: data.driverId,
      action: "access_window", before, after: patch,
    });
    return { ok: true };
  });

export const resetDriverPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ driverId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // Generate a unique random temp password per reset — no shared default.
    const tempPw = generateTempPassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.driverId, {
      password: tempPw,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("profiles").update({ first_sign_in_completed: false }).eq("id", data.driverId);
    await logAudit({
      actorId: context.userId, entityType: "profile", entityId: data.driverId,
      action: "reset_password",
    });
    return { ok: true, password: tempPw };
  });


export const createDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        email: z.string().email().max(255),
        full_name: z.string().min(1).max(120),
        phone: z.string().max(40).optional().nullable(),
        motorcycle_brand: z.string().max(80).optional().nullable(),
        motorcycle_model: z.string().max(80).optional().nullable(),
        fuel_tank_liters: z.number().positive().max(100).optional().nullable(),
        password: z.string().min(6).max(72).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Unique random temp password per driver (admin can also pass one explicitly).
    const tempPw = data.password || generateTempPassword();

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: tempPw,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, phone: data.phone ?? undefined },
    });
    if (error) throw new Error(error.message);

    const userId = created.user!.id;

    // handle_new_user trigger seeds default 'driver' role + profile row.
    // Patch profile with any additional fields supplied.
    await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: userId,
          full_name: data.full_name,
          phone: data.phone ?? null,
          motorcycle_brand: data.motorcycle_brand ?? null,
          motorcycle_model: data.motorcycle_model ?? null,
          fuel_tank_liters: data.fuel_tank_liters ?? null,
          first_sign_in_completed: false,
        },
        { onConflict: "id" },
      );

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "driver" }, { onConflict: "user_id,role" });

    await logAudit({
      actorId: context.userId, entityType: "profile", entityId: userId,
      action: "create_driver", after: { email: data.email, full_name: data.full_name },
    });
    return { ok: true, driverId: userId, password: tempPw };
  });

export const updateDriverProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        driverId: z.string().uuid(),
        full_name: z.string().min(1).max(120).optional(),
        phone: z.string().max(40).nullable().optional(),
        motorcycle_brand: z.string().max(80).nullable().optional(),
        motorcycle_model: z.string().max(80).nullable().optional(),
        fuel_tank_liters: z.number().positive().max(100).nullable().optional(),
        email: z.string().email().max(255).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { driverId, email, ...profilePatch } = data;

    const { data: before } = await supabaseAdmin
      .from("profiles").select("*").eq("id", driverId).single();

    if (Object.keys(profilePatch).length > 0) {
      const { error } = await supabaseAdmin
        .from("profiles").update(profilePatch).eq("id", driverId);
      if (error) throw new Error(error.message);
    }

    if (email) {
      const { error: eErr } = await supabaseAdmin.auth.admin.updateUserById(driverId, { email });
      if (eErr) throw new Error(eErr.message);
    }

    await logAudit({
      actorId: context.userId, entityType: "profile", entityId: driverId,
      action: "update_driver", before, after: { ...profilePatch, email },
    });
    return { ok: true };
  });

export const deleteDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ driverId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: before } = await supabaseAdmin
      .from("profiles").select("*").eq("id", data.driverId).single();

    // Wipe driver-owned rows first (no FK cascade configured).
    await supabaseAdmin.from("fee_entries").delete().eq("driver_id", data.driverId);
    await supabaseAdmin.from("fuel_logs").delete().eq("driver_id", data.driverId);
    await supabaseAdmin.from("trips").delete().eq("driver_id", data.driverId);
    await supabaseAdmin.from("shifts").delete().eq("driver_id", data.driverId);
    await supabaseAdmin.from("user_requests").delete().eq("driver_id", data.driverId);
    await supabaseAdmin.from("user_security_answers").delete().eq("user_id", data.driverId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.driverId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.driverId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.driverId);
    if (error) throw new Error(error.message);

    await logAudit({
      actorId: context.userId, entityType: "profile", entityId: data.driverId,
      action: "delete_driver", before,
    });
    return { ok: true };
  });

// ============================================================
// FEE CATEGORIES
// ============================================================
export const listFeeCategoriesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("fee_categories")
      .select("*")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertFeeCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(80),
        entry_type: z.enum(["income", "expense"]),
        is_active: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.id) {
      const { data: before } = await supabaseAdmin
        .from("fee_categories").select("*").eq("id", data.id).single();
      const { error } = await supabaseAdmin
        .from("fee_categories")
        .update({ name: data.name, entry_type: data.entry_type, is_active: data.is_active })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await logAudit({
        actorId: context.userId, entityType: "fee_category", entityId: data.id,
        action: "update", before, after: data,
      });
      return { ok: true, id: data.id };
    } else {
      const { data: row, error } = await supabaseAdmin
        .from("fee_categories")
        .insert({ name: data.name, entry_type: data.entry_type, is_active: data.is_active })
        .select("id").single();
      if (error) throw new Error(error.message);
      await logAudit({
        actorId: context.userId, entityType: "fee_category", entityId: row.id,
        action: "create", after: data,
      });
      return { ok: true, id: row.id };
    }
  });

export const deleteFeeCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: before } = await supabaseAdmin
      .from("fee_categories").select("*").eq("id", data.id).single();
    // Soft-delete by deactivating if used; hard delete otherwise.
    const { count } = await supabaseAdmin
      .from("fee_entries").select("id", { count: "exact", head: true }).eq("category_id", data.id);
    if (count && count > 0) {
      await supabaseAdmin.from("fee_categories").update({ is_active: false }).eq("id", data.id);
      await logAudit({
        actorId: context.userId, entityType: "fee_category", entityId: data.id,
        action: "deactivate", before,
      });
      return { ok: true, softDeleted: true };
    }
    const { error } = await supabaseAdmin.from("fee_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit({
      actorId: context.userId, entityType: "fee_category", entityId: data.id,
      action: "delete", before,
    });
    return { ok: true, softDeleted: false };
  });

// ============================================================
// APP SETTINGS
// ============================================================
export const listAppSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("app_settings").select("*").order("key");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertAppSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ key: z.string().min(1).max(80), value: z.unknown() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: data.key, value: data.value as never, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    await logAudit({
      actorId: context.userId, entityType: "app_setting", entityId: data.key as unknown as string,
      action: "upsert", after: { key: data.key, value: data.value },
    });
    return { ok: true };
  });

// ============================================================
// SHIFT RECORDS
// ============================================================
export const listShiftRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        driverId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("shifts")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(500);
    if (data.from) q = q.gte("started_at", data.from);
    if (data.to) q = q.lte("started_at", data.to);
    if (data.driverId) q = q.eq("driver_id", data.driverId);
    const { data: shifts, error } = await q;
    if (error) throw new Error(error.message);
    if (!shifts || shifts.length === 0) return { shifts: [], drivers: {} as Record<string, string> };

    const ids = [...new Set(shifts.map((s) => s.driver_id))];
    const { data: profs } = await supabaseAdmin
      .from("profiles").select("id, full_name").in("id", ids);
    const drivers = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name ?? ""]));

    const shiftIds = shifts.map((s) => s.id);
    const [tripsRes, fuelRes, feesRes] = await Promise.all([
      supabaseAdmin.from("trips").select("shift_id, distance_km, gross_fare_php").in("shift_id", shiftIds),
      supabaseAdmin.from("fuel_logs").select("shift_id, total_cost_php, liters").in("shift_id", shiftIds),
      supabaseAdmin
        .from("fee_entries")
        .select("shift_id, amount_php, category:fee_categories(entry_type)")
        .in("shift_id", shiftIds),
    ]);

    const totals = new Map<string, { tripDistance: number; gross: number; fuel: number; feeIncome: number; feeExpense: number }>();
    for (const s of shiftIds) totals.set(s, { tripDistance: 0, gross: 0, fuel: 0, feeIncome: 0, feeExpense: 0 });
    for (const t of tripsRes.data ?? []) {
      const r = totals.get(t.shift_id!)!;
      r.tripDistance += Number(t.distance_km ?? 0);
      r.gross += Number(t.gross_fare_php ?? 0);
    }
    for (const f of fuelRes.data ?? []) {
      totals.get(f.shift_id!)!.fuel += Number(f.total_cost_php ?? 0);
    }
    for (const fe of feesRes.data ?? []) {
      const r = totals.get(fe.shift_id!)!;
      const t = (fe.category as unknown as { entry_type?: string } | null)?.entry_type;
      // Uncategorized (null) entries are skipped from income/expense totals.
      if (t === "expense") r.feeExpense += Number(fe.amount_php);
      else if (t === "income") r.feeIncome += Number(fe.amount_php);
    }

    return {
      shifts: shifts.map((s) => {
        const t = totals.get(s.id)!;
        // Canonical total distance: odometer delta when both readings exist,
        // else sum of trip distances (matches computeShift on the driver side).
        const start = s.starting_odometer_km != null ? Number(s.starting_odometer_km) : null;
        const end = s.ending_odometer_km != null ? Number(s.ending_odometer_km) : null;
        const totalDistance =
          start != null && end != null ? Math.max(0, end - start) : t.tripDistance;
        return {
          ...s,
          driver_name: drivers[s.driver_id] ?? "",
          total_distance_km: totalDistance,
          gross_earnings_php: t.gross + t.feeIncome,
          fuel_cost_php: t.fuel,
          expenses_php: t.fuel + t.feeExpense,
          net_earnings_php: t.gross + t.feeIncome - t.fuel - t.feeExpense,
        };
      }),
      drivers,
    };
  });


export const getShiftDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ shiftId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const [shiftRes, tripsRes, fuelRes, feesRes, auditRes] = await Promise.all([
      supabaseAdmin.from("shifts").select("*").eq("id", data.shiftId).single(),
      supabaseAdmin.from("trips").select("*").eq("shift_id", data.shiftId).order("started_at"),
      supabaseAdmin.from("fuel_logs").select("*").eq("shift_id", data.shiftId).order("logged_at"),
      supabaseAdmin
        .from("fee_entries").select("*, category:fee_categories(name, entry_type)").eq("shift_id", data.shiftId).order("logged_at"),
      supabaseAdmin
        .from("audit_log").select("*").eq("entity_id", data.shiftId).order("created_at", { ascending: false }).limit(20),
    ]);
    if (shiftRes.error) throw new Error(shiftRes.error.message);
    return {
      shift: shiftRes.data,
      trips: tripsRes.data ?? [],
      fuelLogs: fuelRes.data ?? [],
      feeEntries: feesRes.data ?? [],
      audit: auditRes.data ?? [],
    };
  });

export const updateShiftRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        shiftId: z.string().uuid(),
        starting_odometer_km: z.number().nullable().optional(),
        ending_odometer_km: z.number().nullable().optional(),
        gas_rate_php_per_liter: z.number().nullable().optional(),
        notes: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { shiftId, ...patch } = data;
    const { data: before } = await supabaseAdmin
      .from("shifts").select("*").eq("id", shiftId).single();
    const { error } = await supabaseAdmin.from("shifts").update(patch).eq("id", shiftId);
    if (error) throw new Error(error.message);
    await logAudit({
      actorId: context.userId, entityType: "shift", entityId: shiftId,
      action: "update", before, after: patch,
    });
    return { ok: true };
  });

export const updateTripRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        distance_km: z.number().nullable().optional(),
        gross_fare_php: z.number().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id, ...patch } = data;
    const { data: before } = await supabaseAdmin.from("trips").select("*").eq("id", id).single();
    const { error } = await supabaseAdmin.from("trips").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    await logAudit({
      actorId: context.userId, entityType: "trip", entityId: id,
      action: "update", before, after: patch,
    });
    return { ok: true };
  });

export const updateFuelLogRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        total_cost_php: z.number().optional(),
        liters: z.number().optional(),
        price_per_liter_php: z.number().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id, ...patch } = data;
    const { data: before } = await supabaseAdmin.from("fuel_logs").select("*").eq("id", id).single();
    const { error } = await supabaseAdmin.from("fuel_logs").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    await logAudit({
      actorId: context.userId, entityType: "fuel_log", entityId: id,
      action: "update", before, after: patch,
    });
    return { ok: true };
  });

export const deleteRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      entity: z.enum(["trip", "fuel_log", "fee_entry", "shift"]),
      id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const tableMap = { trip: "trips", fuel_log: "fuel_logs", fee_entry: "fee_entries", shift: "shifts" } as const;
    const table = tableMap[data.entity];
    const { data: before } = await supabaseAdmin.from(table).select("*").eq("id", data.id).single();
    const { error } = await supabaseAdmin.from(table).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit({
      actorId: context.userId, entityType: data.entity, entityId: data.id,
      action: "delete", before,
    });
    return { ok: true };
  });

// ============================================================
// DASHBOARD
// ============================================================
export const getDashboardSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ days: z.number().min(7).max(365).default(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();

    const { data: shifts } = await supabaseAdmin
      .from("shifts")
      .select("id, started_at, starting_odometer_km, ending_odometer_km")
      .gte("started_at", since)
      .not("ended_at", "is", null);

    const shiftIds = (shifts ?? []).map((s) => s.id);
    const [tripsRes, fuelRes, feesRes] = await Promise.all([
      supabaseAdmin.from("trips").select("shift_id, gross_fare_php").in("shift_id", shiftIds.length ? shiftIds : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("fuel_logs").select("shift_id, total_cost_php").in("shift_id", shiftIds.length ? shiftIds : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("fee_entries").select("shift_id, amount_php, category:fee_categories(entry_type)").in("shift_id", shiftIds.length ? shiftIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);

    const grossByShift = new Map<string, number>();
    const fuelByShift = new Map<string, number>();
    const feeIncByShift = new Map<string, number>();
    const feeExpByShift = new Map<string, number>();
    for (const t of tripsRes.data ?? [])
      grossByShift.set(t.shift_id!, (grossByShift.get(t.shift_id!) ?? 0) + Number(t.gross_fare_php ?? 0));
    for (const f of fuelRes.data ?? [])
      fuelByShift.set(f.shift_id!, (fuelByShift.get(f.shift_id!) ?? 0) + Number(f.total_cost_php ?? 0));
    for (const fe of feesRes.data ?? []) {
      const t = (fe.category as unknown as { entry_type?: string } | null)?.entry_type;
      // Null/uncategorized entries are intentionally excluded from both totals.
      if (t !== "income" && t !== "expense") continue;
      const m = t === "expense" ? feeExpByShift : feeIncByShift;
      m.set(fe.shift_id!, (m.get(fe.shift_id!) ?? 0) + Number(fe.amount_php));
    }

    const daily = new Map<string, { distance: number; gross: number; fuel: number; net: number; date: string }>();
    for (const s of shifts ?? []) {
      const day = (s.started_at as string).slice(0, 10);
      const row = daily.get(day) ?? { distance: 0, gross: 0, fuel: 0, net: 0, date: day };
      const dist = Number(s.ending_odometer_km ?? 0) - Number(s.starting_odometer_km ?? 0);
      const gross = (grossByShift.get(s.id) ?? 0) + (feeIncByShift.get(s.id) ?? 0);
      const fuel = fuelByShift.get(s.id) ?? 0;
      const exp = fuel + (feeExpByShift.get(s.id) ?? 0);
      row.distance += Math.max(0, dist);
      row.gross += gross;
      row.fuel += fuel;
      row.net += gross - exp;
      daily.set(day, row);
    }
    const dailyArr = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date));

    const totals = dailyArr.reduce(
      (a, r) => ({ distance: a.distance + r.distance, gross: a.gross + r.gross, fuel: a.fuel + r.fuel, net: a.net + r.net }),
      { distance: 0, gross: 0, fuel: 0, net: 0 },
    );
    return { daily: dailyArr, totals, shiftCount: (shifts ?? []).length };
  });

// ============================================================
// EXPORT
// ============================================================
export const exportRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin.from("shifts").select("*").order("started_at", { ascending: false }).limit(5000);
    if (data.from) q = q.gte("started_at", data.from);
    if (data.to) q = q.lte("started_at", data.to);
    const { data: shifts, error } = await q;
    if (error) throw new Error(error.message);
    if (!shifts || shifts.length === 0) return { rows: [] };

    const ids = shifts.map((s) => s.id);
    const driverIds = [...new Set(shifts.map((s) => s.driver_id))];
    const [profs, trips, fuel, fees] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name").in("id", driverIds),
      supabaseAdmin.from("trips").select("shift_id, distance_km, gross_fare_php").in("shift_id", ids),
      supabaseAdmin.from("fuel_logs").select("shift_id, total_cost_php, liters").in("shift_id", ids),
      supabaseAdmin.from("fee_entries").select("shift_id, amount_php, category:fee_categories(entry_type)").in("shift_id", ids),
    ]);
    const driverName = new Map((profs.data ?? []).map((p) => [p.id, p.full_name ?? ""]));

    const agg = new Map<string, { tripDistance: number; baseFares: number; fuelCost: number; refuelLiters: number; feeIncome: number; feeExpense: number }>();
    for (const id of ids) agg.set(id, { tripDistance: 0, baseFares: 0, fuelCost: 0, refuelLiters: 0, feeIncome: 0, feeExpense: 0 });
    for (const t of trips.data ?? []) {
      const r = agg.get(t.shift_id!)!;
      r.tripDistance += Number(t.distance_km ?? 0);
      r.baseFares += Number(t.gross_fare_php ?? 0);
    }
    for (const f of fuel.data ?? []) {
      const r = agg.get(f.shift_id!)!;
      r.fuelCost += Number(f.total_cost_php ?? 0);
      r.refuelLiters += Number(f.liters ?? 0);
    }
    for (const fe of fees.data ?? []) {
      const r = agg.get(fe.shift_id!)!;
      const t = (fe.category as unknown as { entry_type?: string } | null)?.entry_type;
      // Uncategorized entries are skipped (neither income nor expense).
      if (t === "expense") r.feeExpense += Number(fe.amount_php);
      else if (t === "income") r.feeIncome += Number(fe.amount_php);
    }

    const rows = shifts.map((s) => {
      const a = agg.get(s.id)!;
      const gross = a.baseFares + a.feeIncome;
      const expenses = a.fuelCost + a.feeExpense;
      // Canonical distance: odometer delta if both readings, else trip sum.
      const start = s.starting_odometer_km != null ? Number(s.starting_odometer_km) : null;
      const end = s.ending_odometer_km != null ? Number(s.ending_odometer_km) : null;
      const totalDistance =
        start != null && end != null ? Math.max(0, end - start) : a.tripDistance;
      return {
        date: (s.started_at as string).slice(0, 10),
        driver: driverName.get(s.driver_id) ?? "",
        start_mileage_km: Number(s.starting_odometer_km ?? 0),
        end_mileage_km: Number(s.ending_odometer_km ?? 0),
        distance_km: Number(totalDistance.toFixed(2)),
        fuel_cost_php: Number(a.fuelCost.toFixed(2)),
        refuel_liters: Number(a.refuelLiters.toFixed(2)),
        base_fares_php: Number(a.baseFares.toFixed(2)),
        fees_php: Number(a.feeIncome.toFixed(2)),
        // Explicit expense-fees column so columns reconcile:
        //   base_fares + fees − fuel − other_expenses = net
        other_expenses_php: Number(a.feeExpense.toFixed(2)),
        net_earnings_php: Number((gross - expenses).toFixed(2)),
      };
    });
    return { rows };
  });


// ============================================================
// REPORTS — Fleet leaderboard + Data quality
// ============================================================
const ANALYTICS_KMPL_MIN = 10;
const ANALYTICS_KMPL_MAX = 100;
// Fare-per-km plausibility window (PHP/km) used by the data-quality report.
const FAREKM_MIN = 2;
const FAREKM_MAX = 200;

export const getFleetLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("shifts")
      .select("id, driver_id, started_at, ended_at, starting_odometer_km, ending_odometer_km")
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(5000);
    if (data.from) q = q.gte("started_at", data.from);
    if (data.to) q = q.lte("started_at", data.to);
    const { data: shifts, error } = await q;
    if (error) throw new Error(error.message);

    const shiftIds = (shifts ?? []).map((s) => s.id);
    const safeIds = shiftIds.length ? shiftIds : ["00000000-0000-0000-0000-000000000000"];
    const driverIds = [...new Set((shifts ?? []).map((s) => s.driver_id))];

    const [tripsRes, fuelRes, feesRes, profRes] = await Promise.all([
      supabaseAdmin
        .from("trips")
        .select("shift_id, distance_km, gross_fare_php")
        .in("shift_id", safeIds),
      supabaseAdmin
        .from("fuel_logs")
        .select("shift_id, total_cost_php, liters")
        .in("shift_id", safeIds),
      supabaseAdmin
        .from("fee_entries")
        .select("shift_id, amount_php, category:fee_categories(entry_type)")
        .in("shift_id", safeIds),
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, last_seen_at")
        .in("id", driverIds.length ? driverIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);

    type Row = {
      driver_id: string;
      driver_name: string;
      net: number;
      gross: number;
      fuel: number;
      feeIncome: number;
      feeExpense: number;
      trips: number;
      total_km: number;
      between_km: number;
      hours: number;
      liters: number;
      last_active: string | null;
    };
    const byDriver = new Map<string, Row>();
    const profById = new Map((profRes.data ?? []).map((p) => [p.id, p]));

    // per-shift trip distance + counts + gross
    const trDist = new Map<string, number>();
    const trGross = new Map<string, number>();
    const trCount = new Map<string, number>();
    for (const t of tripsRes.data ?? []) {
      trDist.set(t.shift_id!, (trDist.get(t.shift_id!) ?? 0) + Number(t.distance_km ?? 0));
      trGross.set(t.shift_id!, (trGross.get(t.shift_id!) ?? 0) + Number(t.gross_fare_php ?? 0));
      trCount.set(t.shift_id!, (trCount.get(t.shift_id!) ?? 0) + 1);
    }
    const fuelCost = new Map<string, number>();
    const fuelLit = new Map<string, number>();
    for (const f of fuelRes.data ?? []) {
      fuelCost.set(f.shift_id!, (fuelCost.get(f.shift_id!) ?? 0) + Number(f.total_cost_php ?? 0));
      fuelLit.set(f.shift_id!, (fuelLit.get(f.shift_id!) ?? 0) + Number(f.liters ?? 0));
    }
    const feeIn = new Map<string, number>();
    const feeEx = new Map<string, number>();
    for (const fe of feesRes.data ?? []) {
      const et = (fe.category as unknown as { entry_type?: string } | null)?.entry_type;
      if (et === "income")
        feeIn.set(fe.shift_id!, (feeIn.get(fe.shift_id!) ?? 0) + Number(fe.amount_php));
      else if (et === "expense")
        feeEx.set(fe.shift_id!, (feeEx.get(fe.shift_id!) ?? 0) + Number(fe.amount_php));
    }

    for (const s of shifts ?? []) {
      const did = s.driver_id;
      const prof = profById.get(did);
      const row =
        byDriver.get(did) ??
        ({
          driver_id: did,
          driver_name: prof?.full_name ?? "(unknown)",
          net: 0,
          gross: 0,
          fuel: 0,
          feeIncome: 0,
          feeExpense: 0,
          trips: 0,
          total_km: 0,
          between_km: 0,
          hours: 0,
          liters: 0,
          last_active: prof?.last_seen_at ?? null,
        } as Row);
      const start = s.starting_odometer_km != null ? Number(s.starting_odometer_km) : null;
      const end = s.ending_odometer_km != null ? Number(s.ending_odometer_km) : null;
      const trip = trDist.get(s.id) ?? 0;
      const total = start != null && end != null ? Math.max(0, end - start) : trip;
      row.total_km += total;
      if (start != null && end != null) row.between_km += Math.max(0, total - trip);
      row.trips += trCount.get(s.id) ?? 0;
      const g = trGross.get(s.id) ?? 0;
      const fi = feeIn.get(s.id) ?? 0;
      const fc = fuelCost.get(s.id) ?? 0;
      const fe = feeEx.get(s.id) ?? 0;
      row.gross += g;
      row.feeIncome += fi;
      row.fuel += fc;
      row.feeExpense += fe;
      row.liters += fuelLit.get(s.id) ?? 0;
      row.net += g + fi - fc - fe;
      const startedAt = new Date(s.started_at as string).getTime();
      const endedAt = s.ended_at ? new Date(s.ended_at as string).getTime() : startedAt;
      row.hours += Math.max(0, (endedAt - startedAt) / 3600_000);
      const sa = s.started_at as string;
      if (!row.last_active || sa > row.last_active) row.last_active = sa;
      byDriver.set(did, row);
    }
    // shiftToDriver unused beyond mapping; keep var to satisfy noUnused.
    void shiftToDriver;

    const rows = [...byDriver.values()].map((r) => {
      const raw = r.liters > 0 && r.total_km > 0 ? r.total_km / r.liters : null;
      const kmpl =
        raw != null && raw >= ANALYTICS_KMPL_MIN && raw <= ANALYTICS_KMPL_MAX ? raw : null;
      return {
        ...r,
        peso_per_hour: r.hours > 0 ? r.net / r.hours : null,
        peso_per_km: r.total_km > 0 ? r.net / r.total_km : null,
        km_per_liter: kmpl,
      };
    });
    return { rows };
  });

export const getDataQualityReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("shifts")
      .select("id, driver_id, started_at, ended_at, starting_odometer_km, ending_odometer_km")
      .order("started_at", { ascending: false })
      .limit(2000);
    if (data.from) q = q.gte("started_at", data.from);
    if (data.to) q = q.lte("started_at", data.to);
    const { data: shifts, error } = await q;
    if (error) throw new Error(error.message);

    const shiftIds = (shifts ?? []).map((s) => s.id);
    const safeIds = shiftIds.length ? shiftIds : ["00000000-0000-0000-0000-000000000000"];
    const driverIds = [...new Set((shifts ?? []).map((s) => s.driver_id))];
    const [tripsRes, fuelRes, feesRes, profRes] = await Promise.all([
      supabaseAdmin
        .from("trips")
        .select("shift_id, distance_km, gross_fare_php")
        .in("shift_id", safeIds),
      supabaseAdmin
        .from("fuel_logs")
        .select("shift_id, total_cost_php, liters")
        .in("shift_id", safeIds),
      supabaseAdmin
        .from("fee_entries")
        .select("shift_id, amount_php, category:fee_categories(entry_type)")
        .in("shift_id", safeIds),
      supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", driverIds.length ? driverIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const profMap = new Map((profRes.data ?? []).map((p) => [p.id, p.full_name ?? ""]));
    const trDist = new Map<string, number>();
    const trGross = new Map<string, number>();
    for (const t of tripsRes.data ?? []) {
      trDist.set(t.shift_id!, (trDist.get(t.shift_id!) ?? 0) + Number(t.distance_km ?? 0));
      trGross.set(t.shift_id!, (trGross.get(t.shift_id!) ?? 0) + Number(t.gross_fare_php ?? 0));
    }
    const fuelCost = new Map<string, number>();
    const fuelLit = new Map<string, number>();
    for (const f of fuelRes.data ?? []) {
      fuelCost.set(f.shift_id!, (fuelCost.get(f.shift_id!) ?? 0) + Number(f.total_cost_php ?? 0));
      fuelLit.set(f.shift_id!, (fuelLit.get(f.shift_id!) ?? 0) + Number(f.liters ?? 0));
    }
    const feeIn = new Map<string, number>();
    const feeEx = new Map<string, number>();
    for (const fe of feesRes.data ?? []) {
      const et = (fe.category as unknown as { entry_type?: string } | null)?.entry_type;
      if (et === "income")
        feeIn.set(fe.shift_id!, (feeIn.get(fe.shift_id!) ?? 0) + Number(fe.amount_php));
      else if (et === "expense")
        feeEx.set(fe.shift_id!, (feeEx.get(fe.shift_id!) ?? 0) + Number(fe.amount_php));
    }

    type Flag =
      | "missing_ending_odometer"
      | "abandoned_open_shift"
      | "odometer_trip_mismatch"
      | "kmpl_out_of_range"
      | "negative_net"
      | "fare_per_km_outlier";
    type Finding = {
      shift_id: string;
      driver_id: string;
      driver_name: string;
      started_at: string;
      ended_at: string | null;
      flag: Flag;
      detail: string;
    };
    const findings: Finding[] = [];
    const now = Date.now();
    for (const s of shifts ?? []) {
      const start = s.starting_odometer_km != null ? Number(s.starting_odometer_km) : null;
      const end = s.ending_odometer_km != null ? Number(s.ending_odometer_km) : null;
      const trip = trDist.get(s.id) ?? 0;
      const fc = fuelCost.get(s.id) ?? 0;
      const fl = fuelLit.get(s.id) ?? 0;
      const g = trGross.get(s.id) ?? 0;
      const fi = feeIn.get(s.id) ?? 0;
      const fe = feeEx.get(s.id) ?? 0;
      const net = g + fi - fc - fe;
      const base = {
        shift_id: s.id,
        driver_id: s.driver_id,
        driver_name: profMap.get(s.driver_id) ?? "",
        started_at: s.started_at as string,
        ended_at: (s.ended_at as string | null) ?? null,
      };
      if (s.ended_at && end == null) {
        findings.push({ ...base, flag: "missing_ending_odometer", detail: "Ended shift has no ending odometer reading." });
      }
      if (!s.ended_at) {
        const age = (now - new Date(s.started_at as string).getTime()) / 3600_000;
        if (age > 24)
          findings.push({ ...base, flag: "abandoned_open_shift", detail: `Open for ${age.toFixed(1)}h — likely abandoned.` });
      }
      if (start != null && end != null) {
        const delta = end - start;
        if (delta - trip < 0) {
          findings.push({
            ...base,
            flag: "odometer_trip_mismatch",
            detail: `Trips sum ${trip.toFixed(1)}km exceeds odometer delta ${delta.toFixed(1)}km.`,
          });
        }
      }
      const total = start != null && end != null ? Math.max(0, end - start) : trip;
      if (fl > 0 && total > 0) {
        const k = total / fl;
        if (k < ANALYTICS_KMPL_MIN || k > ANALYTICS_KMPL_MAX) {
          findings.push({
            ...base,
            flag: "kmpl_out_of_range",
            detail: `Computed ${k.toFixed(1)} km/L (outside ${ANALYTICS_KMPL_MIN}–${ANALYTICS_KMPL_MAX}).`,
          });
        }
      }
      if (s.ended_at && net < 0) {
        findings.push({ ...base, flag: "negative_net", detail: `Net ₱${net.toFixed(2)} — expenses exceed earnings.` });
      }
      if (trip > 0 && g > 0) {
        const fareKm = g / trip;
        if (fareKm > 200 || fareKm < 2) {
          findings.push({
            ...base,
            flag: "fare_per_km_outlier",
            detail: `Fare/km ₱${fareKm.toFixed(2)} looks off (trips ${trip.toFixed(1)}km, fares ₱${g.toFixed(0)}).`,
          });
        }
      }
    }
    return { findings };
  });
