import { describe, it, expect, beforeEach } from "vitest";
import { VaultStore, newId } from "./store";
import { WebCryptoProvider } from "./provider";
import type { VaultStorage } from "./storage";
import type { VaultEnvelope } from "./vault";
import type { CreditCard } from "../mask";

class MemoryStorage implements VaultStorage {
  private env: VaultEnvelope | null = null;
  async save(e: VaultEnvelope) {
    this.env = structuredClone(e);
  }
  async load() {
    return this.env;
  }
  async clear() {
    this.env = null;
  }
}

const TYPE = "credit_card";
const card = (over: Partial<CreditCard> = {}): CreditCard => ({
  id: "",
  label: "Personal",
  brand: "visa",
  number: "4111111111111111",
  holderName: "ALEX MORELLI",
  expiry: "08/27",
  cvc: "123",
  pin: "4321",
  notes: "",
  ...over,
});

const makeStore = () =>
  new VaultStore({ provider: new WebCryptoProvider(), storage: new MemoryStorage() });

describe("VaultStore card records (Phase 3)", () => {
  let store: VaultStore;
  beforeEach(async () => {
    store = makeStore();
    await store.create("master-pw");
  });

  it("adds a record and lists it decrypted", async () => {
    const c = card({ id: newId() });
    await store.addRecord(c.id, TYPE, c);
    const list = await store.listRecords<CreditCard>(TYPE);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(c);
  });

  it("persists across a lock -> reload -> unlock cycle", async () => {
    const shared = new MemoryStorage();
    const s1 = new VaultStore({
      provider: new WebCryptoProvider(),
      storage: shared,
    });
    await s1.create("master-pw");
    const c = card({ id: newId(), label: "Work" });
    await s1.addRecord(c.id, TYPE, c);
    s1.lock();
    // Simulate app restart: brand-new store reading the same storage backend.
    const store2 = new VaultStore({
      provider: new WebCryptoProvider(),
      storage: shared,
    });
    await store2.unlock("master-pw");
    const list = await store2.listRecords<CreditCard>(TYPE);
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe("Work");
    expect(list[0].number).toBe(c.number);
  });

  it("upserts (edit) an existing record in place", async () => {
    const id = newId();
    await store.addRecord(id, TYPE, card({ id, label: "Old" }));
    await store.upsertRecord(id, TYPE, card({ id, label: "New", cvc: "999" }));
    const list = await store.listRecords<CreditCard>(TYPE);
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe("New");
    expect(list[0].cvc).toBe("999");
  });

  it("deletes a record", async () => {
    const id = newId();
    await store.addRecord(id, TYPE, card({ id }));
    await store.addRecord(newId(), TYPE, card());
    await store.deleteRecord(id);
    const list = await store.listRecords<CreditCard>(TYPE);
    expect(list).toHaveLength(1);
    expect(list[0].id).not.toBe(id);
  });

  it("does not expose plaintext after lock", async () => {
    await store.addRecord(newId(), TYPE, card());
    store.lock();
    await expect(store.listRecords<CreditCard>(TYPE)).rejects.toThrow();
  });
});
