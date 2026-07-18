export type CardBrand = "visa" | "mastercard" | "amex" | "other";

export interface CreditCard {
  id: string;
  label: string;
  brand: CardBrand;
  number: string; // full PAN
  holderName: string;
  expiry: string; // MM/YY
  cvc: string;
  pin: string;
  notes: string;
}

/**
 * Produce the masked display string for a card number, e.g.
 * "1234 5678 9012 3456" -> "XXXX XX** **** 3456".
 * Keeps only the last 4 digits visible; the rest become masking glyphs.
 */
export function maskCardNumber(number: string): string {
  const digits = number.replace(/\D/g, "");
  if (digits.length === 0) return "";
  const last4 = digits.slice(-4);
  return `XXXX XX** **** ${last4}`;
}

/**
 * Format a full PAN into grouped blocks of 4 for display (reveal view).
 */
export function formatCardNumber(number: string): string {
  const digits = number.replace(/\D/g, "");
  return digits.replace(/(.{4})/g, "$1 ").trim();
}
