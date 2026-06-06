import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuthSession } from "@/hooks/use-auth-session";
import { BottomNav } from "@/components/BottomNav";
import { getMyPerformance, getMyRideHeatmap } from "@/lib/shift.functions";
import { php, km } from "@/lib/format";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { Sparkles, Info } from "lucide-react";

type Period = "week" | "month" | "30d";

export const Route = createFileRoute("/insights")({ component: InsightsPage });

function InsightsPage() {
  const session = useAuthSession();
  const [period, setPeriod] = useState<Period>("30d");
  const fetchPerf = useServerFn(getMyPerformance);
  const q = useQuery({
    queryKey: ["my-performance", session?.user.id, period],
    enabled: !!session,
    queryFn: () => fetchPerf({ data: { period } }),
  });

  if (session === undefined) return null;
  if (session === null) return <Navigate to="/login" />;

  const d = q.data;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-4 pt-6 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-6 text-primary" />
          <h1 className="text-2xl font-bold">My Performance</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Track your earnings, distance, and efficiency.
        </p>
      </header>

      <div className="px-4">
        <div className="flex gap-1 bg-card border border-border rounded-md p-1 w-full">
          {(
            [
              { v: "week", l: "This week" },
              { v: "month", l: "This month" },
              { v: "30d", l: "Last 30 days" },
            ] as { v: Period; l: string }[]
          ).map((o) => (
            <button
              key={o.v}
              onClick={() => setPeriod(o.v)}
              className={`flex-1 px-3 py-2 text-sm font-semibold rounded ${period === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading && (
        <div className="px-4 py-8 text-center text-muted-foreground">Loading…</div>
      )}

      {d && (
        <main className="px-4 mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Net earnings" value={php(d.totals.net)} highlight />
            <Kpi
              label="₱ / hour"
              value={d.metrics.peso_per_hour != null ? php(d.metrics.peso_per_hour) : "—"}
            />
            <Kpi label="Total km" value={km(d.totals.total_km)} />
            <Kpi
              label="km / L"
              value={d.metrics.km_per_liter != null ? d.metrics.km_per_liter.toFixed(1) : "—"}
            />
          </div>

          <section className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <h2 className="font-semibold">Between-booking km</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Distance ridden between trips — burns fuel, earns nothing.
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">{km(d.between.between_km)}</div>
                <div className="text-xs text-muted-foreground">
                  of {km(d.between.paid_km + d.between.between_km)} total
                </div>
              </div>
            </div>
            <div className="mt-3 h-3 w-full rounded-full overflow-hidden bg-muted flex">
              {(() => {
                const sum = d.between.paid_km + d.between.between_km;
                const paidPct = sum > 0 ? (d.between.paid_km / sum) * 100 : 0;
                return (
                  <>
                    <div className="bg-primary" style={{ width: `${paidPct}%` }} />
                    <div className="bg-amber-500 flex-1" />
                  </>
                );
              })()}
            </div>
            <div className="mt-2 flex justify-between text-xs">
              <span className="text-primary font-medium">Paid {km(d.between.paid_km)}</span>
              <span className="text-amber-600 font-medium">
                Between {km(d.between.between_km)}
              </span>
            </div>
            {d.between.unknown_shifts > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="size-3.5 shrink-0 mt-0.5" />
                {d.between.unknown_shifts} shift
                {d.between.unknown_shifts === 1 ? "" : "s"} excluded — missing odometer reading.
              </p>
            )}
            {d.metrics.paid_distance_ratio != null && (
              <p className="mt-1 text-xs text-muted-foreground">
                Paid-distance ratio:{" "}
                <span className="font-semibold text-foreground">
                  {(d.metrics.paid_distance_ratio * 100).toFixed(0)}%
                </span>
              </p>
            )}
          </section>

          <section className="bg-card border border-border rounded-lg p-4">
            <h2 className="font-semibold mb-3">Net earnings — daily</h2>
            {d.daily.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No shifts yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={d.daily}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="net"
                    name="Net"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="bg-card border border-border rounded-lg p-4">
            <h2 className="font-semibold mb-3">Service mix</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={d.service}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="service_type" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Bar dataKey="net" name="Gross fares" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              {d.service.map((s) => (
                <div key={s.service_type} className="bg-muted/40 rounded p-2">
                  <div className="font-semibold capitalize">{s.service_type}</div>
                  <div className="text-muted-foreground">{s.trips} trips</div>
                  <div className="text-muted-foreground">
                    {s.peso_per_hour != null ? `${php(s.peso_per_hour)}/h` : "—"}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <p className="text-xs text-muted-foreground text-center pb-4">
            Based on {d.shiftCount} shift{d.shiftCount === 1 ? "" : "s"} in this period.
          </p>
        </main>
      )}

      <BottomNav />
    </div>
  );
}

function Kpi({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 border ${highlight ? "border-primary bg-primary/5" : "border-border bg-card"}`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}
