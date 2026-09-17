import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  generateCommunityTerms,
  mapCommunitySummary,
  type CommunityDetail,
} from "@/lib/communities";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { LibraryNanoAiWorkspace } from "@/components/library-nanoai-workspace";

function renderWorkspace(props: ComponentProps<typeof LibraryNanoAiWorkspace>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(LibraryNanoAiWorkspace, props),
    ),
  );
}

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
  it("shows the saved current semester even when a deep link views an older one", () => {
    const secondTerm = { ...generateCommunityTerms(1, 2)[1], id: "term-2", subjects: [] };
    const html = renderWorkspace({
        community: {
          ...community,
          membership: { ...community.membership!, currentTermId: "term-2" },
          terms: [...community.terms, secondTerm],
        },
        insights: {},
        initialSelection: { termId: "term-1", subjectSlug: "applied-mechanics", documentId: null },
        onSubjectSelect: vi.fn(),
        onMaterialOpen: vi.fn(),
      });

    expect(html).toContain('<option value="term-2" selected="">2nd Semester</option>');
    expect(html).not.toContain('<option value="term-1" selected="">');
  });

  it("renders real community semesters, subjects, and progress in the three-step design", () => {
    const html = renderWorkspace({
        community,
        insights: {
          "subject-1": {
            subjectId: "subject-1",
            readiness: 64,
            materialCount: 3,
            topicCount: 1,
            practicedTopicCount: 1,
            masteredTopicCount: 0,
            examsTaken: 1,
            averageScore: 64,
            topics: [
              {
                key: "forces",
                title: "Forces and equilibrium",
                blurb: "",
                unitNumber: "1",
                percentage: 64,
                attempts: 2,
                status: "developing",
              },
            ],
          },
        },
        initialSelection: { termId: null, subjectSlug: null, documentId: null },
        onSubjectSelect: vi.fn(),
        onMaterialOpen: vi.fn(),
      });

    expect(html).toContain("1. Choose Semester");
    expect(html).toContain("2. Choose Subject");
    expect(html).toContain("Learning Resources");
    expect(html).not.toContain("3. Choose Chapter");
    expect(html).toContain("1st Semester");
    expect(html).toContain("Applied Mechanics");
    const appliedMechanicsCard =
      html.match(/<button[^>]*>.*?Applied Mechanics.*?<\/button>/)?.[0] ?? "";
    expect(appliedMechanicsCard).not.toContain("3 chapters");
    expect(appliedMechanicsCard).toContain("64%");
    expect(appliedMechanicsCard).toContain(
      "Applied Mechanics: 64% progress across 1 indexed topic",
    );
    expect(appliedMechanicsCard).toContain('data-progress-level="low"');
    expect(appliedMechanicsCard).toContain("text-[var(--community-accent)]");
    expect(html).toContain("type-student-page-title");
    expect(html).toContain("/figma/library/book-open.svg");
    expect(html).toContain("Choose running semester");
    expect(html).toContain("lg:grid-cols-2");
    expect(html).toContain("Forces and equilibrium");
    expect(html).toContain("Unit 1");
    expect(html).not.toContain("2 attempts");
    expect(html).not.toContain("In progress");
    expect(html).not.toContain("Your learning progress");
    expect(html).toContain('<option value="term-1" selected="">1st Semester</option>');
    expect(html).not.toContain("Search subjects and chapters");
  });

  it("uses the real materials and membership APIs and removes Subject Explorer from navigation", () => {
    const library = readFileSync("components/library-nanoai-workspace.tsx", "utf8");
    const desktopNav = readFileSync("components/app-sidebar.tsx", "utf8");
    const mobileNav = readFileSync("components/app-nav.tsx", "utf8");
    const oldRoute = readFileSync("app/app/communities/page.tsx", "utf8");
    const settingsPage = readFileSync("app/app/settings/page.tsx", "utf8");
    const settingsForm = readFileSync("components/settings-form.tsx", "utf8");

    expect(library).toContain("/api/student/materials?subject=");
    expect(library).toContain("courseId=");
    expect(library).toContain("/membership");
    expect(library).toContain("semesterSelectionReducer");
    expect(library).toContain('type: "browse"');
    expect(library).toContain("void saveRunningSemester(term)");
    expect(library).toContain("onClick={() => browseTerm(term)}");
    expect(library).not.toContain("async function selectTerm");
    expect(settingsPage).toContain("getActiveCommunity(user.id)");
    expect(settingsPage).toContain("currentTermId: community.membership.currentTermId");
    expect(settingsForm).toContain('label="Running semester"');
    expect(settingsForm).toContain("saveRunningSemester(event.target.value)");
    expect(settingsForm).toContain("/membership`");
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
    expect(oldRoute).toContain("redirect(`/app/today");
  });
});
