import jsQR from "jsqr";
import sharp from "sharp";

export type PaymentQrDetails = {
  accountName: string | null;
  bankName: string | null;
  accountNumber: string | null;
};

const EMPTY: PaymentQrDetails = { accountName: null, bankName: null, accountNumber: null };
// Provider codes observed in bank-issued QRs. Unknown codes are left for the admin.
const BANK_NAMES: Record<string, string> = {
  BOALNPKA: "NIC ASIA",
  NICENPKA: "NIC ASIA",
  GLBBNPKA: "Global IME Bank Limited",
};

function text(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max && !/[\u0000-\u001f]/.test(trimmed) ? trimmed : null;
}

/** Extract only labelled payment fields; merchant IDs and phone numbers are not bank accounts. */
export function parsePaymentQr(payload: string): PaymentQrDetails {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const fields = new Map(
        Object.entries(parsed).map(([key, value]) => [
          key.toLowerCase().replace(/[_\s-]/g, ""),
          value,
        ]),
      );
      const get = (...keys: string[]) =>
        keys
          .map((key) => fields.get(key))
          .find((value) => typeof value === "string" && value.trim());
      const bankCode = text(get("bankcode", "swiftcode"), 20)?.toUpperCase();
      const accountNumber = text(get("accountnumber", "accountno"), 64);
      return {
        accountName: text(get("accountname", "merchantname", "payeename"), 160),
        bankName: text(get("bankname"), 500) || (bankCode ? (BANK_NAMES[bankCode] ?? null) : null),
        accountNumber: accountNumber && !/[*•●]/.test(accountNumber) ? accountNumber : null,
      };
    }
  } catch {
    // EMV merchant-presented QRs use tag/length/value fields instead of JSON.
  }

  const bytes = Buffer.from(payload.trim(), "utf8");
  const fields = new Map<string, string>();
  for (let offset = 0; offset < bytes.length; ) {
    const header = bytes.subarray(offset, offset + 4).toString("ascii");
    if (!/^\d{4}$/.test(header)) return { ...EMPTY };
    const tag = header.slice(0, 2);
    const length = Number(header.slice(2));
    if (fields.has(tag) || offset + 4 + length > bytes.length) return { ...EMPTY };
    fields.set(tag, bytes.subarray(offset + 4, offset + 4 + length).toString("utf8"));
    offset += 4 + length;
  }
  // EMV tag 59 is the merchant name. Account templates are provider-specific;
  // reading their IDs as bank account numbers would produce incorrect details.
  return fields.get("00") === "01"
    ? { ...EMPTY, accountName: text(fields.get("59"), 160) }
    : { ...EMPTY };
}

/** Decode locally from the uploaded bytes, without sending payment details to an AI service. */
export async function analyzePaymentQr(image: Buffer): Promise<PaymentQrDetails> {
  const { data, info } = await sharp(image, { limitInputPixels: 25_000_000 })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const code = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
    inversionAttempts: "attemptBoth",
  });
  return code ? parsePaymentQr(code.data) : { ...EMPTY };
}
