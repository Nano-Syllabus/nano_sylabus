import { describe, expect, it } from "vitest";
import {
  isTeacherSyllabusFileSupported,
  TEACHER_SYLLABUS_FILE_ACCEPT,
} from "@/lib/teacher-upload";

describe("teacher syllabus uploads", () => {
  it.each(["syllabus.jpg", "syllabus.jpeg", "syllabus.png", "syllabus.webp"])(
    "accepts image syllabus %s",
    (fileName) => {
      expect(isTeacherSyllabusFileSupported(fileName)).toBe(true);
    },
  );

  it("keeps document formats and rejects unrelated files", () => {
    expect(isTeacherSyllabusFileSupported("course.pdf")).toBe(true);
    expect(isTeacherSyllabusFileSupported("course.docx")).toBe(true);
    expect(isTeacherSyllabusFileSupported("installer.exe")).toBe(false);
    expect(TEACHER_SYLLABUS_FILE_ACCEPT).toContain(".jpg");
    expect(TEACHER_SYLLABUS_FILE_ACCEPT).toContain(".jpeg");
  });
});
