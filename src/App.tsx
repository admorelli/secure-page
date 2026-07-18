import { useState } from "react";
import "./App.css";
import { maskCardNumber, formatCardNumber, type CreditCard } from "./lib/mask";

// PoC sample data only — real cards will be stored encrypted in IndexedDB (Phase 3).
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

function Locked({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState("");
  return (
    <main className="screen lock">
      <div className="brand">Secure Page</div>
      <p className="sub">Local encrypted vault</p>
      <input
        type="password"
        placeholder="Master password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        autoComplete="current-password"
      />
      <button onClick={onUnlock} disabled={!pw}>
        Unlock
      </button>
      <button className="ghost" onClick={onUnlock}>
        Unlock with biometrics
      </button>
      <p className="warn">PoC — unlocking uses no real crypto yet.</p>
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
  const [unlocked, setUnlocked] = useState(false);
  return unlocked ? (
    <Cards onLock={() => setUnlocked(false)} />
  ) : (
    <Locked onUnlock={() => setUnlocked(true)} />
  );
}
