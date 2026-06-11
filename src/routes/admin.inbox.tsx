import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllRequests, resolveRequest } from "@/lib/requests.functions";
import {
  listDriverMessagesAdmin,
  sendDriverMessage,
} from "@/lib/messages.functions";
import { DriverCombobox } from "@/components/admin/DriverCombobox";
import {
  Check,
  X,
  Clock,
  Inbox,
  RefreshCw,
  Pencil,
  Send,
  MailCheck,
  Mail,
} from "lucide-react";

export const Route = createFileRoute("/admin/inbox")({ component: AdminInbox });

type StatusFilter = "pending" | "approved" | "rejected" | "all";
type TopTab = "requests" | "messages";

function AdminInbox() {
  const [tab, setTab] = useState<TopTab>("requests");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Inbox className="size-6" /> Inbox
        </h1>
        <p className="text-sm text-muted-foreground">
          Requests from drivers and direct messages you've sent.
        </p>
      </header>

      <div className="flex gap-1 bg-muted p-1 rounded-md w-fit">
        {[
          { v: "requests" as const, label: "Requests" },
          { v: "messages" as const, label: "Messages" },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v)}
            className={`px-3 h-8 rounded text-sm font-medium ${
              tab === t.v
                ? "bg-card shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "requests" ? <RequestsPanel /> : <MessagesPanel />}
    </div>
  );
}

function RequestsPanel() {
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const fetchAll = useServerFn(listAllRequests);
  const resolve = useServerFn(resolveRequest);
  const list = useQuery({
    queryKey: ["admin-requests", filter],
    queryFn: () => fetchAll({ data: { status: filter } }),
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      await resolve({ data: { id, action } });
      await list.refetch();
    } finally {
      setBusyId(null);
    }
  }

  const tabs: { value: StatusFilter; label: string }[] = [
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "all", label: "All" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-muted p-1 rounded-md w-fit">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setFilter(t.value)}
            className={`px-3 h-8 rounded text-sm font-medium ${
              filter === t.value
                ? "bg-card shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {list.isLoading && <p className="text-muted-foreground">Loading…</p>}
      {list.data && list.data.length === 0 && (
        <p className="text-muted-foreground">No requests in this view.</p>
      )}

      <div className="space-y-3">
        {(list.data ?? []).map((r) => {
          const proposed = (r.proposed ?? {}) as Record<string, unknown>;
          const Icon = r.type === "resubscribe" ? RefreshCw : Pencil;
          return (
            <div
              key={r.id}
              className="bg-card border border-border rounded-lg p-4"
            >
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">
                      {r.driver?.full_name ?? "Driver"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {r.driver?.phone}
                    </span>
                    <StatusBadge status={r.status} />
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm capitalize mt-1">
                    {r.type.replace("_", " ")}
                  </p>

                  {r.type === "profile_change" && (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      {Object.entries(proposed).map(([k, v]) => (
                        <div key={k}>
                          <span className="text-muted-foreground capitalize">
                            {k.replace(/_/g, " ")}:
                          </span>{" "}
                          <span className="font-medium">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {r.type === "resubscribe" && r.driver && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Current access ends:{" "}
                      {r.driver.access_ends_at
                        ? new Date(r.driver.access_ends_at).toLocaleDateString()
                        : "—"}
                    </p>
                  )}

                  {r.message && (
                    <p className="mt-2 text-sm bg-muted/50 rounded p-2">
                      "{r.message}"
                    </p>
                  )}
                  {r.admin_note && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Admin note: {r.admin_note}
                    </p>
                  )}

                  {r.status === "pending" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => act(r.id, "approve")}
                        disabled={busyId === r.id}
                        className="inline-flex items-center gap-1 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
                      >
                        <Check className="size-4" /> Approve
                      </button>
                      <button
                        onClick={() => act(r.id, "reject")}
                        disabled={busyId === r.id}
                        className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-border bg-background text-sm font-semibold disabled:opacity-60"
                      >
                        <X className="size-4" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MessagesPanel() {
  const [recipient, setRecipient] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterDriver, setFilterDriver] = useState<string | null>(null);

  const send = useServerFn(sendDriverMessage);
  const fetchList = useServerFn(listDriverMessagesAdmin);
  const list = useQuery({
    queryKey: ["admin-messages", filterDriver],
    queryFn: () =>
      fetchList({ data: { driverId: filterDriver ?? undefined } }),
  });

  async function handleSend() {
    setError(null);
    if (!recipient) {
      setError("Pick a recipient driver.");
      return;
    }
    if (!body.trim()) {
      setError("Message body is required.");
      return;
    }
    setSending(true);
    try {
      await send({
        data: {
          driverId: recipient,
          subject: subject.trim() || undefined,
          body: body.trim(),
        },
      });
      setBody("");
      setSubject("");
      await list.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Compose message</h2>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Recipient
          </label>
          <div className="mt-1">
            <DriverCombobox
              value={recipient}
              onChange={setRecipient}
              allowAll={false}
              placeholder="Select a driver…"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Subject (optional)
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
            maxLength={200}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Message
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
            maxLength={4000}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          onClick={handleSend}
          disabled={sending}
          className="inline-flex items-center gap-1 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
        >
          <Send className="size-4" /> {sending ? "Sending…" : "Send"}
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold">Sent messages</h2>
          <DriverCombobox value={filterDriver} onChange={setFilterDriver} />
        </div>
        {list.isLoading && (
          <p className="text-muted-foreground">Loading…</p>
        )}
        {list.data && list.data.length === 0 && (
          <p className="text-muted-foreground">No messages yet.</p>
        )}
        {(list.data ?? []).map((m) => (
          <div
            key={m.id}
            className="bg-card border border-border rounded-lg p-4"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-semibold">{m.driver_name}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(m.created_at).toLocaleString()}
              </span>
            </div>
            {m.subject && (
              <p className="mt-1 text-sm font-medium">{m.subject}</p>
            )}
            <p className="mt-1 text-sm whitespace-pre-wrap">{m.body}</p>
            <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              {m.read_at ? (
                <>
                  <MailCheck className="size-3.5 text-emerald-500" />
                  Read {new Date(m.read_at).toLocaleString()}
                </>
              ) : (
                <>
                  <Mail className="size-3.5" />
                  Unread
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    approved:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    rejected:
      "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
        map[status] ?? "bg-muted"
      }`}
    >
      {status === "pending" && <Clock className="size-3" />}
      {status}
    </span>
  );
}
