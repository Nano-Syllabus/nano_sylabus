import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  serverClient: vi.fn(),
  verifiedUser: vi.fn(),
  admin: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.serverClient }));
vi.mock("@/lib/supabase/verified-user", () => ({ getVerifiedUser: mocks.verifiedUser }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/teacher-app/client", () => ({}));

import { onboardTeacher } from "@/app/teachers/actions";

/**
 * Next redacts anything a Server Action throws in a production build, so every
 * precise sentence this action had reached the student as "An error occurred in
 * the Server Components render…" — a paragraph nobody can act on, and one that
 * told the operator nothing either.
 */
describe("creator onboarding reports why it failed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.serverClient.mockResolvedValue({});
    mocks.admin.mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    });
  });

  it("says so when nobody is signed in, instead of throwing", async () => {
    mocks.verifiedUser.mockResolvedValue({ data: { user: null } });

    const result = await onboardTeacher();

    expect(result).toEqual({
      ok: false,
      message: "You must be logged in to create a creator workspace.",
    });
  });

  it("names an unconfigured course API rather than crashing the boundary", async () => {
    mocks.verifiedUser.mockResolvedValue({
      data: { user: { id: "18966d20-b6dd", email: "someone@example.com" } },
    });
    const saved = { ...process.env };
    delete process.env.TENANT_API_BASE_URL;

    const result = await onboardTeacher();

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/not configured/i);
    Object.assign(process.env, saved);
  });

  it("names a missing course API token once the base URL is present", async () => {
    mocks.verifiedUser.mockResolvedValue({
      data: { user: { id: "18966d20-b6dd", email: "someone@example.com" } },
    });
    const saved = { ...process.env };
    process.env.TENANT_API_BASE_URL = "https://example.invalid/";
    process.env.TENANT_API_TOKEN = "tenant-token";
    delete process.env.TEACHER_APP_API_TOKEN;

    const result = await onboardTeacher();

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/token is missing/i);
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  });

  it("returns the existing workspace instead of building a second one", async () => {
    mocks.verifiedUser.mockResolvedValue({
      data: { user: { id: "18966d20-b6dd", email: "someone@example.com" } },
    });
    mocks.admin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: "t1", user_id: "18966d20-b6dd", handle: "someone_18966", collection_sk: "k" },
              error: null,
            }),
          }),
        }),
      }),
    });

    await expect(onboardTeacher()).resolves.toEqual({ ok: true, handle: "someone_18966" });
  });
});
