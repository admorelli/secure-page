import { describe, it, expect, beforeEach } from "vitest";
import { VaultStore } from "./store";
import { WebCryptoProvider } from "./provider";
import type { VaultStorage } from "./storage";
import type { VaultEnvelope } from "./vault";

/** In-memory storage stand-in so tests don't need fake-indexeddb. */
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

const makeStore = () =>
  new VaultStore({ provider: new WebCryptoProvider(), storage: new MemoryStorage() });

describe("VaultStore (Phase 2 wiring)", () => {
  let store: VaultStore;
  beforeEach(() => {
    store = makeStore();
  });

  it("reports no vault on first run, then exists after create", async () => {
    expect(await store.exists()).toBe(false);
    await store.create("master-pw");
    expect(await store.exists()).toBe(true);
    expect(store.isUnlocked()).toBe(true);
  });

  it("persists across a reload-shaped lifecycle: lock -> unlock with same pw", async () => {
    await store.create("master-pw");
    store.lock();
    expect(store.isUnlocked()).toBe(false);
    await store.unlock("master-pw");
    expect(store.isUnlocked()).toBe(true);
  });

  it("rejects the wrong password on unlock after a reload", async () => {
    await store.create("master-pw");
    store.lock();
    await expect(store.unlock("nope")).rejects.toThrow();
    expect(store.isUnlocked()).toBe(false);
  });

  it("won't create twice", async () => {
    await store.create("master-pw");
    await expect(store.create("other")).rejects.toThrow();
  });

  it("wipe removes the vault and clears unlocked state", async () => {
    await store.create("master-pw");
    await store.wipe();
    expect(await store.exists()).toBe(false);
    expect(store.isUnlocked()).toBe(false);
  });
});
