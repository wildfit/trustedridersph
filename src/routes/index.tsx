import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { getMyRole } from "@/lib/admin.functions";

export const Route = createFileRoute("/")({ component: HomeRedirect });

/** Route the signed-in user to the right home: admins → dashboard, drivers → shift. */
function HomeRedirect() {
  const session = useAuthSession();
  const fetchRole = useServerFn(getMyRole);

  const role = useQuery({
    queryKey: ["my-role", session?.user.id],
    enabled: !!session,
    queryFn: () => fetchRole(),
  });

  const profile = useQuery({
    queryKey: ["profile-first-signin", session?.user.id],
    enabled: !!session && role.data?.isAdmin === false,
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
  if (role.isLoading || !role.data) return <Spinner />;
  if (role.data.isAdmin) return <Navigate to="/admin/dashboard" />;
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
