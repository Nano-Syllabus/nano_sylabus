import { describe, expect, it, vi } from "vitest";
import { attachCommunitySubject } from "@/lib/data/communities";

describe("community data authorization", () => {
  it("rejects subject attachment by a non-creator before touching a term", async () => {
    const communityQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: { id: "community-1", creator_id: "ram", status: "active" },
        error: null,
      })),
    };
    communityQuery.select.mockReturnValue(communityQuery);
    communityQuery.eq.mockReturnValue(communityQuery);
    const admin = { from: vi.fn(() => communityQuery) };

    await expect(
      attachCommunitySubject(
        "aarav",
        "sec-bei",
        {
          termId: "8f0f086b-229f-4655-89f7-241767262036",
          subjectSlug: "computer-networks",
        },
        admin as never,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(admin.from).toHaveBeenCalledTimes(1);
    expect(admin.from).toHaveBeenCalledWith("communities");
  });
});
