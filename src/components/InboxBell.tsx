import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";
import { unreadMessageCount } from "@/lib/messages.functions";
import { useAuthSession } from "@/hooks/use-auth-session";

export function InboxBell({ className = "" }: { className?: string }) {
  const session = useAuthSession();
  const fetchCount = useServerFn(unreadMessageCount);
  const q = useQuery({
    queryKey: ["unread-message-count", session?.user.id],
    enabled: !!session,
    queryFn: () => fetchCount(),
    refetchInterval: 60_000,
  });
  const count = q.data?.count ?? 0;
  return (
    <Link
      to="/inbox"
      aria-label={`Messages${count ? `, ${count} unread` : ""}`}
      className={`relative inline-flex items-center justify-center size-10 rounded-full hover:bg-muted ${className}`}
    >
      <Bell className="size-5" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
