import { createFileRoute, Navigate, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { endShift, getActiveShift } from "@/lib/shift.functions";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/shift/end")({ component: EndShiftPage });

function EndShiftPage() {
  const session = useAuthSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchActive = useServerFn(getActiveShift);
  const run = useServerFn(endShift);

  const active = useQuery({
    queryKey: ["active-shift", session?.user.id],
    enabled: !!session,
    queryFn: () => fetchActive(),
  });

  const [odo, setOdo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (session === undefined) return null;
  if (session === null) return <Navigate to="/login" />;
  if (active.data && !active.data.shift) return <Navigate to="/shift" />;

  const startingOdo = Number(active.data?.shift?.starting_odometer_km ?? 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const o = Number(odo);
    if (!o || o <= 0) return setError("Enter your ending odometer reading.");
    if (o < startingOdo) {
      return setError(`Ending reading must be at least your starting reading of ${startingOdo} km.`);
    }
    if (!active.data?.shift) return;
    if (!confirming) { setConfirming(true); return; }
    setBusy(true);
    try {
      const res = await run({
        data: { shiftId: active.data.shift.id, endingOdometerKm: o },
      });
      await qc.invalidateQueries({ queryKey: ["active-shift"] });
      navigate({ to: "/shift/summary", search: { id: res.shiftId } });
    } catch (e) {
      setError((e as Error).message);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <Header title="End shift" />
      <form onSubmit={submit} className="screen-pad flex flex-col gap-5">
        <p className="text-muted-foreground">
          Check your motorcycle's odometer one more time and type the current reading.
        </p>
        <div className="card-surface">
          <p className="text-sm text-muted-foreground">Starting reading was</p>
          <p className="text-2xl font-bold">{startingOdo} km</p>
        </div>
        <label className="flex flex-col gap-2">
          <span className="font-semibold text-lg">Ending odometer (km)</span>
          <input
            autoFocus inputMode="decimal" pattern="[0-9.]*"
            className="field text-2xl font-bold text-center"
            placeholder="e.g. 12390"
            value={odo}
            onChange={(e) => { setOdo(e.target.value); setConfirming(false); }}
          />
        </label>

        {error && <p className="text-destructive font-medium">{error}</p>}

        <button type="submit" disabled={busy} className="btn-primary mt-2">
          {busy ? "Ending..." : confirming ? "Tap again to confirm end shift" : "End shift"}
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
