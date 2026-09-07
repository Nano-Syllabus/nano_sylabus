import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateCommunityTerms,
  mapCommunitySummary,
  type CommunityDetail,
} from "@/lib/communities";

const navigation = vi.hoisted(() => ({
  search: "view=subjects",
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
  usePathname: () => "/teachers",
  useRouter: () => ({ replace: navigation.replace, refresh: navigation.refresh }),
}));

import { CommunitiesView } from "@/app/teachers-v2/teacher-workspace-v2";

type Props = ComponentProps<typeof CommunitiesView>;
type Dashboard = NonNullable<Props["dashboard"]>;

const community: CommunityDetail = {
  ...mapCommunitySummary({
    id: "community-1",
    slug: "henglish",
    name: "Henglish",
    university: "TU",
    faculty: "English",
    total_years: 4,
    total_semesters: 8,
  }),
  canManage: true,
  terms: generateCommunityTerms(4, 8).map((term, index) => ({
    ...term,
    id: `term-${index + 1}`,
    subjects:
      index === 2
        ? [
            {
              id: "subject-1",
              termId: "term-3",
              slug: "nims",
              name: "Nims",
              code: "",
              description: "",
              position: 0,
              teacherId: "teacher-1",
              externalSubjectSlug: "teacher_nims",
              folderPath: "Nims",
              publicationStatus: "published" as const,
              publishedAt: null,
              topicSyncStatus: "ready" as const,
              topicSyncedAt: null,
            },
          ]
        : [],
  })),
};

function dashboard(selected = false): Dashboard {
  return {
    summary: {
      classroomCount: 0,
      studentCount: 0,
      paperCount: 0,
      submissionCount: 0,
      actionRequiredCount: 0,
      needsAttentionCount: 0,
    },
    classrooms: [],
    needsAttention: [],
    managedCommunities: [community],
    communityWorkspace: selected ? community : null,
    communityAdmin: null,
    communitySubjectWorkspace: null,
  };
}

function render(overrides: Partial<Props> = {}) {
  return renderToStaticMarkup(
    createElement(CommunitiesView, {
      subjectsMode: true,
      dashboard: dashboard(),
      state: "ready",
      error: "",
      selectedSubjectSlug: "",
      selectedTermId: "",
      onRetry: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSubject: vi.fn(),
      ...overrides,
    }),
  );
}

