/**
 * Driver-facing server functions for shifts, trips, fuel, fees.
 * All run as the signed-in driver via requireSupabaseAuth — RLS enforces ownership.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ServiceType = "angkas" | "pabakal" | "padala";

// ---------- queries ----------
export const getActiveShift = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: shift, error } = await supabase
      .from("shifts")
      .select("*")
      .eq("driver_id", userId)
      .is("ended_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!shift) return { shift: null, trips: [], fuelLogs: [], feeEntries: [] };

    const [tripsRes, fuelRes, feesRes] = await Promise.all([
      supabase
        .from("trips")
        .select("id, service_type, distance_km, gross_fare_php, started_at")
        .eq("shift_id", shift.id)
        .order("started_at", { ascending: false }),
      supabase
        .from("fuel_logs")
        .select("id, total_cost_php, liters, price_per_liter_php, logged_at")
        .eq("shift_id", shift.id)
        .order("logged_at", { ascending: true }),
      supabase
        .from("fee_entries")
        .select("id, amount_php, note, logged_at, category_id, category:fee_categories(id, name, entry_type)")
        .eq("shift_id", shift.id)
        .order("logged_at", { ascending: false }),
    ]);
    if (tripsRes.error) throw new Error(tripsRes.error.message);
    if (fuelRes.error) throw new Error(fuelRes.error.message);
    if (feesRes.error) throw new Error(feesRes.error.message);

    return {
      shift,
      trips: tripsRes.data ?? [],
      fuelLogs: fuelRes.data ?? [],
      feeEntries: feesRes.data ?? [],
    };
  });

export const listFeeCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fee_categories")
      .select("id, name, entry_type, is_active")
      .eq("is_active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- mutations ----------
export const startShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        startingOdometerKm: z.number().min(0).max(9_999_999),
        gasRate: z.number().min(1).max(500).optional(),
        startingFuelCostPhp: z.number().min(0).max(100_000).optional(),
        startingTankFull: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("shifts").select("id").eq("driver_id", userId).is("ended_at", null).maybeSingle();
    if (existing) throw new Error("You already have an active shift.");

    const { data: shift, error } = await supabase
      .from("shifts")
      .insert({
        driver_id: userId,
        starting_odometer_km: data.startingOdometerKm,
        gas_rate_php_per_liter: data.gasRate ?? null,
        starting_tank_full: data.startingTankFull ?? false,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (data.startingFuelCostPhp && data.startingFuelCostPhp > 0) {
      const rate = data.gasRate ?? 0;
      await supabase.from("fuel_logs").insert({
        driver_id: userId,
        shift_id: shift.id,
        total_cost_php: data.startingFuelCostPhp,
        price_per_liter_php: rate,
        liters: rate > 0 ? data.startingFuelCostPhp / rate : 0,
      });
    }
    return { shift };
  });

export const updateShiftStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        shiftId: z.string().uuid(),
        startingOdometerKm: z.number().min(0).max(9_999_999),
        gasRate: z.number().min(1).max(500).nullable().optional(),
        startingTankFull: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("shifts")
      .update({
        starting_odometer_km: data.startingOdometerKm,
        gas_rate_php_per_liter: data.gasRate ?? null,
        starting_tank_full: data.startingTankFull ?? false,
      })
      .eq("id", data.shiftId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const addTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        shiftId: z.string().uuid(),
        serviceType: z.enum(["angkas", "pabakal", "padala"]),
        distanceKm: z.number().min(0).max(1000),
        grossFarePhp: z.number().min(0).max(100_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("trips").insert({
      driver_id: userId,
      shift_id: data.shiftId,
      service_type: data.serviceType as ServiceType,
      distance_km: data.distanceKm,
      gross_fare_php: data.grossFarePhp,
      ended_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        serviceType: z.enum(["angkas", "pabakal", "padala"]),
        distanceKm: z.number().min(0).max(1000),
        grossFarePhp: z.number().min(0).max(100_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("trips")
      .update({
        service_type: data.serviceType as ServiceType,
        distance_km: data.distanceKm,
        gross_fare_php: data.grossFarePhp,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("trips").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getTrip = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: trip, error } = await context.supabase
      .from("trips")
      .select("id, shift_id, service_type, distance_km, gross_fare_php")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return trip;
  });

export const addFuelLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        shiftId: z.string().uuid(),
        totalCostPhp: z.number().min(1).max(100_000),
        liters: z.number().min(0).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: shift } = await supabase
      .from("shifts").select("gas_rate_php_per_liter").eq("id", data.shiftId).single();
    const rate = Number(shift?.gas_rate_php_per_liter ?? 0);
    const liters = data.liters ?? (rate > 0 ? data.totalCostPhp / rate : 0);
    const { error } = await supabase.from("fuel_logs").insert({
      driver_id: userId,
      shift_id: data.shiftId,
      total_cost_php: data.totalCostPhp,
      price_per_liter_php: rate,
      liters,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setGasRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ shiftId: z.string().uuid(), gasRate: z.number().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("shifts")
      .update({ gas_rate_php_per_liter: data.gasRate })
      .eq("id", data.shiftId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const addFeeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        shiftId: z.string().uuid(),
        categoryId: z.string().uuid(),
        amountPhp: z.number().min(0.01).max(100_000),
        note: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("fee_entries").insert({
      driver_id: userId,
      shift_id: data.shiftId,
      category_id: data.categoryId,
      amount_php: data.amountPhp,
      note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteFeeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("fee_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const endShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        shiftId: z.string().uuid(),
        endingOdometerKm: z.number().min(0).max(9_999_999),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: shift, error: sErr } = await supabase
      .from("shifts").select("starting_odometer_km").eq("id", data.shiftId).single();
    if (sErr) throw new Error(sErr.message);
    const start = Number(shift.starting_odometer_km ?? 0);
    if (data.endingOdometerKm < start) {
      throw new Error(
        `Ending reading must be at least your starting reading of ${start} km.`,
      );
    }
    const { error } = await supabase
      .from("shifts")
      .update({
        ending_odometer_km: data.endingOdometerKm,
        ended_at: new Date().toISOString(),
      })
      .eq("id", data.shiftId);
    if (error) throw new Error(error.message);
    return { ok: true as const, shiftId: data.shiftId };
  });

export const updateShiftEnd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        shiftId: z.string().uuid(),
        endingOdometerKm: z.number().min(0).max(9_999_999),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: shift, error: sErr } = await supabase
      .from("shifts").select("starting_odometer_km, ended_at").eq("id", data.shiftId).single();
    if (sErr) throw new Error(sErr.message);
    const start = Number(shift.starting_odometer_km ?? 0);
    if (data.endingOdometerKm < start) {
      throw new Error(`Ending reading must be at least your starting reading of ${start} km.`);
    }
    const { error } = await supabase
      .from("shifts")
      .update({ ending_odometer_km: data.endingOdometerKm })
      .eq("id", data.shiftId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listMyShifts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        status: z.enum(["all", "ended", "active"]).optional(),
        serviceType: z.enum(["angkas", "pabakal", "padala"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("shifts")
      .select("id, started_at, ended_at, starting_odometer_km, ending_odometer_km, gas_rate_php_per_liter, starting_tank_full")
      .eq("driver_id", userId)
      .order("started_at", { ascending: false })
      .limit(200);
    if (data.from) q = q.gte("started_at", data.from);
    if (data.to) q = q.lte("started_at", data.to);
    if (data.status === "ended") q = q.not("ended_at", "is", null);
    if (data.status === "active") q = q.is("ended_at", null);
    const { data: shifts, error } = await q;
    if (error) throw new Error(error.message);
    if (!shifts || shifts.length === 0) return { shifts: [] };

    const ids = shifts.map((s) => s.id);
    const [tripsRes, fuelRes, feesRes] = await Promise.all([
      supabase.from("trips").select("shift_id, service_type, distance_km, gross_fare_php").in("shift_id", ids),
      supabase.from("fuel_logs").select("shift_id, total_cost_php, liters").in("shift_id", ids),
      supabase.from("fee_entries").select("shift_id, amount_php, category:fee_categories(entry_type)").in("shift_id", ids),
    ]);
    if (tripsRes.error) throw new Error(tripsRes.error.message);
    if (fuelRes.error) throw new Error(fuelRes.error.message);
    if (feesRes.error) throw new Error(feesRes.error.message);

    const byShift: Record<string, {
      trips: { service_type: string; distance_km: number | null; gross_fare_php: number }[];
      fuelLogs: { total_cost_php: number; liters: number | null }[];
      feeEntries: { amount_php: number; category: { entry_type: string } | null }[];
    }> = {};
    for (const id of ids) byShift[id] = { trips: [], fuelLogs: [], feeEntries: [] };
    for (const t of tripsRes.data ?? []) byShift[t.shift_id!]?.trips.push(t);
    for (const f of fuelRes.data ?? []) byShift[f.shift_id!]?.fuelLogs.push(f);
    for (const f of feesRes.data ?? []) byShift[f.shift_id!]?.feeEntries.push(f);

    const filtered = data.serviceType
      ? shifts.filter((s) => byShift[s.id].trips.some((t) => t.service_type === data.serviceType))
      : shifts;

    return {
      shifts: filtered.map((s) => ({
        ...s,
        trips: byShift[s.id].trips,
        fuelLogs: byShift[s.id].fuelLogs,
        feeEntries: byShift[s.id].feeEntries,
      })),
    };
  });

export const getShiftSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ shiftId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [shiftRes, tripsRes, fuelRes, feesRes] = await Promise.all([
      supabase.from("shifts").select("*").eq("id", data.shiftId).single(),
      supabase.from("trips").select("id, service_type, distance_km, gross_fare_php, started_at").eq("shift_id", data.shiftId).order("started_at", { ascending: false }),
      supabase.from("fuel_logs").select("total_cost_php, liters").eq("shift_id", data.shiftId),
      supabase
        .from("fee_entries")
        .select("amount_php, category:fee_categories(entry_type)")
        .eq("shift_id", data.shiftId),
    ]);
    if (shiftRes.error) throw new Error(shiftRes.error.message);
    return {
      shift: shiftRes.data,
      trips: tripsRes.data ?? [],
      fuelLogs: fuelRes.data ?? [],
      feeEntries: feesRes.data ?? [],
    };
  });

// ============================================================
// MY PERFORMANCE (driver insights)
// ============================================================
const KMPL_MIN = 10;
const KMPL_MAX = 100;

export const getMyPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ period: z.enum(["week", "month", "30d"]).default("30d") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date();
    let from: Date;
    if (data.period === "week") {
      from = new Date(now);
      const dow = (from.getDay() + 6) % 7; // Mon-start
      from.setDate(from.getDate() - dow);
      from.setHours(0, 0, 0, 0);
    } else if (data.period === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      from = new Date(now);
      from.setDate(from.getDate() - 30);
    }
    const fromIso = from.toISOString();

    const { data: shifts, error } = await supabase
      .from("shifts")
      .select("id, started_at, ended_at, starting_odometer_km, ending_odometer_km")
      .eq("driver_id", userId)
      .gte("started_at", fromIso)
      .order("started_at", { ascending: true });
    if (error) throw new Error(error.message);
    const shiftIds = (shifts ?? []).map((s) => s.id);
    const safeIds = shiftIds.length ? shiftIds : ["00000000-0000-0000-0000-000000000000"];

    const [tripsRes, fuelRes, feesRes] = await Promise.all([
      supabase
        .from("trips")
        .select("shift_id, service_type, distance_km, gross_fare_php, started_at, ended_at")
        .in("shift_id", safeIds),
      supabase
        .from("fuel_logs")
        .select("shift_id, total_cost_php, liters")
        .in("shift_id", safeIds),
      supabase
        .from("fee_entries")
        .select("shift_id, amount_php, category:fee_categories(entry_type)")
        .in("shift_id", safeIds),
    ]);
    if (tripsRes.error) throw new Error(tripsRes.error.message);
    if (fuelRes.error) throw new Error(fuelRes.error.message);
    if (feesRes.error) throw new Error(feesRes.error.message);

    type Agg = {
      tripDistance: number;
      gross: number;
      fuel: number;
      liters: number;
      feeIncome: number;
      feeExpense: number;
      tripSecs: number;
    };
    const byShift = new Map<string, Agg>();
    for (const id of shiftIds)
      byShift.set(id, { tripDistance: 0, gross: 0, fuel: 0, liters: 0, feeIncome: 0, feeExpense: 0, tripSecs: 0 });

    // service-type roll-up: net (gross fare only, no fee allocation per service) + minutes
    const byService = new Map<ServiceType, { gross: number; secs: number; trips: number }>();
    for (const t of tripsRes.data ?? []) {
      const a = byShift.get(t.shift_id!)!;
      a.tripDistance += Number(t.distance_km ?? 0);
      a.gross += Number(t.gross_fare_php ?? 0);
      let secs = 0;
      if (t.started_at && t.ended_at) {
        secs = Math.max(0, (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 1000);
        a.tripSecs += secs;
      }
      const svc = t.service_type as ServiceType;
      const s = byService.get(svc) ?? { gross: 0, secs: 0, trips: 0 };
      s.gross += Number(t.gross_fare_php ?? 0);
      s.secs += secs;
      s.trips += 1;
      byService.set(svc, s);
    }
    for (const f of fuelRes.data ?? []) {
      const a = byShift.get(f.shift_id!)!;
      a.fuel += Number(f.total_cost_php ?? 0);
      a.liters += Number(f.liters ?? 0);
    }
    for (const fe of feesRes.data ?? []) {
      const a = byShift.get(fe.shift_id!)!;
      const et = (fe.category as unknown as { entry_type?: string } | null)?.entry_type;
      if (et === "income") a.feeIncome += Number(fe.amount_php);
      else if (et === "expense") a.feeExpense += Number(fe.amount_php);
    }

    // Per-shift metrics + daily net trend
    const dailyMap = new Map<string, { date: string; net: number }>();
    let net = 0,
      gross = 0,
      fuel = 0,
      feeIncome = 0,
      feeExpense = 0;
    let totalKm = 0,
      paidKm = 0,
      betweenKm = 0,
      totalKmKnown = 0; // sum of total_km only when odometer-derived
    let betweenKnownShifts = 0,
      betweenUnknownShifts = 0;
    let litersTotal = 0;
    let totalHours = 0;
    let activeShiftSecs = 0;
    for (const s of shifts ?? []) {
      const a = byShift.get(s.id)!;
      const start = s.starting_odometer_km != null ? Number(s.starting_odometer_km) : null;
      const end = s.ending_odometer_km != null ? Number(s.ending_odometer_km) : null;
      const odoTotal = start != null && end != null ? Math.max(0, end - start) : null;
      const total = odoTotal ?? a.tripDistance;
      totalKm += total;
      paidKm += a.tripDistance;
      if (odoTotal != null) {
        totalKmKnown += odoTotal;
        const between = Math.max(0, odoTotal - a.tripDistance);
        betweenKm += between;
        betweenKnownShifts += 1;
      } else {
        betweenUnknownShifts += 1;
      }
      fuel += a.fuel;
      gross += a.gross;
      feeIncome += a.feeIncome;
      feeExpense += a.feeExpense;
      litersTotal += a.liters;
      const shiftNet = a.gross + a.feeIncome - a.fuel - a.feeExpense;
      net += shiftNet;
      const startedAt = new Date(s.started_at as string).getTime();
      const endedAt = s.ended_at ? new Date(s.ended_at as string).getTime() : now.getTime();
      const secs = Math.max(0, (endedAt - startedAt) / 1000);
      totalHours += secs / 3600;
      activeShiftSecs += secs;
      const day = (s.started_at as string).slice(0, 10);
      const row = dailyMap.get(day) ?? { date: day, net: 0 };
      row.net += shiftNet;
      dailyMap.set(day, row);
    }
    const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    const pesoPerHour = totalHours > 0 ? net / totalHours : null;
    const pesoPerKm = totalKm > 0 ? net / totalKm : null;
    const fuelPerKm = totalKm > 0 ? fuel / totalKm : null;
    const rawKmPerL = litersTotal > 0 && totalKm > 0 ? totalKm / litersTotal : null;
    const kmPerL = rawKmPerL != null && rawKmPerL >= KMPL_MIN && rawKmPerL <= KMPL_MAX ? rawKmPerL : null;
    const paidRatio = totalKmKnown > 0 ? Math.min(1, paidKm / totalKmKnown) : null;
    const timeUtil = activeShiftSecs > 0
      ? Math.min(1, [...byShift.values()].reduce((s, a) => s + a.tripSecs, 0) / activeShiftSecs)
      : null;

    const service = (["angkas", "pabakal", "padala"] as ServiceType[]).map((k) => {
      const s = byService.get(k) ?? { gross: 0, secs: 0, trips: 0 };
      const hrs = s.secs / 3600;
      return {
        service_type: k,
        net: s.gross,
        trips: s.trips,
        peso_per_hour: hrs > 0 ? s.gross / hrs : null,
      };
    });

    return {
      period: data.period,
      from: fromIso,
      totals: {
        net,
        gross,
        fuel,
        feeIncome,
        feeExpense,
        total_km: totalKm,
        paid_km: paidKm,
        between_km: betweenKm,
        hours: totalHours,
        liters: litersTotal,
      },
      metrics: {
        peso_per_hour: pesoPerHour,
        peso_per_km: pesoPerKm,
        fuel_cost_per_km: fuelPerKm,
        km_per_liter: kmPerL,
        paid_distance_ratio: paidRatio,
        time_utilization: timeUtil,
      },
      between: {
        known_shifts: betweenKnownShifts,
        unknown_shifts: betweenUnknownShifts,
        paid_km: paidKm,
        between_km: betweenKm,
      },
      daily,
      service,
      shiftCount: (shifts ?? []).length,
    };
  });
