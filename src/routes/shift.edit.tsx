import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { getActiveShift, updateShiftStart } from "@/lib/shift.functions";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/shift/edit")({ component: EditShiftPage });

function EditShiftPage() {
  const session = useAuthSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchActive = useServerFn(getActiveShift);
  const run = useServerFn(updateShiftStart);

  const active = useQuery({
    queryKey: ["active-shift", session?.user.id],
    enabled: !!session,
    queryFn: () => fetchActive(),
  });

  const [odo, setOdo] = useState("");
  const [rate, setRate] = useState("");
  const [tankFull, setTankFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = active.data?.shift;
    if (s) {
      setOdo(String(s.starting_odometer_km ?? ""));
      setRate(s.gas_rate_php_per_liter ? String(s.gas_rate_php_per_liter) : "");
      setTankFull(Boolean((s as { starting_tank_full?: boolean }).starting_tank_full));
    }
  }, [active.data?.shift]);

  if (session === undefined) return null;
  if (session === null) return <Navigate to="/login" />;
  if (active.data && !active.data.shift) return <Navigate to="/shift" />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const o = Number(odo);
    if (!o || o <= 0) return setError("Enter a valid starting odometer.");
    const r = rate ? Number(rate) : null;
    if (rate && (!r || r <= 0)) return setError("Enter a valid gas rate or leave it blank.");
    if (!active.data?.shift) return;
    setBusy(true);
    try {
      await run({
        data: {
          shiftId: active.data.shift.id,
          startingOdometerKm: o,
          gasRate: r,
          startingTankFull: tankFull,
        },
      });
      await qc.invalidateQueries({ queryKey: ["active-shift"] });
      navigate({ to: "/shift" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <Header title="Edit shift start" />
      <form onSubmit={submit} className="screen-pad flex flex-col gap-5">
        <p className="text-muted-foreground">
          Made a typo when you started the shift? Fix it here.
        </p>

        <label className="flex flex-col gap-2">
          <span className="font-semibold text-lg">Starting odometer (km)</span>
          <input
            inputMode="decimal" pattern="[0-9.]*"
            className="field text-2xl font-bold text-center"
            value={odo} onChange={(e) => setOdo(e.target.value)}
          />
        </label>

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
            <p className="font-semibold">I started with a full tank</p>
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

function Header({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-20 bg-card border-b border-border">
      <div className="max-w-md mx-auto h-14 px-2 flex items-center gap-2">
        <Link to="/shift" aria-label="Back" className="size-12 flex items-center justify-center rounded-xl active:bg-muted">
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
    </header>
  );
}
