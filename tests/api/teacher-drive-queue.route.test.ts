import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTeacherProfile: vi.fn(),
  listDriveImports: vi.fn(),
  clearFinishedDriveImports: vi.fn(),
  retryDriveImports: vi.fn(),
  drainDriveQueue: vi.fn(),
}));

vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/data/teacher-drive-queue", () => ({
  listDriveImports: mocks.listDriveImports,
  clearFinishedDriveImports: mocks.clearFinishedDriveImports,
  retryDriveImports: mocks.retryDriveImports,
}));
vi.mock("@/lib/teacher-drive-drain", () => ({ drainDriveQueue: mocks.drainDriveQueue }));

import { POST } from "@/app/api/teacher/drive-queue/route";

const request = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/teacher/drive-queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/teacher/drive-queue retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTeacherProfile.mockResolvedValue({
      id: "teacher-1",
      collection_sk: "collection-secret",
    });
    mocks.listDriveImports.mockResolvedValue({ items: [{ id: "row-1" }], unavailable: false });
    mocks.retryDriveImports.mockResolvedValue({ retried: 1, unavailable: false });
    mocks.drainDriveQueue.mockResolvedValue({ imported: 1, failed: 0 });
  });

  it("re-queues the named rows and starts a drain behind the response", async () => {
    const response = await POST(request({ action: "retry", ids: ["row-1"] }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ retried: 1 });
    expect(mocks.retryDriveImports).toHaveBeenCalledWith("teacher-1", ["row-1"]);
    // Not awaited — the creator asked for this to happen in the background, and
    // holding the response for the import is the wait the queue exists to remove.
    expect(mocks.drainDriveQueue).toHaveBeenCalledWith("collection-secret", "teacher-1");
  });

  it("retries every failure when the body names none", async () => {
    await POST(request({ action: "retry" }));

    expect(mocks.retryDriveImports).toHaveBeenCalledWith("teacher-1", []);
  });

  it("does not start a drain when nothing was re-queued", async () => {
    mocks.retryDriveImports.mockResolvedValue({ retried: 0, unavailable: false });

    await POST(request({ action: "retry", ids: ["row-1"] }));

    expect(mocks.drainDriveQueue).not.toHaveBeenCalled();
  });

  it("says so when the deployment has no queue table", async () => {
    mocks.retryDriveImports.mockResolvedValue({ retried: 0, unavailable: true });

    const response = await POST(request({ action: "retry" }));

    expect(response.status).toBe(503);
    expect(mocks.drainDriveQueue).not.toHaveBeenCalled();
  });

  it("refuses a retry from a signed-out browser", async () => {
    mocks.getTeacherProfile.mockResolvedValue(null);

    const response = await POST(request({ action: "retry" }));

    expect(response.status).toBe(401);
    expect(mocks.retryDriveImports).not.toHaveBeenCalled();
  });
});
