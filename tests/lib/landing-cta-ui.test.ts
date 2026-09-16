import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const landingSource = readFileSync("app/page.tsx", "utf8");
const primaryCtaSource = readFileSync("components/landing-primary-cta.tsx", "utf8");

describe("landing page calls to action", () => {
  it("routes signed-out visitors to community browsing", () => {
    expect(primaryCtaSource).toMatch(
      /communityOnly\s*\?\s*"\/communities"\s*:\s*isLoggedIn\s*\?\s*"\/app"\s*:\s*"\/communities"/,
    );
    expect(primaryCtaSource).toMatch(
      /:\s*isLoggedIn\s*\?\s*"Continue learning"\s*:\s*\(children \?\? "Start Learning"\)/,
    );
  });

  it("keeps the blue hero action auth-independent and routes it to communities", () => {
    expect(landingSource).toContain('<LandingPrimaryCta blue size="hero" communityOnly>');
    expect(landingSource).toContain("Find your program");
    expect(primaryCtaSource).toContain('communityOnly ? "/communities"');
    expect(landingSource).not.toContain("Get Started");
  });

  it("uses the navbar's signed-in destination for every primary landing CTA", () => {
    expect(landingSource.match(/<LandingPrimaryCta\b/g)).toHaveLength(4);
    expect(landingSource).not.toContain('<Cta href="/flow"');
    expect(primaryCtaSource).toContain('isLoggedIn ? "/app" : "/communities"');
  });
});
