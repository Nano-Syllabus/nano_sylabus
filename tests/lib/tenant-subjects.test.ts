import { describe, expect, it } from "vitest";
import {
  findTenantSubject,
  findTenantSubjectForCourseSubject,
  listTenantSubjectNames,
  type TenantSubject,
} from "@/lib/tenant/client";

const subjects: TenantSubject[] = [
  {
    name: "Digital Logic",
    slug: "digital-logic",
    namespace: "teacher-a",
    namespace_slug: "teacher-a",
    full_path: "teacher-a/Digital Logic",
    folder_path: "teacher-a/Digital Logic",
    chunk_count: 10,
  },
  {
    name: "Engineering Physics",
    slug: "engineering-physics",
    namespace: "teacher-b",
    namespace_slug: "teacher-b",
    full_path: "teacher-b/Engineering Physics",
    folder_path: "teacher-b/Engineering Physics",
    chunk_count: 20,
  },
  {
    name: "Nepaliii",
    slug: "nepaliii",
    namespace: "teacher-c",
    namespace_slug: "teacher-c",
    full_path: "teacher-c/Nepaliii",
    folder_path: "teacher-c/Nepaliii",
    chunk_count: 4,
  },
];

describe("tenant subject access", () => {
  it("keeps every API subject while ordering profile subjects first", () => {
    expect(listTenantSubjectNames(subjects, ["Engineering Physics"])).toEqual([
      "Engineering Physics",
      "Digital Logic",
      "Nepaliii",
    ]);
  });

  it("resolves display names, slugs, and URL-style names", () => {
    expect(findTenantSubject(subjects, "Digital Logic")?.slug).toBe("digital-logic");
    expect(findTenantSubject(subjects, "engineering-physics")?.name).toBe("Engineering Physics");
    expect(findTenantSubject(subjects, "nepaliii")?.namespace).toBe("teacher-c");
  });

  it("keeps duplicate names scoped to the course-owned teacher subject", () => {
    const duplicateSubjects: TenantSubject[] = [
      {
        name: "MBA",
        slug: "teacher-a-mba",
        namespace: "teacher-a",
        namespace_slug: "teacher_a",
        full_path: "teacher-a/MBA",
        folder_path: "teacher-a/MBA",
        chunk_count: 4,
      },
      {
        name: "mba",
        slug: "teacher-b-mba",
        namespace: "teacher-b",
        namespace_slug: "teacher_b",
        full_path: "teacher-b/mba",
        folder_path: "teacher-b/mba",
        chunk_count: 0,
      },
    ];

    expect(
      findTenantSubjectForCourseSubject(duplicateSubjects, {
        subjectSlug: "teacher-b-mba",
        subjectName: "mba",
        folderPath: "teacher-b/mba",
      }),
    ).toMatchObject({ slug: "teacher-b-mba", namespace: "teacher-b", chunk_count: 0 });
  });
});
