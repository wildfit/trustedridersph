import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listFeeCategoriesAdmin, upsertFeeCategory, deleteFeeCategory,
} from "@/lib/admin.functions";
import { Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_admin/fees")({ component: FeesAdmin });

type Cat = Awaited<ReturnType<typeof listFeeCategoriesAdmin>>[number];

function FeesAdmin() {
  const fetchAll = useServerFn(listFeeCategoriesAdmin);
  const q = useQuery({ queryKey: ["admin-fees"], queryFn: () => fetchAll() });
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Cat> | null>(null);

  const delMut = useMutation({
    mutationFn: useServerFn(deleteFeeCategory),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-fees"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Fee Categories</h1>
        <button className="btn-primary" onClick={() => setEditing({ name: "", entry_type: "income", is_active: true } as Partial<Cat>)}>
          <Plus className="size-4" /> New category
        </button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left"><Th>Name</Th><Th>Type</Th><Th>Active</Th><th className="px-3 py-2 text-right">Actions</th></tr>
          </thead>
          <tbody>
            {q.data?.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{c.name}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${c.entry_type === "income" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                    {c.entry_type}
                  </span>
                </td>
                <td className="px-3 py-2">{c.is_active ? "Yes" : "No"}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <button className="icon-btn" onClick={() => setEditing(c)}><Pencil className="size-4" /></button>
                    <button
                      className="icon-btn text-red-600"
                      onClick={() => { if (confirm(`Delete "${c.name}"?`)) delMut.mutate({ data: { id: c.id } }); }}
                    ><Trash2 className="size-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <EditModal cat={editing} onClose={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["admin-fees"] }); }} />}
      <style>{`.icon-btn{padding:6px;border-radius:6px}.icon-btn:hover{background:hsl(var(--muted))}`}</style>
    </div>
  );
}

function EditModal({ cat, onClose }: { cat: Partial<Cat>; onClose: () => void }) {
  const [name, setName] = useState(cat.name ?? "");
  const [type, setType] = useState<"income" | "expense">((cat.entry_type as "income" | "expense") ?? "income");
  const [active, setActive] = useState(cat.is_active ?? true);
  const mut = useMutation({ mutationFn: useServerFn(upsertFeeCategory), onSuccess: onClose });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-card border border-border rounded-lg w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-3">{cat.id ? "Edit category" : "New category"}</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Name</label>
            <input className="w-full px-2 py-1.5 border border-border rounded bg-background" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Type</label>
            <div className="flex gap-3 mt-1">
              <label className="flex items-center gap-1"><input type="radio" checked={type === "income"} onChange={() => setType("income")} /> Income</label>
              <label className="flex items-center gap-1"><input type="radio" checked={type === "expense"} onChange={() => setType("expense")} /> Expense</label>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              disabled={!name.trim()}
              onClick={() => mut.mutate({ data: { id: cat.id, name: name.trim(), entry_type: type, is_active: active } })}
            >Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-2 font-semibold text-xs uppercase tracking-wide text-muted-foreground">{children}</th>; }
