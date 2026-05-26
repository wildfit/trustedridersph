import { createFileRoute, Link, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { BottomNav } from "@/components/BottomNav";
import { Bike, ClipboardList, Wallet, Fuel } from "lucide-react";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  const session = useAuthSession();
  const navigate = useNavigate();

  // Load profile to decide if wizard needs to run
  const profile = useQuery({
    queryKey: ["profile", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, first_sign_in_completed, motorcycle_brand, motorcycle_model")
        .eq("id", session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (profile.data && profile.data.first_sign_in_completed === false) {
      navigate({ to: "/setup" });
    }
  }, [profile.data, navigate]);

  if (session === undefined) return <Spinner />;
  if (session === null) return <Navigate to="/login" />;
  if (profile.isLoading || !profile.data) return <Spinner />;
  if (!profile.data.first_sign_in_completed) return <Spinner />;

  const name = profile.data.full_name?.split(" ")[0] ?? "kabayan";

  return (
    <div className="screen">
      <div className="screen-pad">
        <header className="pt-4 pb-6">
          <p className="text-muted-foreground">Kumusta,</p>
          <h1 className="text-3xl font-bold">{name}!</h1>
        </header>

        <div className="card-surface bg-gradient-to-br from-primary to-accent text-primary-foreground border-0">
          <p className="text-sm opacity-90">Today's earnings (sample)</p>
          <p className="text-4xl font-bold mt-1">₱0.00</p>
          <p className="text-sm mt-1 opacity-90">Start a shift to begin tracking</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <ActionCard icon={ClipboardList} label="Start shift" to="/shifts" />
          <ActionCard icon={Bike} label="Log trip" to="/shifts" />
          <ActionCard icon={Fuel} label="Add fuel" to="/shifts" />
          <ActionCard icon={Wallet} label="My earnings" to="/earnings" />
        </div>

        <div className="card-surface mt-5">
          <h2 className="text-lg font-semibold">Coming soon</h2>
          <p className="text-muted-foreground mt-1">
            Trip logging, fuel tracking, and earnings reports arrive in the next update.
          </p>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

function ActionCard({
  icon: Icon, label, to,
}: { icon: typeof Bike; label: string; to: string }) {
  return (
    <Link
      to={to}
      className="card-surface flex flex-col items-start gap-3 active:scale-[0.98] transition"
    >
      <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="size-6" />
      </div>
      <span className="font-semibold">{label}</span>
    </Link>
  );
}

function Spinner() {
  return (
    <div className="screen items-center justify-center">
      <div className="size-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    </div>
  );
}
