import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { BottomNav } from "@/components/BottomNav";
import { addFuelLog, getActiveShift, setGasRate } from "@/lib/shift.functions";
import { computeShift } from "@/lib/shift-math";
import { php, liters as litersFmt } from "@/lib/format";
import { Fuel, Plus, Check } from "lucide-react";

export const Route = createFileRoute("/fuel")({ component: FuelPage });

function FuelPage() {
  const session = useAuthSession();
  const qc = useQueryClient();
  const fetchActive = useServerFn(getActiveShift);
  const addFuel = useServerFn(addFuelLog);
  const updateRate = useServerFn(setGasRate);

  const active = useQuery({
    queryKey: ["active-shift", session?.user.id],
    enabled: !!session,
    queryFn: () => fetchActive(),
  });

  const [rate, setRate] = useState("");
  const [rateSaving, setRateSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [litersInput, setLitersInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session === undefined) return null;
  if (session === null) return <Navigate to="/login" />;

  const data = active.data;

  if (data && !data.shift) {
    return (
      <div className="screen">
        <div className="screen-pad">
          <Header />
          <div className="card-surface flex flex-col items-center text-center py-10">
            <div className="size-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Fuel className="size-8" />
            </div>
            <h2 className="text-xl font-semibold mt-4">No active shift</h2>
            <p className="text-muted-foreground mt-2 max-w-xs">
              Start a shift first, then log your fuel here.
            </p>
            <Link to="/shift/start" className="btn-primary mt-6">Start shift</Link>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const shift = data?.shift;
  const fuelLogs = data?.fuelLogs ?? [];
  const trips = data?.trips ?? [];
  const feeEntries = data?.feeEntries ?? [];
  const gasRate = Number(shift?.gas_rate_php_per_liter ?? 0) || null;

  const math = data
    ? computeShift({
        startingOdo: Number(shift!.starting_odometer_km ?? 0),
        endingOdo: null,
        trips,
        fuelLogs,
        feeEntries,
        gasRate,
      })
    : null;

  async function saveRate() {
    if (!shift) return;
    const r = Number(rate);
    if (!r || r <= 0) return setError("Enter a valid gas rate.");
    setError(null);
    setRateSaving(true);
    try {
      await updateRate({ data: { shiftId: shift.id, gasRate: r } });
      setRate("");
      await qc.invalidateQueries({ queryKey: ["active-shift"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRateSaving(false);
    }
  }

  async function submitFuel(e: React.FormEvent) {
    e.preventDefault();
    if (!shift) return;
    const a = Number(amount);
    if (!a || a <= 0) return setError("Enter the amount you paid.");
    setError(null);
    setBusy(true);
    try {
      await addFuel({
        data: {
          shiftId: shift.id,
          totalCostPhp: a,
          liters: litersInput ? Number(litersInput) : undefined,
        },
      });
      setAmount(""); setLitersInput("");
      await qc.invalidateQueries({ queryKey: ["active-shift"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="screen-pad">
        <Header />

        <div className="card-surface">
          <h2 className="text-lg font-semibold">Gas rate</h2>
          <p className="text-sm text-muted-foreground mt-1">Today's price at your pump (₱/L).</p>
          <p className="text-2xl font-bold mt-2">
            {gasRate ? `${php(gasRate)} / L` : "Not set"}
          </p>
          <div className="flex gap-2 mt-3">
            <input
              inputMode="decimal" pattern="[0-9.]*" className="field flex-1"
              placeholder="e.g. 65.50" value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
            <button onClick={saveRate} disabled={rateSaving || !rate}
              className="h-14 px-5 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">
              {rateSaving ? "..." : <Check className="size-5" />}
            </button>
          </div>
        </div>

        <form onSubmit={submitFuel} className="card-surface mt-4 flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Log fuel</h2>
          <p className="text-sm text-muted-foreground">
            For your starting fill or any refuel during the shift.
          </p>
          <label className="flex flex-col gap-2">
            <span className="font-semibold">Amount paid (₱)</span>
            <input
              inputMode="decimal" pattern="[0-9.]*" className="field text-xl"
              placeholder="e.g. 200" value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-semibold">Liters <span className="text-muted-foreground font-normal text-sm">(optional)</span></span>
            <input
              inputMode="decimal" pattern="[0-9.]*" className="field"
              placeholder="e.g. 3.05" value={litersInput}
              onChange={(e) => setLitersInput(e.target.value)}
            />
          </label>
          {error && <p className="text-destructive font-medium">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary">
            <Plus className="size-5" /> {busy ? "Saving..." : "Add fuel"}
          </button>
        </form>

        {math && (
          <div className="card-surface mt-4">
            <h2 className="text-lg font-semibold">This shift</h2>
            <div className="grid grid-cols-3 gap-3 mt-3 text-center">
              <Stat label="Total" value={php(math.totalFuelCost)} />
              <Stat label="Liters" value={litersFmt(math.litersConsumed)} />
              <Stat
                label="km/L"
                value={math.fuelEfficiency ? math.fuelEfficiency.toFixed(1) : "—"}
              />
            </div>
            {fuelLogs.length > 0 && (
              <ul className="mt-4 divide-y divide-border">
                {fuelLogs.map((f, i) => (
                  <li key={i} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{php(f.total_cost_php)}</p>
                      <p className="text-sm text-muted-foreground">
                        {f.liters ? `${Number(f.liters).toFixed(2)} L` : "—"}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date((f as { logged_at?: string }).logged_at ?? Date.now())
                        .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}

function Header() {
  return (
    <header className="pt-4 pb-6">
      <h1 className="text-3xl font-bold">Fuel</h1>
      <p className="text-muted-foreground mt-1">Track every peso of gas.</p>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
    </div>
  );
}
