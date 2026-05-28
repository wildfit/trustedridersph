import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listShiftRecords, getShiftDetail, updateShiftRecord, updateTripRecord, updateFuelLogRecord, deleteRecord,
} from "@/lib/admin.functions";
import { php, km } from "@/lib/format";
import { Pencil, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/admin/records")({ component: Records });

function Records() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const fetchList = useServerFn(listShiftRecords);
  const q = useQuery({
    queryKey: ["admin-records", from, to],
    queryFn: () => fetchList({ data: {
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
    } }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Shift Records</h1>
      <div className="bg-card border border-border rounded-lg p-3 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground">From</label>
          <input type="date" className="block px-2 py-1.5 border border-border rounded bg-background" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">To</label>
          <input type="date" className="block px-2 py-1.5 border border-border rounded bg-background" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="btn-secondary" onClick={() => { setFrom(""); setTo(""); }}>Clear</button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <Th>Date</Th><Th>Driver</Th><Th>Distance</Th><Th>Gross</Th><Th>Fuel</Th><Th>Net</Th><th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {q.data?.shifts.map((s) => (
              <tr key={s.id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setOpenId(s.id)}>
                <td className="px-3 py-2">{(s.started_at as string).slice(0, 10)}</td>
                <td className="px-3 py-2 font-medium">{s.driver_name}</td>
                <td className="px-3 py-2">{km(s.total_distance_km)}</td>
                <td className="px-3 py-2">{php(s.gross_earnings_php)}</td>
                <td className="px-3 py-2 text-muted-foreground">{php(s.fuel_cost_php)}</td>
                <td className={`px-3 py-2 font-semibold ${s.net_earnings_php >= 0 ? "text-green-700" : "text-red-700"}`}>{php(s.net_earnings_php)}</td>
                <td className="px-3 py-2 text-right text-xs text-muted-foreground">view →</td>
              </tr>
            ))}
            {q.data?.shifts.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No records.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {openId && <ShiftDetail shiftId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function ShiftDetail({ shiftId, onClose }: { shiftId: string; onClose: () => void }) {
  const fetchDetail = useServerFn(getShiftDetail);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["shift-detail", shiftId], queryFn: () => fetchDetail({ data: { shiftId } }) });

  const updShift = useMutation({ mutationFn: useServerFn(updateShiftRecord), onSuccess: () => { q.refetch(); qc.invalidateQueries({ queryKey: ["admin-records"] }); } });
  const updTrip = useMutation({ mutationFn: useServerFn(updateTripRecord), onSuccess: () => q.refetch() });
  const updFuel = useMutation({ mutationFn: useServerFn(updateFuelLogRecord), onSuccess: () => q.refetch() });
  const del = useMutation({ mutationFn: useServerFn(deleteRecord), onSuccess: () => { q.refetch(); qc.invalidateQueries({ queryKey: ["admin-records"] }); } });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-card border border-border rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border p-4 flex justify-between items-center">
          <h2 className="text-lg font-bold">Shift detail</h2>
          <button onClick={onClose}><X className="size-5" /></button>
        </div>
        <div className="p-4 space-y-5">
          {q.data && (
            <>
              <Section title="Shift">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <NumField label="Start odo (km)" value={q.data.shift.starting_odometer_km} onSave={(v) => updShift.mutate({ data: { shiftId, starting_odometer_km: v } })} />
                  <NumField label="End odo (km)" value={q.data.shift.ending_odometer_km} onSave={(v) => updShift.mutate({ data: { shiftId, ending_odometer_km: v } })} />
                  <NumField label="Gas rate (₱/L)" value={q.data.shift.gas_rate_php_per_liter} onSave={(v) => updShift.mutate({ data: { shiftId, gas_rate_php_per_liter: v } })} />
                </div>
              </Section>

              <Section title={`Trips (${q.data.trips.length})`}>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground"><th>Service</th><th>Distance (km)</th><th>Fare (₱)</th><th></th></tr></thead>
                  <tbody>
                    {q.data.trips.map((t) => (
                      <tr key={t.id} className="border-t border-border">
                        <td className="py-1">{t.service_type}</td>
                        <td><EditInline value={Number(t.distance_km ?? 0)} onSave={(v) => updTrip.mutate({ data: { id: t.id, distance_km: v } })} /></td>
                        <td><EditInline value={Number(t.gross_fare_php ?? 0)} onSave={(v) => updTrip.mutate({ data: { id: t.id, gross_fare_php: v } })} /></td>
                        <td className="text-right">
                          <button className="icon-btn text-red-600" onClick={() => { if (confirm("Delete trip?")) del.mutate({ data: { entity: "trip", id: t.id } }); }}><Trash2 className="size-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>

              <Section title={`Fuel logs (${q.data.fuelLogs.length})`}>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground"><th>Cost (₱)</th><th>Liters</th><th>Rate (₱/L)</th><th></th></tr></thead>
                  <tbody>
                    {q.data.fuelLogs.map((f) => (
                      <tr key={f.id} className="border-t border-border">
                        <td><EditInline value={Number(f.total_cost_php ?? 0)} onSave={(v) => updFuel.mutate({ data: { id: f.id, total_cost_php: v } })} /></td>
                        <td><EditInline value={Number(f.liters ?? 0)} onSave={(v) => updFuel.mutate({ data: { id: f.id, liters: v } })} /></td>
                        <td><EditInline value={Number(f.price_per_liter_php ?? 0)} onSave={(v) => updFuel.mutate({ data: { id: f.id, price_per_liter_php: v } })} /></td>
                        <td className="text-right">
                          <button className="icon-btn text-red-600" onClick={() => { if (confirm("Delete fuel log?")) del.mutate({ data: { entity: "fuel_log", id: f.id } }); }}><Trash2 className="size-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>

              <Section title={`Fee entries (${q.data.feeEntries.length})`}>
                <ul className="text-sm divide-y divide-border">
                  {q.data.feeEntries.map((e) => (
                    <li key={e.id} className="py-1 flex justify-between">
                      <span>
                        {(e.category as { name?: string } | null)?.name ?? "—"}{" "}
                        <span className="text-xs text-muted-foreground">({(e.category as { entry_type?: string } | null)?.entry_type})</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {php(Number(e.amount_php))}
                        <button className="icon-btn text-red-600" onClick={() => { if (confirm("Delete?")) del.mutate({ data: { entity: "fee_entry", id: e.id } }); }}><Trash2 className="size-3.5" /></button>
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title={`Audit trail (${q.data.audit.length})`}>
                {q.data.audit.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No edits yet.</p>
                ) : (
                  <ul className="text-xs space-y-1">
                    {q.data.audit.map((a) => (
                      <li key={a.id} className="text-muted-foreground">
                        <span className="font-mono">{new Date(a.created_at).toLocaleString()}</span> — <b>{a.action}</b> on {a.entity_type} by {a.actor_id.slice(0, 8)}…
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <div className="bg-muted/30 rounded p-3">{children}</div>
    </div>
  );
}

function NumField({ label, value, onSave }: { label: string; value: unknown; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value ?? ""));
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-1 mt-1">
        <input type="number" step="0.01" className="flex-1 px-2 py-1 border border-border rounded bg-background" value={v} onChange={(e) => setV(e.target.value)} />
        <button className="btn-sm" onClick={() => onSave(Number(v))}><Pencil className="size-3.5" /></button>
      </div>
    </label>
  );
}

function EditInline({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  return (
    <div className="flex items-center gap-1">
      <input type="number" step="0.01" className="w-24 px-1.5 py-0.5 border border-border rounded bg-background text-sm" value={v} onChange={(e) => setV(e.target.value)} />
      <button className="icon-btn" onClick={() => onSave(Number(v))}><Pencil className="size-3.5" /></button>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-2 font-semibold text-xs uppercase tracking-wide text-muted-foreground">{children}</th>; }
