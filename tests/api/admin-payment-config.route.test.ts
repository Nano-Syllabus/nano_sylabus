import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVpsStorageClient } from "@/lib/vps-storage";

const mocks = vi.hoisted(() => ({ access: vi.fn(), get: vi.fn(), save: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/admin-access", () => ({ assertAdminRequest: mocks.access }));
vi.mock("@/lib/data/admin-subscriptions", () => ({
  getAdminPaymentConfig: mocks.get,
  saveAdminPaymentConfig: mocks.save,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { PUT } from "@/app/api/admin/payment-config/route";

const config = {
  displayName: "Nano QR Yogesh",
  bankName: "NIC ASIA",
  accountName: "Nano Syllabus Yogesh",
  accountNumber: "01557576",
  qrImageUrl: "/qr-nano.jpg",
  instructions: "Scan the QR and submit the payment receipt.",
};

function request(body: unknown) {
  return new Request("http://localhost/api/admin/payment-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ userId: "admin", role: "admin" });
  mocks.save.mockImplementation(async (input) => ({ id: "config-id", ...input }));
});
afterEach(() => vi.unstubAllEnvs());

describe("saving the payment QR", () => {
  it.each(["", "development"])("accepts the VPS upload URL with prefix '%s'", async (prefix) => {
    vi.stubEnv("VPS_STORAGE_PATH_PREFIX", prefix);
    const qrImageUrl = createVpsStorageClient()
      .from("landing-assets")
      .getPublicUrl("payment/qr-123.webp").data.publicUrl;
    const response = await PUT(request({ ...config, qrImageUrl }));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ ...config, qrImageUrl });
    expect(await response.json()).toMatchObject({ config: { qrImageUrl } });
    expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith("/payment/[slug]", "page");
  });

  it.each(["/qr-nano.jpg", "https://example.com/qr.webp", "http://localhost/qr.png"])(
    "accepts an existing QR image at %s",
    async (qrImageUrl) => {
      expect((await PUT(request({ ...config, qrImageUrl }))).status).toBe(200);
      expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ ...config, qrImageUrl });
    },
  );

  it("trims text and preserves the account number's leading zero", async () => {
    const response = await PUT(request({ ...config, displayName: " Nano QR Yogesh ", bankName: " ", instructions: "" }));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ ...config, bankName: null, instructions: null });
  });

  it.each(["", "qr.png", "/", "//example.com/qr.png", "/\\example.com/qr.png", "javascript:alert(1)", "data:image/png;base64,abc", "ftp://example.com/qr.png", "/qr\n.png"])(
    "rejects an invalid image URL %j with a specific message",
    async (qrImageUrl) => {
      const response = await PUT(request({ ...config, qrImageUrl }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Upload a QR image or use a valid image URL." });
      expect(mocks.save).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["displayName", "", "Add a display name of 120 characters or fewer."],
    ["accountName", "", "Add an account name of 160 characters or fewer."],
    ["instructions", "x".repeat(501), "Instructions must be 500 characters or fewer."],
  ])("identifies the invalid %s field", async (field, value, error) => {
    const response = await PUT(request({ ...config, [field]: value }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each([401, 403])("keeps saving restricted to admins (%s)", async (status) => {
    mocks.access.mockResolvedValue({ error: "Denied", status });
    expect((await PUT(request(config))).status).toBe(status);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
