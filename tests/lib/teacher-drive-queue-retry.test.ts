import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createSupabaseAdminClient: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { enqueueDriveImports, retryDriveImports } from "@/lib/data/teacher-drive-queue";

/**
 * Retrying a failed Drive import.
 *
 * The failures worth retrying — an index that timed out, a worker cut short —
 * are properties of the run, not of the file, and they are discovered long after
 * the dialog that queued the file has closed. So the retry has to work from the
 * row alone, and it has to leave the row in a state the claim function will
 * actually pick up again.
 */

type Op = {
  table: string;
  action: "select" | "insert" | "update" | "delete";
  payload?: Record<string, unknown>;
  filters: Record<string, unknown>;
  inFilters: Record<string, unknown[]>;
};

/** A Supabase builder thin enough to assert against: it records what was asked
 *  for and answers with whatever the test says that op returns. */
function fakeAdmin(respond: (op: Op) => { data?: unknown; error?: unknown }) {
  const ops: Op[] = [];
  const from = (table: string) => {
    const op: Op = { table, action: "select", filters: {}, inFilters: {} };
    ops.push(op);
    const settle = () => {
      const answer = respond(op);
      return { data: answer.data ?? null, error: answer.error ?? null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (payload: Record<string, unknown>) => {
        op.action = "insert";
        op.payload = payload;
        return builder;
      },
      update: (payload: Record<string, unknown>) => {
        op.action = "update";
        op.payload = payload;
        return builder;
      },
      delete: () => {
        op.action = "delete";
        return builder;
      },
      eq: (column: string, value: unknown) => {
        op.filters[column] = value;
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        op.inFilters[column] = values;
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      single: async () => settle(),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(settle()).then(resolve, reject),
    };
    return builder;
  };
  mocks.createSupabaseAdminClient.mockReturnValue({
    from,
    rpc: vi.fn(async () => ({ data: [], error: null })),
  });
  return ops;
}

describe("retrying failed Drive imports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("puts the row back on the queue with its strike count cleared", async () => {
    const ops = fakeAdmin((op) => (op.action === "select" ? { data: [{ id: "row-1" }] } : {}));

    const result = await retryDriveImports("teacher-1", ["row-1"]);

    expect(result).toEqual({ retried: 1, unavailable: false });
    const update = ops.find((op) => op.action === "update");
    expect(update?.payload).toMatchObject({
      status: "queued",
      // Three strikes is what makes a row ineligible for reclaim; a retry that
      // left the count alone would be a button that does nothing.
      attempts: 0,
      error: "",
      claimed_at: null,
      finished_at: null,
    });
    // Only from `failed`: a drain may have claimed the row since it was read,
    // and resetting a live import would upload the same document twice.
    expect(update?.filters).toMatchObject({
      id: "row-1",
      teacher_id: "teacher-1",
      status: "failed",
    });
  });

  it("retries every failure when no ids are given", async () => {
    const ops = fakeAdmin((op) =>
      op.action === "select" ? { data: [{ id: "row-1" }, { id: "row-2" }] } : {},
    );

    const result = await retryDriveImports("teacher-1");

    expect(result.retried).toBe(2);
    expect(ops[0].inFilters.id).toBeUndefined();
    expect(ops.filter((op) => op.action === "update").map((op) => op.filters.id)).toEqual([
      "row-1",
      "row-2",
    ]);
  });

  it("drops a failure that a re-pasted link has already re-queued", async () => {
    const ops = fakeAdmin((op) => {
      if (op.action === "select") return { data: [{ id: "row-1" }] };
      // The partial unique index: the same file is in flight to the same folder.
      if (op.action === "update") return { error: { code: "23505" } };
      return {};
    });

    const result = await retryDriveImports("teacher-1", ["row-1"]);

    expect(result).toEqual({ retried: 1, unavailable: false });
    expect(ops.find((op) => op.action === "delete")?.filters).toMatchObject({ id: "row-1" });
  });

  it("reports a deployment without the queue table rather than throwing", async () => {
    fakeAdmin(() => ({ error: { code: "42P01" } }));

    await expect(retryDriveImports("teacher-1")).resolves.toEqual({
      retried: 0,
      unavailable: true,
    });
  });

  it("queuing a file again clears the failed row it replaces", async () => {
    const ops = fakeAdmin((op) => (op.action === "insert" ? { data: { id: "row-9" } } : {}));

    await enqueueDriveImports("teacher-1", [
      {
        driveFileId: "drive-file-aaaaaaaaaa",
        fileName: "Data Communication.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        destinationPath: "Engineering Economics/Question Bank",
        shelf: "Question Bank",
        sourceLink: "https://drive.google.com/file/d/drive-file-aaaaaaaaaa/view",
      },
    ]);

    // Pasting the link again is the other way to retry, and it must not leave
    // the same document in the queue twice — once Failed, once Queued.
    const cleared = ops[0];
    expect(cleared.action).toBe("delete");
    expect(cleared.filters).toMatchObject({
      teacher_id: "teacher-1",
      destination_path: "Engineering Economics/Question Bank",
      status: "failed",
    });
    expect(cleared.inFilters.drive_file_id).toEqual(["drive-file-aaaaaaaaaa"]);
    expect(ops[1].action).toBe("insert");
  });
});
