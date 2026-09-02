import { describe, expect, it, vi } from "vitest";
import { getCommunityPostAttachment } from "@/lib/data/community-subjects";

function queryReturning(data: Record<string, unknown> | null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("community contribution attachment access", () => {
  it("returns storage details to an active community member", async () => {
    const post = queryReturning({
      id: "post-1",
      community_id: "community-1",
      status: "pending",
      attachment_bucket: "community-contributions",
      attachment_path: "community-1/subject-1/aarav/resource.pdf",
      attachment_name: "resource.pdf",
      attachment_mime_type: "application/pdf",
    });
    const membership = queryReturning({ status: "active" });
    const admin = {
      from: vi.fn((table: string) =>
        table === "community_posts" ? post : membership,
      ),
    };

    await expect(
      getCommunityPostAttachment("aarav", "post-1", admin as never),
    ).resolves.toEqual({
      bucket: "community-contributions",
      path: "community-1/subject-1/aarav/resource.pdf",
      name: "resource.pdf",
      mimeType: "application/pdf",
    });
  });

  it("blocks users who have not joined the community", async () => {
    const post = queryReturning({
      id: "post-1",
      community_id: "community-1",
      status: "pending",
      attachment_path: "community-1/subject-1/aarav/resource.pdf",
    });
    const membership = queryReturning(null);
    const admin = {
      from: vi.fn((table: string) =>
        table === "community_posts" ? post : membership,
      ),
    };

    await expect(
      getCommunityPostAttachment("outsider", "post-1", admin as never),
    ).rejects.toMatchObject({ status: 403 });
  });
});
