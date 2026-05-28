import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listLiveDrivers } from "@/lib/requests.functions";
import { Radio, Bike } from "lucide-react";

export const Route = createFileRoute("/admin/live")({ component: AdminLive });

function AdminLive() {
  const fetchLive = useServerFn(listLiveDrivers);
  const live = useQuery({
    queryKey: ["admin-live"],
    queryFn: () => fetchLive({ data: { withinMinutes: 5 } }),
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Radio className="size-6 text-emerald-500" /> Live drivers
        </h1>
        <p className="text-sm text-muted-foreground">
          Drivers active in the last 5 minutes. Refreshes automatically.
        </p>
      </header>

      {live.isLoading && <p className="text-muted-foreground">Loading…</p>}
      {live.data && live.data.length === 0 && (
        <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
          No drivers active right now.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(live.data ?? []).map((d) => {
          const onShift = !!d.active_shift;
          const lastSeen = d.last_seen_at ? new Date(d.last_seen_at) : null;
          const ago = lastSeen
            ? Math.max(1, Math.round((Date.now() - lastSeen.getTime()) / 60000))
            : null;
          return (
            <div key={d.id} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <Bike className="size-5" />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-500 border-2 border-card animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">
                    {d.full_name ?? "Unnamed driver"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {d.motorcycle_brand} {d.motorcycle_model} · {d.phone ?? "—"}
                  </p>
                </div>
                {onShift && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                    On shift
                  </span>
                )}
              </div>
              <div className="mt-3 text-xs text-muted-foreground flex justify-between">
                <span>Last seen {ago}m ago</span>
                {d.active_shift?.started_at && (
                  <span>
                    Shift started{" "}
                    {new Date(d.active_shift.started_at).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
