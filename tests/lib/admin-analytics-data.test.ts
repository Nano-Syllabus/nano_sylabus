import { describe, expect, it, vi } from "vitest";
import { formatMetric, formatReceipt } from "@/lib/admin-analytics";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), result: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc }),
}));
import { AnalyticsUnavailableError, getAdminAnalytics } from "@/lib/data/admin-analytics";

describe("analytics data is never replaced with invented totals", () => {
  it.each(["PGRST202", "PGRST205", "42P01", "42883"])("reports required database setup for %s", async code => {
    mocks.rpc.mockReturnValue({ abortSignal: mocks.result });
    mocks.result.mockResolvedValue({ data: null, error: { code } });
    await expect(getAdminAnalytics()).rejects.toMatchObject({ setupRequired: true });
    expect(mocks.rpc).toHaveBeenCalledWith("get_platform_admin_analytics");
  });

  it("hides raw database error details", async () => {
    mocks.rpc.mockReturnValue({ abortSignal: mocks.result });
    mocks.result.mockResolvedValue({ data: null, error: { code: "XX000", message: "sensitive database detail" } });
    await expect(getAdminAnalytics()).rejects.toThrow(AnalyticsUnavailableError);
    await expect(getAdminAnalytics()).rejects.not.toThrow("sensitive database detail");
  });

  it.each([null, {}, { users: { total: 12 } }])("rejects incomplete snapshots instead of filling zeroes", async data => {
    mocks.rpc.mockReturnValue({ abortSignal: mocks.result });
    mocks.result.mockResolvedValue({ data, error: null });
    await expect(getAdminAnalytics()).rejects.toMatchObject({ setupRequired: false });
  });
});

describe("analytics number presentation", () => {
  it("distinguishes a real zero from an undefined average", () => {
    expect(formatMetric(0)).toBe("0");
    expect(formatMetric(null)).toBe("—");
  });
  it("shows full counts and rounded averages without abbreviations", () => {
    expect(formatMetric(12345)).toBe("12,345");
    expect(formatMetric(1 / 7, 2)).toBe("0.14");
    expect(formatMetric(100, 2)).toBe("100");
  });
  it("retains currency and major units", () => {
    expect(formatReceipt(1500, "NPR")).toBe("NPR 1,500.00");
    expect(formatReceipt(0, "USD")).toBe("USD 0.00");
  });
});
