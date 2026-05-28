import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth-session";

export const Route = createFileRoute("/")({ component: HomeRedirect });

/** Send signed-in drivers straight to the daily-use Shift screen. */
function HomeRedirect() {
  const session = useAuthSession();
  const profile = useQuery({
    queryKey: ["profile-first-signin", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("first_sign_in_completed")
        .eq("id", session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (session === undefined) return <Spinner />;
  if (session === null) return <Navigate to="/login" />;
  if (profile.isLoading || !profile.data) return <Spinner />;
  if (!profile.data.first_sign_in_completed) return <Navigate to="/setup" />;
  return <Navigate to="/shift" />;
}

function Spinner() {
  return (
    <div className="screen items-center justify-center">
      <div className="size-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

// suppress unused-import warning if hook code-gen rearranges
void useEffect;
