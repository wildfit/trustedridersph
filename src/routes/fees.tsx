import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { BottomNav } from "@/components/BottomNav";
import {
  addFeeEntry, deleteFeeEntry, getActiveShift, listFeeCategories,
} from "@/lib/shift.functions";
import { php } from "@/lib/format";
import { Wallet, Plus, Trash2, Info } from "lucide-react";

export const Route = createFileRoute("/fees")({ component: FeesPage });

function FeesPage() {
  const session = useAuthSession();
  const qc = useQueryClient();
  const fetchActive = useServerFn(getActiveShift);
  const fetchCats = useServerFn(listFeeCategories);
  const addFee = useServerFn(addFeeEntry);
  const deleteFee = useServerFn(deleteFeeEntry);

  const active = useQuery({
    queryKey: ["active-shift", session?.user.id],
    enabled: !!session,
    queryFn: () => fetchActive(),
  });
  const cats = useQuery({
    queryKey: ["fee-categories"],
    enabled: !!session,
    queryFn: () => fetchCats(),
  });

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
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
              <Wallet className="size-8" />
            </div>
            <h2 className="text-xl font-semibold mt-4">No active shift</h2>
            <p className="text-muted-foreground mt-2 max-w-xs">
              Start a shift first, then log any tips, tariffs, tolls, or other fees here.
            </p>
            <Link to="/shift/start" className="btn-primary mt-6">Start shift</Link>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const shift = data?.shift;
  const fees = data?.feeEntries ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!shift) return;
    const a = Number(amount);
    if (!categoryId) return setError("Pick a category.");
    if (!a || a <= 0) return setError("Enter the amount.");
    setError(null);
    setBusy(true);
    try {
      await addFee({
        data: {
          shiftId: shift.id,
          categoryId,
          amountPhp: a,
          note: note.trim() || undefined,
        },
      });
      setAmount(""); setNote(""); setCategoryId(null);
      await qc.invalidateQueries({ queryKey: ["active-shift"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this fee?")) return;
    await deleteFee({ data: { id } });
    await qc.invalidateQueries({ queryKey: ["active-shift"] });
  }

  return (
    <div className="screen">
      <div className="screen-pad">
        <Header />

        <div className="card-surface bg-accent/10 border-accent/30 flex gap-3">
          <Info className="size-5 text-accent shrink-0 mt-0.5" />
          <p className="text-sm">
            <strong>Heads up:</strong> these are extra amounts you collected on top of the base fare — your income, not your expenses.
          </p>
        </div>

        <form onSubmit={submit} className="card-surface mt-4 flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Add fee</h2>
          <div>
            <p className="font-semibold mb-2">Category</p>
            <div className="grid grid-cols-2 gap-2">
              {(cats.data ?? []).map((c) => (
                <button
                  key={c.id} type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={`tile text-center text-base py-3 ${categoryId === c.id ? "tile-selected" : ""}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-2">
            <span className="font-semibold">Amount (₱)</span>
            <input
              inputMode="decimal" pattern="[0-9.]*" className="field text-xl"
              placeholder="e.g. 50" value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-semibold">Note <span className="text-muted-foreground font-normal text-sm">(optional)</span></span>
            <input
              className="field"
              placeholder="e.g. SLEX toll" value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {error && <p className="text-destructive font-medium">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary">
            <Plus className="size-5" /> {busy ? "Saving..." : "Save fee"}
          </button>
        </form>

        <div className="card-surface mt-4">
          <h2 className="text-lg font-semibold">Logged this shift</h2>
          {fees.length === 0 ? (
            <p className="text-muted-foreground mt-2">No fees yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {fees.map((f) => (
                <li key={f.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{f.category?.name ?? "Fee"}</p>
                    {f.note && <p className="text-sm text-muted-foreground truncate">{f.note}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="font-semibold">{php(f.amount_php)}</p>
                    <button
                      onClick={() => onDelete(f.id)}
                      aria-label="Delete fee"
                      className="size-10 rounded-xl text-destructive flex items-center justify-center active:bg-muted"
                    >
                      <Trash2 className="size-5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

function Header() {
  return (
    <header className="pt-4 pb-6">
      <h1 className="text-3xl font-bold">Fees</h1>
      <p className="text-muted-foreground mt-1">Tips, tariffs, tolls, and other charges.</p>
    </header>
  );
}
