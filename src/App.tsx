import { useEffect, useState } from "react";
import "./App.css";
import { maskCardNumber, formatCardNumber, type CreditCard } from "./lib/mask";
import { createVaultStore, newId, type VaultStore } from "./lib/crypto/store";
import { luhnValid, expiryValid } from "./lib/validate";

const RECORD_TYPE = "credit_card";
const EMPTY_CARD: CreditCard = {
  id: "",
  label: "",
  brand: "visa",
  number: "",
  holderName: "",
  expiry: "",
  cvc: "",
  pin: "",
  notes: "",
};

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
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);

  useEffect(() => {
    store.biometricAvailable().then((ok) => {
      setBioAvailable(ok);
      if (ok) setBioEnabled(true); // opt-in by default when supported
    });
  }, [store]);

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
        store.setBiometric(bioAvailable && bioEnabled);
        await store.create(pw);
      } else {
        await store.unlock(pw);
      }
      onResult(true);
    } catch (e) {
      onResult(false, e instanceof Error ? e.message : "Failed");
    }
  };

  const unlockBio = async () => {
    setError(null);
    try {
      await store.unlockWithBiometric();
      onResult(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Biometric unlock failed");
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
      {!hasVault && bioAvailable && (
        <label className="check">
          <input
            type="checkbox"
            checked={bioEnabled}
            onChange={(e) => setBioEnabled(e.target.checked)}
          />
          Enable unlock with biometrics (fingerprint / Face ID)
        </label>
      )}
      {hasVault && bioAvailable && (
        <button className="ghost" onClick={unlockBio}>
          Unlock with biometrics
        </button>
      )}
    </main>
  );
}

function CardForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: CreditCard;
  onSave: (card: CreditCard) => void;
  onCancel: () => void;
}) {
  const [card, setCard] = useState<CreditCard>(initial);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof CreditCard>(k: K, v: CreditCard[K]) =>
    setCard((c) => ({ ...c, [k]: v }));

  const submit = () => {
    setError(null);
    if (!card.label.trim()) return setError("Add a label.");
    if (!luhnValid(card.number)) return setError("Card number is invalid.");
    if (!expiryValid(card.expiry)) return setError("Expiry must be MM/YY, future.");
    if (!/^\d{3,4}$/.test(card.cvc)) return setError("CVC must be 3-4 digits.");
    if (!/^\d{4}$/.test(card.pin)) return setError("PIN must be 4 digits.");
    onSave({ ...card, id: card.id || newId() });
  };

  return (
    <main className="screen form">
      <header className="bar">
        <h1>{card.id ? "Edit card" : "Add card"}</h1>
        <button onClick={onCancel}>Cancel</button>
      </header>
      <label>Label<input value={card.label} onChange={(e) => set("label", e.target.value)} placeholder="Personal" /></label>
      <label>Brand
        <select value={card.brand} onChange={(e) => set("brand", e.target.value as CreditCard["brand"])}>
          <option value="visa">Visa</option>
          <option value="mastercard">Mastercard</option>
          <option value="amex">Amex</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>Number<input value={card.number} onChange={(e) => set("number", e.target.value)} inputMode="numeric" placeholder="4111 1111 1111 1111" /></label>
      <label>Holder<input value={card.holderName} onChange={(e) => set("holderName", e.target.value.toUpperCase())} /></label>
      <label>Expiry (MM/YY)<input value={card.expiry} onChange={(e) => set("expiry", e.target.value)} placeholder="08/27" /></label>
      <label>CVC<input value={card.cvc} onChange={(e) => set("cvc", e.target.value)} inputMode="numeric" /></label>
      <label>PIN<input value={card.pin} onChange={(e) => set("pin", e.target.value)} inputMode="numeric" /></label>
      <label>Notes<textarea value={card.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <button className="primary" onClick={submit}>Save</button>
    </main>
  );
}

function CardView({ card, revealed }: { card: CreditCard; revealed: boolean }) {
  return (
    <div className={`card ${card.brand}`}>
      <div className="card-top">
        <span className="card-label">{card.label || card.brand}</span>
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

function Cards({
  cards,
  onAdd,
  onEdit,
  onDelete,
  onLock,
}: {
  cards: CreditCard[];
  onAdd: () => void;
  onEdit: (c: CreditCard) => void;
  onDelete: (id: string) => void;
  onLock: () => void;
}) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const reveal = (id: string) =>
    setRevealed((r) => ({ ...r, [id]: !r[id] }));
  const revealAll = () =>
    setRevealed(Object.fromEntries(cards.map((c) => [c.id, true])));

  return (
    <main className="screen cards">
      <header className="bar">
        <h1>Cards</h1>
        <button onClick={onLock}>Lock</button>
      </header>
      {cards.length > 0 && (
        <button className="reveal-all" onClick={revealAll}>
          Reveal all
        </button>
      )}
      <div className="card-list">
        {cards.length === 0 && <p className="warn">No cards yet. Add one.</p>}
        {cards.map((c) => (
          <div key={c.id} className="card-item">
            <button
              className="card-wrap"
              onClick={() => reveal(c.id)}
              aria-expanded={!!revealed[c.id]}
            >
              <CardView card={c} revealed={!!revealed[c.id]} />
            </button>
            <div className="card-actions">
              <button onClick={() => onEdit(c)}>Edit</button>
              <button className="danger" onClick={() => onDelete(c.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      <button className="add" onClick={onAdd}>
        + Add card
      </button>
    </main>
  );
}

export default function App() {
  const [store] = useState<VaultStore>(() => createVaultStore());
  const [hasVault, setHasVault] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [editing, setEditing] = useState<CreditCard | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    store.exists().then(setHasVault);
    const onHide = () => {
      store.lock();
      setUnlocked(false);
      setCards([]);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [store]);

  useEffect(() => {
    if (unlocked) void store.listRecords<CreditCard>(RECORD_TYPE).then(setCards);
  }, [unlocked, store]);

  const doLock = () => {
    store.lock();
    setCards([]);
    setUnlocked(false);
  };

  if (adding || editing) {
    return (
      <CardForm
        initial={editing ?? EMPTY_CARD}
        onCancel={() => {
          setEditing(null);
          setAdding(false);
        }}
        onSave={async (card) => {
          if (editing) await store.upsertRecord(card.id, RECORD_TYPE, card);
          else await store.addRecord(card.id, RECORD_TYPE, card);
          setEditing(null);
          setAdding(false);
          setCards(await store.listRecords<CreditCard>(RECORD_TYPE));
        }}
      />
    );
  }

  return unlocked ? (
    <Cards
      cards={cards}
      onAdd={() => setAdding(true)}
      onEdit={(c) => setEditing(c)}
      onDelete={async (id) => {
        await store.deleteRecord(id);
        setCards(await store.listRecords<CreditCard>(RECORD_TYPE));
      }}
      onLock={doLock}
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
