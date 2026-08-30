import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCommunityPostAttachment: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/data/community-subjects", () => ({
  getCommunityPostAttachment: mocks.getCommunityPostAttachment,
}));

import { GET } from "@/app/api/community-posts/[postId]/attachment/route";

describe("GET /api/community-posts/[postId]/attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "aarav" } } })) },
    });
    mocks.getCommunityPostAttachment.mockResolvedValue({
      bucket: "community-contributions",
      path: "community/subject/aarav/resource.pdf",
      name: "tcp-ip-bank.pdf",
      mimeType: "application/pdf",
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      storage: {
        from: vi.fn(() => ({
          download: vi.fn(async () => ({
            data: new Blob(["pdf-body"], { type: "application/pdf" }),
            error: null,
          })),
        })),
      },
    });
  });

  it("returns an inline attachment after the membership service authorizes access", async () => {
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ postId: "post-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("tcp-ip-bank.pdf");
    expect(mocks.getCommunityPostAttachment).toHaveBeenCalledWith("aarav", "post-1");
    await expect(response.text()).resolves.toBe("pdf-body");
  });

  it("requires authentication before resolving storage details", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ postId: "post-1" }),
    });

    expect(response.status).toBe(401);
    expect(mocks.getCommunityPostAttachment).not.toHaveBeenCalled();
  });
});
