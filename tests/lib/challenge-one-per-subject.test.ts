import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("one open challenge card per subject", () => {
  it("keeps the started card and every completed one", async () => {
    const { onePerSubjectOpen } = await import("@/lib/data/student-challenge-dashboard");
    const rows = [
      { id: "a", courseId: "c1", subjectSlug: "dsa", status: "assigned" },
      { id: "b", courseId: "c1", subjectSlug: "net", status: "started" },
      { id: "c", courseId: "c1", subjectSlug: "DSA", status: "started" },
      { id: "d", courseId: "c1", subjectSlug: "dsa", status: "completed" },
      { id: "e", courseId: "c1", subjectSlug: "toc", status: "assigned" },
    ];
    expect(onePerSubjectOpen(rows).map((row) => row.id)).toEqual(["b", "c", "d", "e"]);
  });
});
