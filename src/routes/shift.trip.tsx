import { createFileRoute, Navigate, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { addTrip, deleteTrip, getActiveShift, getTrip, updateTrip } from "@/lib/shift.functions";
import { ChevronLeft, Trash2 } from "lucide-react";

export const Route = createFileRoute("/shift/trip")({
  validateSearch: (s) => z.object({ id: z.string().uuid().optional() }).parse(s),
  component: AddTripPage,
});

const SERVICES = [
  { id: "angkas", label: "Angkas" },
  { id: "pabakal", label: "Pabakal" },
  { id: "padala", label: "Padala" },
] as const;

function AddTripPage() {
  const { id: editId } = Route.useSearch();
  const session = useAuthSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchActive = useServerFn(getActiveShift);
  const fetchTrip = useServerFn(getTrip);
  const runAdd = useServerFn(addTrip);
  const runUpdate = useServerFn(updateTrip);
  const runDelete = useServerFn(deleteTrip);

  const active = useQuery({
    queryKey: ["active-shift", session?.user.id],
    enabled: !!session,
    queryFn: () => fetchActive(),
  });

  const existing = useQuery({
    queryKey: ["trip", editId],
    enabled: !!editId && !!session,
    queryFn: () => fetchTrip({ data: { id: editId! } }),
  });

  const [distance, setDistance] = useState("");
  const [fare, setFare] = useState("");
  const [service, setService] = useState<"angkas" | "pabakal" | "padala" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  // Hydrate form when editing
  useEffect(() => {
    if (existing.data) {
      setDistance(String(existing.data.distance_km ?? ""));
      setFare(String(existing.data.gross_fare_php ?? ""));
      setService(existing.data.service_type as "angkas" | "pabakal" | "padala");
    }
  }, [existing.data]);

  if (session === undefined) return null;
  if (session === null) return <Navigate to="/login" />;
  if (!editId && active.data && !active.data.shift) return <Navigate to="/shift" />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const d = Number(distance);
    const f = Number(fare);
    if (!service) return setError("Pick a service type.");
    if (!d || d <= 0) return setError("Enter the trip distance.");
    if (isNaN(f) || f < 0) return setError("Enter the base fare.");
    setBusy(true);
    try {
      if (editId) {
        await runUpdate({
          data: { id: editId, serviceType: service, distanceKm: d, grossFarePhp: f },
        });
      } else {
        if (!active.data?.shift) return setError("No active shift.");
        await runAdd({
          data: {
            shiftId: active.data.shift.id,
            serviceType: service,
            distanceKm: d,
            grossFarePhp: f,
          },
        });
      }
      await qc.invalidateQueries({ queryKey: ["active-shift"] });
      navigate({ to: "/shift" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!editId) return;
    if (!confirmDel) { setConfirmDel(true); return; }
    setBusy(true);
    try {
      await runDelete({ data: { id: editId } });
      await qc.invalidateQueries({ queryKey: ["active-shift"] });
      navigate({ to: "/shift" });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const isEdit = !!editId;

  return (
    <div className="screen">
      <Header title={isEdit ? "Edit trip" : "Add trip"} />
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
          {busy ? "Saving..." : isEdit ? "Save changes" : "Save trip"}
        </button>

        {isEdit && (
          <button
            type="button" onClick={onDelete} disabled={busy}
            className="mt-2 h-14 rounded-xl border border-destructive/40 text-destructive font-semibold flex items-center justify-center gap-2 active:bg-destructive/10"
          >
            <Trash2 className="size-5" />
            {confirmDel ? "Tap again to confirm delete" : "Delete trip"}
          </button>
        )}
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
