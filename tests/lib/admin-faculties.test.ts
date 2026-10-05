import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  attach: vi.fn(),
  provision: vi.fn(),
  createSubject: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/data/community-subjects", () => ({ publishCommunitySubject: mocks.publish }));
vi.mock("@/lib/community-learning", () => ({ ensureCommunityLearningSpace: mocks.provision }));
vi.mock("@/lib/teacher-app/client", () => ({ createTeacherSubject: mocks.createSubject }));
vi.mock("@/lib/data/communities", () => ({
  CommunityError: class extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
  attachCommunitySubject: mocks.attach,
  invalidateCommunityCatalog: vi.fn(),
}));
import {
  addAdminFacultySubject,
  updateAdminFaculty,
  updateAdminFacultySubject,
} from "@/lib/data/admin-faculties";
import type { SupabaseClient } from "@supabase/supabase-js";
const row = {
  id: "bct",
  slug: "bct-license",
  name: "BCT License",
  faculty: "BCT",
  university: "NEC",
  level: "License",
  creator_id: "database-owner",
  status: "active",
  visibility: "public",
  description: "",
  total_years: 1,
  total_semesters: 1,
};
const input = {
  name: row.name,
  faculty: row.faculty,
  university: row.university,
  level: "License" as const,
  status: "active" as const,
  visibility: "public" as const,
  description: "",
};
function database({
  lock = false,
  mapped = false,
  term = true,
  subject = true,
  published = false,
} = {}) {
  const writes: Array<{ table: string; value: unknown; filters: Record<string, unknown> }> = [];
  const reads: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    reads.push({ table, filters });
    const query = {
      select: () => query,
      order: () => query,
      limit: () => query,
      eq: (key: string, value: unknown) => {
        filters[key] = value;
        return query;
      },
      update: (value: unknown) => {
        writes.push({ table, value, filters });
        return query;
      },
      upsert: (value: unknown) => {
        writes.push({ table, value, filters });
        return query;
      },
      maybeSingle: async () => ({
        error: null,
        data:
          table === "communities"
            ? row
            : table === "community_terms"
              ? term
                ? { id: "term" }
                : null
              : table === "community_subjects"
                ? subject
                  ? { id: "subject", publication_status: published ? "published" : "draft" }
                  : null
                : null,
      }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          error: null,
          data:
            table === "student_exam_enrollments"
              ? lock
                ? [{ user_id: "student" }]
                : []
              : table === "landing_exam_faculties"
                ? mapped
                  ? [{ exam_slug: "exam" }]
                  : []
                : [],
        }).then(resolve),
    };
    return query;
  });
  return { admin: { from } as unknown as SupabaseClient, writes, reads, from };
}
beforeEach(() => vi.clearAllMocks());
describe("admin hierarchy scope", () => {
  it.each([{ lock: true }, { mapped: true }])(
    "keeps a used faculty available: %j",
    async (condition) => {
      const db = database(condition);
      await expect(
        updateAdminFaculty(row.slug, { ...input, status: "archived" }, db.admin),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        updateAdminFaculty(row.slug, { ...input, visibility: "private" }, db.admin),
      ).rejects.toMatchObject({ status: 409 });
      expect(db.writes).toEqual([]);
    },
  );
  it("keeps the established faculty term structure", async () => {
    const db = database();
    await expect(
      updateAdminFaculty(row.slug, { ...input, level: "Bachelor" }, db.admin),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.writes).toEqual([]);
  });
  it("rejects another faculty's term before creating a remote subject", async () => {
    const db = database({ term: false });
    await expect(
      addAdminFacultySubject(
        row.slug,
        { termId: "foreign-term", name: "Physics", code: "" },
        db.admin,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.provision).not.toHaveBeenCalled();
    expect(mocks.createSubject).not.toHaveBeenCalled();
    expect(mocks.attach).not.toHaveBeenCalled();
  });
  it("attaches an existing workspace subject using the persisted creator", async () => {
    const db = database();
    await addAdminFacultySubject(
      row.slug,
      { termId: "term", subjectSlug: "physics", code: "" },
      db.admin,
    );
    expect(mocks.attach).toHaveBeenCalledExactlyOnceWith(
      "database-owner",
      "bct-license",
      { termId: "term", subjectSlug: "physics" },
      db.admin,
    );
    expect(mocks.createSubject).not.toHaveBeenCalled();
  });
  it("rejects publishing a subject belonging to another faculty", async () => {
    const db = database({ subject: false });
    await expect(
      updateAdminFacultySubject(row.slug, "foreign-subject", { action: "publish" }, db.admin),
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(db.reads).toContainEqual({
      table: "community_subjects",
      filters: { id: "foreign-subject", community_id: "bct" },
    });
  });
  it("uses the existing syllabus publishing flow and the database owner", async () => {
    const db = database();
    await updateAdminFacultySubject(row.slug, "subject", { action: "publish" }, db.admin);
    expect(mocks.publish).toHaveBeenCalledExactlyOnceWith(
      "database-owner",
      row.slug,
      "subject",
      db.admin,
    );
  });
  it("cannot publish by changing only the visibility metadata", async () => {
    const db = database();
    await expect(
      updateAdminFacultySubject(
        row.slug,
        "subject",
        {
          action: "save",
          name: "Physics",
          code: "",
          description: "",
          termId: "term",
          position: 0,
          status: "active",
          publicationStatus: "published",
        },
        db.admin,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.writes).toEqual([]);
  });
  it("saves archiving and unpublishing within the faculty boundary", async () => {
    const db = database({ published: true });
    await updateAdminFacultySubject(
      row.slug,
      "subject",
      {
        action: "save",
        name: "Physics",
        code: "P1",
        description: "Study physics",
        termId: "term",
        position: 4,
        status: "archived",
        publicationStatus: "draft",
      },
      db.admin,
    );
    expect(db.writes).toEqual([
      {
        table: "community_subjects",
        value: {
          name: "Physics",
          code: "P1",
          description: "Study physics",
          term_id: "term",
          position: 4,
          status: "archived",
          publication_status: "draft",
        },
        filters: { id: "subject", community_id: "bct" },
      },
    ]);
  });
  it("creates a private source subject and attaches it without returning the workspace key", async () => {
    const db = database();
    mocks.provision.mockResolvedValue({
      teacher: { id: "teacher", collectionKey: "private-test-key" },
    });
    mocks.createSubject.mockResolvedValue({ slug: "physics", folder_path: "Physics" });
    const detail = await addAdminFacultySubject(
      row.slug,
      { termId: "term", name: "Physics", code: "P1" },
      db.admin,
    );
    expect(mocks.createSubject).toHaveBeenCalledExactlyOnceWith("private-test-key", "Physics");
    expect(db.writes).toContainEqual({
      table: "teacher_subject_profiles",
      value: expect.objectContaining({
        teacher_id: "teacher",
        subject_slug: "physics",
        visibility: "private",
        subject_code: "P1",
      }),
      filters: {},
    });
    expect(mocks.attach).toHaveBeenCalledExactlyOnceWith(
      "database-owner",
      row.slug,
      { termId: "term", subjectSlug: "physics" },
      db.admin,
    );
    expect(JSON.stringify(detail)).not.toContain("private-test-key");
  });
  it("does not attach an incomplete subject when its source service fails", async () => {
    const db = database();
    mocks.provision.mockResolvedValue({
      teacher: { id: "teacher", collectionKey: "private-test-key" },
    });
    mocks.createSubject.mockRejectedValue(new Error("Provider unavailable"));
    await expect(
      addAdminFacultySubject(row.slug, { termId: "term", name: "Physics", code: "" }, db.admin),
    ).rejects.toThrow("Provider unavailable");
    expect(mocks.attach).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });
});
