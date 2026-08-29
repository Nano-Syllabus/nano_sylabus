import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ user: vi.fn(), profile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mock.user }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mock.profile }) }) }) }) }));
import { assertAdminRequest, assertSuperAdminRequest } from "@/lib/admin-access";
import { resolveAccess } from "@/lib/access";

describe("database-backed admin role", () => {
  it.each(["admin", "super_admin"])("allows %s at page and API gates", async role => {
    mock.user.mockResolvedValue({ data: { user: { id: "admin-id" } } });
    mock.profile.mockResolvedValue({ data: { role }, error: null });
    expect(await assertAdminRequest()).toEqual({ userId: "admin-id", role });
    expect(resolveAccess({ pathname: "/admin", hasUser: true, onboarded: false, role: role as "admin" | "super_admin" })).toEqual({ allow: true });
  });
  it("rejects a student even when their auth metadata claims admin", async () => {
    mock.user.mockResolvedValue({ data: { user: { id: "student-id", user_metadata: { role: "admin" } } } });
    mock.profile.mockResolvedValue({ data: { role: "student" }, error: null });
    expect((await assertAdminRequest()).status).toBe(403);
  });
  it("fails closed on a profile query error", async () => {
    mock.user.mockResolvedValue({ data: { user: { id: "admin-id" } } });
    mock.profile.mockResolvedValue({ data: { role: "admin" }, error: { code: "unavailable" } });
    expect((await assertAdminRequest()).status).toBe(503);
  });
  it("rejects guests without querying a profile", async () => {
    mock.user.mockResolvedValue({ data: { user: null } });
    expect((await assertAdminRequest()).status).toBe(401);
    expect(mock.profile).not.toHaveBeenCalled();
  });

  it("allows only super admins through the role-management gate", async () => {
    mock.user.mockResolvedValue({ data: { user: { id: "admin-id" } } });
    mock.profile.mockResolvedValueOnce({ data: { role: "admin" }, error: null });
    expect(await assertSuperAdminRequest()).toEqual({
      error: "Super admin access is required.",
      status: 403,
    });

    mock.profile.mockResolvedValueOnce({ data: { role: "super_admin" }, error: null });
    expect(await assertSuperAdminRequest()).toEqual({
      userId: "admin-id",
      role: "super_admin",
    });
  });
});
