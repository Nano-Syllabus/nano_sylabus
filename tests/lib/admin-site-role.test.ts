import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny in-memory stand-in for the two tables and the role RPC.
const db = vi.hoisted(() => ({
  roles: new Map<string, string>(),
  siteAdmins: new Map<string, string>(), // user_id -> site_slug (an admin runs one site)
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
          db.siteAdmins.delete(id);
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
                  data: db.siteAdmins.has(value) ? { site_slug: db.siteAdmins.get(value) } : null,
                  error: null,
                },
        }),
      }),
      delete: () => ({
        eq: async (_c: string, user: string) => {
          db.siteAdmins.delete(user);
          return { error: null };
        },
      }),
      insert: async (row: { site_slug: string; user_id: string }) => {
        if (db.failInsert) return { error: { code: "23505", message: "duplicate" } };
        db.siteAdmins.set(row.user_id, row.site_slug);
        return { error: null };
      },
    }),
  }),
}));

vi.mock("@/lib/data/student-ambassadors", () => ({ listStudentAmbassadors: async () => [] }));

import { updateAdminUserRole } from "@/lib/data/admin-users";

describe("an admin runs one subdomain; a subdomain has many admins", () => {
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

  it("lets a site have several admins, each running one site", async () => {
    await make("a", "ioe");
    await make("b", "ioe");
    expect([...db.siteAdmins]).toEqual([
      ["a", "ioe"],
      ["b", "ioe"],
    ]);
    expect(db.roles.get("b")).toBe("admin");

    await make("a", "cee"); // moving an admin takes them off the old site
    expect(db.siteAdmins.get("a")).toBe("cee");
    expect(db.siteAdmins.get("b")).toBe("ioe");
  });

  it("puts the old role back when the site can't be assigned", async () => {
    db.failInsert = true;
    await expect(make("c", "ioe")).rejects.toThrow("only one admin");
    expect(db.roles.get("c")).toBe("student");
  });
});
