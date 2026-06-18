import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Bike, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      setError("That email and password don't match. Please try again.");
      return;
    }
    navigate({ to: "/" });
  }

  return (
    <div className="screen">
      <div className="screen-pad flex flex-col">
        <div className="flex flex-col items-center text-center pt-8 pb-10">
          <div className="size-20 rounded-3xl bg-primary text-primary-foreground
                          flex items-center justify-center shadow-lg">
            <Bike className="size-10" />
          </div>
          <h1 className="mt-5 text-3xl font-bold">Kita + Metro</h1>
          <p className="mt-2 text-muted-foreground text-lg">
            Welcome back, kabayan!
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="font-semibold">Email</span>
            <input
              type="email"
              required
              autoComplete="username"
              inputMode="email"
              className="field"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="font-semibold">Password</span>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                required
                autoComplete="current-password"
                className="field pr-14"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 size-10
                           rounded-lg flex items-center justify-center text-muted-foreground"
              >
                {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
          </label>

          {error && (
            <p className="text-destructive font-medium text-center" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary mt-2">
            {busy ? "Signing in..." : "Sign in"}
          </button>

          <Link to="/forgot-password" className="btn-ghost">
            Forgot password?
          </Link>
        </form>

        <p className="mt-auto pt-8 text-center text-sm text-muted-foreground">
          New driver? Ask your admin to add you.
        </p>
      </div>
    </div>
  );
}
