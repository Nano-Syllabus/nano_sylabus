import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/admin-access", () => ({ assertSuperAdminRequest: mocks.access }));
vi.mock("@/lib/data/student-ambassadors", () => ({
  listStudentAmbassadors: mocks.list,
  addStudentAmbassador: mocks.add,
  removeStudentAmbassador: mocks.remove,
}));

import { DELETE, GET, POST } from "@/app/api/admin/ambassadors/route";

const send = (method: "POST" | "DELETE", body: unknown) =>
  (method === "POST" ? POST : DELETE)(
    new Request("http://localhost/api/admin/ambassadors", { method, body: JSON.stringify(body) }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ userId: "boss", role: "super_admin" });
  mocks.list.mockResolvedValue([]);
});

describe("choosing student ambassadors", () => {
  it("is for super admins only, on every method", async () => {
    mocks.access.mockResolvedValue({ error: "Super admin access is required.", status: 403 });
    expect((await GET()).status).toBe(403);
    expect((await send("POST", { email: "a@b.com" })).status).toBe(403);
    expect((await send("DELETE", { email: "a@b.com" })).status).toBe(403);
    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("adds any email, lower-cased, recording who added it", async () => {
    expect((await send("POST", { email: "  Someone@Example.COM " })).status).toBe(201);
    expect(mocks.add).toHaveBeenCalledWith("someone@example.com", "boss");
  });

  it("rejects something that is not an email", async () => {
    expect((await send("POST", { email: "not-an-email" })).status).toBe(400);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("removes an ambassador", async () => {
    expect((await send("DELETE", { email: "someone@example.com" })).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith("someone@example.com");
  });
});
