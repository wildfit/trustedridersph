import { createFileRoute, Navigate, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { startShift } from "@/lib/shift.functions";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/shift/start")({ component: StartShiftPage });

function StartShiftPage() {
  const session = useAuthSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const run = useServerFn(startShift);
  const [odo, setOdo] = useState("");
  const [rate, setRate] = useState("");
  const [startCost, setStartCost] = useState("");
  const [tankFull, setTankFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session === undefined) return null;
  if (session === null) return <Navigate to="/login" />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const o = Number(odo);
    if (!o || o <= 0) return setError("Please enter your starting odometer reading.");
    setBusy(true);
    try {
      await run({
        data: {
          startingOdometerKm: o,
          gasRate: rate ? Number(rate) : undefined,
          startingFuelCostPhp: startCost ? Number(startCost) : undefined,
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
      <Header title="Start shift" backTo="/shift" />
      <form onSubmit={submit} className="screen-pad flex flex-col gap-5">
        <p className="text-muted-foreground">
          Look at your motorcycle's odometer and type the current reading.
        </p>
        <label className="flex flex-col gap-2">
          <span className="font-semibold text-lg">Starting odometer (km)</span>
          <input
            autoFocus inputMode="decimal" pattern="[0-9.]*"
            className="field text-2xl font-bold text-center"
            placeholder="e.g. 12345"
            value={odo}
            onChange={(e) => setOdo(e.target.value)}
          />
        </label>

        <div className="card-surface">
          <h2 className="text-base font-semibold">Optional fuel info</h2>
          <p className="text-sm text-muted-foreground mt-1">You can also set these later in the Fuel tab.</p>
          <label className="flex flex-col gap-2 mt-3">
            <span className="font-semibold">Gas rate (₱ per liter)</span>
            <input
              inputMode="decimal" pattern="[0-9.]*" className="field"
              placeholder="e.g. 65.50"
              value={rate} onChange={(e) => setRate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2 mt-3">
            <span className="font-semibold">Starting fuel cost (₱)</span>
            <input
              inputMode="decimal" pattern="[0-9.]*" className="field"
              placeholder="e.g. 200"
              value={startCost} onChange={(e) => setStartCost(e.target.value)}
            />
          </label>
        </div>

        <label className="card-surface flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox" className="size-6 mt-0.5 accent-primary"
            checked={tankFull} onChange={(e) => setTankFull(e.target.checked)}
          />
          <div>
            <p className="font-semibold">I'm starting with a full tank</p>
            <p className="text-sm text-muted-foreground">
              Tick this if you just filled up. We'll estimate fuel left during the shift.
            </p>
          </div>
        </label>

        {error && <p className="text-destructive font-medium">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary mt-2">
          {busy ? "Starting..." : "Start shift"}
        </button>
      </form>
    </div>
  );
}

function Header({ title, backTo }: { title: string; backTo: string }) {
  return (
    <header className="sticky top-0 z-20 bg-card border-b border-border">
      <div className="max-w-md mx-auto h-14 px-2 flex items-center gap-2">
        <Link to={backTo} aria-label="Back" className="size-12 flex items-center justify-center rounded-xl active:bg-muted">
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
    </header>
  );
}
