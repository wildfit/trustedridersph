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

export const getShiftSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ shiftId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [shiftRes, tripsRes, fuelRes, feesRes] = await Promise.all([
      supabase.from("shifts").select("*").eq("id", data.shiftId).single(),
      supabase.from("trips").select("distance_km, gross_fare_php").eq("shift_id", data.shiftId),
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
