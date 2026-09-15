import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const landingSource = readFileSync("app/page.tsx", "utf8");
const primaryCtaSource = readFileSync("components/landing-primary-cta.tsx", "utf8");

describe("landing page calls to action", () => {
  it("routes signed-out visitors to community browsing", () => {
    expect(primaryCtaSource).toContain('isLoggedIn ? "/app" : "/communities"');
    expect(primaryCtaSource).toContain('isLoggedIn ? "Continue learning" : (children ?? "Start Learning")');
  });

  it("uses the program-choice label for the hero action", () => {
    expect(landingSource).toContain("Choose your program");
    expect(landingSource).not.toContain("Get Started");
  });

  it("uses the navbar's signed-in destination for every primary landing CTA", () => {
    expect(landingSource.match(/<LandingPrimaryCta\b/g)).toHaveLength(4);
    expect(landingSource).not.toContain('<Cta href="/flow"');
    expect(primaryCtaSource).toContain('href={isLoggedIn ? "/app" : "/communities"}');
  });
});
