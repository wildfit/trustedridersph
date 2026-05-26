import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to Supabase auth changes. Returns the current session,
 * `null` once we know there is none, and `undefined` while loading.
 *
 * Pattern: register the listener FIRST, then read the existing session.
 */
export function useAuthSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => sub.subscription.unsubscribe();
  }, []);

  return session;
}
