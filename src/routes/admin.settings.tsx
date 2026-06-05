import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listAppSettings, upsertAppSetting } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/settings")({ component: SettingsPage });

const KNOWN: { key: string; label: string; help: string }[] = [
  { key: "default_gas_rate_php_per_liter", label: "Default gas rate (₱/L)", help: "Pre-fills the gas rate when starting a new shift." },
  { key: "superadmin_email", label: "Superadmin email", help: "Email of the seeded superadmin account." },
  { key: "superadmin_username", label: "Superadmin display name", help: "Display name shown for the superadmin account." },
];

function valueAsString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function SettingsPage() {
  const fetchAll = useServerFn(listAppSettings);
  const q = useQuery({ queryKey: ["app-settings"], queryFn: () => fetchAll() });
  const qc = useQueryClient();
  const upsert = useMutation({
    mutationFn: useServerFn(upsertAppSetting),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-settings"] }),
  });

  const existing = new Map((q.data ?? []).map((r) => [r.key, r.value]));
  const allKeys = new Set<string>([...KNOWN.map((k) => k.key), ...(q.data ?? []).map((r) => r.key)]);

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-sm text-muted-foreground">
        Configurable rates and defaults used across the app.
      </p>
      <div className="bg-card border border-border rounded-lg divide-y divide-border">
        {[...allKeys].map((key) => (
          <Row
            key={key}
            settingKey={key}
            label={KNOWN.find((k) => k.key === key)?.label ?? key}
            help={KNOWN.find((k) => k.key === key)?.help ?? ""}
            initial={valueAsString(existing.get(key))}
            onSave={(v) => {
              // store as JSON: number if numeric, else string
              const num = Number(v);
              const parsed = v !== "" && !isNaN(num) ? num : v;
              upsert.mutate({ data: { key, value: parsed } });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Row({ settingKey, label, help, initial, onSave }: { settingKey: string; label: string; help: string; initial: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(initial);
  const dirty = v !== initial;
  return (
    <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{help || settingKey}</div>
      </div>
      <input className="px-2 py-1.5 border border-border rounded bg-background w-full sm:w-64" value={v} onChange={(e) => setV(e.target.value)} />
      <button className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50 disabled:pointer-events-none shrink-0" disabled={!dirty} onClick={() => onSave(v)}>Save</button>
    </div>
  );
}
