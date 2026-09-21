import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockTeacherApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  return {
    getTeacherProfile: vi.fn(),
    renameTeacherDocument: vi.fn(),
    createSupabaseAdminClient: vi.fn(),
    MockTeacherApiError,
  };
});

vi.mock("@/app/teachers/actions", () => ({ getTeacherProfile: mocks.getTeacherProfile }));
vi.mock("@/lib/teacher-app/client", () => ({
  deleteTeacherDocument: vi.fn(),
  getTeacherDocument: vi.fn(),
  indexTeacherDocument: vi.fn(),
  renameTeacherDocument: mocks.renameTeacherDocument,
  TeacherApiError: mocks.MockTeacherApiError,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { PATCH } from "@/app/api/teacher/documents/[documentId]/route";

const context = (documentId = "doc_1") => ({ params: Promise.resolve({ documentId }) });

function patch(body: unknown, documentId = "doc_1") {
  return PATCH(
    new Request(`http://localhost/api/teacher/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    context(documentId),
  );
}

type Mirror = { id: string; original_name: string } | null;

/** The preview-mirror table: one row found by external id, and its update. */
function mirrorTable(mirror: Mirror, updateError: unknown = null) {
  const update = { eq: vi.fn() };
  update.eq.mockReturnValue(update);
  Object.assign(update, {
    then: (resolve: (value: unknown) => void) => resolve({ error: updateError }),
  });
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: mirror, error: null })),
    update: vi.fn(() => update),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return { query, update };
}

describe("PATCH /api/teacher/documents/[documentId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTeacherProfile.mockResolvedValue({
      id: "teacher-1",
      collection_sk: "collection-secret",
    });
    mocks.renameTeacherDocument.mockResolvedValue({
      document_id: "doc_1",
      path: "Physics/Notes/unit-1.pdf",
      name: "Kinematics.pdf",
      stored_name: "unit-1.pdf",
      renamed: true,
    });
  });

  it("renames through the collection API and brings the preview's name along", async () => {
    const { query, update } = mirrorTable({ id: "mirror-1", original_name: "unit-1.pdf" });
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => query) });

    const response = await patch({ name: "  Kinematics ", path: "Physics/Notes/unit-1.pdf" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      document: { id: "doc_1", path: "Physics/Notes/unit-1.pdf", name: "Kinematics.pdf" },
      name: "Kinematics.pdf",
      renamed: true,
      mirrorSynced: true,
    });
    expect(mocks.renameTeacherDocument).toHaveBeenCalledWith("collection-secret", "doc_1", {
      name: "Kinematics",
      path: "Physics/Notes/unit-1.pdf",
    });
    // Only the label: the mirror's storage path and collection path — the two
    // things that find it — are not in the update.
    expect(query.update).toHaveBeenCalledWith({ original_name: "Kinematics.pdf" });
    expect(update.eq).toHaveBeenCalledWith("id", "mirror-1");
    expect(update.eq).toHaveBeenCalledWith("teacher_id", "teacher-1");
  });

  it("refuses a name that could never be valid before asking the API", async () => {
    for (const name of ["", "   ", "Notes/Unit 1", 42]) {
      const response = await patch({ name });
      expect(response.status).toBe(400);
    }
    expect(mocks.renameTeacherDocument).not.toHaveBeenCalled();
  });

  it("refuses a path that climbs out of the collection", async () => {
    const response = await patch({ name: "Kinematics", path: "../other-teacher/secret.pdf" });

    expect(response.status).toBe(400);
    expect(mocks.renameTeacherDocument).not.toHaveBeenCalled();
  });

  it("passes the API's reason through when it refuses the name", async () => {
    mocks.renameTeacherDocument.mockRejectedValue(
      new mocks.MockTeacherApiError(
        "another file in this folder is already called 'unit-2.pdf'",
        409,
      ),
    );

    const response = await patch({ name: "unit-2" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Another file in this folder is already called 'unit-2.pdf'",
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("does not reveal whether another collection owns the document", async () => {
    mocks.renameTeacherDocument.mockRejectedValue(new mocks.MockTeacherApiError("nope", 404));

    const response = await patch({ name: "Kinematics" }, "someone-elses");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Document not found in this teacher collection.",
    });
  });

  it("keeps the rename when the preview mirror cannot follow it, and says so", async () => {
    const { query } = mirrorTable(
      { id: "mirror-1", original_name: "unit-1.pdf" },
      { message: "db down" },
    );
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => query) });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await patch({ name: "Kinematics" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      name: "Kinematics.pdf",
      mirrorSynced: false,
    });
    logged.mockRestore();
  });

  it("renames a document that has no preview mirror", async () => {
    const { query } = mirrorTable(null);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => query) });

    const response = await patch({ name: "Kinematics" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ mirrorSynced: true });
    expect(query.update).not.toHaveBeenCalled();
  });

  it("needs a signed-in creator", async () => {
    mocks.getTeacherProfile.mockResolvedValue(null);

    const response = await patch({ name: "Kinematics" });

    expect(response.status).toBe(401);
    expect(mocks.renameTeacherDocument).not.toHaveBeenCalled();
  });
});
