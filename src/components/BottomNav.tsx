import { Link, useLocation } from "@tanstack/react-router";
import { Home, ClipboardList, Wallet, User } from "lucide-react";

/**
 * Bottom navigation, Facebook-style. 4 big tap targets.
 * In Phase 1 only Home and Account are functional; Shifts and Earnings
 * are placeholders so the nav model is locked in.
 */
const TABS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/shifts", label: "Shifts", icon: ClipboardList },
  { to: "/earnings", label: "Earnings", icon: Wallet },
  { to: "/account", label: "Account", icon: User },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border
                 pb-[env(safe-area-inset-bottom)]"
      aria-label="Main navigation"
    >
      <ul className="max-w-md mx-auto grid grid-cols-4">
        {TABS.map((t) => {
          const active =
            t.to === "/" ? pathname === "/" : pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <li key={t.to}>
              <Link
                to={t.to}
                className={`flex flex-col items-center justify-center gap-1 h-16
                  text-xs font-semibold transition
                  ${active ? "text-primary" : "text-muted-foreground"}`}
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
