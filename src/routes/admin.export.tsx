import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { exportRecords } from "@/lib/admin.functions";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";

export const Route = createFileRoute("/admin/export")({ component: ExportPage });

function ExportPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<null | "csv" | "xlsx">(null);
  const fetchRows = useServerFn(exportRecords);

  async function run(format: "csv" | "xlsx") {
    setBusy(format);
    try {
      const { rows } = await fetchRows({ data: {
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
      } });
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `trusted-riders-records-${stamp}.${format}`;
      if (format === "csv") {
        const csv = Papa.unparse(rows);
        download(filename, new Blob([csv], { type: "text/csv" }));
      } else {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Records");
        const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
        download(filename, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-bold">Export</h1>
      <p className="text-sm text-muted-foreground">
        Export driver shift records with: date, start mileage, end mileage, distance, fuel cost,
        refuel liters, base fares, fees, and net earnings.
      </p>
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <input type="date" className="w-full px-2 py-1.5 border border-border rounded bg-background" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <input type="date" className="w-full px-2 py-1.5 border border-border rounded bg-background" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={busy !== null} onClick={() => run("csv")}>
            <Download className="size-4" /> {busy === "csv" ? "Preparing…" : "Download CSV"}
          </button>
          <button className="btn-secondary" disabled={busy !== null} onClick={() => run("xlsx")}>
            <Download className="size-4" /> {busy === "xlsx" ? "Preparing…" : "Download Excel"}
          </button>
        </div>
      </div>
    </div>
  );
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
