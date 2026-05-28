/**
 * Admin / Superadmin server functions. Every handler validates the caller
 * has 'admin' or 'superadmin' role; writes are recorded to public.audit_log.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

    // emails via auth admin
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 500,
    });
    const emailById = new Map(list.users.map((u) => [u.id, u.email ?? ""]));

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
    const { data: setting } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", "default_driver_password").maybeSingle();
    const defaultPw =
      (setting?.value as string) || process.env.SUPERADMIN_DEFAULT_PASSWORD || "Welcome312";
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.driverId, {
      password: defaultPw,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("profiles").update({ first_sign_in_completed: false }).eq("id", data.driverId);
    await logAudit({
      actorId: context.userId, entityType: "profile", entityId: data.driverId,
      action: "reset_password",
    });
    return { ok: true, password: defaultPw };
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

    const totals = new Map<string, { distance: number; gross: number; fuel: number; feeIncome: number; feeExpense: number }>();
    for (const s of shiftIds) totals.set(s, { distance: 0, gross: 0, fuel: 0, feeIncome: 0, feeExpense: 0 });
    for (const t of tripsRes.data ?? []) {
      const r = totals.get(t.shift_id!)!;
      r.distance += Number(t.distance_km ?? 0);
      r.gross += Number(t.gross_fare_php ?? 0);
    }
    for (const f of fuelRes.data ?? []) {
      totals.get(f.shift_id!)!.fuel += Number(f.total_cost_php ?? 0);
    }
    for (const fe of fuelRes.data ?? []) void fe;
    for (const fe of feesRes.data ?? []) {
      const r = totals.get(fe.shift_id!)!;
      const t = (fe.category as unknown as { entry_type?: string } | null)?.entry_type;
      if (t === "expense") r.feeExpense += Number(fe.amount_php);
      else r.feeIncome += Number(fe.amount_php);
    }

    return {
      shifts: shifts.map((s) => {
        const t = totals.get(s.id)!;
        return {
          ...s,
          driver_name: drivers[s.driver_id] ?? "",
          total_distance_km: t.distance,
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

    const agg = new Map<string, { distance: number; baseFares: number; fuelCost: number; refuelLiters: number; feeIncome: number; feeExpense: number }>();
    for (const id of ids) agg.set(id, { distance: 0, baseFares: 0, fuelCost: 0, refuelLiters: 0, feeIncome: 0, feeExpense: 0 });
    for (const t of trips.data ?? []) {
      const r = agg.get(t.shift_id!)!;
      r.distance += Number(t.distance_km ?? 0);
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
      if (t === "expense") r.feeExpense += Number(fe.amount_php);
      else r.feeIncome += Number(fe.amount_php);
    }

    const rows = shifts.map((s) => {
      const a = agg.get(s.id)!;
      const gross = a.baseFares + a.feeIncome;
      const expenses = a.fuelCost + a.feeExpense;
      return {
        date: (s.started_at as string).slice(0, 10),
        driver: driverName.get(s.driver_id) ?? "",
        start_mileage_km: Number(s.starting_odometer_km ?? 0),
        end_mileage_km: Number(s.ending_odometer_km ?? 0),
        distance_km: Number(a.distance.toFixed(2)),
        fuel_cost_php: Number(a.fuelCost.toFixed(2)),
        refuel_liters: Number(a.refuelLiters.toFixed(2)),
        base_fares_php: Number(a.baseFares.toFixed(2)),
        fees_php: Number(a.feeIncome.toFixed(2)),
        net_earnings_php: Number((gross - expenses).toFixed(2)),
      };
    });
    return { rows };
  });
