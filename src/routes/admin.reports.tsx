import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getFleetLeaderboard,
  getDataQualityReport,
  getFleetEngagement,
  getFleetServiceFuel,
  getAuditLog,
  getAccessReport,
} from "@/lib/admin.functions";
import { php, km } from "@/lib/format";
import {
  ArrowUpDown,
  AlertTriangle,
  Users,
  Fuel,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type RangeKey = "7d" | "30d" | "90d" | "all";
type TabKey =
  | "leaderboard"
  | "engagement"
  | "service_fuel"
  | "quality"
  | "audit"
  | "access";

export const Route = createFileRoute("/admin/reports")({ component: AdminReports });

function AdminReports() {
  const [tab, setTab] = useState<TabKey>("leaderboard");
  const [range, setRange] = useState<RangeKey>("30d");

  const { fromIso, toIso } = useMemo(() => {
    if (range === "all") return { fromIso: undefined, toIso: undefined };
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    const from = new Date();
    from.setDate(from.getDate() - days);
    return { fromIso: from.toISOString(), toIso: undefined };
  }, [range]);

  const showRange = tab !== "access" && tab !== "audit";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Reports</h1>
        {showRange && (
          <div className="flex gap-1 bg-card border border-border rounded-md p-1">
            {(["7d", "30d", "90d", "all"] as RangeKey[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-sm rounded font-medium ${range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {r === "all" ? "All time" : `Last ${r}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {(
          [
            { v: "leaderboard", l: "Leaderboard", I: ArrowUpDown },
            { v: "engagement", l: "Engagement", I: Users },
            { v: "service_fuel", l: "Service & Fuel", I: Fuel },
            { v: "quality", l: "Data quality", I: AlertTriangle },
            { v: "audit", l: "Audit log", I: ScrollText },
            { v: "access", l: "Access", I: ShieldCheck },
          ] as { v: TabKey; l: string; I: typeof Users }[]
        ).map((t) => {
          const Ico = t.I;
          return (
            <button
              key={t.v}
              onClick={() => setTab(t.v)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px inline-flex items-center gap-2 whitespace-nowrap ${tab === t.v ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            >
              <Ico className="size-4" /> {t.l}
            </button>
          );
        })}
      </div>

      {tab === "leaderboard" && <Leaderboard fromIso={fromIso} toIso={toIso} />}
      {tab === "engagement" && <Engagement fromIso={fromIso} toIso={toIso} />}
      {tab === "service_fuel" && <ServiceFuel fromIso={fromIso} toIso={toIso} />}
      {tab === "quality" && <DataQuality fromIso={fromIso} toIso={toIso} />}
      {tab === "audit" && <AuditLogTab />}
      {tab === "access" && <AccessTab />}
    </div>
  );
}

/* ----------------------------- Leaderboard ----------------------------- */
type SortKey =
  | "driver_name"
  | "net"
  | "trips"
  | "total_km"
  | "between_km"
  | "hours"
  | "peso_per_hour"
  | "peso_per_km"
  | "km_per_liter"
  | "last_active";

function Leaderboard({ fromIso, toIso }: { fromIso?: string; toIso?: string }) {
  const fetchFn = useServerFn(getFleetLeaderboard);
  const q = useQuery({
    queryKey: ["fleet-leaderboard", fromIso, toIso],
    queryFn: () => fetchFn({ data: { from: fromIso, to: toIso } }),
  });
  const [sortKey, setSortKey] = useState<SortKey>("net");
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => {
    if (!q.data) return [];
    const copy = [...q.data.rows];
    copy.sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return asc ? av - bv : bv - av;
      return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [q.data, sortKey, asc]);

  if (q.isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!rows.length) return <div className="text-muted-foreground">No shifts in this range.</div>;

  const TH = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th className={`px-3 py-2 text-xs font-semibold ${right ? "text-right" : "text-left"}`}>
      <button
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => {
          if (sortKey === k) setAsc(!asc);
          else {
            setSortKey(k);
            setAsc(false);
          }
        }}
      >
        {label} <ArrowUpDown className="size-3" />
      </button>
    </th>
  );

  return (
    <div className="bg-card border border-border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground border-b border-border">
          <tr>
            <TH k="driver_name" label="Driver" />
            <TH k="net" label="Net" right />
            <TH k="trips" label="Trips" right />
            <TH k="total_km" label="Total km" right />
            <TH k="between_km" label="Between km" right />
            <TH k="hours" label="Hours" right />
            <TH k="peso_per_hour" label="₱/hr" right />
            <TH k="peso_per_km" label="₱/km" right />
            <TH k="km_per_liter" label="km/L" right />
            <TH k="last_active" label="Last active" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.driver_id} className="border-b border-border last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2 font-medium">{r.driver_name}</td>
              <td className="px-3 py-2 text-right">{php(r.net)}</td>
              <td className="px-3 py-2 text-right">{r.trips}</td>
              <td className="px-3 py-2 text-right">{km(r.total_km)}</td>
              <td className="px-3 py-2 text-right">{km(r.between_km)}</td>
              <td className="px-3 py-2 text-right">{r.hours.toFixed(1)}</td>
              <td className="px-3 py-2 text-right">
                {r.peso_per_hour != null ? php(r.peso_per_hour) : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                {r.peso_per_km != null ? php(r.peso_per_km) : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                {r.km_per_liter != null ? r.km_per_liter.toFixed(1) : "—"}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {r.last_active ? new Date(r.last_active).toLocaleDateString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------- Engagement ----------------------------- */
const STATUS_BADGE: Record<string, string> = {
  active_7d: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  active_30d: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  dormant: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  never_rode: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = {
  active_7d: "Active (7d)",
  active_30d: "Active (30d)",
  dormant: "Dormant",
  never_rode: "Never rode",
};

function Engagement({ fromIso, toIso }: { fromIso?: string; toIso?: string }) {
  const fetchFn = useServerFn(getFleetEngagement);
  const q = useQuery({
    queryKey: ["fleet-engagement", fromIso, toIso],
    queryFn: () => fetchFn({ data: { from: fromIso, to: toIso } }),
  });
  if (q.isLoading) return <div className="text-muted-foreground">Loading…</div>;
  const d = q.data;
  if (!d) return null;

  const f = d.funnel;
  const steps = [
    { label: "Created", value: f.created },
    { label: "Signed in", value: f.signed_in },
    { label: "First shift", value: f.first_shift },
    { label: "First trip", value: f.first_trip },
  ];
  const max = Math.max(1, f.created);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="font-semibold mb-3">Driver activation funnel</h2>
        <div className="space-y-2">
          {steps.map((s, i) => {
            const prev = i === 0 ? null : steps[i - 1].value;
            const pct = (s.value / max) * 100;
            const stepPct = prev != null && prev > 0 ? (s.value / prev) * 100 : null;
            return (
              <div key={s.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-muted-foreground">
                    {s.value} {stepPct != null && `(${stepPct.toFixed(0)}% of prev)`}
                  </span>
                </div>
                <div className="h-1 bg-muted rounded overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground border-b border-border">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold">Driver</th>
              <th className="px-3 py-2 text-left text-xs font-semibold">Status</th>
              <th className="px-3 py-2 text-right text-xs font-semibold">Shifts in range</th>
              <th className="px-3 py-2 text-right text-xs font-semibold">Days since active</th>
              <th className="px-3 py-2 text-left text-xs font-semibold">Last active</th>
            </tr>
          </thead>
          <tbody>
            {d.perDriver.map((r) => (
              <tr key={r.driver_id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">{r.driver_name}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${STATUS_BADGE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">{r.shifts_in_range}</td>
                <td className="px-3 py-2 text-right">
                  {r.days_since_active == null ? "—" : r.days_since_active}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.last_active ? new Date(r.last_active).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ----------------------------- Service & Fuel ----------------------------- */
function ServiceFuel({ fromIso, toIso }: { fromIso?: string; toIso?: string }) {
  const fetchFn = useServerFn(getFleetServiceFuel);
  const q = useQuery({
    queryKey: ["fleet-service-fuel", fromIso, toIso],
    queryFn: () => fetchFn({ data: { from: fromIso, to: toIso } }),
  });
  if (q.isLoading) return <div className="text-muted-foreground">Loading…</div>;
  const d = q.data;
  if (!d) return null;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <section className="bg-card border border-border rounded-lg p-4 md:col-span-2">
        <h2 className="font-semibold mb-3">Service mix (gross fares)</h2>
        {d.byService.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No trips in range.</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={d.byService}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="service_type" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Bar dataKey="gross" name="Gross ₱" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
              {d.byService.map((s) => (
                <div key={s.service_type} className="bg-muted/40 rounded p-2">
                  <div className="font-semibold capitalize">{s.service_type}</div>
                  <div className="text-muted-foreground">{s.trips} trips · {s.share_pct.toFixed(0)}%</div>
                  <div className="text-muted-foreground">
                    {s.peso_per_hour != null ? `${php(s.peso_per_hour)}/h` : "—"}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="bg-card border border-border rounded-lg p-4 md:col-span-2">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold">Fuel spend</h2>
          <div className="text-sm text-muted-foreground">
            {php(d.fuel.total_spend)} · {d.fuel.total_liters.toFixed(1)} L
          </div>
        </div>
        {d.fuel.byDay.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No fuel logs in range.</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={d.fuel.byDay}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="spend"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="bg-card border border-border rounded-lg p-4 md:col-span-2">
        <h2 className="font-semibold mb-3">Efficiency outliers (km/L outside 10–100)</h2>
        {d.efficiencyOutliers.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            ✓ No outliers in range.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold">Driver</th>
                <th className="px-3 py-2 text-right text-xs font-semibold">km/L</th>
              </tr>
            </thead>
            <tbody>
              {d.efficiencyOutliers.map((o) => (
                <tr key={o.driver_id} className="border-t border-border">
                  <td className="px-3 py-2">{o.driver_name}</td>
                  <td className="px-3 py-2 text-right">{o.km_per_liter.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/* ----------------------------- Data Quality ----------------------------- */
const FLAG_LABEL: Record<string, string> = {
  missing_ending_odometer: "Missing ending odometer",
  abandoned_open_shift: "Open shift > 24h (abandoned?)",
  odometer_trip_mismatch: "Odometer / trip-distance mismatch",
  kmpl_out_of_range: "km/L out of plausible range",
  negative_net: "Negative net earnings",
  fare_per_km_outlier: "Fare/km outlier",
};

function DataQuality({ fromIso, toIso }: { fromIso?: string; toIso?: string }) {
  const fetchFn = useServerFn(getDataQualityReport);
  const q = useQuery({
    queryKey: ["data-quality", fromIso, toIso],
    queryFn: () => fetchFn({ data: { from: fromIso, to: toIso } }),
  });

  if (q.isLoading) return <div className="text-muted-foreground">Loading…</div>;
  const findings = q.data?.findings ?? [];
  if (!findings.length)
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-center text-muted-foreground">
        ✓ No data-quality issues in this range.
      </div>
    );

  const grouped = new Map<string, typeof findings>();
  for (const f of findings) {
    const arr = grouped.get(f.flag) ?? [];
    arr.push(f);
    grouped.set(f.flag, arr);
  }

  return (
    <div className="space-y-4">
      {[...grouped.entries()].map(([flag, items]) => (
        <div key={flag} className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="bg-amber-50 dark:bg-amber-950/20 px-4 py-2 flex items-center gap-2 border-b border-border">
            <AlertTriangle className="size-4 text-amber-600" />
            <h3 className="font-semibold text-sm">{FLAG_LABEL[flag] ?? flag}</h3>
            <span className="text-xs text-muted-foreground">({items.length})</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold">Driver</th>
                <th className="px-3 py-2 text-left text-xs font-semibold">Started</th>
                <th className="px-3 py-2 text-left text-xs font-semibold">Detail</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.shift_id + f.flag} className="border-t border-border">
                  <td className="px-3 py-2">{f.driver_name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(f.started_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs">{f.detail}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to="/admin/records"
                      search={{ shiftId: f.shift_id } as never}
                      className="text-xs text-primary hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------- Audit Log ----------------------------- */
function AuditLogTab() {
  const fetchFn = useServerFn(getAuditLog);
  const [entityType, setEntityType] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const q = useQuery({
    queryKey: ["audit-log", entityType, action],
    queryFn: () =>
      fetchFn({
        data: {
          entityType: entityType || undefined,
          action: action || undefined,
          limit: 200,
        },
      }),
  });
  const [openRow, setOpenRow] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <input
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          placeholder="Entity type (e.g. shift, profile)"
          className="px-3 py-1.5 text-sm bg-card border border-border rounded"
        />
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Action (e.g. update, delete)"
          className="px-3 py-1.5 text-sm bg-card border border-border rounded"
        />
      </div>
      {q.isLoading && <div className="text-muted-foreground">Loading…</div>}
      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground border-b border-border">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold">When</th>
              <th className="px-3 py-2 text-left text-xs font-semibold">Actor</th>
              <th className="px-3 py-2 text-left text-xs font-semibold">Action</th>
              <th className="px-3 py-2 text-left text-xs font-semibold">Entity</th>
              <th className="px-3 py-2 text-left text-xs font-semibold">Entity ID</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.rows ?? []).map((r) => {
              const isOpen = openRow === r.id;
              return (
                <Fragment key={r.id}>
                  <tr className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{r.actor_name || r.actor_id.slice(0, 8)}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded bg-muted text-xs font-medium">
                        {r.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.entity_type}</td>
                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
                      {r.entity_type === "shift" ? (
                        <Link
                          to="/admin/records"
                          search={{ shiftId: r.entity_id } as never}
                          className="text-primary hover:underline"
                        >
                          {r.entity_id.slice(0, 8)}…
                        </Link>
                      ) : (
                        `${r.entity_id.slice(0, 8)}…`
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setOpenRow(isOpen ? null : r.id)}
                        className="text-xs text-primary hover:underline"
                      >
                        {isOpen ? "Hide" : "Diff"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-muted/20">
                      <td colSpan={6} className="px-3 py-3">
                        <div className="grid md:grid-cols-2 gap-3 text-xs">
                          <div>
                            <div className="font-semibold mb-1 text-muted-foreground">Before</div>
                            <pre className="bg-background border border-border rounded p-2 overflow-x-auto max-h-64">
                              {JSON.stringify(r.before, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className="font-semibold mb-1 text-muted-foreground">After</div>
                            <pre className="bg-background border border-border rounded p-2 overflow-x-auto max-h-64">
                              {JSON.stringify(r.after, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {q.data && q.data.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No matching audit entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ----------------------------- Access ----------------------------- */
function AccessTab() {
  const fetchFn = useServerFn(getAccessReport);
  const q = useQuery({
    queryKey: ["access-report"],
    queryFn: () => fetchFn(),
  });
  if (q.isLoading) return <div className="text-muted-foreground">Loading…</div>;
  const d = q.data;
  if (!d) return null;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <section className="bg-card border border-border rounded-lg p-4">
        <h2 className="font-semibold mb-3">Drivers by access mode</h2>
        <div className="flex gap-6">
          <div>
            <div className="text-2xl font-bold">{d.byMode.indefinite}</div>
            <div className="text-xs text-muted-foreground">Indefinite</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{d.byMode.duration}</div>
            <div className="text-xs text-muted-foreground">Time-limited</div>
          </div>
        </div>
      </section>

      <section className="bg-card border border-border rounded-lg p-4">
        <h2 className="font-semibold mb-3">Pending resubscribe requests</h2>
        {d.pendingResubscribe.length === 0 ? (
          <div className="text-sm text-muted-foreground">None pending.</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {d.pendingResubscribe.map((r) => (
              <li key={r.id} className="flex justify-between items-center border-b border-border pb-2 last:border-0">
                <div>
                  <Link
                    to="/admin/drivers"
                    className="font-medium text-primary hover:underline"
                  >
                    {r.driver_name || r.driver_id.slice(0, 8)}
                  </Link>
                  {r.message && (
                    <div className="text-xs text-muted-foreground">{r.message}</div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card border border-border rounded-lg p-4 md:col-span-2">
        <h2 className="font-semibold mb-3">Expiring in the next 7 days</h2>
        {d.expiringSoon.length === 0 ? (
          <div className="text-sm text-muted-foreground">No upcoming expirations.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold">Driver</th>
                <th className="px-3 py-2 text-left text-xs font-semibold">Ends</th>
              </tr>
            </thead>
            <tbody>
              {d.expiringSoon.map((r) => (
                <tr key={r.driver_id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link to="/admin/drivers" className="text-primary hover:underline">
                      {r.driver_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(r.access_ends_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="bg-card border border-border rounded-lg p-4 md:col-span-2">
        <h2 className="font-semibold mb-3">Expired but still enabled</h2>
        {d.expired.length === 0 ? (
          <div className="text-sm text-muted-foreground">None.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold">Driver</th>
                <th className="px-3 py-2 text-left text-xs font-semibold">Expired</th>
              </tr>
            </thead>
            <tbody>
              {d.expired.map((r) => (
                <tr key={r.driver_id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link to="/admin/drivers" className="text-primary hover:underline">
                      {r.driver_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(r.access_ends_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
