import { createFileRoute, Navigate, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { addTrip, getActiveShift } from "@/lib/shift.functions";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/shift/trip")({ component: AddTripPage });

const SERVICES = [
  { id: "angkas", label: "Angkas" },
  { id: "pabakal", label: "Pabakal" },
  { id: "padala", label: "Padala" },
] as const;

function AddTripPage() {
  const session = useAuthSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchActive = useServerFn(getActiveShift);
  const run = useServerFn(addTrip);

  const active = useQuery({
    queryKey: ["active-shift", session?.user.id],
    enabled: !!session,
    queryFn: () => fetchActive(),
  });

  const [distance, setDistance] = useState("");
  const [fare, setFare] = useState("");
  const [service, setService] = useState<"angkas" | "pabakal" | "padala" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session === undefined) return null;
  if (session === null) return <Navigate to="/login" />;
  if (active.data && !active.data.shift) return <Navigate to="/shift" />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const d = Number(distance);
    const f = Number(fare);
    if (!service) return setError("Pick a service type.");
    if (!d || d <= 0) return setError("Enter the trip distance.");
    if (!f || f < 0) return setError("Enter the base fare.");
    if (!active.data?.shift) return setError("No active shift.");
    setBusy(true);
    try {
      await run({
        data: {
          shiftId: active.data.shift.id,
          serviceType: service,
          distanceKm: d,
          grossFarePhp: f,
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
      <Header title="Add trip" />
      <form onSubmit={submit} className="screen-pad flex flex-col gap-5">
        <div>
          <p className="font-semibold text-lg mb-3">Service type</p>
          <div className="grid grid-cols-3 gap-2">
            {SERVICES.map((s) => (
              <button
                key={s.id} type="button"
                onClick={() => setService(s.id)}
                className={`tile text-center text-base ${service === s.id ? "tile-selected" : ""}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-2">
          <span className="font-semibold text-lg">Distance (km)</span>
          <input
            inputMode="decimal" pattern="[0-9.]*"
            className="field text-2xl font-bold text-center"
            placeholder="e.g. 3.5"
            value={distance} onChange={(e) => setDistance(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="font-semibold text-lg">Base fare (₱)</span>
          <input
            inputMode="decimal" pattern="[0-9.]*"
            className="field text-2xl font-bold text-center"
            placeholder="e.g. 80"
            value={fare} onChange={(e) => setFare(e.target.value)}
          />
        </label>

        {error && <p className="text-destructive font-medium">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary mt-2">
          {busy ? "Saving..." : "Save trip"}
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
