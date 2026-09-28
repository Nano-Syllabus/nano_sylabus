import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));

import { isPlatformAdmin } from "@/lib/data/platform-admin";

function adminWithRole(role: string | null, fail = false) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => {
      if (fail) throw new Error("down");
      return { data: role ? { role } : null, error: null };
    },
  };
  return { from: () => chain } as never;
}

describe("platform admins are always on Pro", () => {
  it("recognises the roles that see platform analytics", async () => {
    expect(await isPlatformAdmin("u-super", adminWithRole("super_admin"))).toBe(true);
    expect(await isPlatformAdmin("u-admin", adminWithRole("admin"))).toBe(true);
    expect(await isPlatformAdmin("u-student", adminWithRole("student"))).toBe(false);
    expect(await isPlatformAdmin("u-none", adminWithRole(null))).toBe(false);
  });

  it("treats a failed lookup as not an admin, so plans read as before", async () => {
    expect(await isPlatformAdmin("u-fail", adminWithRole("super_admin", true))).toBe(false);
  });
});
