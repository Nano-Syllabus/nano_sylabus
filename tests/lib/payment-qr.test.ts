import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { analyzePaymentQr, parsePaymentQr } from "@/lib/payment-qr";

const payload = JSON.stringify({
  accountName: "TEST PAYEE",
  accountNumber: "001234567890",
  bankCode: "BOALNPKA",
});
const expected = { accountName: "TEST PAYEE", accountNumber: "001234567890", bankName: "NIC ASIA" };

describe("payment QR details", () => {
  it("reads the bank-issued JSON format while preserving leading zeros", () => {
    expect(parsePaymentQr(payload)).toEqual(expected);
  });
  it("supports uppercase bank names and snake case field names", () => {
    expect(
      parsePaymentQr(
        JSON.stringify({
          account_name: "TEST PAYEE",
          account_number: "001234567890",
          BANKNAME: "NIC ASIA",
        }),
      ),
    ).toEqual(expected);
  });
  it("leaves unknown bank codes and merchant identifiers for manual entry", () => {
    expect(
      parsePaymentQr(
        JSON.stringify({ accountName: "TEST PAYEE", bankCode: "UNKNOWN", merchantId: "123456" }),
      ),
    ).toEqual({ accountName: "TEST PAYEE", bankName: null, accountNumber: null });
  });
  it.each([123456789012345678, "0012****3456"])(
    "does not invent a full account number from %s",
    (accountNumber) => {
      expect(parsePaymentQr(JSON.stringify({ accountNumber })).accountNumber).toBeNull();
    },
  );
  it("reads only the merchant name from an EMV QR", () => {
    const tlv = (tag: string, value: string) =>
      `${tag}${String(Buffer.byteLength(value)).padStart(2, "0")}${value}`;
    expect(
      parsePaymentQr(tlv("00", "01") + tlv("26", tlv("01", "123456")) + tlv("59", "TEST PAYEE")),
    ).toEqual({ accountName: "TEST PAYEE", bankName: null, accountNumber: null });
  });
  it.each(["https://example.com/pay", "not a payment", "0002015909bad", "[]"])(
    "leaves unsupported or malformed payloads empty: %s",
    (value) => {
      expect(parsePaymentQr(value)).toEqual({
        accountName: null,
        bankName: null,
        accountNumber: null,
      });
    },
  );
  it.each(["png", "jpeg", "webp"] as const)(
    "decodes a rotated uploaded %s image",
    async (format) => {
      const svg = renderToStaticMarkup(
        createElement(QRCodeSVG, { value: payload, size: 600, marginSize: 4 }),
      );
      const image = await sharp(Buffer.from(svg)).rotate(90).toFormat(format).toBuffer();
      expect(await analyzePaymentQr(image)).toEqual(expected);
    },
  );
  it("reads the existing bundled payment QR", async () => {
    expect(await analyzePaymentQr(readFileSync("public/qr-nano.jpg"))).toMatchObject({
      bankName: "Global IME Bank Limited",
    });
  });
  it("allows an image without a readable QR to fall back to manual details", async () => {
    const image = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    expect(await analyzePaymentQr(image)).toEqual({
      accountName: null,
      bankName: null,
      accountNumber: null,
    });
  });
});
