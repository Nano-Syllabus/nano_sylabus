import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/teachers",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const ROOT = path.join(process.cwd(), "app/teachers-v2");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/**
 * THE CREATOR PORTAL MUST NOT SHIP ITS WHOLE SELF TO OPEN ONE TAB.
 *
 * `/teachers` is eight views and a stack of dialogs, and it used to be one
 * 12,148-line module: 131 kB of route JavaScript, against 25 kB for the next
 * largest route in the app. Every teacher downloaded, parsed and hydrated the
 * exam workflow, the classroom register and a 936-line subject wizard before
 * the page could paint — while landing on "My communities", which needs none of
 * them. Splitting the views out took the route to 24.1 kB and its first load
 * from 264 kB to 158 kB.
 *
 * That is one `import` away from coming back, and it would come back silently:
 * a static import of a view reads exactly like the dynamic one and nothing
 * fails. So the shape is asserted rather than trusted.
 */
describe("the teachers workspace is code split", () => {
  const HEAVY = [
    "views/exams-view",
    "views/classrooms-view",
    "views/settings-view",
    "views/subject-view",
    "views/workspace-dialogs",
  ];

  it("loads every non-default view lazily, never with a static import", () => {
    const entry = read("teacher-workspace-v2.tsx");
    for (const module of HEAVY) {
      const specifier = `./${module.replace("views/", "views/")}`;
      expect(
        entry.includes(`from "${specifier}"`),
        `${module} is statically imported — that puts it back in the first load`,
      ).toBe(false);
      expect(
        entry.includes(`import("${specifier}")`),
        `${module} should be reached through dynamic()`,
      ).toBe(true);
    }
  });

  it("keeps the shared module free of anything only a lazy view needs", () => {
    // `workspace-shared` is in the initial chunk because the shell imports it.
    // Anything only the views use belongs in `views/workspace-view-shared`, or
    // it rides along into the first load for a tab nobody opened.
    const shared = read("workspace-shared.tsx");
    for (const name of ["ClassroomDetailView", "ExamsView", "CreateSubjectDialog", "UploadDialog"]) {
      expect(shared.includes(`function ${name}`)).toBe(false);
    }
    // And it must never depend on the views, which would drag them back in.
    expect(shared.includes('from "@/app/teachers-v2/views/')).toBe(false);
  });

  it("every split module still evaluates and exports its view", async () => {
    // A split that compiles can still fail at runtime — a cycle, or a const read
    // before its module finished evaluating. Importing them proves neither happened.
    const mods = await Promise.all([
      import("@/app/teachers-v2/views/exams-view"),
      import("@/app/teachers-v2/views/classrooms-view"),
      import("@/app/teachers-v2/views/settings-view"),
      import("@/app/teachers-v2/views/subject-view"),
      import("@/app/teachers-v2/views/workspace-dialogs"),
    ]);
    const [exams, classrooms, settings, subjects, dialogs] = mods;
    expect(typeof exams.ExamsView).toBe("function");
    expect(typeof classrooms.ClassroomsView).toBe("function");
    expect(typeof settings.TeacherSettingsView).toBe("function");
    expect(typeof subjects.SubjectsView).toBe("function");
    expect(typeof dialogs.CreateSubjectDialog).toBe("function");
    expect(typeof dialogs.UploadDialog).toBe("function");
  });
});
