import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listDrivers,
  setDriverEnabled,
  setDriverAccessWindow,
  resetDriverPassword,
} from "@/lib/admin.functions";
import { Power, KeyRound, CalendarClock } from "lucide-react";

export const Route = createFileRoute("/admin/drivers")({ component: Drivers });

type Driver = Awaited<ReturnType<typeof listDrivers>>[number];

function Drivers() {
  const fetchDrivers = useServerFn(listDrivers);
  const q = useQuery({ queryKey: ["admin-drivers"], queryFn: () => fetchDrivers() });
  const qc = useQueryClient();
  const [accessFor, setAccessFor] = useState<Driver | null>(null);
  const [pwResult, setPwResult] = useState<{ email: string; pw: string } | null>(null);

  const enableFn = useServerFn(setDriverEnabled);
  const resetFn = useServerFn(resetDriverPassword);
  const enableMut = useMutation({
    mutationFn: (vars: { driverId: string; enabled: boolean }) => enableFn({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-drivers"] }),
  });
  const resetMut = useMutation({
    mutationFn: (vars: { driverId: string }) => resetFn({ data: vars }),
    onSuccess: (r: { password: string }, vars) => {
      const drv = q.data?.find((d) => d.id === vars.driverId);
      if (drv) setPwResult({ email: drv.email, pw: r.password });
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Drivers</h1>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <Th>Name</Th><Th>Email</Th><Th>Phone</Th><Th>Status</Th><Th>Access</Th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.map((d) => (
              <tr key={d.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{d.full_name || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{d.email}</td>
                <td className="px-3 py-2 text-muted-foreground">{d.phone || "—"}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${d.is_enabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {d.is_enabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {d.access_mode === "indefinite" ? (
                    <span className="text-muted-foreground">Indefinite</span>
                  ) : (
                    <span>
                      {d.access_starts_at?.slice(0, 10) ?? "?"} → {d.access_ends_at?.slice(0, 10) ?? "?"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2 justify-end flex-wrap">
                    <button
                      className="btn-sm"
                      onClick={() => enableMut.mutate({ driverId: d.id, enabled: !d.is_enabled })}
                    >
                      <Power className="size-3.5" /> {d.is_enabled ? "Disable" : "Enable"}
                    </button>
                    <button className="btn-sm" onClick={() => setAccessFor(d)}>
                      <CalendarClock className="size-3.5" /> Access
                    </button>
                    <button
                      className="btn-sm"
                      onClick={() => {
                        if (confirm(`Reset password for ${d.email}?`))
                          resetMut.mutate({ data: { driverId: d.id } });
                      }}
                    >
                      <KeyRound className="size-3.5" /> Reset PW
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {q.data?.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No drivers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {accessFor && (
        <AccessModal driver={accessFor} onClose={() => { setAccessFor(null); qc.invalidateQueries({ queryKey: ["admin-drivers"] }); }} />
      )}
      {pwResult && (
        <Modal onClose={() => setPwResult(null)} title="Password reset">
          <p className="text-sm">
            New password for <b>{pwResult.email}</b>:
          </p>
          <code className="block bg-muted rounded p-2 mt-2 text-base">{pwResult.pw}</code>
          <p className="text-xs text-muted-foreground mt-2">
            Share this with the driver. They will be sent through setup again on next sign-in.
          </p>
        </Modal>
      )}

      <style>{`.btn-sm{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:6px;font-size:12px;background:hsl(var(--muted));color:hsl(var(--foreground));font-weight:500}.btn-sm:hover{background:hsl(var(--muted-foreground)/0.15)}`}</style>
    </div>
  );
}

function AccessModal({ driver, onClose }: { driver: Driver; onClose: () => void }) {
  const [mode, setMode] = useState<"indefinite" | "duration">(driver.access_mode as "indefinite" | "duration");
  const [start, setStart] = useState(driver.access_starts_at?.slice(0, 10) ?? "");
  const [end, setEnd] = useState(driver.access_ends_at?.slice(0, 10) ?? "");
  const mut = useMutation({
    mutationFn: useServerFn(setDriverAccessWindow),
    onSuccess: onClose,
  });

  return (
    <Modal onClose={onClose} title={`Access — ${driver.full_name}`}>
      <div className="space-y-3">
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "indefinite"} onChange={() => setMode("indefinite")} />
          Indefinite
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "duration"} onChange={() => setMode("duration")} />
          Duration
        </label>
        {mode === "duration" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Start</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">End</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="input" />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() =>
              mut.mutate({
                data: {
                  driverId: driver.id,
                  mode,
                  startsAt: mode === "duration" && start ? new Date(start).toISOString() : null,
                  endsAt: mode === "duration" && end ? new Date(end + "T23:59:59").toISOString() : null,
                },
              })
            }
          >Save</button>
        </div>
      </div>
      <style>{`.input{width:100%;padding:6px 8px;border:1px solid hsl(var(--border));border-radius:6px;background:hsl(var(--background))}`}</style>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-card border border-border rounded-lg w-full max-w-md p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-3">{title}</h2>
        {children}
      </div>
    </div>
  );
}
