import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  attachCommunitySubject: vi.fn(),
  listCommunityCreatorSubjects: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/data/communities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/communities")>();
  return {
    ...actual,
    attachCommunitySubject: mocks.attachCommunitySubject,
    listCommunityCreatorSubjects: mocks.listCommunityCreatorSubjects,
  };
});

import { GET, POST } from "@/app/api/communities/[slug]/subjects/route";

describe("POST /api/communities/[slug]/subjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "ram" } } })) },
    });
    mocks.attachCommunitySubject.mockResolvedValue({ id: "community-1", slug: "sec-bei" });
    mocks.listCommunityCreatorSubjects.mockResolvedValue([
      { slug: "computer-networks", name: "Computer Networks", attachedTermId: null },
    ]);
  });

  it("lists the creator's existing workspace subjects", async () => {
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ slug: "sec-bei" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.listCommunityCreatorSubjects).toHaveBeenCalledWith("ram", "sec-bei");
    await expect(response.json()).resolves.toMatchObject({
      subjects: [{ slug: "computer-networks", attachedTermId: null }],
    });
  });

  it("attaches a valid Creator Workspace subject through the community service", async () => {
    const input = {
      termId: "8f0f086b-229f-4655-89f7-241767262036",
      subjectSlug: "computer-networks",
    };
    const response = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify(input) }),
      { params: Promise.resolve({ slug: "sec-bei" }) },
    );
    expect(response.status).toBe(201);
    expect(mocks.attachCommunitySubject).toHaveBeenCalledWith("ram", "sec-bei", input);
  });

  it("rejects an invalid term before calling the service", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ termId: "not-a-uuid", subjectSlug: "computer-networks" }),
      }),
      { params: Promise.resolve({ slug: "sec-bei" }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.attachCommunitySubject).not.toHaveBeenCalled();
  });
});
