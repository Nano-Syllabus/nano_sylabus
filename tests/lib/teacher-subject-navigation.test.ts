import { describe, expect, it } from "vitest";
import {
  teacherCommunitySubjectHref,
  teacherLegacySubjectHref,
  teacherSemesterYear,
  teacherSubjectsHref,
} from "@/lib/teacher-subject-navigation";

const paramsFor = (href: string) => new URL(href, "https://example.test").searchParams;

describe("creator subject navigation", () => {
  it("opens community selection from the Create Subjects sidebar", () => {
    expect(teacherSubjectsHref()).toBe("/teachers?view=subjects");
  });

  it("keeps the community and semester during creation and after completion/cancel", () => {
    const target = { community: "henglish", term: "semester-3" };
    const creating = paramsFor(teacherSubjectsHref({ ...target, create: true }));
    expect(Object.fromEntries(creating)).toEqual({
      view: "subjects",
      community: "henglish",
      term: "semester-3",
      newSubject: "1",
      attachCommunity: "henglish",
      attachTerm: "semester-3",
    });
    expect(Object.fromEntries(paramsFor(teacherSubjectsHref(target)))).toEqual({
      view: "subjects",
      community: "henglish",
      term: "semester-3",
    });
  });

  it("does not launch a community creation dialog without a semester", () => {
    expect(
      paramsFor(teacherSubjectsHref({ community: "henglish", create: true })).has("newSubject"),
    ).toBe(false);
    expect(
      paramsFor(teacherSubjectsHref({ term: "semester-3", create: true })).has("newSubject"),
    ).toBe(false);
  });

  it("opens the subject editor directly and preserves the semester", () => {
    const base = teacherSubjectsHref({ community: "henglish", term: "old-term" });
    const detail = teacherCommunitySubjectHref(base, "teacher_nims", "semester-3");
    const params = paramsFor(detail);
    expect(params.getAll("term")).toEqual(["semester-3"]);
    expect(params.get("view")).toBe("subjects");
    expect(params.has("communitySubject")).toBe(false);
    expect(params.get("subject")).toBe("teacher_nims");
    expect(params.get("tab")).toBe("syllabus");
    const source = paramsFor(
      teacherSubjectsHref({
        community: "henglish",
        term: "semester-3",
        communitySubject: "nims",
        subject: "teacher_nims",
      }),
    );
    expect(Object.fromEntries(source)).toEqual({
      view: "subjects",
      community: "henglish",
      term: "semester-3",
      communitySubject: "nims",
      subject: "teacher_nims",
      tab: "syllabus",
    });
    expect(source.has("returnTo")).toBe(false);
  });

  it("resolves old workspace bookmarks to the editor without topic or forum data", () => {
    const community = {
      slug: "henglish",
      terms: [{ id: "term-3", subjects: [{ slug: "nims", externalSubjectSlug: "teacher_nims" }] }],
    };
    const href = teacherLegacySubjectHref(community, "nims", "term-3");
    expect(href).toBe("/teachers?view=subjects&community=henglish&term=term-3&subject=teacher_nims&tab=syllabus");
    expect(teacherLegacySubjectHref(community, "nims", "")).toBe(href);
    expect(teacherLegacySubjectHref(community, "missing", "term-3")).toBeNull();
    expect(teacherLegacySubjectHref(community, "nims", "wrong-term")).toBeNull();
    expect(teacherLegacySubjectHref({
      slug: "henglish", terms: [{ id: "term-3", subjects: [{ slug: "nims", externalSubjectSlug: null }] }],
    }, "nims", "term-3")).toBeNull();
  });

  it("replaces legacy admin-workspace params when opening an editor", () => {
    const params = paramsFor(teacherCommunitySubjectHref(
      "/teachers?view=communities&community=henglish&communitySubject=old&term=old",
      "teacher_nims",
      "term-3",
    ));
    expect(params.get("view")).toBe("subjects");
    expect(params.has("communitySubject")).toBe(false);
    expect(params.getAll("term")).toEqual(["term-3"]);
    expect(params.get("subject")).toBe("teacher_nims");
  });

  it("encodes community and subject values without adding extra parameters", () => {
    const params = paramsFor(
      teacherSubjectsHref({ community: "a & b", term: "term=1", subject: "notes & library=0" }),
    );
    expect(params.get("community")).toBe("a & b");
    expect(params.get("subject")).toBe("notes & library=0");
    expect(params.has("library")).toBe(false);
  });

  it("keeps existing reusable subjects accessible without selecting a community", () => {
    expect(teacherSubjectsHref({ library: true })).toBe("/teachers?view=subjects&library=1");
  });

  it("restores the correct year for a selected semester, including after indexing", () => {
    const terms = [
      { id: "term-1", yearNumber: 1 },
      { id: "term-3", yearNumber: 2 },
      { id: "term-8", yearNumber: 4 },
    ];
    expect(teacherSemesterYear(terms, "term-3")).toBe(2);
    expect(teacherSemesterYear(terms, "term-8")).toBe(4);
    expect(teacherSemesterYear(terms, "missing")).toBe(1);
    expect(teacherSemesterYear([], "")).toBe(1);
  });
});
