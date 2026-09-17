import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: { from: vi.fn() },
  createAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createAdmin,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { getBillingSocialProof } from "@/lib/data/billing";

type CountResult = { count: number | null; error: Error | null };

function challengeCountQuery(result: CountResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.gte.mockResolvedValue(result);
  return query;
}

function handwrittenCountQuery(result: CountResult) {
  const query = {
    select: vi.fn(),
    in: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.in.mockResolvedValue(result);
  return query;
}

function membershipCountQuery(result: CountResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockResolvedValue(result);
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAdmin.mockReturnValue(mocks.admin);
});

describe("getBillingSocialProof", () => {
  it("returns counts from the underlying product records", async () => {
    const challenges = challengeCountQuery({ count: 17, error: null });
    const handwritten = handwrittenCountQuery({ count: 29, error: null });
    const memberships = membershipCountQuery({ count: 43, error: null });
    mocks.admin.from.mockImplementation((table: string) => {
      if (table === "student_challenges") return challenges;
      if (table === "teacher_exam_submissions") return handwritten;
      if (table === "community_memberships") return memberships;
      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(getBillingSocialProof()).resolves.toEqual({
      challengesCompletedThisWeek: 17,
      handwrittenAnswersReviewed: 29,
      activeStudyCommunityMembers: 43,
    });
    expect(handwritten.in).toHaveBeenCalledWith("source", ["upload", "file"]);
  });

  it("surfaces a data-source failure instead of displaying a fabricated zero", async () => {
    const failure = new Error("Could not query memberships");
    mocks.admin.from.mockImplementation((table: string) => {
      if (table === "student_challenges") return challengeCountQuery({ count: 0, error: null });
      if (table === "teacher_exam_submissions") {
        return handwrittenCountQuery({ count: 0, error: null });
      }
      if (table === "community_memberships") {
        return membershipCountQuery({ count: null, error: failure });
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(getBillingSocialProof()).rejects.toThrow(failure);
  });
});
