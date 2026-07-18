import { useEffect, useState } from "react";

// Minimal type for the install prompt event (not in lib.dom for all TS versions).
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

function ua() {
  return typeof navigator !== "undefined" ? navigator.userAgent : "";
}

function isIOS() {
  const u = ua();
  return /iP(ad|hone|od)/.test(u) && /WebKit/.test(u) && !/CriOS|FxiOS|EdgiOS/.test(u);
}

function platformSteps() {
  if (isIOS()) {
    return "iPhone: open in Safari → Share → Add to Home Screen.";
  }
  if (/Android/.test(ua())) {
    return "Android: tap the ⋮ (3-dot) menu → Install app (Chrome) or Add to Home Screen (Brave).";
  }
  return "Add this page to your home screen from your browser's menu.";
}

/**
 * Install affordance for the PWA.
 *
 * The banner is ALWAYS shown on mobile (no fragile browser gating) so the
 * install path is discoverable everywhere — Chrome/Edge can suppress the
 * native prompt (beforeinstallprompt) after a dismissal, and Brave never fires
 * it, so a manual, always-visible hint is the reliable fallback. When the
 * browser DOES fire beforeinstallprompt, a one-tap "Install" button is added.
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

  return (
    <div className="install-banner">
      <div className="install-banner-body">
        <span className="install-banner-title">Add to Home Screen</span>
        <span className="install-banner-sub">{platformSteps()}</span>
      </div>
      {promptEvent && (
        <button className="install-banner-btn" onClick={install}>
          Install
        </button>
      )}
      <button className="install-banner-btn ghost" onClick={copyLink}>
        {copied ? "Copied!" : "Copy link"}
      </button>
      <button className="install-banner-x" aria-label="Dismiss" onClick={() => setDismissed(true)}>
        ×
      </button>
    </div>
  );
}
