import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuthSession } from "@/hooks/use-auth-session";
import { BottomNav } from "@/components/BottomNav";
import { ClipboardList } from "lucide-react";

export const Route = createFileRoute("/shifts")({ component: ShiftsPage });

function ShiftsPage() {
  const session = useAuthSession();
  if (session === undefined) return null;
  if (session === null) return <Navigate to="/login" />;

  return (
    <div className="screen">
      <div className="screen-pad">
        <header className="pt-4 pb-6">
          <h1 className="text-3xl font-bold">Shifts</h1>
          <p className="text-muted-foreground mt-1">Track your driving day.</p>
        </header>

        <div className="card-surface flex flex-col items-center text-center py-10">
          <div className="size-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <ClipboardList className="size-8" />
          </div>
          <h2 className="text-xl font-semibold mt-4">Coming soon</h2>
          <p className="text-muted-foreground mt-2 max-w-xs">
            Start shifts, log trips for Angkas, Pabakal, and Padala, and record
            fuel — all arriving in the next update.
          </p>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
