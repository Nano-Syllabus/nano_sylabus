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
    expect(landingSource.match(/<LandingPrimaryCta\b[^>]*\{\.\.\.ctaProps\}/g)).toHaveLength(3);
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

  it("shows signed-in visitors an enter-your-faculty label", () => {
    expect(primaryCtaSource).toContain('isLoggedIn && children === "Find your faculty" ? "Enter your faculty" : children');
    expect(primaryCtaSource).toContain("const isLoggedIn = useLandingSession();");
  });

  it("uses the navbar's signed-in destination for every primary landing CTA", () => {
    expect(landingSource.match(/<LandingPrimaryCta\b/g)).toHaveLength(3);
    expect(landingSource).not.toContain('<Cta href="/flow"');
    expect(primaryCtaSource).toContain('isLoggedIn ? "/app" : "/communities"');
  });

  it("sends the main site's header to the free demo and its hero to a booked call", () => {
    expect(landingSource).toContain("<Cta href={FREE_DEMO_URL} size=\"nav\" newTab>");
    expect(landingSource).toContain("Try Free Demo");
    expect(landingSource).toContain("<Cta href={BOOK_CALL_URL} blue size=\"hero\"");
    expect(landingSource).toContain("Book a call");
  });

  it("routes the footer link to a booked call", () => {
    // Main site → Book a call; an exam site sends it through its one door.
    expect(landingSource).toContain("href={joinHref ?? BOOK_CALL_URL}");
    expect(landingSource).toContain('{joinHref ? footer.appLink : "Book a call"}');
    expect(landingSource).not.toContain('href="/app/today"');
  });
});
