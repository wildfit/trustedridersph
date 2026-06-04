import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { z } from "zod";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuthSession } from "@/hooks/use-auth-session";
import { BottomNav } from "@/components/BottomNav";
import { listMyShifts } from "@/lib/shift.functions";
import { computeShift } from "@/lib/shift-math";
import { php, km } from "@/lib/format";
import { AlertTriangle, Calendar, FileBarChart } from "lucide-react";

type RangeKey = "7d" | "30d" | "90d" | "custom" | "all";
type StatusKey = "all" | "ended" | "active";
type ServiceKey = "all" | "angkas" | "pabakal" | "padala";

export const Route = createFileRoute("/reports")({
  validateSearch: (s) =>
    z
      .object({
        range: z.enum(["7d", "30d", "90d", "custom", "all"]).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        status: z.enum(["all", "ended", "active"]).optional(),
        service: z.enum(["all", "angkas", "pabakal", "padala"]).optional(),
      })
      .parse(s),
  component: ReportsPage,
});

function ReportsPage() {
  const search = Route.useSearch();
  const session = useAuthSession();
  const fetchShifts = useServerFn(listMyShifts);

  const range: RangeKey = search.range ?? "30d";
  const status: StatusKey = search.status ?? "all";
  const service: ServiceKey = search.service ?? "all";

  const navigate = Route.useNavigate();
  const [customFrom, setCustomFrom] = useState(search.from ?? "");
  const [customTo, setCustomTo] = useState(search.to ?? "");

  const { fromIso, toIso } = useMemo(() => {
    const now = new Date();
    if (range === "all") return { fromIso: undefined, toIso: undefined };
    if (range === "custom") {
      return {
        fromIso: search.from ? new Date(search.from + "T00:00:00").toISOString() : undefined,
        toIso: search.to ? new Date(search.to + "T23:59:59").toISOString() : undefined,
      };
    }
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    const from = new Date(now);
    from.setDate(from.getDate() - days);
    return { fromIso: from.toISOString(), toIso: undefined };
  }, [range, search.from, search.to]);

  const q = useQuery({
    queryKey: ["my-shifts", session?.user.id, fromIso, toIso, status, service],
    enabled: !!session,
    queryFn: () =>
      fetchShifts({
        data: {
          from: fromIso,
          to: toIso,
          status: status === "all" ? undefined : status,
          serviceType: service === "all" ? undefined : service,
        },
      }),
  });

  if (session === undefined) return null;
  if (session === null) return <Navigate to="/login" />;

  const shifts = q.data?.shifts ?? [];

  const totals = shifts.reduce(
    (acc, s) => {
      const m = computeShift({
        startingOdo: Number(s.starting_odometer_km ?? 0),
        endingOdo: s.ending_odometer_km != null ? Number(s.ending_odometer_km) : null,
        trips: s.trips,
        fuelLogs: s.fuelLogs,
        feeEntries: s.feeEntries,
        gasRate: Number(s.gas_rate_php_per_liter ?? 0) || null,
      });
      acc.net += m.netEarnings;
      acc.gross += m.grossEarnings;
      acc.expenses += m.totalExpenses;
      acc.distance += m.shiftDistanceKm;
      acc.trips += m.tripsCount;
      acc.unlogged += m.unloggedKm;
      return acc;
    },
    { net: 0, gross: 0, expenses: 0, distance: 0, trips: 0, unlogged: 0 },
  );

  function setRange(r: RangeKey) {
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, range: r }) });
  }
  function setStatus(s: StatusKey) {
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, status: s }) });
  }
  function setService(s: ServiceKey) {
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, service: s }) });
  }

  return (
    <div className="screen">
      <div className="screen-pad">
        <header className="pt-4 pb-4">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileBarChart className="size-7" /> Reports
          </h1>
          <p className="text-muted-foreground mt-1">
            Review past shifts and earnings. Tap any shift to edit details.
          </p>
        </header>

        <Section title="Date range" icon={<Calendar className="size-4" />}>
          <Chips
            value={range}
            onChange={(v) => setRange(v as RangeKey)}
            options={[
              { v: "7d", l: "7 days" },
              { v: "30d", l: "30 days" },
              { v: "90d", l: "90 days" },
              { v: "all", l: "All time" },
              { v: "custom", l: "Custom" },
            ]}
          />
          {range === "custom" && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              <input
                type="date" className="field" value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <input
                type="date" className="field" value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
              <button
                type="button"
                className="col-span-2 btn-secondary"
                onClick={() =>
                  navigate({
                    search: (p) => ({ ...p, range: "custom", from: customFrom || undefined, to: customTo || undefined }),
                  })
                }
              >
                Apply dates
              </button>
            </div>
          )}
        </Section>

        <Section title="Status">
          <Chips
            value={status}
            onChange={(v) => setStatus(v as StatusKey)}
            options={[
              { v: "all", l: "All" },
              { v: "ended", l: "Ended" },
              { v: "active", l: "Active" },
            ]}
          />
        </Section>

        <Section title="Service">
          <Chips
            value={service}
            onChange={(v) => setService(v as ServiceKey)}
            options={[
              { v: "all", l: "All" },
              { v: "angkas", l: "Angkas" },
              { v: "pabakal", l: "Pabakal" },
              { v: "padala", l: "Padala" },
            ]}
          />
        </Section>

        <div className="card-surface bg-gradient-to-br from-primary to-accent text-primary-foreground border-0 mt-5 text-center">
          <p className="text-sm opacity-90">Net for {shifts.length} shift{shifts.length === 1 ? "" : "s"}</p>
          <p className="text-4xl font-bold mt-1">{php(totals.net)}</p>
          <p className="text-sm mt-2 opacity-90">
            {php(totals.gross)} gross − {php(totals.expenses)} expenses
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          <Mini label="Trips" value={String(totals.trips)} />
          <Mini label="Distance" value={km(totals.distance)} />
          <Mini label="Unlogged" value={km(totals.unlogged)} />
        </div>

        <div className="mt-5 flex flex-col gap-3">
          {q.isLoading && (
            <div className="card-surface text-center text-muted-foreground">Loading…</div>
          )}
          {!q.isLoading && shifts.length === 0 && (
            <div className="card-surface text-center text-muted-foreground">
              No shifts match these filters.
            </div>
          )}
          {shifts.map((s) => {
            const m = computeShift({
              startingOdo: Number(s.starting_odometer_km ?? 0),
              endingOdo: s.ending_odometer_km != null ? Number(s.ending_odometer_km) : null,
              trips: s.trips,
              fuelLogs: s.fuelLogs,
              feeEntries: s.feeEntries,
              gasRate: Number(s.gas_rate_php_per_liter ?? 0) || null,
            });
            const ended = !!s.ended_at;
            const started = new Date(s.started_at);
            return (
              <Link
                key={s.id} to="/shift/summary" search={{ id: s.id }}
                className="card-surface active:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {started.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {started.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      {" · "}
                      {ended ? `${m.tripsCount} trips · ${km(m.shiftDistanceKm)}` : "in progress"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{php(m.netEarnings)}</p>
                    <p className="text-xs text-muted-foreground">net</p>
                  </div>
                </div>
                {m.unloggedKm > 0 && (
                  <p className="mt-2 text-xs font-semibold text-accent flex items-center gap-1">
                    <AlertTriangle className="size-3.5" /> {km(m.unloggedKm)} unlogged
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

function Section({
  title, icon, children,
}: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold flex items-center gap-1.5 mb-2">
        {icon} {title}
      </p>
      {children}
    </div>
  );
}

function Chips<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; l: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`h-9 px-3 rounded-full text-sm font-semibold border ${
            value === o.v
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border text-foreground active:bg-muted"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-surface text-center">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-base font-bold mt-0.5">{value}</p>
    </div>
  );
}
