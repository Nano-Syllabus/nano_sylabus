import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  generateCommunityTerms,
  mapCommunitySummary,
  type CommunityDetail,
} from "@/lib/communities";
import type { CommunityHubData } from "@/lib/data/community-hub";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { CommunityLeaveControl } from "@/components/community-leave-control";
import { CommunitySubjectExplorer } from "@/components/community-subject-explorer";
import { CommunityCatalogClient } from "@/components/community-catalog-client";
import { CommunityHubClient } from "@/components/community-hub-client";

const community: CommunityDetail = {
  ...mapCommunitySummary({
    id: "one",
    slug: "henglish",
    name: "Henglish",
    university: "TU",
    faculty: "English",
    total_years: 1,
    total_semesters: 2,
  }),
  membership: { role: "member", status: "active", joinedAt: "2026-09-03" },
  canManage: false,
  terms: generateCommunityTerms(1, 2).map((term, index) => ({
    ...term,
    id: `term-${index}`,
    subjects: [],
  })),
};

describe("community leave controls (without browser)", () => {
  it("offers a named confirmation with clear consequences and a safe cancel action", () => {
    const html = renderToStaticMarkup(createElement(CommunityLeaveControl, { community }));
    expect(html).toContain('aria-label="Leave Henglish community"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("<dialog");
    expect(html).toContain("Stay in community");
    expect(html).toContain("Confirm leave");
    expect(html).toContain("will not be deleted");
    expect(html).toContain("min-h-11");
    expect(html).toContain("focus-visible:ring-2");
  });
  it.each([
    null,
    { role: "creator", status: "active", joinedAt: "" },
    { role: "member", status: "left", joinedAt: "" },
  ] as const)("does not offer leave to owners, visitors, or former members: %j", (membership) => {
    expect(
      renderToStaticMarkup(
        createElement(CommunityLeaveControl, { community: { ...community, membership } }),
      ),
    ).toBe("");
  });
  it("puts leave in the Subject Explorer header, including an empty community", () => {
    const html = renderToStaticMarkup(
      createElement(CommunitySubjectExplorer, { community, insights: {} }),
    );
    expect(html.slice(0, html.indexOf("</header>"))).toContain(
      'aria-label="Leave Henglish community"',
    );
  });
  it("loads the persisted current semester in both the box and current badge", () => {
    const html = renderToStaticMarkup(
      createElement(CommunitySubjectExplorer, {
        community: {
          ...community,
          membership: { ...community.membership!, currentTermId: "term-1" },
        },
        insights: {},
      }),
    );
    expect(html).toContain('<option value="term-1" selected="">Semester 2</option>');
    expect(html).toContain("Semester 2 · current");
    expect(html).not.toContain("Semester 1 · current");
    expect(html).toContain("Tabs below only change what you browse.");
  });
  it("shows leave on a joined community card", () => {
    const html = renderToStaticMarkup(
      createElement(CommunityCatalogClient, { initialCommunities: [community], signedIn: true }),
    );
    expect(html).toContain('aria-label="Leave Henglish community"');
  });
  it("lets a creator open the same joined community as a student or as its admin", () => {
    const html = renderToStaticMarkup(
      createElement(CommunityCatalogClient, {
        initialCommunities: [
          {
            ...community,
            membership: { role: "creator", status: "active", joinedAt: "2026-09-03" },
            canManage: true,
          },
        ],
        signedIn: true,
      }),
    );
    expect(html).toContain('href="/app/communities/henglish"');
    expect(html).toContain("Open as student");
    expect(html).toContain('href="/teachers?view=communities&amp;community=henglish"');
    expect(html).toContain("Admin workspace");
    expect(html).toContain("do not use that join slot");
    expect(html).not.toContain("Leave Henglish community");
  });
  it("labels an owned community as full learner access", () => {
    const html = renderToStaticMarkup(
      createElement(CommunitySubjectExplorer, {
        community: {
          ...community,
          membership: { role: "creator", status: "active", joinedAt: "2026-09-03" },
          canManage: true,
        },
        insights: {},
      }),
    );
    expect(html).toContain("Your learner access");
    expect(html).toContain("you are already joined");
    expect(html).toContain('href="/app/community?community=henglish"');
    expect(html).toContain('href="/teachers?view=communities&amp;community=henglish"');
    expect(html).toContain("Admin Workspace");
  });
  it("shows leave near the top of Community Hub instead of only beneath the feed", () => {
    const data: CommunityHubData = {
      community,
      currentTerm: community.terms[0],
      currentTermId: "term-0",
      canManage: false,
      memberCount: 1,
      activeToday: 0,
      materialCount: 0,
      topicCount: 0,
      contentReadiness: null,
      subjects: [],
      members: [],
      posts: [],
      announcements: [],
      activity: [],
      viewer: { rank: null, xp: 0, weeklyXp: 0, completedThisWeek: 0, streak: 0, bestScore: null },
    };
    const html = renderToStaticMarkup(createElement(CommunityHubClient, { initialData: data }));
    expect(html.indexOf('aria-label="Leave Henglish community"')).toBeLessThan(
      html.indexOf("Your program community"),
    );
    expect(html).not.toContain("Leave and switch");
  });
});
