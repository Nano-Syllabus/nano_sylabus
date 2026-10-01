import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  checkpoint: vi.fn(),
  index: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  download: vi.fn(),
  uploadAndIndex: vi.fn(),
  savePreview: vi.fn(),
  validateDestination: vi.fn(),
}));

vi.mock("@/lib/data/teacher-drive-queue", () => ({
  claimNextDriveImport: mocks.claim,
  checkpointDriveImport: mocks.checkpoint,
  completeDriveImport: mocks.complete,
  failDriveImport: mocks.fail,
}));
vi.mock("@/lib/google-drive", async (original) => ({
  ...(await original<typeof import("@/lib/google-drive")>()),
  downloadDriveFile: mocks.download,
}));
vi.mock("@/lib/teacher-app/client", () => ({ indexTeacherDocument: mocks.index }));
vi.mock("@/lib/teacher-document-import", async (original) => ({
  ...(await original<typeof import("@/lib/teacher-document-import")>()),
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
    claimedAt: "2026-10-01T10:00:00.000Z",
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
    mocks.checkpoint.mockResolvedValue(undefined);
    mocks.index.mockResolvedValue({});
    mocks.uploadAndIndex.mockImplementation(async (input) => {
      await input.onUploaded?.("Nims/Notes/notes.pdf", {});
      return { upload: {}, index: {}, collectionPath: "Nims/Notes/notes.pdf" };
    });
    mocks.savePreview.mockResolvedValue(undefined);
  });

  it("imports every queued file and records each outcome", async () => {
    queue([item(), item({ id: "row-2", fileName: "questions.pdf" })]);

    const result = await drainDriveQueue("collection-secret", "teacher-1");

    expect(result).toEqual({ imported: 2, failed: 0 });
    expect(mocks.uploadAndIndex).toHaveBeenCalledTimes(2);
    expect(mocks.complete).toHaveBeenCalledWith(
      "row-1",
      {
        documentId: "doc-1",
        jobId: "job-1",
        fileName: "notes.pdf",
        warning: "",
      },
      1,
      "2026-10-01T10:00:00.000Z",
    );
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  it("records a failure and keeps going", async () => {
    queue([item(), item({ id: "row-2", fileName: "broken.pdf" })]);
    mocks.download.mockRejectedValueOnce(new Error("That file is not shared."));

    const result = await drainDriveQueue("collection-secret", "teacher-1");

    expect(result).toEqual({ imported: 1, failed: 1 });
    expect(mocks.fail).toHaveBeenCalledWith(
      "row-1",
      "That file is not shared.",
      "notes.pdf",
      1,
      true,
      "2026-10-01T10:00:00.000Z",
    );
    // The one behind it still landed — the whole point of a per-row verdict.
    expect(mocks.complete).toHaveBeenCalledWith(
      "row-2",
      expect.objectContaining({ documentId: "doc-1" }),
      1,
      "2026-10-01T10:00:00.000Z",
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
      "notes.pdf",
      1,
      false,
      "2026-10-01T10:00:00.000Z",
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
      1,
      "2026-10-01T10:00:00.000Z",
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
    expect(mocks.fail).toHaveBeenCalledWith(
      "row-1",
      expect.stringContaining("course-pack.zip"),
      "course-pack.zip",
      1,
      false,
      "2026-10-01T10:00:00.000Z",
    );
  });

  it("refuses a file Drive already said is oversize, without fetching it", async () => {
    // 71.9 MB, the size Drive reports for a real PDF that was pasted in testing.
    queue([item({ sizeBytes: 75_387_542 })]);

    const result = await drainDriveQueue("collection-secret", "teacher-1");

    expect(result).toEqual({ imported: 0, failed: 1 });
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledWith(
      "row-1",
      expect.stringContaining("50 MB"),
      "notes.pdf",
      1,
      false,
      "2026-10-01T10:00:00.000Z",
    );
  });

  it("still fetches when Drive reports no size, since 0 means unknown", async () => {
    // Google-native exports and the keyless path both report no size at all;
    // treating that as "fits" is what lets `readCapped` be the real backstop.
    queue([item({ sizeBytes: 0 })]);

    const result = await drainDriveQueue("collection-secret", "teacher-1");

    expect(result).toEqual({ imported: 1, failed: 0 });
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });

  it("names a failed row after the file, not the placeholder", async () => {
    // The keyless enqueue path stores no name; the drain learns it from the
    // download. A row that then fails must keep that name, or the creator sees
    // "Drive file" beside the error and cannot tell which document it was.
    queue([item({ fileName: "" })]);
    mocks.download.mockResolvedValue({
      buffer: Buffer.from("pdf bytes"),
      fileName: "Basic Electrical Engineering.pdf",
      mimeType: "application/pdf",
    });
    mocks.uploadAndIndex.mockRejectedValue(
      new Error("The document service dropped the connection."),
    );

    await drainDriveQueue("collection-secret", "teacher-1");

    expect(mocks.fail).toHaveBeenCalledWith(
      "row-1",
      "The document service dropped the connection.",
      "Basic Electrical Engineering.pdf",
      1,
      true,
      "2026-10-01T10:00:00.000Z",
    );
  });

  it("stops when the queue is empty", async () => {
    queue([]);

    const result = await drainDriveQueue("collection-secret", "teacher-1");

    expect(result).toEqual({ imported: 0, failed: 0 });
    expect(mocks.claim).toHaveBeenCalledTimes(3);
  });
  it("retries indexing the saved path without downloading or uploading again", async () => {
    queue([item({ collectionPath: "Nims/Notes/saved.pdf", attempts: 2 })]);
    await drainDriveQueue("collection-secret", "teacher-1");
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.uploadAndIndex).not.toHaveBeenCalled();
    expect(mocks.index).toHaveBeenCalledWith("collection-secret", { path: "Nims/Notes/saved.pdf" });
    expect(mocks.complete).toHaveBeenCalledWith(
      "row-1",
      expect.any(Object),
      2,
      "2026-10-01T10:00:00.000Z",
    );
  });

  it("saves a checkpoint before admission to the indexing queue", async () => {
    queue([item()]);
    mocks.uploadAndIndex.mockImplementationOnce(async (input) => {
      await input.onUploaded("Nims/Notes/saved.pdf", {});
      throw Object.assign(new Error("Gemini unavailable"), { status: 503 });
    });
    await drainDriveQueue("collection-secret", "teacher-1");
    expect(mocks.checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({ id: "row-1" }),
      "Nims/Notes/saved.pdf",
    );
    expect(mocks.savePreview).toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledWith(
      "row-1",
      "Gemini unavailable",
      "notes.pdf",
      1,
      true,
      "2026-10-01T10:00:00.000Z",
    );
  });
});
