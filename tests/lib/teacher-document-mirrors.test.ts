import { describe, expect, it } from "vitest";
import { orphanedMirrors } from "@/lib/teacher-document-mirrors";

const now = Date.parse("2026-09-29T12:00:00Z");
const old = "2026-09-29T10:00:00Z";
const documents = [
  { document_id: "doc_live", path: "Basic Electrical/Syllabus/Screenshot-10-39.png" },
  { document_id: "doc_notes", path: "Basic Electrical/Notes/CamScanner.pdf" },
];

describe("preview mirrors that outlived their file", () => {
  it("finds a mirror whose file is gone, and keeps the ones that still exist", () => {
    const mirrors = [
      { id: "1", collection_path: "Basic Electrical/Syllabus/Screenshot-10-39.png", external_document_id: "x", created_at: old },
      { id: "2", collection_path: "Basic Electrical/Syllabus/Screenshot-10-24.png", external_document_id: "doc_gone", created_at: old },
      { id: "3", collection_path: "other/Basic Electrical/Notes/CamScanner.pdf", external_document_id: null, created_at: old },
      { id: "4", collection_path: "Basic Electrical/Syllabus/Syllabus 1.png", external_document_id: "doc_live", created_at: old },
    ];
    expect(orphanedMirrors(mirrors, documents, now).map((mirror) => mirror.id)).toEqual(["2"]);
  });

  it("never prunes a fresh upload or against an empty listing", () => {
    const fresh = [
      { id: "5", collection_path: "Basic Electrical/Notes/new.pdf", external_document_id: null, created_at: "2026-09-29T11:55:00Z" },
    ];
    expect(orphanedMirrors(fresh, documents, now)).toEqual([]);
    const stale = [{ id: "6", collection_path: "A/Notes/x.pdf", external_document_id: null, created_at: old }];
    expect(orphanedMirrors(stale, [], now)).toEqual([]);
  });
});
