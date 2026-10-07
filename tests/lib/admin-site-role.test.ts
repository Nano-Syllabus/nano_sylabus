import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny in-memory stand-in for the two tables and the role RPC.
const db = vi.hoisted(() => ({
  roles: new Map<string, string>(),
  siteAdmins: new Map<string, string>(), // site_slug -> user_id
  rpc: vi.fn(),
  failInsert: false,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    // The detail read after saving isn't under test: "no such user".
    auth: { admin: { getUserById: async () => ({ data: { user: null }, error: null }) } },
    rpc: async (_name: string, args: { p_target_user_ids: string[]; p_role: string }) => {
      db.rpc(args.p_role);
      for (const id of args.p_target_user_ids) {
        db.roles.set(id, args.p_role);
        if (args.p_role !== "admin")
          for (const [site, user] of db.siteAdmins) if (user === id) db.siteAdmins.delete(site);
      }
      return { error: null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, value: string) => ({
          maybeSingle: async () =>
            table === "student_profiles"
              ? { data: { role: db.roles.get(value) ?? "student" }, error: null }
              : {
                  data: db.siteAdmins.has(value) ? { user_id: db.siteAdmins.get(value) } : null,
                  error: null,
                },
        }),
      }),
      delete: () => ({
        eq: (_c: string, user: string) => ({
          neq: async (_c2: string, keep: string) => {
            for (const [site, holder] of db.siteAdmins)
              if (holder === user && site !== keep) db.siteAdmins.delete(site);
            return { error: null };
          },
        }),
      }),
      insert: async (row: { site_slug: string; user_id: string }) => {
        if (db.failInsert || db.siteAdmins.has(row.site_slug))
          return { error: { code: "23505", message: "duplicate" } };
        db.siteAdmins.set(row.site_slug, row.user_id);
        return { error: null };
      },
    }),
  }),
}));

vi.mock("@/lib/data/student-ambassadors", () => ({ listStudentAmbassadors: async () => [] }));

import { updateAdminUserRole } from "@/lib/data/admin-users";

describe("admin ↔ subdomain is one-to-one", () => {
  beforeEach(() => {
    db.roles.clear();
    db.siteAdmins.clear();
    db.rpc.mockClear();
    db.failInsert = false;
  });

  const make = (userId: string, siteSlug?: string) =>
    updateAdminUserRole({ actorUserId: "boss", userId, role: "admin", siteSlug });

  it("needs a subdomain to make an admin", async () => {
    await expect(make("a")).rejects.toThrow("Choose the subdomain");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("gives a site one admin and an admin one site", async () => {
    await make("a", "ioe");
    expect(db.siteAdmins.get("ioe")).toBe("a");
    await expect(make("b", "ioe")).rejects.toThrow("already has an admin");
    expect(db.roles.get("b")).toBeUndefined();

    await make("a", "cee"); // moving an admin frees the old site
    expect([...db.siteAdmins]).toEqual([["cee", "a"]]);
  });

  it("puts the old role back when the site can't be assigned", async () => {
    db.failInsert = true;
    await expect(make("c", "ioe")).rejects.toThrow("already has an admin");
    expect(db.roles.get("c")).toBe("student");
  });
});
