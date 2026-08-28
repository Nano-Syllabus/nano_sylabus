import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ insert: vi.fn(), abortSignal: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: () => ({ insert: mock.insert }) }) }));
import { trackApiRequest } from "@/lib/api-request-tracking";

beforeEach(() => {
  mock.insert.mockReturnValue({ abortSignal: mock.abortSignal });
  mock.abortSignal.mockResolvedValue({ error: null });
});
describe("outbound request accounting", () => {
  it("records one successful call with no sensitive request data", async () => {
    const result = { answer: "private answer" };
    expect(await trackApiRequest("collection", async () => result)).toBe(result);
    expect(mock.insert).toHaveBeenCalledTimes(1);
    expect(mock.insert.mock.calls[0][0]).toEqual({ service: "collection", started_at: expect.any(String), duration_ms: expect.any(Number), succeeded: true });
  });
  it("records rejection and preserves the original error", async () => {
    const error = new Error("upstream failure");
    await expect(trackApiRequest("tenant", async () => { throw error; })).rejects.toBe(error);
    expect(mock.insert.mock.calls[0][0].succeeded).toBe(false);
  });
  it("does not discard the real result if the log insert fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mock.abortSignal.mockResolvedValue({ error: { message: "secret" } });
    expect(await trackApiRequest("tenant", async () => 12)).toBe(12);
    expect(console.warn).toHaveBeenCalledWith(expect.not.stringContaining("secret"));
  });
});
