import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Check } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import {
  changePassword,
  saveSecurityAnswers,
  completeBikeSetup,
} from "@/lib/wizard.functions";

export const Route = createFileRoute("/setup")({
  component: SetupWizard,
});

type Step =
  | "password"
  | "pick-questions"
  | "answer-questions"
  | "bike"
  | "done";

const REQUIRED_QUESTIONS = 3;

function SetupWizard() {
  const session = useAuthSession();
  const navigate = useNavigate();

  if (session === undefined) return <FullScreenSpinner />;
  if (session === null) return <Navigate to="/login" />;
  return <Wizard onDone={() => navigate({ to: "/" })} />;
}

function Wizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>("password");

  // Step 1 — password
  const changePw = useServerFn(changePassword);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (pw.length < 8) return setPwError("Use at least 8 characters.");
    if (pw !== pw2) return setPwError("Passwords don't match.");
    setPwBusy(true);
    try {
      await changePw({ data: { newPassword: pw } });
      setStep("pick-questions");
    } catch (e) {
      setPwError((e as Error).message);
    } finally {
      setPwBusy(false);
    }
  }

  // Steps 2–3 — questions + answers
  const questionsQuery = useQuery({
    queryKey: ["security_questions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_questions")
        .select("id, question_text")
        .eq("is_active", true)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const [picked, setPicked] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answerIdx, setAnswerIdx] = useState(0);

  const saveAnswers = useServerFn(saveSecurityAnswers);
  const [answersBusy, setAnswersBusy] = useState(false);

  function togglePick(id: string) {
    setPicked((p) =>
      p.includes(id)
        ? p.filter((x) => x !== id)
        : p.length < REQUIRED_QUESTIONS
          ? [...p, id]
          : p,
    );
  }

  const currentQuestion = useMemo(
    () => questionsQuery.data?.find((q) => q.id === picked[answerIdx]),
    [questionsQuery.data, picked, answerIdx],
  );

  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    const id = picked[answerIdx];
    const a = (answers[id] ?? "").trim();
    if (!a) return;
    if (answerIdx < REQUIRED_QUESTIONS - 1) {
      setAnswerIdx(answerIdx + 1);
      return;
    }
    // Last answer — submit all
    setAnswersBusy(true);
    try {
      await saveAnswers({
        data: {
          answers: picked.map((qid) => ({
            questionId: qid,
            answer: answers[qid],
          })),
        },
      });
      setStep("bike");
    } finally {
      setAnswersBusy(false);
    }
  }

  // Step 4 — bike
  const completeBike = useServerFn(completeBikeSetup);
  const [tank, setTank] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [bikeBusy, setBikeBusy] = useState(false);
  const [bikeError, setBikeError] = useState<string | null>(null);

  async function submitBike(e: React.FormEvent) {
    e.preventDefault();
    setBikeError(null);
    const liters = Number(tank);
    if (!liters || liters <= 0) return setBikeError("Enter your tank size in liters.");
    if (!brand.trim() || !model.trim()) return setBikeError("Please fill both fields.");
    setBikeBusy(true);
    try {
      await completeBike({
        data: {
          fuelTankLiters: liters,
          motorcycleBrand: brand.trim(),
          motorcycleModel: model.trim(),
        },
      });
      setStep("done");
    } catch (e) {
      setBikeError((e as Error).message);
    } finally {
      setBikeBusy(false);
    }
  }

  // Progress indicator
  const stepIndex = { password: 0, "pick-questions": 1, "answer-questions": 1, bike: 2, done: 3 }[step];
  const totalSteps = 3;

  return (
    <div className="screen">
      <Header
        title={
          {
            password: "Set your password",
            "pick-questions": "Choose 3 questions",
            "answer-questions": "Your answer",
            bike: "Your motorcycle",
            done: "All set!",
          }[step]
        }
        onBack={
          step === "pick-questions"
            ? () => setStep("password")
            : step === "answer-questions"
              ? () => (answerIdx > 0 ? setAnswerIdx(answerIdx - 1) : setStep("pick-questions"))
              : step === "bike"
                ? () => setStep("answer-questions")
                : undefined
        }
      />
      <Progress current={stepIndex} total={totalSteps} />

      <div className="screen-pad">
        {step === "password" && (
          <form onSubmit={submitPassword} className="flex flex-col gap-4">
            <p className="text-muted-foreground">
              Create a new password only you know. At least 8 characters.
            </p>
            <label className="flex flex-col gap-2">
              <span className="font-semibold">New password</span>
              <input
                type="password"
                className="field"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
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
            {pwError && <p className="text-destructive font-medium">{pwError}</p>}
            <button type="submit" disabled={pwBusy} className="btn-primary mt-2">
              {pwBusy ? "Saving..." : "Next"}
            </button>
          </form>
        )}

        {step === "pick-questions" && (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground">
              Pick {REQUIRED_QUESTIONS} questions. You'll use these if you forget your password.
            </p>
            <ul className="flex flex-col gap-3">
              {(questionsQuery.data ?? []).map((q) => {
                const sel = picked.includes(q.id);
                return (
                  <li key={q.id}>
                    <button
                      type="button"
                      onClick={() => togglePick(q.id)}
                      className={`tile flex items-center justify-between ${sel ? "tile-selected" : ""}`}
                    >
                      <span>{q.question_text}</span>
                      {sel && <Check className="size-6 text-primary shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              disabled={picked.length < REQUIRED_QUESTIONS}
              onClick={() => {
                setAnswerIdx(0);
                setStep("answer-questions");
              }}
              className="btn-primary mt-4"
            >
              {picked.length}/{REQUIRED_QUESTIONS} chosen — Continue
            </button>
          </div>
        )}

        {step === "answer-questions" && currentQuestion && (
          <form onSubmit={submitAnswer} className="flex flex-col gap-4">
            <p className="text-muted-foreground">
              Question {answerIdx + 1} of {REQUIRED_QUESTIONS}
            </p>
            <h2 className="text-xl">{currentQuestion.question_text}</h2>
            <input
              autoFocus
              type="text"
              className="field"
              placeholder="Type your answer"
              value={answers[currentQuestion.id] ?? ""}
              onChange={(e) =>
                setAnswers((a) => ({ ...a, [currentQuestion.id]: e.target.value }))
              }
            />
            <p className="text-sm text-muted-foreground">
              Don't worry about capital letters or spaces — we ignore those.
            </p>
            <button type="submit" disabled={answersBusy} className="btn-primary mt-2">
              {answersBusy
                ? "Saving..."
                : answerIdx === REQUIRED_QUESTIONS - 1
                  ? "Save answers"
                  : "Next"}
            </button>
          </form>
        )}

        {step === "bike" && (
          <form onSubmit={submitBike} className="flex flex-col gap-4">
            <p className="text-muted-foreground">
              We use this to track your fuel and earnings.
            </p>
            <label className="flex flex-col gap-2">
              <span className="font-semibold">Fuel tank size (liters)</span>
              <input
                inputMode="decimal"
                pattern="[0-9.]*"
                className="field"
                placeholder="e.g. 4.5"
                value={tank}
                onChange={(e) => setTank(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="font-semibold">Motorcycle brand</span>
              <input
                className="field"
                placeholder="e.g. Honda"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="font-semibold">Model</span>
              <input
                className="field"
                placeholder="e.g. Click 125i"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </label>
            {bikeError && <p className="text-destructive font-medium">{bikeError}</p>}
            <button type="submit" disabled={bikeBusy} className="btn-primary mt-2">
              {bikeBusy ? "Saving..." : "Finish setup"}
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
              <h2 className="text-2xl font-bold">You're all set!</h2>
              <p className="mt-2 text-muted-foreground">
                Welcome to Trusted Riders. Ingat sa daan!
              </p>
            </div>
            <button onClick={onDone} className="btn-primary">
              Go to my dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <header className="sticky top-0 z-20 bg-card border-b border-border">
      <div className="max-w-md mx-auto h-14 px-2 flex items-center gap-2">
        {onBack ? (
          <button
            onClick={onBack}
            aria-label="Back"
            className="size-12 flex items-center justify-center rounded-xl
                       text-foreground active:bg-muted"
          >
            <ChevronLeft className="size-6" />
          </button>
        ) : (
          <div className="size-12" />
        )}
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
    </header>
  );
}

function Progress({ current, total }: { current: number; total: number }) {
  return (
    <div className="bg-card">
      <div className="max-w-md mx-auto px-5 py-3 flex items-center gap-2">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full ${i <= current - 1 || i === current ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </div>
    </div>
  );
}

function FullScreenSpinner() {
  return (
    <div className="screen items-center justify-center">
      <div className="size-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    </div>
  );
}
