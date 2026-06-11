import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuthSession } from "@/hooks/use-auth-session";
import { BottomNav } from "@/components/BottomNav";
import { listMyMessages, markMessageRead } from "@/lib/messages.functions";
import { Inbox as InboxIcon } from "lucide-react";

export const Route = createFileRoute("/inbox")({ component: InboxPage });

function InboxPage() {
  const session = useAuthSession();
  const qc = useQueryClient();
  const fetchMsgs = useServerFn(listMyMessages);
  const markRead = useServerFn(markMessageRead);

  const list = useQuery({
    queryKey: ["my-messages", session?.user.id],
    enabled: !!session,
    queryFn: () => fetchMsgs(),
  });

  // Auto mark all unread as read once on view.
  useEffect(() => {
    if (!list.data) return;
    const unread = list.data.filter((m) => !m.read_at);
    if (unread.length === 0) return;
    Promise.all(unread.map((m) => markRead({ data: { id: m.id } })))
      .then(() => {
        qc.invalidateQueries({ queryKey: ["unread-message-count"] });
        list.refetch();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data?.length]);

  if (session === undefined) return null;
  if (session === null) return <Navigate to="/login" />;

  return (
    <div className="screen">
      <div className="screen-pad">
        <header className="pt-4 pb-4">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <InboxIcon className="size-7" /> Messages
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Messages from Trusted Riders administrators.
          </p>
        </header>

        {list.isLoading && (
          <p className="text-muted-foreground">Loading…</p>
        )}
        {list.data && list.data.length === 0 && (
          <div className="card-surface text-center py-10 text-muted-foreground">
            No messages yet.
          </div>
        )}

        <ul className="space-y-3 pb-24">
          {(list.data ?? []).map((m) => {
            const unread = !m.read_at;
            const senderName = m.sender_id ? "Admin" : "Trusted Riders";
            return (
              <li
                key={m.id}
                className={`bg-card border rounded-lg p-4 ${
                  unread ? "border-primary/60" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {senderName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                </div>
                {m.subject && (
                  <p className="mt-1 font-semibold">{m.subject}</p>
                )}
                <p className="mt-1 text-sm whitespace-pre-wrap">{m.body}</p>
                {unread && (
                  <span className="mt-2 inline-block text-xs font-semibold text-primary">
                    New
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <BottomNav />
    </div>
  );
}
