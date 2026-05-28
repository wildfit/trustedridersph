import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { BottomNav } from "@/components/BottomNav";
import { LogOut, Camera, Sun, Moon, Monitor, Loader2 } from "lucide-react";
import { useTheme, type Theme } from "@/hooks/use-theme";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

const THEMES: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

function ProfilePage() {
  const session = useAuthSession();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = useQuery({
    queryKey: ["profile", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, phone, motorcycle_brand, motorcycle_model, fuel_tank_liters, avatar_url")
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
            className="relative size-32 rounded-full bg-primary/10 border-4 border-card shadow-md
                       flex items-center justify-center overflow-hidden active:scale-[0.98] transition"
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
