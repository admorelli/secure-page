import { test, expect } from "@playwright/test";
import { clearVault, createVault, unlock, addCard, SAMPLE } from "./helpers";

test.beforeEach(async ({ page }) => {
  await clearVault(page);
});

test("first run shows create-vault screen and rejects weak/short passwords", async ({
  page,
}) => {
  await expect(page.getByText("Create your master password")).toBeVisible();
  // Too short -> stays on create screen with a warning.
  await page.getByPlaceholder("Master password").fill("short");
  await page.getByPlaceholder("Confirm password").fill("short");
  await page.getByRole("button", { name: "Create vault" }).click();
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  // Mismatch -> warning.
  await page.getByPlaceholder("Master password").fill("correct horse battery");
  await page.getByPlaceholder("Confirm password").fill("different password");
  await page.getByRole("button", { name: "Create vault" }).click();
  await expect(page.getByText("Passwords do not match.")).toBeVisible();
});

test("create vault -> add card -> masked, then reveal shows full data", async ({
  page,
}) => {
  await createVault(page);
  // Empty state.
  await expect(page.getByText("No cards yet. Add one.")).toBeVisible();

  await addCard(page);

  // Masked number visible; full number not yet.
  await expect(page.getByText("XXXX XX** **** 1111")).toBeVisible();
  await expect(page.getByText(SAMPLE.number)).toHaveCount(0);

  // Reveal.
  await page.getByText("XXXX XX** **** 1111").click();
  await expect(page.getByText(SAMPLE.number)).toBeVisible();
  await expect(page.getByText("XXXX XX** **** 1111")).toHaveCount(0);
  await expect(page.getByText(SAMPLE.cvc)).toBeVisible();
  await expect(page.getByText(SAMPLE.pin)).toBeVisible();
  await expect(page.getByText(SAMPLE.expiry)).toBeVisible();
});

test("reject invalid card (bad Luhn) on add", async ({ page }) => {
  await createVault(page);
  await page.getByRole("button", { name: "+ Add card" }).click();
  await page.getByLabel("Label").fill("Bad");
  await page.getByLabel("Number").fill("1234 5678 9012 3456");
  await page.getByLabel("Holder").fill("A B");
  await page.getByLabel("Expiry (MM/YY)").fill("08/27");
  await page.getByLabel("CVC").fill("123");
  await page.getByLabel("PIN").fill("4321");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Card number is invalid.")).toBeVisible();
});

test("wrong password on unlock is rejected", async ({ page }) => {
  await createVault(page, "correct horse battery");
  // Lock, then fail to unlock.
  await page.getByRole("button", { name: "Lock" }).click();
  await unlock(page, "totally wrong");
  // Still on lock screen (no Cards heading).
  await expect(page.getByRole("heading", { name: "Cards" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Master password")).toBeVisible();
});

test("data persists across reload and unlocks with the right password", async ({
  page,
}) => {
  await createVault(page, "correct horse battery");
  await addCard(page);
  // Simulate refresh.
  await page.reload();
  await unlock(page, "correct horse battery");
  await expect(page.getByText("XXXX XX** **** 1111")).toBeVisible();
  // And with the WRONG password after another reload it stays locked.
  await page.reload();
  await unlock(page, "nope");
  await expect(page.getByRole("heading", { name: "Cards" })).toHaveCount(0);
});

test("biometric button degrades gracefully when no platform authenticator", async ({
  page,
}) => {
  // The old disabled placeholder must be gone.
  await page.goto("/");
  // Headless Chromium has no platform authenticator, so biometric unlock is
  // not offered; password remains the path. This guards against a broken
  // disabled button regressing. (Real PRF crypto is covered by unit tests.)
  await expect(page.getByRole("button", { name: "Unlock with biometrics" })).toHaveCount(0);
  await createVault(page, "correct horse battery");
  await expect(page.getByRole("heading", { name: "Cards" })).toBeVisible();
});

test("lock clears decrypted data; re-unlock restores it", async ({ page }) => {
  await createVault(page, "correct horse battery");
  await addCard(page);
  await page.getByRole("button", { name: "Lock" }).click();
  await expect(page.getByPlaceholder("Master password")).toBeVisible();
  await unlock(page, "correct horse battery");
  await expect(page.getByText("XXXX XX** **** 1111")).toBeVisible();
});

test("delete a card removes it", async ({ page }) => {
  await createVault(page, "correct horse battery");
  await addCard(page);
  // Delete lives on the card list item (card-actions), not inside the form.
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No cards yet. Add one.")).toBeVisible();
});
