import { describe, expect, it } from "vitest";
import {
  cleanDocumentName,
  documentExtension,
  documentStem,
  TEACHER_DOCUMENT_NAME_MAX,
  withRenamedDocument,
} from "@/lib/teacher-document-name";

/**
 * A rename changes what a file is called, never what it is. These are the rules
 * the collection API applies (`clean_document_name` in the backend), mirrored so
 * the workspace can refuse a bad name without a round trip — the two must agree,
 * so the cases here are the backend's own.
 */
describe("cleanDocumentName", () => {
  it.each([
    ["Unit 1 notes", "unit-1.pdf", "Unit 1 notes.pdf"],
    ["Unit 1 notes.PDF", "unit-1.pdf", "Unit 1 notes.pdf"],
    ["  Unit   1\tnotes  ", "unit-1.pdf", "Unit 1 notes.pdf"],
    ["Unit 1.docx", "unit-1.pdf", "Unit 1.docx.pdf"],
    ["इकाई १ नोट्स", "unit-1.pdf", "इकाई १ नोट्स.pdf"],
    ["Handout", "scan", "Handout"],
  ])("names %j on %j as %j", (typed, current, expected) => {
    expect(cleanDocumentName(typed, current)).toEqual({ name: expected });
  });

  it.each([
    ["", "an empty name"],
    ["   ", "only spaces"],
    [".pdf", "only the extension"],
    ["..", "only dots"],
    ["Notes/Unit 1", "a slash"],
    ["Notes\\Unit 1", "a backslash"],
    ["Notes\u0000", "a control character"],
    ["notes\u202efdp", "a direction override"],
    ["x".repeat(TEACHER_DOCUMENT_NAME_MAX), "a name the extension pushes past the limit"],
  ])("refuses %j (%s)", (typed) => {
    expect(cleanDocumentName(typed, "unit-1.pdf").error).toBeTruthy();
  });

  it("refuses anything that is not text", () => {
    expect(cleanDocumentName(undefined, "unit-1.pdf").error).toBe("Enter a name for the file.");
  });
});

describe("documentExtension and documentStem", () => {
  it.each([
    ["Unit 1.pdf", ".pdf", "Unit 1"],
    ["archive.tar.gz", ".gz", "archive.tar"],
    ["scan", "", "scan"],
    [".hidden", "", ".hidden"],
    ["trailing.", "", "trailing."],
  ])("splits %j", (name, extension, stem) => {
    expect(documentExtension(name)).toBe(extension);
    expect(documentStem(name)).toBe(stem);
  });
});

describe("withRenamedDocument", () => {
  const workspace = {
    stale: false,
    documents: [
      { id: "doc_1", path: "Physics/Notes/unit-1.pdf", name: "unit-1.pdf" },
      { id: "doc_2", path: "Physics/Notes/unit-2.pdf", name: "unit-2.pdf" },
    ],
    sourceTree: {
      collection: "ramesh123-teacher",
      tree: [
        {
          type: "folder",
          name: "Physics",
          path: "Physics",
          children: [
            {
              type: "folder",
              name: "Notes",
              path: "Physics/Notes",
              children: [
                { type: "file", name: "unit-1.pdf", path: "Physics/Notes/unit-1.pdf" },
                { type: "file", name: "unit-2.pdf", path: "Physics/Notes/unit-2.pdf" },
              ],
            },
          ],
        },
      ],
    },
  };

  it("renames the one file everywhere it is named, and nothing else", () => {
    const next = withRenamedDocument(workspace, "Physics/Notes/unit-1.pdf", "Kinematics.pdf");

    expect(next.documents).toEqual([
      { id: "doc_1", path: "Physics/Notes/unit-1.pdf", name: "Kinematics.pdf" },
      { id: "doc_2", path: "Physics/Notes/unit-2.pdf", name: "unit-2.pdf" },
    ]);
    const notes = (next.sourceTree.tree as typeof workspace.sourceTree.tree)[0].children[0];
    expect(notes.children.map((file) => [file.path, file.name])).toEqual([
      ["Physics/Notes/unit-1.pdf", "Kinematics.pdf"],
      ["Physics/Notes/unit-2.pdf", "unit-2.pdf"],
    ]);
    // Folders keep their names even when one matches the path being renamed.
    expect(notes.name).toBe("Notes");
    expect(next.sourceTree.collection).toBe("ramesh123-teacher");
    expect(next.stale).toBe(false);
  });

  it("leaves the workspace it was given untouched", () => {
    const before = JSON.stringify(workspace);
    withRenamedDocument(workspace, "Physics/Notes/unit-1.pdf", "Kinematics.pdf");
    expect(JSON.stringify(workspace)).toBe(before);
  });
});
