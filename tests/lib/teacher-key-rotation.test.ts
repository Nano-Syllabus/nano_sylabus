import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  regenerateTeacherCollectionKey: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/teacher-app/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/teacher-app/client")>()),
  regenerateTeacherCollectionKey: mocks.regenerateTeacherCollectionKey,
}));

import { rotateTeacherCollectionKeyAction } from "@/app/teachers/actions";

describe("rotateTeacherCollectionKeyAction", () => {
  beforeEach(() => {
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
    });

    const selectChain = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: "teacher-1",
          user_id: "user-1",
          handle: "ramesh",
          collection_sk: "old-collection-key",
        },
        error: null,
      })),
    };
    selectChain.select.mockReturnValue(selectChain);
    selectChain.eq.mockReturnValue(selectChain);

    const finalEq = vi.fn(async () => ({ error: null }));
    const firstEq = vi.fn(() => ({ eq: finalEq }));
    const update = vi.fn(() => ({ eq: firstEq }));
    const from = vi.fn()
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce({ update });
    mocks.createSupabaseAdminClient.mockReturnValue({ from });
    mocks.regenerateTeacherCollectionKey.mockResolvedValue({ api_key: "new-collection-key" });
  });

  it("stores the replacement key and returns only a rotation acknowledgement", async () => {
    const result = await rotateTeacherCollectionKeyAction();

    expect(result).toEqual({ rotated: true });
    expect(JSON.stringify(result)).not.toContain("new-collection-key");
    expect(mocks.regenerateTeacherCollectionKey).toHaveBeenCalledWith("old-collection-key");

    const admin = mocks.createSupabaseAdminClient.mock.results[1].value;
    expect(admin.from).toHaveBeenCalledWith("teachers");
    const table = admin.from.mock.results[1].value;
    expect(table.update).toHaveBeenCalledWith({ collection_sk: "new-collection-key" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/teachers");
  });
});
