import { createFileRoute, Link, Navigate, useNavigate, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import {
  getActiveShift,
  getShiftSummary,
  updateShiftEnd,
  updateShiftStart,
} from "@/lib/shift.functions";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/shift/edit")({
  validateSearch: (s) => z.object({ id: z.string().uuid().optional() }).parse(s),
  component: EditShiftPage,
});

function EditShiftPage() {
  const { id: paramId } = Route.useSearch();
  const session = useAuthSession();
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const fetchActive = useServerFn(getActiveShift);
  const fetchSummary = useServerFn(getShiftSummary);
  const runStart = useServerFn(updateShiftStart);
  const runEnd = useServerFn(updateShiftEnd);

  const active = useQuery({
    queryKey: ["active-shift", session?.user.id],
    enabled: !!session && !paramId,
    queryFn: () => fetchActive(),
  });
  const past = useQuery({
    queryKey: ["shift-summary", paramId],
    enabled: !!session && !!paramId,
    queryFn: () => fetchSummary({ data: { shiftId: paramId! } }),
  });

  const shift = paramId ? past.data?.shift : active.data?.shift;

  const [odo, setOdo] = useState("");
  const [endOdo, setEndOdo] = useState("");
  const [rate, setRate] = useState("");
  const [tankFull, setTankFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shift) return;
    setOdo(String(shift.starting_odometer_km ?? ""));
    setEndOdo(shift.ending_odometer_km != null ? String(shift.ending_odometer_km) : "");
    setRate(shift.gas_rate_php_per_liter ? String(shift.gas_rate_php_per_liter) : "");
    setTankFull(Boolean((shift as { starting_tank_full?: boolean }).starting_tank_full));
  }, [shift]);

  if (session === undefined) return null;
  if (session === null) return <Navigate to="/login" />;
  if (!paramId && active.data && !active.data.shift) return <Navigate to="/shift" />;
  if (!shift) return null;

  const ended = !!shift.ended_at;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const o = Number(odo);
    if (!o || o <= 0) return setError("Enter a valid starting odometer.");
    const r = rate ? Number(rate) : null;
    if (rate && (!r || r <= 0)) return setError("Enter a valid gas rate or leave it blank.");
    let endVal: number | null = null;
    if (ended) {
      endVal = Number(endOdo);
      if (!endVal || endVal <= 0) return setError("Enter the ending odometer.");
      if (endVal < o) return setError("Ending reading can't be less than starting.");
    }
    setBusy(true);
    try {
      await runStart({
        data: {
          shiftId: shift!.id,
          startingOdometerKm: o,
          gasRate: r,
          startingTankFull: tankFull,
        },
      });
      if (ended && endVal != null) {
        await runEnd({ data: { shiftId: shift!.id, endingOdometerKm: endVal } });
      }
      await qc.invalidateQueries({ queryKey: ["active-shift"] });
      await qc.invalidateQueries({ queryKey: ["shift-summary", shift!.id] });
      await qc.invalidateQueries({ queryKey: ["my-shifts"] });
      if (paramId) router.history.back();
      else navigate({ to: "/shift" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <Header />
      <form onSubmit={submit} className="screen-pad flex flex-col gap-5">
        <p className="text-muted-foreground">
          {ended ? "Fix any mistakes in this past shift's details." : "Made a typo when you started the shift? Fix it here."}
        </p>

        <label className="flex flex-col gap-2">
          <span className="font-semibold text-lg">Starting odometer (km)</span>
          <input
            inputMode="decimal" pattern="[0-9.]*"
            className="field text-2xl font-bold text-center"
            value={odo} onChange={(e) => setOdo(e.target.value)}
          />
        </label>

        {ended && (
          <label className="flex flex-col gap-2">
            <span className="font-semibold text-lg">Ending odometer (km)</span>
            <input
              inputMode="decimal" pattern="[0-9.]*"
              className="field text-2xl font-bold text-center"
              value={endOdo} onChange={(e) => setEndOdo(e.target.value)}
            />
          </label>
        )}

        <label className="flex flex-col gap-2">
          <span className="font-semibold text-lg">Gas rate (₱/L)</span>
          <input
            inputMode="decimal" pattern="[0-9.]*" className="field"
            placeholder="optional"
            value={rate} onChange={(e) => setRate(e.target.value)}
          />
        </label>

        <label className="card-surface flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox" className="size-6 mt-0.5 accent-primary"
            checked={tankFull} onChange={(e) => setTankFull(e.target.checked)}
          />
          <div>
            <p className="font-semibold">Started with a full tank</p>
            <p className="text-sm text-muted-foreground">
              Lets us estimate the fuel left in your tank during the shift.
            </p>
          </div>
        </label>

        {error && <p className="text-destructive font-medium">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary mt-2">
          {busy ? "Saving..." : "Save changes"}
        </button>
      </form>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 bg-card border-b border-border">
      <div className="max-w-md mx-auto h-14 px-2 flex items-center gap-2">
        <Link to="/shift" aria-label="Back" className="size-12 flex items-center justify-center rounded-xl active:bg-muted">
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="text-lg font-semibold">Edit shift</h1>
      </div>
    </header>
  );
}
