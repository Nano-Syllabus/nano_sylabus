const E164_PHONE_NUMBER = /^\+[1-9]\d{7,14}$/;

/**
 * Keeps the value that reaches the database in E.164 format. Nepali mobile
 * numbers are accepted with or without the +977 country prefix for a simpler
 * signup experience.
 */
export function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed || /[a-z]/i.test(trimmed)) return "";

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  if (/^9[6-8]\d{8}$/.test(digits)) return `+977${digits}`;
  if (/^9779[6-8]\d{8}$/.test(digits)) return `+${digits}`;
  if (trimmed.startsWith("00")) return `+${digits.slice(2)}`;
  if (trimmed.startsWith("+")) return `+${digits}`;

  return "";
}

export function getPhoneNumberError(value: string) {
  return E164_PHONE_NUMBER.test(normalizePhoneNumber(value))
    ? ""
    : "Enter a valid phone number with its country code.";
}
