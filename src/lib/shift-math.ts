export type Trip = { distance_km: number | null; gross_fare_php: number };
export type FuelLog = { total_cost_php: number; liters: number | null };
export type FeeEntry = {
  amount_php: number;
  category: { entry_type: string } | null;
};

export type ShiftMath = {
  shiftDistanceKm: number;
  tripDistanceSumKm: number;
  unloggedKm: number;
  distanceMismatch: boolean;
  litersConsumed: number;
  fuelEfficiency: number | null; // km/L
  grossEarnings: number;
  totalExpenses: number;
  netEarnings: number;
  totalFuelCost: number;
  tripsCount: number;
};

export function computeShift(args: {
  startingOdo: number | null;
  endingOdo: number | null;
  trips: Trip[];
  fuelLogs: FuelLog[];
  feeEntries: FeeEntry[];
  gasRate: number | null;
}): ShiftMath {
  const { startingOdo, endingOdo, trips, fuelLogs, feeEntries, gasRate } = args;

  const tripDistanceSumKm = trips.reduce((s, t) => s + Number(t.distance_km ?? 0), 0);
  const shiftDistanceKm =
    startingOdo != null && endingOdo != null
      ? Math.max(0, endingOdo - startingOdo)
      : tripDistanceSumKm;

  const distanceMismatch =
    shiftDistanceKm > 0 &&
    Math.abs(shiftDistanceKm - tripDistanceSumKm) > shiftDistanceKm * 0.1;

  const totalFuelCost = fuelLogs.reduce((s, f) => s + Number(f.total_cost_php ?? 0), 0);
  const allHaveLiters = fuelLogs.length > 0 && fuelLogs.every((f) => f.liters != null);
  const litersConsumed = allHaveLiters
    ? fuelLogs.reduce((s, f) => s + Number(f.liters ?? 0), 0)
    : gasRate && gasRate > 0
      ? totalFuelCost / gasRate
      : 0;

  const fuelEfficiency =
    litersConsumed > 0 && shiftDistanceKm > 0 ? shiftDistanceKm / litersConsumed : null;

  const grossTrips = trips.reduce((s, t) => s + Number(t.gross_fare_php ?? 0), 0);
  const incomeFees = feeEntries
    .filter((f) => f.category?.entry_type !== "expense")
    .reduce((s, f) => s + Number(f.amount_php ?? 0), 0);
  const expenseFees = feeEntries
    .filter((f) => f.category?.entry_type === "expense")
    .reduce((s, f) => s + Number(f.amount_php ?? 0), 0);

  const grossEarnings = grossTrips + incomeFees;
  const totalExpenses = totalFuelCost + expenseFees;
  const netEarnings = grossEarnings - totalExpenses;

  return {
    shiftDistanceKm,
    tripDistanceSumKm,
    distanceMismatch,
    litersConsumed,
    fuelEfficiency,
    grossEarnings,
    totalExpenses,
    netEarnings,
    totalFuelCost,
    tripsCount: trips.length,
  };
}
