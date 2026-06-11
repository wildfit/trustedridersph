import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDrivers } from "@/lib/admin.functions";
import { Check, ChevronsUpDown, X } from "lucide-react";

type Driver = { id: string; full_name: string | null; email: string };

export function DriverCombobox({
  value,
  onChange,
  allowAll = true,
  placeholder = "All drivers",
  className = "",
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  allowAll?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const fetchDrivers = useServerFn(listDrivers);
  const drivers = useQuery({
    queryKey: ["admin-driver-combobox"],
    queryFn: () => fetchDrivers(),
    staleTime: 60_000,
  });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const list = (drivers.data ?? []) as Driver[];
    const q = query.trim().toLowerCase();
    if (!q) return list.slice(0, 50);
    return list
      .filter(
        (d) =>
          (d.full_name ?? "").toLowerCase().includes(q) ||
          (d.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [drivers.data, query]);

  const selected = (drivers.data ?? []).find((d) => d.id === value) as
    | Driver
    | undefined;

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-9 min-w-[220px] inline-flex items-center justify-between gap-2 px-3 rounded-md border border-border bg-card text-sm"
      >
        <span className="truncate">
          {selected ? selected.full_name || selected.email : placeholder}
        </span>
        <span className="flex items-center gap-1">
          {value && allowAll && (
            <X
              className="size-3.5 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            />
          )}
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute z-50 mt-1 w-[320px] max-w-[90vw] rounded-md border border-border bg-card shadow-lg">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search drivers…"
              className="w-full h-9 px-3 text-sm bg-transparent border-b border-border outline-none"
            />
            <ul className="max-h-64 overflow-auto py-1">
              {allowAll && (
                <li>
                  <button
                    onClick={() => {
                      onChange(null);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between"
                  >
                    <span>All drivers</span>
                    {value === null && <Check className="size-4" />}
                  </button>
                </li>
              )}
              {drivers.isLoading && (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  Loading…
                </li>
              )}
              {!drivers.isLoading && filtered.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  No matching drivers.
                </li>
              )}
              {filtered.map((d) => (
                <li key={d.id}>
                  <button
                    onClick={() => {
                      onChange(d.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {d.full_name || "Unnamed driver"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {d.email}
                      </span>
                    </span>
                    {value === d.id && <Check className="size-4" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
