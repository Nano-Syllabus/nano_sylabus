import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  download: vi.fn(),
  uploadAndIndex: vi.fn(),
  savePreview: vi.fn(),
  validateDestination: vi.fn(),
}));

vi.mock("@/lib/data/teacher-drive-queue", () => ({
  claimNextDriveImport: mocks.claim,
  completeDriveImport: mocks.complete,
  failDriveImport: mocks.fail,
}));
vi.mock("@/lib/google-drive", async (original) => ({
  ...(await original<typeof import("@/lib/google-drive")>()),
  downloadDriveFile: mocks.download,
}));
vi.mock("@/lib/teacher-document-import", () => ({
  indexedDocumentId: () => "doc-1",
  jobId: () => "job-1",
  safeFilename: (name: string) => name,
  savePreviewFromBuffer: mocks.savePreview,
  uploadAndIndex: mocks.uploadAndIndex,
  validateDestination: mocks.validateDestination,
}));

import { drainDriveQueue } from "@/lib/teacher-drive-drain";

/**
 * The drain's contract: every claimed row leaves the queue with a verdict, and
 * one bad file does not cost the creator the ones behind it. That second half is
 * the property the old per-file browser loop had and the queue must not lose.
 */

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    driveFileId: "drive-file-aaaaaaaaaa",
    fileName: "notes.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    destinationPath: "Nims/Notes",
    shelf: "Notes",
    sourceLink: "https://drive.google.com/file/d/drive-file-aaaaaaaaaa/view",
    status: "importing" as const,
    attempts: 1,
    error: "",
    warning: "",
    documentId: "",
    jobId: "",
    createdAt: "2026-09-14T10:00:00.000Z",
    finishedAt: "",
    ...overrides,
  };
}

/** Hands the drain a fixed run of rows and then an empty queue. */
function queue(rows: ReturnType<typeof item>[]) {
  const pending = [...rows];
  mocks.claim.mockImplementation(async () => pending.shift() ?? null);
}

describe("draining the Drive import queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateDestination.mockResolvedValue("");
    mocks.download.mockResolvedValue({
      buffer: Buffer.from("pdf bytes"),
      fileName: "notes.pdf",
      mimeType: "application/pdf",
    });
    mocks.uploadAndIndex.mockResolvedValue({
      upload: {},
      index: {},
      collectionPath: "Nims/Notes/notes.pdf",
    });
    mocks.savePreview.mockResolvedValue(undefined);
  });

  it("imports every queued file and records each outcome", async () => {
    queue([item(), item({ id: "row-2", fileName: "questions.pdf" })]);

    const result = await drainDriveQueue("collection-secret", "teacher-1");

    expect(result).toEqual({ imported: 2, failed: 0 });
    expect(mocks.uploadAndIndex).toHaveBeenCalledTimes(2);
    expect(mocks.complete).toHaveBeenCalledWith("row-1", {
      documentId: "doc-1",
      jobId: "job-1",
      fileName: "notes.pdf",
      warning: "",
    });
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  it("records a failure and keeps going", async () => {
    queue([item(), item({ id: "row-2", fileName: "broken.pdf" })]);
    mocks.download.mockRejectedValueOnce(new Error("That file is not shared."));

    const result = await drainDriveQueue("collection-secret", "teacher-1");

    expect(result).toEqual({ imported: 1, failed: 1 });
    expect(mocks.fail).toHaveBeenCalledWith("row-1", "That file is not shared.");
    // The one behind it still landed — the whole point of a per-row verdict.
    expect(mocks.complete).toHaveBeenCalledWith(
      "row-2",
      expect.objectContaining({ documentId: "doc-1" }),
    );
  });

  it("re-checks the destination at import time, not at enqueue time", async () => {
    queue([item()]);
    mocks.validateDestination.mockResolvedValue(
      "Choose a folder inside one of this creator's subject shelves.",
    );

    const result = await drainDriveQueue("collection-secret", "teacher-1");

    // A subject can be renamed or removed between queueing and importing, and
    // this row is about to be written to that path.
    expect(result).toEqual({ imported: 0, failed: 1 });
    expect(mocks.uploadAndIndex).not.toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledWith(
      "row-1",
      "Choose a folder inside one of this creator's subject shelves.",
    );
  });

  it("indexes the document even when its private preview cannot be saved", async () => {
    queue([item()]);
    mocks.savePreview.mockRejectedValue(new Error("no such bucket"));

    const result = await drainDriveQueue("collection-secret", "teacher-1");

    expect(result).toEqual({ imported: 1, failed: 0 });
    expect(mocks.complete).toHaveBeenCalledWith(
      "row-1",
      expect.objectContaining({ warning: expect.stringContaining("private preview") }),
    );
  });

  it("judges the shelf rule on Drive's own filename, not the queued one", async () => {
    // A folder import never passes through the file picker, and on the keyless
    // Drive path nothing is known about a file until its bytes arrive — so the
    // name that matters is the one the download reports, and it is checked
    // before a single byte is sent upstream.
    queue([item({ fileName: "course-pack" })]);
    mocks.download.mockResolvedValue({
      buffer: Buffer.from("zip bytes"),
      fileName: "course-pack.zip",
      mimeType: "application/zip",
    });

    const result = await drainDriveQueue("collection-secret", "teacher-1");

    expect(result).toEqual({ imported: 0, failed: 1 });
    expect(mocks.uploadAndIndex).not.toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledWith("row-1", expect.stringContaining("course-pack.zip"));
  });

  it("stops when the queue is empty", async () => {
    queue([]);

    const result = await drainDriveQueue("collection-secret", "teacher-1");

    expect(result).toEqual({ imported: 0, failed: 0 });
    expect(mocks.claim).toHaveBeenCalledTimes(1);
  });
});
