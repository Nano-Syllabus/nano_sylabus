const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

/**
 * Store marketing contacts in one predictable format. Nepal mobile numbers are
 * accepted without a country code as a small signup convenience; every other
 * number must include its country code.
 */
export function normalizeMarketingPhone(value: string) {
  const compact = value.trim();
  if (!compact || /[a-z]/i.test(compact)) return "";

  const hasLeadingPlus = compact.startsWith("+");
  const digits = compact.replace(/\D/g, "");
  if (!digits) return "";

  if (/^9[6-8]\d{8}$/.test(digits)) return `+977${digits}`;
  if (/^9779[6-8]\d{8}$/.test(digits)) return `+${digits}`;
  if (compact.startsWith("00")) return `+${digits.slice(2)}`;
  return hasLeadingPlus ? `+${digits}` : "";
}

export function marketingPhoneError(value: string) {
  if (!value.trim()) return "Enter a phone number.";
  const normalized = normalizeMarketingPhone(value);
  if (!E164_PHONE_PATTERN.test(normalized)) {
    return "Use a valid phone number, for example 9812345678 or +977 9812345678.";
  }
  return null;
}
