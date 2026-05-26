import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Check } from "lucide-react";
import {
  getSecurityQuestionsForEmail,
  resetPasswordWithAnswers,
} from "@/lib/auth.functions";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const lookup = useServerFn(getSecurityQuestionsForEmail);
  const reset = useServerFn(resetPasswordWithAnswers);

  const [step, setStep] = useState<"email" | "answers" | "done">("email");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<{ id: string; text: string }[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await lookup({ data: { email: email.trim() } });
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
      const res = await reset({
        data: {
          userId,
          answers: questions.map((q) => ({
            questionId: q.id,
            answer: answers[q.id] ?? "",
          })),
        },
      });
      if (!res.ok) {
        setError("Some answers don't match. Please try again.");
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
              {busy ? "Checking..." : "Reset my password"}
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
              <h2 className="text-2xl font-bold">Password reset!</h2>
              <p className="mt-2 text-muted-foreground">
                Your password is now the default. Sign in to set a new one.
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
