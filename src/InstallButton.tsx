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
  // Brave also hides behind Chrome UA; best-effort detection.
  return (
    "brave" in nav ||
    /Brave/.test(navigator.userAgent) ||
    // Brave on Android often exposes this experimental flag
    typeof (navigator as unknown as { userAgentData?: { brands?: { brand: string }[] } })
      .userAgentData?.brands?.some((b) => /Brave/.test(b.brand)) === "boolean"
  );
}

/**
 * Install affordance for the PWA.
 *
 * - Chrome/Edge fire `beforeinstallprompt`: show a real "Install" button.
 * - Brave / iOS never fire it: show a short "Add to Home Screen" hint with the
 *   correct per-platform steps, so install is still discoverable.
 */
export function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    // If no prompt fires shortly, offer the manual hint for Brave/iOS.
    const t = window.setTimeout(() => {
      if (!promptEvent) setShowHint(isIOS() || isBrave());
    }, 1500);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler as EventListener);
      window.clearTimeout(t);
    };
  }, [promptEvent]);

  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
  };

  if (promptEvent) {
    return (
      <button className="install-btn" onClick={install}>
        Install app
      </button>
    );
  }

  if (showHint && isIOS()) {
    return (
      <p className="install-hint">
        On iPhone, open this in <b>Safari</b> → tap <b>Share</b> → <b>Add to Home
        Screen</b>.
      </p>
    );
  }

  if (showHint && isBrave()) {
    return (
      <p className="install-hint">
        In Brave: tap the <b>⋮ menu</b> → <b>Add to Home Screen</b> (or enable
        <b> Settings → Flags → PWA install</b> if the option is hidden).
      </p>
    );
  }

  return null;
}
