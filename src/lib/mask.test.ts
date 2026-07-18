import { describe, it, expect } from "vitest";
import { maskCardNumber, formatCardNumber } from "./mask";

describe("maskCardNumber", () => {
  it("masks all but the last 4 digits", () => {
    expect(maskCardNumber("1234 5678 9012 3456")).toBe("XXXX XX** **** 3456");
  });

  it("strips non-digit separators", () => {
    expect(maskCardNumber("4111-1111-1111-1111")).toBe("XXXX XX** **** 1111");
  });

  it("handles amex-style 15-digit numbers", () => {
    expect(maskCardNumber("378282246310005")).toBe("XXXX XX** **** 0005");
  });

  it("returns empty string for no digits", () => {
    expect(maskCardNumber("   ")).toBe("");
  });
});

describe("formatCardNumber", () => {
  it("groups digits into blocks of 4", () => {
    expect(formatCardNumber("1234567890123456")).toBe(
      "1234 5678 9012 3456",
    );
  });

  it("strips separators", () => {
    expect(formatCardNumber("1234-5678-9012-3456")).toBe(
      "1234 5678 9012 3456",
    );
  });
});
