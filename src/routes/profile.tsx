import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useHeartbeat } from "@/hooks/use-heartbeat";
import { BottomNav } from "@/components/BottomNav";
import {
  LogOut, Camera, Sun, Moon, Monitor, Loader2,
  Pencil, RefreshCw, Inbox, Check, X, Clock,
} from "lucide-react";
import { useTheme, type Theme } from "@/hooks/use-theme";
import {
  submitProfileChangeRequest,
  submitResubscribeRequest,
  listMyRequests,
} from "@/lib/requests.functions";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

const THEMES: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

type Proposed = {
  full_name?: string;
  phone?: string;
  motorcycle_brand?: string;
  motorcycle_model?: string;
  fuel_tank_liters?: number;
};

function ProfilePage() {
  const session = useAuthSession();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [resubOpen, setResubOpen] = useState(false);

  useHeartbeat();

  const fetchMyRequests = useServerFn(listMyRequests);
  const profile = useQuery({
    queryKey: ["profile", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "full_name, phone, motorcycle_brand, motorcycle_model, fuel_tank_liters, avatar_url, access_ends_at, is_enabled",
        )
        .eq("id", session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const myRequests = useQuery({
    queryKey: ["my-requests", session?.user.id],
    enabled: !!session,
    queryFn: () => fetchMyRequests(),
  });

  if (session === undefined) return null;
  if (session === null) return <Navigate to="/login" />;

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    setError(null);
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const path = `${session.user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", session.user.id);
      if (dbErr) throw dbErr;
      await profile.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const p = profile.data;
  const initials = (p?.full_name ?? session.user.email ?? "?")
    .split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const pending = (myRequests.data ?? []).filter((r) => r.status === "pending");
  const accessEnd = p?.access_ends_at ? new Date(p.access_ends_at) : null;
  const accessExpired =
    p && (p.is_enabled === false || (accessEnd && accessEnd.getTime() < Date.now()));

  return (
    <div className="screen">
      <div className="screen-pad">
        <header className="pt-4 pb-6">
          <h1 className="text-3xl font-bold">Profile</h1>
        </header>

        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="relative size-32 rounded-full bg-primary/10 border-4 border-card shadow-md flex items-center justify-center overflow-hidden active:scale-[0.98] transition"
            aria-label="Change profile photo"
          >
            {p?.avatar_url ? (
              <img src={p.avatar_url} alt="" className="size-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-primary">{initials}</span>
            )}
            <span className="absolute bottom-0 inset-x-0 bg-foreground/70 text-background py-1.5 flex items-center justify-center gap-1 text-xs font-semibold">
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              {uploading ? "Uploading" : "Change"}
            </span>
          </button>
          <input
            ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={onPickPhoto}
          />
          {error && <p className="text-destructive mt-3 text-sm">{error}</p>}
        </div>

        <div className="card-surface mt-6">
          <ProfileRow label="Full name" value={p?.full_name} />
          <ProfileRow label="Email" value={session.user.email ?? ""} />
          <ProfileRow label="Phone" value={p?.phone} />
        </div>

        <div className="card-surface mt-4">
          <h2 className="text-lg font-semibold mb-3">Motorcycle</h2>
          <ProfileRow label="Brand" value={p?.motorcycle_brand} />
          <ProfileRow label="Model" value={p?.motorcycle_model} />
          <ProfileRow
            label="Fuel tank"
            value={p?.fuel_tank_liters != null ? `${p.fuel_tank_liters} L` : null}
          />
        </div>

        <div className="card-surface mt-4 space-y-2">
          <h2 className="text-lg font-semibold mb-1">Account requests</h2>
          <p className="text-sm text-muted-foreground">
            Need to update your information or extend access? Send a request to admins.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center justify-center gap-2 h-11 rounded-md border border-border bg-background hover:bg-muted text-sm font-semibold"
            >
              <Pencil className="size-4" /> Request profile change
            </button>
            <button
              type="button"
              onClick={() => setResubOpen(true)}
              className={`inline-flex items-center justify-center gap-2 h-11 rounded-md text-sm font-semibold ${
                accessExpired
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background hover:bg-muted"
              }`}
            >
              <RefreshCw className="size-4" /> Request resubscription
            </button>
          </div>
          {accessEnd && (
            <p className="text-xs text-muted-foreground pt-1">
              Current access ends: {accessEnd.toLocaleDateString()}
            </p>
          )}

          {pending.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Pending requests
              </p>
              {pending.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-sm">
                  <Clock className="size-4 text-amber-500" />
                  <span className="capitalize">{r.type.replace("_", " ")}</span>
                  <span className="text-muted-foreground ml-auto">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-surface mt-4">
          <h2 className="text-lg font-semibold mb-3">Appearance</h2>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`tile flex flex-col items-center justify-center gap-2 p-3 text-sm ${theme === value ? "tile-selected" : ""}`}
                aria-pressed={theme === value}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <button onClick={signOut} className="btn-secondary mt-6">
          <LogOut className="size-5" /> Sign out
        </button>
      </div>
      <BottomNav />

      {editing && p && (
        <ProfileChangeDialog
          current={{
            full_name: p.full_name ?? "",
            phone: p.phone ?? "",
            motorcycle_brand: p.motorcycle_brand ?? "",
            motorcycle_model: p.motorcycle_model ?? "",
            fuel_tank_liters: p.fuel_tank_liters ?? undefined,
          }}
          onClose={() => setEditing(false)}
          onSubmitted={() => {
            setEditing(false);
            myRequests.refetch();
          }}
        />
      )}
      {resubOpen && (
        <ResubscribeDialog
          onClose={() => setResubOpen(false)}
          onSubmitted={() => {
            setResubOpen(false);
            myRequests.refetch();
          }}
        />
      )}
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0 border-b border-border last:border-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold break-all">{value ?? "—"}</p>
    </div>
  );
}

function ProfileChangeDialog({
  current,
  onClose,
  onSubmitted,
}: {
  current: Required<{ [K in keyof Proposed]: Proposed[K] | "" }>;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const submit = useServerFn(submitProfileChangeRequest);
  const [values, setValues] = useState({ ...current });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const proposed: Proposed = {};
      const keys = ["full_name","phone","motorcycle_brand","motorcycle_model"] as const;
      for (const k of keys) {
        const v = (values[k] ?? "").toString().trim();
        if (v && v !== (current[k] ?? "")) proposed[k] = v;
      }
      const liters = values.fuel_tank_liters;
      const litersNum = liters === "" || liters == null ? undefined : Number(liters);
      if (litersNum != null && !Number.isNaN(litersNum) && litersNum !== current.fuel_tank_liters) {
        proposed.fuel_tank_liters = litersNum;
      }
      if (Object.keys(proposed).length === 0) {
        setErr("Change at least one field.");
        setBusy(false);
        return;
      }
      await submit({ data: { proposed, message: message.trim() || undefined } });
      onSubmitted();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell title="Request profile change" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Full name"
          value={values.full_name ?? ""}
          onChange={(v) => setValues((s) => ({ ...s, full_name: v }))} />
        <Field label="Phone"
          value={values.phone ?? ""}
          onChange={(v) => setValues((s) => ({ ...s, phone: v }))} />
        <Field label="Motorcycle brand"
          value={values.motorcycle_brand ?? ""}
          onChange={(v) => setValues((s) => ({ ...s, motorcycle_brand: v }))} />
        <Field label="Motorcycle model"
          value={values.motorcycle_model ?? ""}
          onChange={(v) => setValues((s) => ({ ...s, motorcycle_model: v }))} />
        <Field label="Fuel tank (L)" type="number" step="0.1"
          value={values.fuel_tank_liters?.toString() ?? ""}
          onChange={(v) => setValues((s) => ({ ...s, fuel_tank_liters: v === "" ? undefined : Number(v) }))} />
        <div>
          <label className="text-sm font-medium">Note to admin (optional)</label>
          <textarea
            value={message} onChange={(e) => setMessage(e.target.value)}
            maxLength={500} rows={2}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        {err && <p className="text-destructive text-sm">{err}</p>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 h-10 rounded-md border border-border bg-background text-sm font-semibold">Cancel</button>
          <button type="submit" disabled={busy}
            className="flex-1 h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

function ResubscribeDialog({
  onClose, onSubmitted,
}: { onClose: () => void; onSubmitted: () => void }) {
  const submit = useServerFn(submitResubscribeRequest);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await submit({ data: { message: message.trim() || undefined } });
      onSubmitted();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell title="Request resubscription" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Ask an admin to extend your access. They'll review and approve from
          their inbox.
        </p>
        <div>
          <label className="text-sm font-medium">Note to admin (optional)</label>
          <textarea
            value={message} onChange={(e) => setMessage(e.target.value)}
            maxLength={500} rows={3}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        {err && <p className="text-destructive text-sm">{err}</p>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 h-10 rounded-md border border-border bg-background text-sm font-semibold">Cancel</button>
          <button type="submit" disabled={busy}
            className="flex-1 h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

function DialogShell({
  title, children, onClose,
}: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Inbox className="size-4" /> {title}
          </h3>
          <button onClick={onClose} className="p-1 -mr-1 rounded hover:bg-muted">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", step,
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  type?: string; step?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        type={type} step={step} value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
      />
    </div>
  );
}

// silence unused icon import in case Check usage is dropped later
void Check;
