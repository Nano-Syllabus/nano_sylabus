import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockTeacherApiError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
  }
  return {
    getTeacherProfile: vi.fn(),
    getTeacherSubjects: vi.fn(),
    capture: vi.fn(),
    readiness: vi.fn(),
    weightage: vi.fn(),
    topics: vi.fn(),
    chapters: vi.fn(),
    usage: vi.fn(),
    MockTeacherApiError,
  };
});

vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/teacher-app/client", () => ({
  getTeacherSubjects: mocks.getTeacherSubjects,
  getTeacherCollectionCapture: mocks.capture,
  getTeacherCollectionReadiness: mocks.readiness,
  getTeacherCollectionWeightage: mocks.weightage,
  getTeacherPracticeTopics: mocks.topics,
  getTeacherPracticeChapters: mocks.chapters,
  getTeacherCollectionUsage: mocks.usage,
  TeacherApiError: mocks.MockTeacherApiError,
}));

import { GET } from "@/app/api/teacher/subjects/[slug]/insights/route";

const context = { params: Promise.resolve({ slug: "ramesh-teacher-physics" }) };

describe("GET /api/teacher/subjects/[slug]/insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTeacherProfile.mockResolvedValue({ collection_sk: "collection-secret" });
    mocks.getTeacherSubjects.mockResolvedValue({ subjects: [{ slug: "ramesh-teacher-physics", name: "Physics" }] });
    mocks.capture.mockResolvedValue({ document_count: 4 });
    mocks.readiness.mockResolvedValue({ ready: true });
    mocks.weightage.mockResolvedValue({ full_marks: 80 });
    mocks.topics.mockResolvedValue({ topics: [{ title: "Induction" }] });
    mocks.chapters.mockResolvedValue({ chapters: [{ name: "Induction" }] });
    mocks.usage.mockResolvedValue({ calls: 2, total_tokens: 22506 });
  });

  it("loads every subject-intelligence API with the verified subject name", async () => {
    const response = await GET(new Request("http://localhost/api/teacher/subjects/ramesh-teacher-physics/insights"), context);
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.readiness.ready).toBe(true);
    expect(payload.usage.total_tokens).toBe(22506);
    expect(mocks.weightage).toHaveBeenCalledWith("collection-secret", "Physics");
    expect(mocks.topics).toHaveBeenCalledWith("collection-secret", "Physics", { refresh: false });
  });

  it("keeps useful results when one optional insight fails", async () => {
    mocks.capture.mockRejectedValue(new Error("capture unavailable"));
    const response = await GET(new Request("http://localhost/api/teacher/subjects/ramesh-teacher-physics/insights"), context);
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.partialErrors.capture).toBe("capture unavailable");
    expect(payload.readiness.ready).toBe(true);
  });

  it("surfaces an invalid collection key instead of hiding it as a partial failure", async () => {
    mocks.readiness.mockRejectedValue(new mocks.MockTeacherApiError("invalid", 401));
    const response = await GET(new Request("http://localhost/api/teacher/subjects/ramesh-teacher-physics/insights"), context);
    expect(response.status).toBe(409);
  });
});
