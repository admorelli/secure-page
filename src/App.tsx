import { useEffect, useState } from "react";
import "./App.css";
import { maskCardNumber, formatCardNumber, type CreditCard } from "./lib/mask";
import { createVaultStore, type VaultStore } from "./lib/crypto/store";

// PoC sample data only — real cards will be added via the encrypted vault (Phase 3).
const SAMPLE_CARDS: CreditCard[] = [
  {
    id: "1",
    label: "Personal",
    brand: "visa",
    number: "4111111111111111",
    holderName: "ALEX MORELLI",
    expiry: "08/27",
    cvc: "123",
    pin: "4321",
    notes: "",
  },
  {
    id: "2",
    label: "Work",
    brand: "mastercard",
    number: "5555555555554444",
    holderName: "ALEX MORELLI",
    expiry: "11/28",
    cvc: "321",
    pin: "9876",
    notes: "",
  },
];

function Locked({
  store,
  hasVault,
  onResult,
}: {
  store: VaultStore;
  hasVault: boolean;
  onResult: (ok: boolean, error?: string) => void;
}) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      if (!hasVault) {
        if (pw.length < 8) {
          setError("Use at least 8 characters.");
          return;
        }
        if (pw !== confirm) {
          setError("Passwords do not match.");
          return;
        }
        await store.create(pw);
      } else {
        await store.unlock(pw);
      }
      onResult(true);
    } catch (e) {
      onResult(false, e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <main className="screen lock">
      <div className="brand">Secure Page</div>
      <p className="sub">
        {hasVault ? "Local encrypted vault" : "Create your master password"}
      </p>
      {!hasVault && (
        <p className="warn">
          There is no recovery if you forget this. Stored only on this device.
        </p>
      )}
      <input
        type="password"
        placeholder="Master password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        autoComplete={hasVault ? "current-password" : "new-password"}
      />
      {!hasVault && (
        <input
          type="password"
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      )}
      {error && <p className="error">{error}</p>}
      <button onClick={submit} disabled={!pw}>
        {hasVault ? "Unlock" : "Create vault"}
      </button>
      {hasVault && (
        <button className="ghost" onClick={submit} disabled>
          Unlock with biometrics
        </button>
      )}
    </main>
  );
}

function CardView({ card, revealed }: { card: CreditCard; revealed: boolean }) {
  return (
    <div className={`card ${card.brand}`}>
      <div className="card-top">
        <span className="card-label">{card.label}</span>
        <span className="card-brand">{card.brand}</span>
      </div>
      <div className="card-number">
        {revealed ? formatCardNumber(card.number) : maskCardNumber(card.number)}
      </div>
      <div className="card-row">
        <div>
          <span className="field-label">Holder</span>
          <span>{card.holderName}</span>
        </div>
        <div>
          <span className="field-label">Valid</span>
          <span>{revealed ? card.expiry : "••/••"}</span>
        </div>
      </div>
      {revealed && (
        <div className="card-row">
          <div>
            <span className="field-label">CVC</span>
            <span>{card.cvc}</span>
          </div>
          <div>
            <span className="field-label">PIN</span>
            <span>{card.pin}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Cards({ onLock }: { onLock: () => void }) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const reveal = (id: string) =>
    setRevealed((r) => ({ ...r, [id]: !r[id] }));
  const revealAll = () =>
    setRevealed(Object.fromEntries(SAMPLE_CARDS.map((c) => [c.id, true])));

  return (
    <main className="screen cards">
      <header className="bar">
        <h1>Cards</h1>
        <button onClick={onLock}>Lock</button>
      </header>
      <button className="reveal-all" onClick={revealAll}>
        Reveal all
      </button>
      <div className="card-list">
        {SAMPLE_CARDS.map((c) => (
          <button
            key={c.id}
            className="card-wrap"
            onClick={() => reveal(c.id)}
            aria-expanded={!!revealed[c.id]}
          >
            <CardView card={c} revealed={!!revealed[c.id]} />
          </button>
        ))}
      </div>
      <button className="add">+ Add card</button>
    </main>
  );
}

export default function App() {
  const [store] = useState<VaultStore>(() => createVaultStore());
  const [hasVault, setHasVault] = useState<boolean>(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    store.exists().then(setHasVault);
    const onHide = () => {
      store.lock();
      setUnlocked(false);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [store]);

  return unlocked ? (
    <Cards
      onLock={() => {
        store.lock();
        setUnlocked(false);
      }}
    />
  ) : (
    <Locked
      store={store}
      hasVault={hasVault}
      onResult={(ok, error) => {
        if (ok) {
          setHasVault(true);
          setUnlocked(true);
        } else {
          console.warn("unlock failed:", error);
        }
      }}
    />
  );
}
