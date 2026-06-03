import { useEffect, useState } from "react";
import { X, Download, Share } from "lucide-react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "tr-install-dismissed-at";
const DISMISS_DAYS = 7;

function recentlyDismissed() {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    return Date.now() - Number(v) < DISMISS_DAYS * 86400_000;
  } catch {
    return false;
  }
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectPlatform() {
  if (typeof navigator === "undefined") return "other" as const;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios" as const;
  if (/Android/i.test(ua)) return "android" as const;
  return "other" as const;
}

/**
 * Install prompt with a smart failure mechanism:
 * 1. Captures `beforeinstallprompt` when Chrome/Edge fire it → shows native install button.
 * 2. If event never fires within 4s on Android (e.g. Samsung Internet, Firefox, or
 *    criteria not yet met), shows a manual "Add to Home Screen" instruction sheet.
 * 3. iOS Safari never fires the event → always shows manual instructions.
 * 4. Hidden when already installed/standalone, or recently dismissed.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const [open, setOpen] = useState(false);
  const platform = detectPlatform();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone() || recentlyDismissed()) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    const onInstalled = () => {
      setOpen(false);
      setDeferred(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    // Failure mechanism: if the browser never fires beforeinstallprompt
    // within 4s on a mobile device, fall back to manual instructions.
    const fallbackTimer = window.setTimeout(() => {
      if (!deferred && (platform === "ios" || platform === "android")) {
        setShowFallback(true);
        setOpen(true);
      }
    }, 4000);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(fallbackTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "dismissed") dismiss();
      setDeferred(null);
      setOpen(false);
    } catch {
      setShowFallback(true);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Trusted Riders"
      className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md p-3"
    >
      <div className="rounded-2xl border border-border bg-background shadow-lg p-4">
        <div className="flex items-start gap-3">
          <img src="/icon-192.png" alt="" className="size-10 rounded-xl" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">Install Trusted Riders</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Get faster access and a full-screen experience from your home screen.
            </p>

            {deferred && !showFallback ? (
              <div className="mt-3 flex gap-2">
                <button onClick={install} className="btn-primary inline-flex items-center gap-1.5 text-sm">
                  <Download className="size-4" /> Install
                </button>
                <button onClick={dismiss} className="text-sm px-3 py-2 text-muted-foreground">
                  Not now
                </button>
              </div>
            ) : (
              <div className="mt-3 text-xs text-muted-foreground space-y-1">
                {platform === "ios" ? (
                  <p className="inline-flex items-center gap-1">
                    Tap <Share className="size-3.5 inline" /> Share, then{" "}
                    <b className="text-foreground">Add to Home Screen</b>.
                  </p>
                ) : platform === "android" ? (
                  <p>
                    Open your browser menu (⋮) and tap{" "}
                    <b className="text-foreground">Install app</b> or{" "}
                    <b className="text-foreground">Add to Home screen</b>.
                  </p>
                ) : (
                  <p>Use your browser menu to install this app.</p>
                )}
                <button onClick={dismiss} className="mt-2 underline">
                  Dismiss
                </button>
              </div>
            )}
          </div>
          <button
            onClick={dismiss}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
