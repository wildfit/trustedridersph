import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { heartbeat } from "@/lib/requests.functions";
import { useAuthSession } from "@/hooks/use-auth-session";

/** Pings the server every `intervalMs` so admins can see who's currently online. */
export function useHeartbeat(intervalMs = 60_000) {
  const session = useAuthSession();
  const ping = useServerFn(heartbeat);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const send = () => {
      ping().catch(() => {});
    };
    send();
    const id = setInterval(() => {
      if (!cancelled) send();
    }, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session, ping, intervalMs]);
}
