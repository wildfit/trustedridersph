import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listDrivers,
  setDriverEnabled,
  setDriverAccessWindow,
  resetDriverPassword,
  createDriver,
  updateDriverProfile,
  deleteDriver,
} from "@/lib/admin.functions";
import { Power, KeyRound, CalendarClock, Pencil, Trash2, UserPlus } from "lucide-react";

export const Route = createFileRoute("/admin/drivers")({ component: Drivers });

type Driver = Awaited<ReturnType<typeof listDrivers>>[number];

function Drivers() {
  const fetchDrivers = useServerFn(listDrivers);
  const q = useQuery({ queryKey: ["admin-drivers"], queryFn: () => fetchDrivers() });
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-drivers"] });

  const [accessFor, setAccessFor] = useState<Driver | null>(null);
  const [editFor, setEditFor] = useState<Driver | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pwResult, setPwResult] = useState<{ email: string; pw: string } | null>(null);

  const enableMut = useMutation({
    mutationFn: useServerFn(setDriverEnabled),
    onSuccess: invalidate,
  });
  const resetFn = useServerFn(resetDriverPassword);
  const resetMut = useMutation({
    mutationFn: (vars: { driverId: string }) => resetFn({ data: vars }),
    onSuccess: (r: { password: string }, vars) => {
      const drv = q.data?.find((d) => d.id === vars.driverId);
      if (drv) setPwResult({ email: drv.email, pw: r.password });
    },
  });
  const deleteFn = useServerFn(deleteDriver);
  const deleteMut = useMutation({
    mutationFn: (vars: { driverId: string }) => deleteFn({ data: vars }),
    onSuccess: invalidate,
    onError: (e: Error) => alert(`Delete failed: ${e.message}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Drivers</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-md text-sm font-semibold bg-primary text-primary-foreground"
        >
          <UserPlus className="size-4" /> New driver
        </button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              {["Name","Email","Phone","Status","Access"].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
              ))}
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
                    <button className="btn-sm" onClick={() => setEditFor(d)}>
                      <Pencil className="size-3.5" /> Edit
                    </button>
                    <button
                      className="btn-sm"
                      onClick={() => enableMut.mutate({ data: { driverId: d.id, enabled: !d.is_enabled } })}
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
                          resetMut.mutate({ driverId: d.id });
                      }}
                    >
                      <KeyRound className="size-3.5" /> Reset PW
                    </button>
                    <button
                      className="btn-sm btn-danger"
                      onClick={() => {
                        if (
                          confirm(
                            `Delete ${d.full_name || d.email}? This permanently removes the account and all shifts, trips, fuel logs, and fees for this driver.`,
                          )
                        ) {
                          deleteMut.mutate({ driverId: d.id });
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" /> Delete
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
        <AccessModal driver={accessFor} onClose={() => { setAccessFor(null); invalidate(); }} />
      )}
      {editFor && (
        <EditModal driver={editFor} onClose={() => { setEditFor(null); invalidate(); }} />
      )}
      {createOpen && (
        <CreateModal
          onClose={() => { setCreateOpen(false); invalidate(); }}
          onCreated={(email, pw) => setPwResult({ email, pw })}
        />
      )}
      {pwResult && (
        <Modal onClose={() => setPwResult(null)} title="Password">
          <p className="text-sm">
            Password for <b>{pwResult.email}</b>:
          </p>
          <code className="block bg-muted rounded p-2 mt-2 text-base">{pwResult.pw}</code>
          <p className="text-xs text-muted-foreground mt-2">
            Share this with the driver. They'll be sent through setup again on next sign-in.
          </p>
        </Modal>
      )}

      <style>{`.btn-sm{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:6px;font-size:12px;background:hsl(var(--muted));color:hsl(var(--foreground));font-weight:500}.btn-sm:hover{background:hsl(var(--muted-foreground)/0.15)}.btn-danger{background:hsl(var(--destructive)/0.12);color:hsl(var(--destructive))}.btn-danger:hover{background:hsl(var(--destructive)/0.2)}.input{width:100%;padding:6px 8px;border:1px solid hsl(var(--border));border-radius:6px;background:hsl(var(--background));font-size:14px}`}</style>
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
    </Modal>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (email: string, pw: string) => void }) {
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    phone: "",
    motorcycle_brand: "",
    motorcycle_model: "",
    fuel_tank_liters: "",
    password: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: useServerFn(createDriver),
    onSuccess: (r: { password: string }) => {
      onCreated(form.email, r.password);
      onClose();
    },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <Modal onClose={onClose} title="New driver">
      <div className="space-y-3">
        <Field label="Email *">
          <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Full name *">
          <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Phone">
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Tank (L)">
            <input className="input" type="number" step="0.1" value={form.fuel_tank_liters} onChange={(e) => setForm({ ...form, fuel_tank_liters: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Motorcycle brand">
            <input className="input" value={form.motorcycle_brand} onChange={(e) => setForm({ ...form, motorcycle_brand: e.target.value })} />
          </Field>
          <Field label="Motorcycle model">
            <input className="input" value={form.motorcycle_model} onChange={(e) => setForm({ ...form, motorcycle_model: e.target.value })} />
          </Field>
        </div>
        <Field label="Initial password (optional — uses default if blank)">
          <input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={mut.isPending || !form.email || !form.full_name}
            onClick={() => {
              setErr(null);
              mut.mutate({
                data: {
                  email: form.email.trim(),
                  full_name: form.full_name.trim(),
                  phone: form.phone.trim() || null,
                  motorcycle_brand: form.motorcycle_brand.trim() || null,
                  motorcycle_model: form.motorcycle_model.trim() || null,
                  fuel_tank_liters: form.fuel_tank_liters ? Number(form.fuel_tank_liters) : null,
                  password: form.password || undefined,
                },
              });
            }}
          >{mut.isPending ? "Creating…" : "Create"}</button>
        </div>
      </div>
    </Modal>
  );
}

function EditModal({ driver, onClose }: { driver: Driver; onClose: () => void }) {
  const [form, setForm] = useState({
    email: driver.email,
    full_name: driver.full_name ?? "",
    phone: driver.phone ?? "",
    motorcycle_brand: driver.motorcycle_brand ?? "",
    motorcycle_model: driver.motorcycle_model ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: useServerFn(updateDriverProfile),
    onSuccess: onClose,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <Modal onClose={onClose} title={`Edit — ${driver.full_name || driver.email}`}>
      <div className="space-y-3">
        <Field label="Email">
          <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Full name">
          <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label="Phone">
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Motorcycle brand">
            <input className="input" value={form.motorcycle_brand} onChange={(e) => setForm({ ...form, motorcycle_brand: e.target.value })} />
          </Field>
          <Field label="Motorcycle model">
            <input className="input" value={form.motorcycle_model} onChange={(e) => setForm({ ...form, motorcycle_model: e.target.value })} />
          </Field>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={mut.isPending}
            onClick={() => {
              setErr(null);
              const emailChanged = form.email.trim().toLowerCase() !== (driver.email ?? "").toLowerCase();
              mut.mutate({
                data: {
                  driverId: driver.id,
                  full_name: form.full_name.trim() || undefined,
                  phone: form.phone.trim() || null,
                  motorcycle_brand: form.motorcycle_brand.trim() || null,
                  motorcycle_model: form.motorcycle_model.trim() || null,
                  ...(emailChanged && form.email ? { email: form.email.trim() } : {}),
                },
              });
            }}
          >{mut.isPending ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-card border border-border rounded-lg w-full max-w-md p-5 shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-3">{title}</h2>
        {children}
      </div>
    </div>
  );
}