describe("Create Subjects community manager (server-rendered, no browser)", () => {
  beforeEach(() => {
    navigation.search = "view=subjects";
  });

  it("offers community selection and the existing reusable library", () => {
    const html = render();
    expect(html).toContain("Create Subjects");
    expect(html).toContain("Manage subjects");
    expect(html).toContain("/teachers?view=subjects&amp;community=henglish");
    expect(html).toContain("/teachers?view=subjects&amp;library=1");
    expect(html).not.toContain("Create community");
    expect(html).not.toContain("Open admin workspace");
  });

  it("offers deletion only in the owner's community admin page", () => {
    const own = dashboard(true);
    expect(render({ dashboard: own, subjectsMode: false })).toContain("Delete community");
    expect(render({ dashboard: own, subjectsMode: true })).not.toContain("Delete community");
    const member = { ...own, communityWorkspace: { ...community, canManage: false } };
    expect(render({ dashboard: member, subjectsMode: false })).not.toContain("Delete community");
    // Confirmation is not pre-approved or submitted just by loading the page.
    expect(render({ dashboard: own, subjectsMode: false })).not.toContain("Confirm deletion");
  });

  it("shows the requested year's semesters and links subjects inside Create Subjects", () => {
    navigation.search = "view=subjects&community=henglish&term=term-3";
    const html = render({ dashboard: dashboard(true), selectedTermId: "term-3" });
    expect(html).toContain('id="subject-community"');
    expect(html).toContain("Semester 3");
    expect(html).toContain("Semester 4");
    expect(html).not.toContain("Semester 1</h2>");
    expect(html).toContain("Open Nims");
    expect(html).toContain(
      "/teachers?view=subjects&amp;community=henglish&amp;subject=teacher_nims&amp;tab=syllabus&amp;term=term-3",
    );
    expect(html).toContain("Add subject");
    expect(html).toContain('aria-label="Add subject to Semester 3"');
    expect(html).not.toContain("Open subject creator");
    expect(html).not.toContain("No reusable subjects available");
    expect(html).toContain("Use an existing subject");
    expect(html).toContain("Published · Community members");
    expect(html).not.toContain("Private");
    expect(html).not.toContain("Preview student view");
    expect(html).toContain("Refresh published subject");
    expect(html).toContain('aria-label="Refresh published subject Nims"');
  });

  it("makes extraction visible for newly indexed subjects without reopening the removed workspace", () => {
    navigation.search = "view=subjects&community=henglish&term=term-3";
    const selected = dashboard(true);
    selected.communityWorkspace = {
      ...community,
      terms: community.terms.map((term) => ({
        ...term,
        subjects: term.subjects.map((subject) => ({
          ...subject,
          publicationStatus: "draft",
          publishedAt: null,
          topicSyncStatus: "pending",
        })),
      })),
    };
    const html = render({ dashboard: selected, selectedTermId: "term-3" });
    expect(html).toContain("Publish subject");
    expect(html).toContain("Publishing extracts topics from indexed syllabus and notes");
    expect(html).toContain("Draft · Only you");
    expect(html).toContain("Open Nims");
    expect(html).not.toContain("Subject forum");
  });

  it("does not expose extraction to a non-creator", () => {
    navigation.search = "view=subjects&community=henglish&term=term-3";
    const selected = dashboard(true);
    selected.communityWorkspace = { ...community, canManage: false };
    const html = render({ dashboard: selected, selectedTermId: "term-3" });
    expect(html).not.toContain("Refresh published subject");
    expect(html).not.toContain("Publish subject");
  });

  it("does not render the intermediate workspace or admin forum for old subject URLs", () => {
    navigation.search = "view=subjects&community=henglish&term=term-3";
    const selected = dashboard(true);
    selected.communitySubjectWorkspace = {
      subjectId: "subject-1",
      communityId: community.id,
      courseId: null,
      canManage: true,
      folderPath: "Nims",
      externalSubjectSlug: "teacher_nims",
      publicationStatus: "published",
      publishedAt: null,
      topicSyncStatus: "ready",
      topicSyncError: null,
      contributionThreshold: 3,
      topics: [],
      posts: [],
    };
    const html = render({
      dashboard: selected,
      selectedTermId: "term-3",
      selectedSubjectSlug: "nims",
    });
    expect(html).not.toContain("Nims workspace");
    expect(html).not.toContain("Extracted topics");
    expect(html).not.toContain("Generate or refresh challenges");
    expect(html).not.toContain("Subject forum");
    expect(html).toContain("Subjects by semester");
    expect(html).not.toContain("returnTo=");
  });

  it("provides empty and error recovery states", () => {
    const empty = dashboard();
    empty.managedCommunities = [];
    const html = render({ dashboard: empty });
    expect(html).toContain("No communities available");
    expect(html).toContain("Open My Communities");
    expect(html).not.toContain("Create community");
    expect(
      render({ dashboard: null, state: "error", error: "Unable to load communities" }),
    ).toContain("Unable to load communities");
    expect(
      render({ dashboard: null, state: "error", error: "Unable to load communities" }),
    ).toContain("Try again");
  });

  it("preserves the existing My Communities admin entry", () => {
    const html = render({ subjectsMode: false });
    expect(html).toContain("My communities");
    expect(html).toContain("Open admin workspace");
    expect(html).toContain("/teachers?view=communities&amp;community=henglish");
  });

  it("hides the curriculum manager in My Communities without removing overview or members", () => {
    const selected = dashboard(true);
    selected.communityAdmin = {
      id: community.id,
      slug: community.slug,
      name: community.name,
      university: community.university,
      faculty: community.faculty,
      totalYears: 4,
      totalSemesters: 8,
      contributionThreshold: 3,
      memberCount: 1,
      subjectCount: 1,
      filledSemesterCount: 1,
      pendingResourceCount: 0,
      mergedResourceCount: 0,
      discussionCount: 0,
      recentMembers: [
        { userId: "teacher-1", name: "Suman", role: "creator", joinedAt: "2026-09-03T00:00:00Z" },
      ],
    };
    const html = render({ subjectsMode: false, dashboard: selected });
    expect(html).not.toContain("Curriculum manager");
    expect(html).not.toContain("Choose academic year");
    expect(html).not.toContain("Add subject");
    expect(html).not.toContain("Open Nims workspace");
    expect(html).toContain("Community workspace");
    expect(html).toContain("Active members");
    expect(html).toContain("Community members");
    expect(html).toContain("Suman");
  });
});
