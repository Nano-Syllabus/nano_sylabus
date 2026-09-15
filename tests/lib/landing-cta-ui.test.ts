import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const landingSource = readFileSync("app/page.tsx", "utf8");
const primaryCtaSource = readFileSync("components/landing-primary-cta.tsx", "utf8");

describe("landing page calls to action", () => {
  it("always routes visitors to community browsing", () => {
    expect(primaryCtaSource).toContain('href="/communities"');
    expect(primaryCtaSource).toContain('children ?? "Find your program"');
  });

  it("uses the program-choice label for the hero action", () => {
    expect(landingSource).toContain("Choose your program");
    expect(landingSource).not.toContain("Get Started");
  });

  it("uses /communities destination for every primary landing CTA", () => {
    expect(landingSource.match(/<LandingPrimaryCta\b/g)).toHaveLength(4);
    expect(landingSource).not.toContain('<Cta href="/flow"');
    expect(primaryCtaSource).toContain('href="/communities"');
    expect(primaryCtaSource).not.toContain("isLoggedIn");
  });
});
