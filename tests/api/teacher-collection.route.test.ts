import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  indexAllTeacherDocumentsAction: vi.fn(),
  rotateTeacherCollectionKeyAction: vi.fn(),
}));

vi.mock("@/app/teachers/actions", () => ({
  indexAllTeacherDocumentsAction: mocks.indexAllTeacherDocumentsAction,
  rotateTeacherCollectionKeyAction: mocks.rotateTeacherCollectionKeyAction,
}));

import { POST } from "@/app/api/teacher/collection/route";

function request(body: unknown) {
  return new Request("http://localhost/api/teacher/collection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/teacher/collection", () => {
  beforeEach(() => {
    mocks.indexAllTeacherDocumentsAction.mockResolvedValue({ job_id: "job-all" });
    mocks.rotateTeacherCollectionKeyAction.mockResolvedValue({ rotated: true });
  });

  it("queues every pending document and returns the polling job", async () => {
    const response = await POST(request({ action: "index-all" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ queued: true, jobId: "job-all" });
    expect(mocks.indexAllTeacherDocumentsAction).toHaveBeenCalledOnce();
  });

  it("requires explicit confirmation before rotating the collection key", async () => {
    const response = await POST(request({ action: "rotate-key", confirmation: "rotate" }));

    expect(response.status).toBe(400);
    expect(mocks.rotateTeacherCollectionKeyAction).not.toHaveBeenCalled();
  });

  it("rotates and stores the replacement key without returning it", async () => {
    const response = await POST(request({ action: "rotate-key", confirmation: "ROTATE" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ rotated: true });
    expect(JSON.stringify(payload)).not.toContain("collection_sk");
    expect(mocks.rotateTeacherCollectionKeyAction).toHaveBeenCalledOnce();
  });
});
