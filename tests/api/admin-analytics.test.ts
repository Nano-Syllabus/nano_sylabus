import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ access: vi.fn(), analytics: vi.fn() }));
vi.mock("@/lib/admin-access", () => ({ assertAdminRequest: mock.access }));
vi.mock("@/lib/data/admin-analytics", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/data/admin-analytics")>(), getAdminAnalytics: mock.analytics }));
import { GET } from "@/app/api/admin/analytics/route";
import { AnalyticsUnavailableError } from "@/lib/data/admin-analytics";

beforeEach(() => { mock.access.mockResolvedValue({ userId: "admin-id" }); });
describe("admin analytics API boundary", () => {
  it.each([401, 403, 503])("does not query any metrics when authorization returns %s", async status => {
    mock.access.mockResolvedValue({ error: "Denied", status });
    const result = await GET();
    expect(result.status).toBe(status);
    expect(mock.analytics).not.toHaveBeenCalled();
    expect(result.headers.get("cache-control")).toContain("no-store");
  });
  it("returns an authorized snapshot without shared caching", async () => {
    mock.analytics.mockResolvedValue({ generatedAt: "verified-snapshot" });
    const result = await GET();
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ generatedAt: "verified-snapshot" });
    expect(result.headers.get("vary")).toBe("Cookie");
  });
  it("exposes a setup error, never fake zero metrics", async () => {
    mock.analytics.mockRejectedValue(new AnalyticsUnavailableError(true));
    const result = await GET();
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ setupRequired: true, error: expect.stringContaining("20260828120000") });
  });
  it("does not expose raw server errors", async () => {
    mock.analytics.mockRejectedValue(new Error("service-role-secret"));
    expect(JSON.stringify(await (await GET()).json())).not.toContain("service-role-secret");
  });
});
