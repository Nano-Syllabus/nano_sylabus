import { describe, expect, it } from "vitest";
import { marketingPhoneError, normalizeMarketingPhone } from "@/lib/marketing-phone";

describe("marketing phone normalization", () => {
  it("normalizes common Nepal mobile formats to E.164", () => {
    expect(normalizeMarketingPhone("9812345678")).toBe("+9779812345678");
    expect(normalizeMarketingPhone("+977 981-234-5678")).toBe("+9779812345678");
    expect(normalizeMarketingPhone("00977 9812345678")).toBe("+9779812345678");
  });

  it("keeps valid international numbers in E.164", () => {
    expect(normalizeMarketingPhone("+91 98765 43210")).toBe("+919876543210");
    expect(marketingPhoneError("+91 98765 43210")).toBeNull();
  });

  it("rejects missing, malformed, and non-E.164 numbers", () => {
    expect(marketingPhoneError("")).toBe("Enter a phone number.");
    expect(marketingPhoneError("98123")).toMatch(/valid phone number/i);
    expect(marketingPhoneError("call me")).toMatch(/valid phone number/i);
  });
});
