import { describe, expect, it } from "vitest";
import { getPhoneNumberError, normalizePhoneNumber } from "@/lib/phone-number";

describe("signup phone numbers", () => {
  it("normalizes Nepali mobile numbers for storage", () => {
    expect(normalizePhoneNumber("9812345678")).toBe("+9779812345678");
    expect(normalizePhoneNumber("+977 981-234-5678")).toBe("+9779812345678");
  });

  it("accepts international E.164 numbers and rejects ambiguous input", () => {
    expect(normalizePhoneNumber("+1 (415) 555-2671")).toBe("+14155552671");
    expect(normalizePhoneNumber("4155552671")).toBe("");
    expect(getPhoneNumberError("4155552671")).toBeTruthy();
    expect(getPhoneNumberError("9812345678")).toBe("");
  });
});
