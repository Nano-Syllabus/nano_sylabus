import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";

const state = vi.hoisted(() => ({
  errorStatus: 0,
  all: true,
  assignedSite: "my-course",
  getSite: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  notFound: () => {
    throw new Error("not-found");
  },
}));
vi.mock("@/lib/admin-access", () => ({
  assertAdminRequest: async () =>
    state.errorStatus
      ? { error: "No access", status: state.errorStatus }
      : { userId: "admin-1", role: state.all ? "super_admin" : "admin" },
}));
vi.mock("@/lib/admin-scope", () => ({
  getAdminScope: async () => ({ all: state.all, site: { slug: state.assignedSite } }),
  scopeAllowsSite: (scope: { all: boolean; site: { slug: string } }, slug: string) =>
    scope.all || scope.site.slug === slug,
}));
vi.mock("@/lib/data/landing-sites", () => ({
  getLandingSite: (slug: string) => state.getSite(slug),
}));
vi.mock("@/components/landing-preview", () => ({ LandingPreview: () => null }));
import LandingSamplePage from "@/app/admin/landing-samples/[template]/page";
import AdminSitePreviewPage from "@/app/admin/sites/[slug]/preview/page";

describe("landing sample and draft preview access", () => {
  beforeEach(() => {
    state.errorStatus = 0;
    state.all = true;
    state.getSite.mockReset().mockResolvedValue({ draft: DEFAULT_LANDING_CONTENT });
  });

  it("lets an assigned admin preview samples without reading anyone's stored site", async () => {
    state.all = false;
    const page = await LandingSamplePage({ params: Promise.resolve({ template: "academy" }) });
    expect(page.props.initialContent.design.template).toBe("academy");
    expect(page.props.editable).toBe(false);
    expect(state.getSite).not.toHaveBeenCalled();
  });

  it("requires admin access and rejects unrecognised samples", async () => {
    state.errorStatus = 401;
    await expect(
      LandingSamplePage({ params: Promise.resolve({ template: "studio" }) }),
    ).rejects.toThrow("redirect:/login");
    state.errorStatus = 403;
    await expect(
      LandingSamplePage({ params: Promise.resolve({ template: "studio" }) }),
    ).rejects.toThrow("redirect:/app/today");
    await expect(
      LandingSamplePage({ params: Promise.resolve({ template: "unknown" }) }),
    ).rejects.toThrow("not-found");
  });

  it("prevents an admin from reading a different subdomain's draft", async () => {
    state.all = false;
    await expect(
      AdminSitePreviewPage({ params: Promise.resolve({ slug: "someone-else" }) }),
    ).rejects.toThrow("redirect:/admin/sites");
    expect(state.getSite).not.toHaveBeenCalled();
    const page = await AdminSitePreviewPage({
      params: Promise.resolve({ slug: state.assignedSite }),
    });
    expect(page.props.initialContent).toBe(DEFAULT_LANDING_CONTENT);
    expect(page.props.examSlug).toBe(state.assignedSite);
  });
});
