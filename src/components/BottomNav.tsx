import { Link, useLocation } from "@tanstack/react-router";
import { User, ClipboardList, Fuel, Wallet, FileBarChart } from "lucide-react";

const TABS = [
  { to: "/shift", label: "Shift", icon: ClipboardList },
  { to: "/fuel", label: "Fuel", icon: Fuel },
  { to: "/fees", label: "Fees", icon: Wallet },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]"
      aria-label="Main navigation"
    >
      <ul className="max-w-md mx-auto grid grid-cols-4">
        {TABS.map((t) => {
          const active = pathname === t.to || pathname.startsWith(t.to + "/");
          const Icon = t.icon;
          return (
            <li key={t.to}>
              <Link
                to={t.to}
                className={`flex flex-col items-center justify-center gap-1 h-16 text-xs font-semibold transition ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                <Icon className="size-6" strokeWidth={active ? 2.5 : 2} />
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
