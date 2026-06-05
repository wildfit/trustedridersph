import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Check } from "lucide-react";
import {
  getSecurityQuestionsForEmail,
  verifySecurityAnswers,
  setPasswordWithResetToken,
} from "@/lib/auth.functions";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const lookup = useServerFn(getSecurityQuestionsForEmail);
  const verify = useServerFn(verifySecurityAnswers);
  const setPw = useServerFn(setPasswordWithResetToken);

  const [step, setStep] = useState<"email" | "answers" | "new-password" | "done">("email");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [questions, setQuestions] = useState<{ id: string; text: string }[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pw, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await lookup({ data: { email: email.trim() } });
      if (res.locked) {
        setError("Too many attempts. Please wait 15 minutes and try again.");
        return;
      }
      if (!res.userId || res.questions.length === 0) {
        setError(
          "We can't reset this account automatically. Please ask your admin for help.",
        );
        return;
      }
      setUserId(res.userId);
      setQuestions(res.questions);
      setStep("answers");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswers(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setError(null);
    setBusy(true);
    try {
      const res = await verify({
        data: {
          userId,
          email: email.trim(),
          answers: questions.map((q) => ({
            questionId: q.id,
            answer: answers[q.id] ?? "",
          })),
        },
      });
      if (!res.ok) {
        if (res.reason === "locked") {
          setError("Too many attempts. Please wait 15 minutes and try again.");
        } else {
          setError("Some answers don't match. Please try again.");
        }
        return;
      }
      setResetToken(res.resetToken);
      setStep("new-password");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !resetToken) return;
    setError(null);
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (pw !== pw2) return setError("Passwords don't match.");
    setBusy(true);
    try {
      const res = await setPw({
        data: { userId, resetToken, newPassword: pw },
      });
      if (!res.ok) {
        setError(
          res.reason === "expired"
            ? "Your reset link has expired. Start over."
            : "We couldn't set your password. Start over.",
        );
        return;
      }
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <header className="sticky top-0 z-20 bg-card border-b border-border">
        <div className="max-w-md mx-auto h-14 px-2 flex items-center gap-2">
          <Link
            to="/login"
            aria-label="Back"
            className="size-12 flex items-center justify-center rounded-xl active:bg-muted"
          >
            <ChevronLeft className="size-6" />
          </Link>
          <h1 className="text-lg font-semibold">Reset your password</h1>
        </div>
      </header>

      <div className="screen-pad">
        {step === "email" && (
          <form onSubmit={submitEmail} className="flex flex-col gap-4">
            <p className="text-muted-foreground">
              Enter the email you use to sign in. We'll ask your security questions.
            </p>
            <label className="flex flex-col gap-2">
              <span className="font-semibold">Email</span>
              <input
                type="email"
                inputMode="email"
                required
                className="field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error && <p className="text-destructive font-medium">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary mt-2">
              {busy ? "Checking..." : "Continue"}
            </button>
          </form>
        )}

        {step === "answers" && (
          <form onSubmit={submitAnswers} className="flex flex-col gap-5">
            <p className="text-muted-foreground">
              Answer your security questions. Capital letters and spaces don't matter.
            </p>
            {questions.map((q) => (
              <label key={q.id} className="flex flex-col gap-2">
                <span className="font-semibold">{q.text}</span>
                <input
                  type="text"
                  className="field"
                  value={answers[q.id] ?? ""}
                  onChange={(e) =>
                    setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                  }
                />
              </label>
            ))}
            {error && <p className="text-destructive font-medium">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary mt-2">
              {busy ? "Checking..." : "Continue"}
            </button>
          </form>
        )}

        {step === "new-password" && (
          <form onSubmit={submitNewPassword} className="flex flex-col gap-4">
            <p className="text-muted-foreground">
              Choose a new password. At least 8 characters.
            </p>
            <label className="flex flex-col gap-2">
              <span className="font-semibold">New password</span>
              <input
                type="password"
                className="field"
                value={pw}
                onChange={(e) => setPw1(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="font-semibold">Confirm password</span>
              <input
                type="password"
                className="field"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            {error && <p className="text-destructive font-medium">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary mt-2">
              {busy ? "Saving..." : "Set new password"}
            </button>
          </form>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center text-center gap-6 pt-12">
            <div className="size-24 rounded-full bg-success/15 text-success
                            flex items-center justify-center">
              <Check className="size-12" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Password updated!</h2>
              <p className="mt-2 text-muted-foreground">
                Sign in with your new password.
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={() => navigate({ to: "/login" })}
            >
              Go to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
