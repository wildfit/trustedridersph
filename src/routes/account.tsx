import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { BottomNav } from "@/components/BottomNav";
import { LogOut, Bike } from "lucide-react";

export const Route = createFileRoute("/account")({ component: AccountPage });

function AccountPage() {
  const session = useAuthSession();
  const navigate = useNavigate();

  const profile = useQuery({
    queryKey: ["profile", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, phone, motorcycle_brand, motorcycle_model, fuel_tank_liters")
        .eq("id", session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (session === undefined) return null;
  if (session === null) return <Navigate to="/login" />;

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  const p = profile.data;
  return (
    <div className="screen">
      <div className="screen-pad">
        <header className="pt-4 pb-6">
          <h1 className="text-3xl font-bold">Account</h1>
        </header>

        <div className="card-surface">
          <p className="text-sm text-muted-foreground">Name</p>
          <p className="text-lg font-semibold">{p?.full_name ?? "—"}</p>
          <p className="mt-3 text-sm text-muted-foreground">Email</p>
          <p className="text-lg font-semibold break-all">{session.user.email}</p>
        </div>

        <div className="card-surface mt-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Bike className="size-5" />
            </div>
            <h2 className="text-lg font-semibold">Motorcycle</h2>
          </div>
          <p className="text-sm text-muted-foreground">Brand & model</p>
          <p className="text-lg font-semibold">
            {p?.motorcycle_brand ?? "—"} {p?.motorcycle_model ?? ""}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">Fuel tank</p>
          <p className="text-lg font-semibold">{p?.fuel_tank_liters ?? "—"} L</p>
        </div>

        <button onClick={signOut} className="btn-secondary mt-6">
          <LogOut className="size-5" />
          Sign out
        </button>
      </div>
      <BottomNav />
    </div>
  );
}
