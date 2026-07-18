import { expect, type Page } from "@playwright/test";

/** Wipe the vault IndexedDB so each test starts from first-run. */
export async function clearVault(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    // Wait for any in-flight IndexedDB ops, then delete the DB.
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("secure-page");
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.goto("/");
}

/** First-run: set a master password and confirm, lands on empty Cards screen. */
export async function createVault(page: Page, password = "correct horse battery") {
  await page.getByPlaceholder("Master password").fill(password);
  await page.getByPlaceholder("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create vault" }).click();
  await expect(page.getByRole("heading", { name: "Cards" })).toBeVisible();
}

/** Unlock an existing vault with the given password. */
export async function unlock(page: Page, password: string) {
  await page.getByPlaceholder("Master password").fill(password);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
}

export const SAMPLE = {
  label: "Personal",
  brand: "visa",
  number: "4111 1111 1111 1111",
  holder: "ALEX MORELLI",
  expiry: "08/27",
  cvc: "123",
  pin: "4321",
};

/** Fill the add-card form and save. Targets inputs by their label text. */
export async function addCard(page: Page, c = SAMPLE) {
  await page.getByRole("button", { name: "+ Add card" }).click();
  await page.getByLabel("Label").fill(c.label);
  await page.getByLabel("Brand").selectOption(c.brand);
  await page.getByLabel("Number").fill(c.number);
  await page.getByLabel("Holder").fill(c.holder);
  await page.getByLabel("Expiry (MM/YY)").fill(c.expiry);
  await page.getByLabel("CVC").fill(c.cvc);
  await page.getByLabel("PIN").fill(c.pin);
  await page.getByRole("button", { name: "Save" }).click();
}
