import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentAuth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/saas-flow-client", () => ({
  SaaSFlowClient: (props: { completionDestination: string; initialUser: { id: string } | null }) =>
    createElement("div", { "data-destination": props.completionDestination, "data-user": props.initialUser?.id }, "Study questions"),
}));
import FlowPage from "@/app/flow/page";

describe("study flow server entry", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue({
      user: { id: "student-1" },
      studyDiagnosticCompleted: true,
      studyDiagnosticStarted: true,
    });
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
  });
  it("skips all questions for a completed account joining a new community", async () => {
    await expect(FlowPage({ searchParams: Promise.resolve({ community: "henglish" }) }))
      .rejects.toThrow("redirect:/app/today?community=henglish");
  });
  it("skips questions on subsequent generic visits too", async () => {
    await expect(FlowPage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow("redirect:/app/today");
  });
  it("skips questions after an account answered only part of the funnel", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "partial-student" },
      studyDiagnosticCompleted: false,
      studyDiagnosticStarted: true,
    });
    await expect(FlowPage({ searchParams: Promise.resolve({ community: "henglish" }) }))
      .rejects.toThrow("redirect:/app/today?community=henglish");
  });
  it("still shows questions to an account that has never started them", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "new-student" },
      studyDiagnosticCompleted: false,
      studyDiagnosticStarted: false,
    });
    const html = renderToStaticMarkup(await FlowPage({ searchParams: Promise.resolve({ community: "henglish" }) }));
    expect(html).toContain("Study questions");
    expect(html).toContain('data-destination="/app/today?community=henglish"');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("does not bypass first-time onboarding for a signed-out visitor", async () => {
    mocks.auth.mockResolvedValue({
      user: null,
      studyDiagnosticCompleted: false,
      studyDiagnosticStarted: false,
    });
    expect(renderToStaticMarkup(await FlowPage({ searchParams: Promise.resolve({}) }))).toContain("Study questions");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("does not infer completion when auth lookup fails", async () => {
    mocks.auth.mockRejectedValue(new Error("Offline"));
    expect(renderToStaticMarkup(await FlowPage({ searchParams: Promise.resolve({}) }))).toContain("Study questions");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("handles duplicate community query parameters safely", async () => {
    await expect(FlowPage({ searchParams: Promise.resolve({ community: ["one", "two"] }) }))
      .rejects.toThrow("redirect:/app/today");
  });
});
