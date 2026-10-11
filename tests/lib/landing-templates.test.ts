import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LANDING_CONTENT,
  LANDING_TEMPLATE_IDS,
  sanitizeLandingContent,
} from "@/lib/landing-content";
import {
  applyLandingTemplate,
  createLandingTemplate,
  LANDING_TEMPLATES,
} from "@/lib/landing-templates";
import { applyLandingChanges } from "@/lib/landing-edits";

vi.mock("next/font/google", () => ({
  DM_Sans: () => ({ className: "sans" }),
  Manrope: () => ({ className: "sans" }),
}));
import { LandingView } from "@/components/landing-view";

describe("landing page samples", () => {
  it("offers exactly five distinct, complete, independently editable starting points", () => {
    expect(LANDING_TEMPLATES.map((sample) => sample.id)).toEqual(LANDING_TEMPLATE_IDS);
    const samples = LANDING_TEMPLATE_IDS.map(createLandingTemplate);
    expect(new Set(samples.map((sample) => sample.hero.titleLead)).size).toBe(5);
    for (const sample of samples) expect(sanitizeLandingContent(sample)).toEqual(sample);
    samples[0].steps.items[0].title = "Edited";
    expect(createLandingTemplate("original").steps.items[0].title).toBe(
      DEFAULT_LANDING_CONTENT.steps.items[0].title,
    );
    expect(samples[1].steps.items[0].title).not.toBe("Edited");
  });

  it("preserves the original layout when reading older stored pages", () => {
    const { design: _design, ...oldContent } = DEFAULT_LANDING_CONTENT;
    expect(sanitizeLandingContent(oldContent)).toEqual(DEFAULT_LANDING_CONTENT);
  });

  it("rejects unsafe image URLs, CSS values and unrecognised design options", () => {
    expect(
      sanitizeLandingContent({
        design: {
          template: "unknown",
          font: "url(x)",
          corners: "wild",
          spacing: "-100px",
          backgroundColor: "red;display:none",
          textColor: "#abc",
          heroImageUrl: "javascript:alert(1)",
          showDemo: "false",
        },
      }).design,
    ).toEqual(DEFAULT_LANDING_CONTENT.design);
    expect(
      sanitizeLandingContent({ design: { heroImageUrl: "//evil.test/image.jpg" } }).design
        .heroImageUrl,
    ).toBe("");
    expect(
      sanitizeLandingContent({
        design: {
          template: "studio",
          heroImageUrl: "https://example.test/hero.jpg",
          backgroundColor: "#AABBCC",
          showDemo: false,
        },
      }).design,
    ).toMatchObject({
      template: "studio",
      heroImageUrl: "https://example.test/hero.jpg",
      backgroundColor: "#aabbcc",
      showDemo: false,
    });
  });

  it("can switch design without replacing the site's text, branding or destination", () => {
    const current = structuredClone(DEFAULT_LANDING_CONTENT);
    current.hero.titleLead = "My course";
    current.brand.logoUrl = "/my-logo.png";
    current.brand.communitySlug = "my-course";
    current.brand.primaryColor = "#112233";
    current.design.heroImageUrl = "/my-hero.png";
    const next = applyLandingTemplate(current, "editorial");
    expect(next.design.template).toBe("editorial");
    expect(next.design.font).toBe("serif");
    expect(next.hero).toEqual(current.hero);
    expect(next.brand).toEqual(current.brand);
    expect(next.steps).toEqual(current.steps);
    expect(next.design.heroImageUrl).toBe("/my-hero.png");
    const reset = applyLandingTemplate(current, "academy", false);
    expect(reset.hero).toEqual(createLandingTemplate("academy").hero);
    expect(reset.brand.primaryColor).toBe(createLandingTemplate("academy").brand.primaryColor);
    expect(reset.brand.logoUrl).toBe("/my-logo.png");
    expect(reset.brand.communitySlug).toBe("my-course");
  });

  it("supports validated design edits through the existing assistant edit pipeline", () => {
    const next = applyLandingChanges(DEFAULT_LANDING_CONTENT, [
      { path: "design.template", value: "community" },
      { path: "design.font", value: "serif" },
      { path: "design.showDemo", value: "false" },
    ]);
    expect(next.design).toMatchObject({ template: "community", font: "serif", showDemo: false });
    expect(
      applyLandingChanges(next, [{ path: "design.template", value: "arbitrary-layout" }]).design
        .template,
    ).toBe("original");
  });

  for (const template of LANDING_TEMPLATE_IDS) {
    it(`renders edited ${template} content, hides sections, and retains the subdomain entry flow`, () => {
      const content = createLandingTemplate(template);
      content.hero.titleLead = "A custom course";
      content.hero.primaryCta = "Join our course";
      content.brand.primaryColor = "#234567";
      content.design.backgroundColor = "#fffef0";
      content.design.heroImageUrl = "/custom-hero.png";
      content.design.showDemo = false;
      content.features.hidden = true;
      content.steps.hidden = true;
      content.community.hidden = true;
      content.faq.hidden = true;
      const html = renderToStaticMarkup(
        createElement(LandingView, {
          content,
          examSlug: "my-exam",
          appOrigin: "https://my-exam.example.test",
        }),
      );
      expect(html).toContain(`data-landing-template="${template}"`);
      expect(html).toContain("A custom course");
      expect(html).toContain("Join our course");
      expect(html).toContain("/custom-hero.png");
      expect(html).toContain("--lp-primary:#234567");
      expect(html).toContain("--lp-background:#fffef0");
      expect(html).toContain('href="https://my-exam.example.test/prepare/my-exam"');
      for (const hidden of ["features", "steps", "community", "faq"])
        expect(html).not.toContain(`data-landing-section="${hidden}"`);
      expect(html).not.toContain('href="#steps"');
      expect(html).not.toContain("nanosyllabus-features-minimal-animation.html");
    });
  }
});
