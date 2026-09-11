import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  generateCommunityTerms,
  mapCommunitySummary,
  type CommunityDetail,
} from "@/lib/communities";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { LibraryNanoAiWorkspace } from "@/components/library-nanoai-workspace";

const baseTerm = generateCommunityTerms(1, 2)[0];
const community: CommunityDetail = {
  ...mapCommunitySummary({
    id: "community-1",
    slug: "bct",
    name: "BCT",
    university: "Tribhuvan University",
    faculty: "Engineering",
    total_years: 1,
    total_semesters: 2,
  }),
  canManage: false,
  membership: {
    role: "member",
    status: "active",
    joinedAt: "2026-09-08",
    currentTermId: "term-1",
  },
  terms: [
    {
      ...baseTerm,
      id: "term-1",
      subjects: [
        {
          id: "subject-1",
          termId: "term-1",
          slug: "applied-mechanics",
          name: "Applied Mechanics",
          code: "ME101",
          description: "Mechanics",
          position: 1,
          teacherId: "teacher-1",
          externalSubjectSlug: "applied-mechanics",
          folderPath: "Applied Mechanics",
          publicationStatus: "published",
          publishedAt: "2026-09-08",
          topicSyncStatus: "ready",
          topicSyncedAt: "2026-09-08",
        },
      ],
    },
  ],
};

describe("unified Figma library", () => {
  it("renders real community semesters, subjects, and progress in the three-step design", () => {
    const html = renderToStaticMarkup(
      createElement(LibraryNanoAiWorkspace, {
        community,
        insights: {
          "subject-1": {
            subjectId: "subject-1",
            readiness: 64,
            materialCount: 3,
            topicCount: 5,
            practicedTopicCount: 2,
            masteredTopicCount: 1,
            examsTaken: 1,
            averageScore: 64,
            topics: [],
          },
        },
        initialSelection: { termId: null, subjectSlug: null, documentId: null },
        onSubjectSelect: vi.fn(),
        onMaterialOpen: vi.fn(),
      }),
    );

    expect(html).toContain("1. Choose Semester");
    expect(html).toContain("2. Choose Subject");
    expect(html).toContain("3. Choose Chapter");
    expect(html).toContain("1st Semester");
    expect(html).toContain("Applied Mechanics");
    const appliedMechanicsCard =
      html.match(/<button[^>]*>.*?Applied Mechanics.*?<\/button>/)?.[0] ?? "";
    expect(appliedMechanicsCard).not.toContain("3 chapters");
    expect(appliedMechanicsCard).not.toContain("64%");
    expect(html).toContain("font-figma-library");
    expect(html).toContain("/figma/library/book-open.svg");
    expect(html).toContain("Choose current semester");
    expect(html).not.toContain("Your learning progress");
    expect(html).toContain('<option value="term-1" selected="">1st Semester</option>');
    expect(html).not.toContain("Search subjects and chapters");
  });

  it("uses the real materials and membership APIs and removes Subject Explorer from navigation", () => {
    const library = readFileSync("components/library-nanoai-workspace.tsx", "utf8");
    const desktopNav = readFileSync("components/app-sidebar.tsx", "utf8");
    const mobileNav = readFileSync("components/app-nav.tsx", "utf8");
    const oldRoute = readFileSync("app/app/communities/page.tsx", "utf8");

    expect(library).toContain("/api/student/materials?subject=");
    expect(library).toContain("courseId=");
    expect(library).toContain("/membership");
    expect(desktopNav).not.toContain('label: "Subject Explorer"');
    expect(desktopNav).toContain('!isCollapsed && "Today"');
    expect(desktopNav).toContain('!isCollapsed && "Community"');
    expect(desktopNav).toContain('!isCollapsed && "Challenges"');
    expect(desktopNav).toContain('title={isCollapsed ? "Library" : undefined}');
    expect(desktopNav).toContain('label: "Revision"');
    expect(mobileNav).not.toContain('label: "Subject Explorer"');
    expect(mobileNav).toContain('label: "Today"');
    expect(mobileNav).toContain('label: "Community"');
    expect(mobileNav).toContain('label: "Challenges"');
    expect(mobileNav).toContain('label: "Library"');
    expect(mobileNav).toContain('label: "Revision"');
    expect(oldRoute).toContain("redirect(`/app/chat");
  });
});
