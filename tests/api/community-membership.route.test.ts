import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn(), joinCommunity: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/data/communities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/communities")>();
  return { ...actual, joinCommunity: mocks.joinCommunity };
});

import { POST } from "@/app/api/communities/[slug]/join/route";

describe("POST /api/communities/[slug]/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "aarav" } } })) },
    });
    mocks.joinCommunity.mockResolvedValue({
      id: "community-1",
      slug: "sec-bei",
      membership: { status: "active" },
    });
  });

  it("joins the signed-in student", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ slug: "sec-bei" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.joinCommunity).toHaveBeenCalledWith("aarav", "sec-bei");
  });

  it("does not call the join service without authentication", async () => {
    mocks.createSupabaseServerClient.mockResolvedValueOnce({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ slug: "sec-bei" }),
    });
    expect(response.status).toBe(401);
    expect(mocks.joinCommunity).not.toHaveBeenCalled();
  });
});
