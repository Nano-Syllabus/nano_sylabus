import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as string[]);
const exists = vi.hoisted(() => ({ value: true }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: exists.value ? { slug: "bct" } : null, error: null }) }),
      }),
      update: () => ({ eq: async () => (calls.push(`update ${table}`), { error: null }) }),
      delete: () => ({ eq: async () => (calls.push(`delete ${table}`), { error: null }) }),
    }),
  }),
}));

import { deleteLandingSite } from "@/lib/data/landing-sites";

describe("deleting a subdomain site", () => {
  beforeEach(() => {
    calls.length = 0;
    exists.value = true;
  });

  it("lets go of invoices and enrollments before the site (both restrict the delete)", async () => {
    await deleteLandingSite("bct");
    expect(calls).toEqual([
      "update invoices",
      "delete student_exam_enrollments",
      "delete landing_sites",
    ]);
  });

  it("touches nothing for a site that is already gone", async () => {
    exists.value = false;
    await expect(deleteLandingSite("bct")).rejects.toThrow("no longer exists");
    expect(calls).toEqual([]);
  });
});
