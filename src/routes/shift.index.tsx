import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuthSession } from "@/hooks/use-auth-session";
import { BottomNav } from "@/components/BottomNav";
import { getActiveShift } from "@/lib/shift.functions";
import { computeShift, estimateFuelLeft } from "@/lib/shift-math";
import { php, km, liters as litersFmt } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Play, Plus, StopCircle, Bike, Pencil, Fuel } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/shift/")({ component: ShiftPage });

function ShiftPage() {
  const session = useAuthSession();
  const navigate = useNavigate();
  const fetchActive = useServerFn(getActiveShift);

  const active = useQuery({
    queryKey: ["active-shift", session?.user.id],
    enabled: !!session,
    queryFn: () => fetchActive(),
  });

  const [tankLiters, setTankLiters] = useState<number | null>(null);
  useEffect(() => {
    if (!session) return;
    supabase
      .from("profiles")
      .select("fuel_tank_liters")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setTankLiters(data?.fuel_tank_liters ? Number(data.fuel_tank_liters) : null));
  }, [session]);

  if (session === undefined) return null;
  if (session === null) return <Navigate to="/login" />;

  const data = active.data;
  const hasActive = !!data?.shift;

  return (
    <div className="screen">
      <div className="screen-pad">
        <header className="pt-4 pb-6">
          <h1 className="text-3xl font-bold">My shift</h1>
          <p className="text-muted-foreground mt-1">
            {hasActive ? "Your shift is running." : "No shift yet. Tap below to start."}
          </p>
        </header>

        {!hasActive && (
          <div className="card-surface flex flex-col items-center text-center py-10">
            <div className="size-20 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Bike className="size-10" />
            </div>
            <h2 className="text-xl font-semibold mt-4">Ready to ride?</h2>
            <p className="text-muted-foreground mt-2 max-w-xs">
              Start a shift to track your trips, fuel, and earnings for the day.
            </p>
            <button
              onClick={() => navigate({ to: "/shift/start" })}
              className="btn-primary mt-6"
            >
              <Play className="size-5" /> Start shift
            </button>
          </div>
        )}

        {hasActive && data && (
          <ActiveShift
            startingOdo={Number(data.shift!.starting_odometer_km ?? 0)}
            startedAt={data.shift!.started_at}
            startingTankFull={Boolean((data.shift as { starting_tank_full?: boolean }).starting_tank_full)}
            trips={data.trips}
            fuelLogs={data.fuelLogs}
            feeEntries={data.feeEntries}
            gasRate={Number(data.shift!.gas_rate_php_per_liter ?? 0) || null}
            tankLiters={tankLiters}
          />
        )}
      </div>
      <BottomNav />
    </div>
  );
}

function ActiveShift({
  startingOdo, startedAt, startingTankFull, trips, fuelLogs, feeEntries, gasRate, tankLiters,
}: {
  startingOdo: number;
  startedAt: string;
  startingTankFull: boolean;
  trips: { distance_km: number | null; gross_fare_php: number; service_type: string; id: string }[];
  fuelLogs: { total_cost_php: number; liters: number | null }[];
  feeEntries: { amount_php: number; category: { entry_type: string } | null }[];
  gasRate: number | null;
  tankLiters: number | null;
}) {
  const math = computeShift({
    startingOdo,
    endingOdo: null,
    trips,
    fuelLogs,
    feeEntries,
    gasRate,
  });
  const fuel = estimateFuelLeft({
    startingTankFull,
    tankCapacityLiters: tankLiters,
    fuelLogs,
    shiftDistanceKm: math.tripDistanceSumKm, // best in-shift estimate before end odo
    assumedKmPerLiter: math.fuelEfficiency,
  });
  const startedLabel = new Date(startedAt).toLocaleTimeString([], {
    hour: "numeric", minute: "2-digit",
  });

  return (
    <>
      <div className="card-surface bg-gradient-to-br from-primary to-accent text-primary-foreground border-0">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm opacity-90">Started {startedLabel}</p>
            <p className="text-sm opacity-90 mt-1">Starting odo: {startingOdo} km</p>
          </div>
          <Link
            to="/shift/edit" aria-label="Edit shift start"
            className="size-10 rounded-xl bg-primary-foreground/15 flex items-center justify-center active:bg-primary-foreground/25"
          >
            <Pencil className="size-5" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4 text-center">
          <Stat label="Trips" value={String(math.tripsCount)} />
          <Stat label="Distance" value={km(math.tripDistanceSumKm)} />
          <Stat label="Gross" value={php(math.grossEarnings)} />
        </div>
      </div>

      {fuel && (
        <div className="card-surface mt-4 flex items-start gap-3">
          <Fuel className="size-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">
              ~{litersFmt(fuel.liters)} fuel left
              {fuel.capacity ? ` of ${litersFmt(fuel.capacity)} tank` : ""}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {startingTankFull
                ? "Estimated from a full tank at start."
                : "Estimated from your starting fuel log."}
              {!math.fuelEfficiency && " Uses average km/L until your first refuel."}
            </p>
          </div>
        </div>
      )}

      <Link to="/shift/trip" className="btn-primary mt-5">
        <Plus className="size-6" /> Add trip
      </Link>
      <Link to="/shift/end" className="btn-secondary mt-3">
        <StopCircle className="size-6" /> End shift
      </Link>

      <div className="card-surface mt-5">
        <h2 className="text-lg font-semibold">Trips this shift</h2>
        {trips.length === 0 ? (
          <p className="text-muted-foreground mt-2">No trips yet. Tap "Add trip" after each ride.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {trips.map((t) => (
              <li key={t.id}>
                <Link
                  to="/shift/trip"
                  search={{ id: t.id }}
                  className="py-3 flex items-center justify-between active:bg-muted/40 -mx-2 px-2 rounded-lg"
                >
                  <div>
                    <p className="font-semibold capitalize">{t.service_type}</p>
                    <p className="text-sm text-muted-foreground">
                      {km(Number(t.distance_km ?? 0))} · tap to edit
                    </p>
                  </div>
                  <p className="font-semibold">{php(t.gross_fare_php)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase opacity-80">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
    </div>
  );
}
