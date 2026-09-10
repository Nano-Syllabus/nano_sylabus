import { createHash, randomBytes } from "node:crypto";

export const MOBILE_RECEIPT_UPLOAD_TTL_MINUTES = 15;
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_RECEIPT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export function createReceiptUploadToken() {
  return randomBytes(32).toString("base64url");
}

export function hashReceiptUploadToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function receiptFileExtension(file: File) {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };
  return extensions[file.type] ?? "bin";
}

export function receiptFileError(file: File) {
  if (file.size <= 0 || file.size > MAX_RECEIPT_BYTES) {
    return "Receipt must be smaller than 5 MB.";
  }
  if (!ALLOWED_RECEIPT_TYPES.has(file.type)) {
    return "Upload a JPG, PNG, WebP, or PDF receipt.";
  }
  return null;
}
