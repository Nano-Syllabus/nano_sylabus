import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { studentFacingBuildError } from "@/lib/data/student-challenges";

/**
 * A community subject's display name can drift from the name the creator's
 * collection knows it by, and the course API then refused every challenge call
 * with its whole subject list — which reached a student's screen verbatim.
 */
describe("challenges ask the course API by subject slug", () => {
  it("sends the slug the community row was attached by, not its display name", () => {
    const source = readFileSync("lib/data/student-challenges.ts", "utf8");
    expect(source).toContain("subject: access.subjectSlug || access.subjectName");
    expect(readFileSync("lib/data/challenge-pool.ts", "utf8")).toContain("subject: row.subject_slug || row.subject_name");
  });

  it("never shows a student the collection's subject list", () => {
    const upstream =
      "subject 'Computer Network and Network Security System' is not pinned in this collection — one of: 'AI', 'C Programming'";
    expect(studentFacingBuildError(upstream)).toBe(
      "This subject's course material couldn't be found. Your teacher may have renamed or moved it — try again later.",
    );
    expect(studentFacingBuildError("The course API could not issue a live challenge exam.")).toBe(
      "The course API could not issue a live challenge exam.",
    );
  });
});
