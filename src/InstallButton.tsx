import { useEffect, useState } from "react";

// Minimal type for the install prompt event (not in lib.dom for all TS versions).
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iP(ad|hone|od)/.test(ua);
  const webkit = /WebKit/.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && notChrome;
}

function isBrave() {
  const nav = navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } };
  return (
    "brave" in nav ||
    /Brave/.test(navigator.userAgent) ||
    typeof (
      navigator as unknown as { userAgentData?: { brands?: { brand: string }[] } }
    ).userAgentData?.brands?.some((b) => /Brave/.test(b.brand)) === "boolean"
  );
}

/**
 * Install affordance for the PWA.
 *
 * - Chrome/Edge fire `beforeinstallprompt`: show a real "Install" button.
 * - Brave / iOS never fire it: show a prominent, dismissible banner with the
 *   correct per-platform steps, so install is discoverable without a prompt.
 */
export function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
  }, []);

  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (dismissed) return null;

  // Native install prompt available (Chrome/Edge).
  if (promptEvent) {
    return (
      <div className="install-banner">
        <div className="install-banner-body">
          <span className="install-banner-title">Install Secure Page</span>
          <span className="install-banner-sub">
            Add to your home screen for offline, app-like access.
          </span>
        </div>
        <button className="install-banner-btn" onClick={install}>
          Install
        </button>
        <button className="install-banner-x" aria-label="Dismiss" onClick={() => setDismissed(true)}>
          ×
        </button>
      </div>
    );
  }

  // No native prompt: Brave / iOS. Show explicit steps + copy link.
  const showManual = isIOS() || isBrave();
  if (!showManual) return null;

  const steps = isIOS()
    ? "iPhone: open in Safari → Share → Add to Home Screen."
    : "Brave: tap ⋮ menu → Add to Home Screen (enable Settings → Flags → PWA install if hidden).";

  return (
    <div className="install-banner">
      <div className="install-banner-body">
        <span className="install-banner-title">Add to Home Screen</span>
        <span className="install-banner-sub">{steps}</span>
      </div>
      <button className="install-banner-btn" onClick={copyLink}>
        {copied ? "Copied!" : "Copy link"}
      </button>
      <button className="install-banner-x" aria-label="Dismiss" onClick={() => setDismissed(true)}>
        ×
      </button>
    </div>
  );
}
