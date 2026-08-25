import { describe, expect, it } from "vitest";
import { createCourseInviteCode } from "@/lib/course-invites";

describe("course invite codes", () => {
  it("creates opaque codes accepted by the database constraint", () => {
    const first = createCourseInviteCode();
    const second = createCourseInviteCode();

    expect(first).toMatch(/^[A-Z0-9]{32}$/);
    expect(second).toMatch(/^[A-Z0-9]{32}$/);
    expect(first).not.toBe(second);
  });
});
