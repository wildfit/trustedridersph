import { useEffect, useState } from "react";
import {
  createFileRoute,
  Link,
  Navigate,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuthSession } from "@/hooks/use-auth-session";
import { supabase } from "@/integrations/supabase/client";
import { getMyRole } from "@/lib/admin.functions";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Tags,
  Settings,
  Download,
  LogOut,
  Bike,
  Menu,
} from "lucide-react";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

const NAV = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/drivers", label: "Drivers", icon: Users },
  { to: "/admin/records", label: "Records", icon: ClipboardList },
  { to: "/admin/fees", label: "Fee Categories", icon: Tags },
  { to: "/admin/settings", label: "Settings", icon: Settings },
  { to: "/admin/export", label: "Export", icon: Download },
] as const;

function AdminLayout() {
  const session = useAuthSession();
  const fetchRole = useServerFn(getMyRole);
  const role = useQuery({
    queryKey: ["my-role", session?.user.id],
    enabled: !!session,
    queryFn: () => fetchRole(),
  });
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  if (session === undefined || (session && role.isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="size-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (session === null) return <Navigate to="/login" />;
  if (!role.data?.isAdmin) return <Navigate to="/shift" />;

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-card border-r border-border">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-card border-r border-border flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-card border-b border-border flex items-center px-4 gap-3">
          <button
            className="md:hidden p-2 -ml-2"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {role.data?.isSuper ? "Superadmin" : "Admin"}
            </h2>
          </div>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {session.user.email}
          </span>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
            }}
            className="inline-flex items-center gap-1 text-sm px-2 py-1 rounded hover:bg-muted"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </header>
        <main className="flex-1 p-4 sm:p-6 overflow-x-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarContent() {
  const { pathname } = useLocation();
  return (
    <>
      <div className="h-14 flex items-center gap-2 px-4 border-b border-border">
        <div className="size-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
          <Bike className="size-5" />
        </div>
        <span className="font-bold">Trusted Riders</span>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {NAV.map((n) => {
          const active = pathname === n.to || pathname.startsWith(n.to + "/");
          const Icon = n.icon;
          return (
            <Link
              key={n.to}
              to={n.to}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="size-4" />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

// avoid TS unused warning when no nav hook is invoked
export const _unused = useNavigate;
