import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  analyze: vi.fn(),
  upload: vi.fn(),
  publicUrl: vi.fn(),
}));
vi.mock("@/lib/admin-access", () => ({ assertAdminRequest: mocks.access }));
vi.mock("@/lib/payment-qr", () => ({ analyzePaymentQr: mocks.analyze }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: { from: () => ({ upload: mocks.upload, getPublicUrl: mocks.publicUrl }) },
  }),
}));
import { POST } from "@/app/api/admin/payment-config/qr/route";

function request() {
  const form = new FormData();
  form.set("file", new File(["image bytes"], "qr.webp", { type: "image/webp" }));
  return new Request("http://localhost/api/admin/payment-config/qr", {
    method: "POST",
    body: form,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ userId: "admin", role: "admin" });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.publicUrl.mockReturnValue({
    data: { publicUrl: "/vps-storage/public/landing-assets/payment/qr.webp" },
  });
});
describe("QR upload and analysis", () => {
  it("returns detected details along with the uploaded URL", async () => {
    const details = {
      accountName: "TEST PAYEE",
      bankName: "NIC ASIA",
      accountNumber: "001234567890",
    };
    mocks.analyze.mockResolvedValue(details);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ details });
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });
  it("keeps upload working when details cannot be decoded", async () => {
    const details = { accountName: null, bankName: null, accountNumber: null };
    mocks.analyze.mockResolvedValue(details);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ details });
  });
  it("rejects corrupt images before storing them", async () => {
    mocks.analyze.mockRejectedValue(new Error("Invalid image"));
    expect((await POST(request())).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it.each([401, 403])("requires admin access (%s)", async (status) => {
    mocks.access.mockResolvedValue({ error: "Denied", status });
    expect((await POST(request())).status).toBe(status);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
});
