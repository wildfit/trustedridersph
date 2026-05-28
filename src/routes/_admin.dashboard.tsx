import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getDashboardSummary } from "@/lib/admin.functions";
import { php, km } from "@/lib/format";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_admin/dashboard")({ component: Dashboard });

function Dashboard() {
  const [days, setDays] = useState(30);
  const fetchSummary = useServerFn(getDashboardSummary);
  const q = useQuery({
    queryKey: ["dashboard-summary", days],
    queryFn: () => fetchSummary({ data: { days } }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex gap-1 bg-card border border-border rounded-md p-1">
          {[
            { v: 7, l: "Daily (7d)" },
            { v: 30, l: "Weekly (30d)" },
            { v: 90, l: "Monthly (90d)" },
          ].map((o) => (
            <button
              key={o.v}
              onClick={() => setDays(o.v)}
              className={`px-3 py-1.5 text-sm rounded font-medium ${days === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading && <div className="text-muted-foreground">Loading…</div>}
      {q.data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Total distance" value={km(q.data.totals.distance)} />
            <Kpi label="Gross earnings" value={php(q.data.totals.gross)} />
            <Kpi label="Fuel cost" value={php(q.data.totals.fuel)} />
            <Kpi label="Net income" value={php(q.data.totals.net)} />
          </div>

          <Card title="Earnings vs fuel">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={q.data.daily}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Bar dataKey="gross" name="Gross" fill="hsl(var(--primary))" />
                <Bar dataKey="fuel" name="Fuel" fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Net income trend">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={q.data.daily}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Line type="monotone" dataKey="net" name="Net" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="distance" name="Distance (km)" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <p className="text-xs text-muted-foreground">
            Based on {q.data.shiftCount} completed shifts in the selected range.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}
