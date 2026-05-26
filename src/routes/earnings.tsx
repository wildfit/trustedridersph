import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuthSession } from "@/hooks/use-auth-session";
import { BottomNav } from "@/components/BottomNav";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/earnings")({ component: EarningsPage });

function EarningsPage() {
  const session = useAuthSession();
  if (session === undefined) return null;
  if (session === null) return <Navigate to="/login" />;

  return (
    <div className="screen">
      <div className="screen-pad">
        <header className="pt-4 pb-6">
          <h1 className="text-3xl font-bold">Earnings</h1>
          <p className="text-muted-foreground mt-1">
            See what you really take home after fuel.
          </p>
        </header>

        <div className="card-surface bg-gradient-to-br from-accent to-primary text-primary-foreground border-0">
          <p className="text-sm opacity-90">Net earnings this week (sample)</p>
          <p className="text-4xl font-bold mt-1">₱0.00</p>
          <p className="text-sm mt-1 opacity-90">Gross − fuel − fees</p>
        </div>

        <div className="card-surface mt-5 flex flex-col items-center text-center py-10">
          <div className="size-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <Wallet className="size-8" />
          </div>
          <h2 className="text-xl font-semibold mt-4">Coming soon</h2>
          <p className="text-muted-foreground mt-2 max-w-xs">
            Daily, weekly, and monthly earnings breakdowns by service type are
            on the way.
          </p>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
