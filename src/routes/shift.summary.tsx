import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuthSession } from "@/hooks/use-auth-session";
import { getShiftSummary } from "@/lib/shift.functions";
import { computeShift } from "@/lib/shift-math";
import { php, km } from "@/lib/format";
import { CheckCircle2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/shift/summary")({
  validateSearch: (s) => z.object({ id: z.string().uuid() }).parse(s),
  component: SummaryPage,
});

function SummaryPage() {
  const { id } = Route.useSearch();
  const session = useAuthSession();
  const fetchSummary = useServerFn(getShiftSummary);
  const q = useQuery({
    queryKey: ["shift-summary", id],
    enabled: !!session,
    queryFn: () => fetchSummary({ data: { shiftId: id } }),
  });

  if (session === undefined) return null;
  if (session === null) return <Navigate to="/login" />;
  if (!q.data) {
    return (
      <div className="screen items-center justify-center">
        <div className="size-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const { shift, trips, fuelLogs, feeEntries } = q.data;
  const math = computeShift({
    startingOdo: Number(shift.starting_odometer_km ?? 0),
    endingOdo: Number(shift.ending_odometer_km ?? 0),
    trips,
    fuelLogs,
    feeEntries,
    gasRate: Number(shift.gas_rate_php_per_liter ?? 0) || null,
  });

  return (
    <div className="screen">
      <div className="screen-pad">
        <div className="flex flex-col items-center text-center pt-6">
          <div className="size-20 rounded-full bg-success/15 text-success flex items-center justify-center">
            <CheckCircle2 className="size-12" />
          </div>
          <h1 className="text-2xl font-bold mt-4">Magaling, kabayan!</h1>
          <p className="text-muted-foreground mt-1">Here's how your shift went.</p>
        </div>

        <div className="card-surface bg-gradient-to-br from-primary to-accent text-primary-foreground border-0 mt-6 text-center">
          <p className="text-sm opacity-90">Net earnings</p>
          <p className="text-5xl font-bold mt-1">{php(math.netEarnings)}</p>
          <p className="text-sm mt-2 opacity-90">
            {php(math.grossEarnings)} gross − {php(math.totalExpenses)} expenses
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Card label="Total distance" value={km(math.shiftDistanceKm)} />
          <Card label="Trips" value={String(math.tripsCount)} />
          <Card label="Fuel cost" value={php(math.totalFuelCost)} />
          <Card
            label="Fuel efficiency"
            value={math.fuelEfficiency ? `${math.fuelEfficiency.toFixed(1)} km/L` : "—"}
          />
        </div>

        {math.distanceMismatch && (
          <div className="card-surface mt-4 flex gap-3 border-accent/40 bg-accent/5">
            <AlertTriangle className="size-5 text-accent shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Distance check</p>
              <p className="text-sm text-muted-foreground mt-1">
                Trips total {km(math.tripDistanceSumKm)}, but your odometer shows {km(math.shiftDistanceKm)}.
              </p>
            </div>
          </div>
        )}

        <Link to="/shift" className="btn-primary mt-6">Done</Link>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-surface text-center">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  );
}
