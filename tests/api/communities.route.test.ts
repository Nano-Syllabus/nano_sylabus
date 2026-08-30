import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  listPublicCommunities: vi.fn(),
  createCommunity: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/data/communities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/communities")>();
  return {
    ...actual,
    listPublicCommunities: mocks.listPublicCommunities,
    createCommunity: mocks.createCommunity,
  };
});

import { GET, POST } from "@/app/api/communities/route";

const validInput = {
  name: "SEC BEI",
  university: "Pokhara University",
  faculty: "BEI",
  description: "A shared academic community for electronics engineering students.",
  totalYears: 4,
  totalSemesters: 8,
  visibility: "public",
};

describe("/api/communities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
    });
    mocks.listPublicCommunities.mockResolvedValue([{ id: "community-1", slug: "sec-bei" }]);
    mocks.createCommunity.mockResolvedValue({ id: "community-1", slug: "sec-bei" });
  });

  it("lists public communities with viewer membership state", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(mocks.listPublicCommunities).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      communities: [{ id: "community-1", slug: "sec-bei" }],
    });
  });

  it("creates a validated community for the signed-in user", async () => {
    const response = await POST(
      new Request("http://localhost/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validInput),
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.createCommunity).toHaveBeenCalledWith("user-1", validInput);
  });

  it("requires authentication before community creation", async () => {
    mocks.createSupabaseServerClient.mockResolvedValueOnce({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });
    const response = await POST(
      new Request("http://localhost/api/communities", {
        method: "POST",
        body: JSON.stringify(validInput),
      }),
    );
    expect(response.status).toBe(401);
    expect(mocks.createCommunity).not.toHaveBeenCalled();
  });

  it("returns the invalid field for an impossible academic structure", async () => {
    const response = await POST(
      new Request("http://localhost/api/communities", {
        method: "POST",
        body: JSON.stringify({ ...validInput, totalSemesters: 3 }),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ field: "totalSemesters" });
    expect(mocks.createCommunity).not.toHaveBeenCalled();
  });
});
