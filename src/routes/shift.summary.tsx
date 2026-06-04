import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuthSession } from "@/hooks/use-auth-session";
import { getShiftSummary } from "@/lib/shift.functions";
import { computeShift } from "@/lib/shift-math";
import { php, km } from "@/lib/format";
import { CheckCircle2, AlertTriangle, Pencil } from "lucide-react";

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
  const ended = !!shift.ended_at;
  const startedLabel = new Date(shift.started_at).toLocaleString([], {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  return (
    <div className="screen">
      <div className="screen-pad">
        <div className="flex flex-col items-center text-center pt-6">
          <div className="size-20 rounded-full bg-success/15 text-success flex items-center justify-center">
            <CheckCircle2 className="size-12" />
          </div>
          <h1 className="text-2xl font-bold mt-4">
            {ended ? "Shift summary" : "Shift in progress"}
          </h1>
          <p className="text-muted-foreground mt-1">Started {startedLabel}</p>
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

        {math.unloggedKm > 0 && (
          <div className="card-surface mt-4 flex gap-3 border-accent/40 bg-accent/5">
            <AlertTriangle className="size-5 text-accent shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{km(math.unloggedKm)} not logged in any trip</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your odometer says you rode {km(math.shiftDistanceKm)}, but your trips only
                add up to {km(math.tripDistanceSumKm)}. The difference might be personal
                trips, dead miles, or trips you forgot to log.
              </p>
            </div>
          </div>
        )}

        <div className="card-surface mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Shift details</h2>
            <Link
              to="/shift/edit" search={{ id: shift.id }}
              className="text-sm font-semibold text-primary flex items-center gap-1 active:opacity-70"
            >
              <Pencil className="size-4" /> Edit
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
            <div>
              <p className="text-muted-foreground">Starting odo</p>
              <p className="font-semibold">{shift.starting_odometer_km ?? "—"} km</p>
            </div>
            <div>
              <p className="text-muted-foreground">Ending odo</p>
              <p className="font-semibold">{shift.ending_odometer_km ?? "—"} km</p>
            </div>
          </div>
        </div>

        <div className="card-surface mt-4">
          <h2 className="text-lg font-semibold">Trips</h2>
          {trips.length === 0 ? (
            <p className="text-muted-foreground mt-2">No trips logged.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {trips.map((t) => (
                <li key={t.id}>
                  <Link
                    to="/shift/trip" search={{ id: t.id }}
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

        <Link to="/reports" className="btn-secondary mt-6">Back to reports</Link>
        <Link to="/shift" className="btn-primary mt-3">Go to shift</Link>
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
