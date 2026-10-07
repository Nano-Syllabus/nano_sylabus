import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The landing markup lives in LandingView; its words live in landing-content
// (editable per site from /admin/sites).
const landingSource = readFileSync("components/landing-view.tsx", "utf8");
const landingContentSource = readFileSync("lib/landing-content.ts", "utf8");
const primaryCtaSource = readFileSync("components/landing-primary-cta.tsx", "utf8");

describe("landing page calls to action", () => {
  it("sends every main button into the site's community join when one is set", () => {
    expect(landingSource).toContain("/communities/${encodeURIComponent(brand.communitySlug)}/join");
    expect(landingSource.match(/<LandingPrimaryCta\b[^>]*\{\.\.\.ctaProps\}/g)).toHaveLength(4);
    expect(primaryCtaSource).toContain("href={joins ? joinHref! : `${appOrigin}${defaultHref}`}");
  });

  it("routes signed-out visitors to community browsing", () => {
    expect(primaryCtaSource).toMatch(
      /communityOnly\s*\?\s*"\/communities"\s*:\s*isLoggedIn\s*\?\s*"\/app"\s*:\s*"\/communities"/,
    );
    expect(primaryCtaSource).toMatch(
      /:\s*isLoggedIn\s*\?\s*"Continue learning"\s*:\s*\(children \?\? "Start Learning"\)/,
    );
  });

  it("keeps the blue hero action auth-independent and routes it to communities", () => {
    expect(landingSource).toContain('<LandingPrimaryCta blue size="hero" communityOnly {...ctaProps}>');
    expect(landingContentSource).toContain('primaryCta: "Find your faculty"');
    expect(primaryCtaSource).toContain('communityOnly ? "/communities"');
    expect(landingSource).not.toContain("Get Started");
  });

  it("uses the navbar's signed-in destination for every primary landing CTA", () => {
    expect(landingSource.match(/<LandingPrimaryCta\b/g)).toHaveLength(4);
    expect(landingSource).not.toContain('<Cta href="/flow"');
    expect(primaryCtaSource).toContain('isLoggedIn ? "/app" : "/communities"');
  });

  it("routes the footer app link to the community page", () => {
    // Main site → community page; an exam site sends it through its one door.
    expect(landingSource).toContain("href={joinHref ?? `${appOrigin}/app/community`}");
    expect(landingSource).not.toContain('href="/app/today"');
  });
});
