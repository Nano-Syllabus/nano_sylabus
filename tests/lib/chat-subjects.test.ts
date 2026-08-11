import { describe, expect, it } from "vitest";
import { deriveSubjectTags, filterTenantSubjectsForCourses } from "@/lib/chat-subjects";

describe("deriveSubjectTags", () => {
  it("keeps explicit subject context and retrieval subjects", () => {
    const tags = deriveSubjectTags({
      existingTags: [],
      subjectContext: "Physics",
      retrieval: {
        chunks: [],
        grounded: true,
        citations: [
          {
            chunkId: "chunk-1",
            documentId: "doc-1",
            sourceLabel: "Physics",
            sourceTitle: "Motion",
            sourceName: "physics.pdf",
            subject: "Physics",
            chapter: "Kinematics",
            topic: null,
          },
        ],
      },
      question: "Explain motion",
      profileSubjects: ["Physics", "Mathematics"],
    });

    expect(tags).toEqual(["Physics"]);
  });

  it("falls back to profile subject matches from the question", () => {
    const tags = deriveSubjectTags({
      existingTags: ["General"],
      subjectContext: null,
      retrieval: {
        chunks: [],
        grounded: false,
        citations: [],
      },
      question: "Can you solve this Mathematics question?",
      profileSubjects: ["Physics", "Mathematics"],
    });

    expect(tags).toEqual(["General", "Mathematics"]);
  });

  it("normalizes subject casing from handoff paths", () => {
    const tags = deriveSubjectTags({
      existingTags: [" physics "],
      subjectContext: "physics",
      retrieval: {
        chunks: [],
        grounded: true,
        citations: [
          {
            chunkId: "chunk-1",
            documentId: "doc-1",
            sourceLabel: "Physics",
            sourceTitle: "Motion",
            sourceName: "physics.pdf",
            subject: "physics",
            chapter: null,
            topic: null,
          },
        ],
      },
      question: "physics ko law bujhau",
      profileSubjects: ["physics"],
    });

    expect(tags).toEqual(["Physics"]);
  });
});

describe("filterTenantSubjectsForCourses", () => {
  it("keeps only tenant subjects connected to enrolled courses", () => {
    const subjects = filterTenantSubjectsForCourses(
      [
        { name: "Digital Logic", slug: "digital-logic", folder_path: "Digital Logic" },
        { name: "Engineering Physics", slug: "engineering-physics", folder_path: "Physics" },
        { name: "MBA", slug: "mba", folder_path: "MBA" },
      ],
      [
        {
          subjects: [
            { slug: "engineering-physics", name: "Engineering Physics", folderPath: "Physics" },
            { slug: "mba", name: "MBA", folderPath: "MBA" },
          ],
        },
      ],
    );

    expect(subjects.map((subject) => subject.slug)).toEqual(["engineering-physics", "mba"]);
  });

  it("returns no subjects without an enrolled course", () => {
    expect(
      filterTenantSubjectsForCourses(
        [{ name: "Digital Logic", slug: "digital-logic", folder_path: "Digital Logic" }],
        [],
      ),
    ).toEqual([]);
  });
});
