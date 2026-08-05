import { describe, expect, it } from "vitest";
import { createTeacherClassroomJoinCode } from "@/lib/teacher-classroom-code";

describe("createTeacherClassroomJoinCode", () => {
  it("creates a compact uppercase hexadecimal join code", () => {
    expect(createTeacherClassroomJoinCode()).toMatch(/^[0-9A-F]{10}$/);
  });

  it("does not reuse the same code across a small sample", () => {
    const codes = new Set(Array.from({ length: 20 }, createTeacherClassroomJoinCode));
    expect(codes.size).toBe(20);
  });
});
