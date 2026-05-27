import { useEffect } from "react";
import { useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { supabase } from "@/integrations/supabase/client";
import { ensureSuperadminSeeded } from "@/lib/auth.functions";

function NotFoundComponent() {
  return (
    <div className="screen items-center justify-center text-center px-6">
      <div className="screen-pad flex flex-col items-center justify-center">
        <div className="text-6xl font-bold text-primary">404</div>
        <h1 className="mt-3 text-xl font-semibold">We can't find that page</h1>
        <p className="mt-2 text-muted-foreground">
          Please go back home and try again.
        </p>
        <Link to="/" className="btn-primary mt-6">Go home</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="screen items-center justify-center px-6 text-center">
      <div className="screen-pad flex flex-col items-center justify-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-muted-foreground">Please try again.</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="btn-primary mt-6"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1",
      },
      { title: "Trusted Riders — Your Driver Log" },
      {
        name: "description",
        content:
          "Mobile-first driver log for Angkas, Pabakal, and Padala. See how much you really earn after fuel.",
      },
      { name: "theme-color", content: "#E22A2A" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Trusted Riders" },
      { property: "og:title", content: "Trusted Riders — Your Driver Log" },
      { property: "og:description", content: "Trusted Rider Log is a PWA for motorcycle drivers to track earnings after fuel costs." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Trusted Riders — Your Driver Log" },
      { name: "description", content: "Trusted Rider Log is a PWA for motorcycle drivers to track earnings after fuel costs." },
      { name: "twitter:description", content: "Trusted Rider Log is a PWA for motorcycle drivers to track earnings after fuel costs." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/c66fcc48-cb90-41d2-92cf-87277f28b3bf/id-preview-cc599fb7--c36e3f37-a141-4939-909e-8135db3548c0.lovable.app-1779807295044.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/c66fcc48-cb90-41d2-92cf-87277f28b3bf/id-preview-cc599fb7--c36e3f37-a141-4939-909e-8135db3548c0.lovable.app-1779807295044.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", type: "image/svg+xml", href: "/icon.svg" },
      { rel: "apple-touch-icon", href: "/icon.svg" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthSync() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
      queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}

function SuperadminBootstrap() {
  useEffect(() => {
    // Idempotent — safe to call on every cold start of the app.
    ensureSuperadminSeeded().catch((e) => console.warn("seed superadmin:", e));
  }, []);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSync />
      <SuperadminBootstrap />
      <Outlet />
    </QueryClientProvider>
  );
}
