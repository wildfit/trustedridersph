import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFleetLeaderboard, getDataQualityReport } from "@/lib/admin.functions";
import { php, km } from "@/lib/format";
import { ArrowUpDown, AlertTriangle } from "lucide-react";

type RangeKey = "7d" | "30d" | "90d" | "all";

export const Route = createFileRoute("/admin/reports")({ component: AdminReports });

function AdminReports() {
  const [tab, setTab] = useState<"leaderboard" | "quality">("leaderboard");
  const [range, setRange] = useState<RangeKey>("30d");

  const { fromIso, toIso } = useMemo(() => {
    if (range === "all") return { fromIso: undefined, toIso: undefined };
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    const from = new Date();
    from.setDate(from.getDate() - days);
    return { fromIso: from.toISOString(), toIso: undefined };
  }, [range]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Reports</h1>
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
      </div>

      <div className="flex gap-1 border-b border-border">
        {(
          [
            { v: "leaderboard", l: "Fleet leaderboard" },
            { v: "quality", l: "Data quality" },
          ] as const
        ).map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === t.v ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === "leaderboard" ? (
        <Leaderboard fromIso={fromIso} toIso={toIso} />
      ) : (
        <DataQuality fromIso={fromIso} toIso={toIso} />
      )}
    </div>
  );
}

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

  // group by flag
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
