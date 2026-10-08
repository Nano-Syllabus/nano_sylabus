import { describe, expect, it } from "vitest";
import { DEFAULT_LANDING_CONTENT, landingColorVars, sanitizeLandingContent } from "@/lib/landing-content";
import { siteSlugFromHost } from "@/lib/landing-site-host";

describe("siteSlugFromHost", () => {
  it("reads one subdomain label of the root domain", () => {
    expect(siteSlugFromHost("highschool.nanosyllabus.com")).toBe("highschool");
    expect(siteSlugFromHost("EntrancePrep.nanosyllabus.com:443")).toBe("entranceprep");
    expect(siteSlugFromHost("licenseprep.localhost:3000")).toBe("licenseprep");
  });

  it("treats the bare domain, www, reserved and nested names as the main site", () => {
    for (const host of ["nanosyllabus.com", "www.nanosyllabus.com", "app.nanosyllabus.com", "a.b.nanosyllabus.com", "localhost:3000", "evil.com", null]) {
      expect(siteSlugFromHost(host)).toBeNull();
    }
  });
});

describe("sanitizeLandingContent", () => {
  it("falls back to the default wording for anything missing or malformed", () => {
    expect(sanitizeLandingContent(null)).toEqual(DEFAULT_LANDING_CONTENT);
    const content = sanitizeLandingContent({ hero: { titleLead: "Crack SEE", subtitle: 42 }, junk: true });
    expect(content.hero.titleLead).toBe("Crack SEE");
    expect(content.hero.subtitle).toBe(DEFAULT_LANDING_CONTENT.hero.subtitle);
    expect(content).not.toHaveProperty("junk");
  });

  it("keeps fixed lists at the design's length and caps the FAQ", () => {
    const content = sanitizeLandingContent({
      steps: { items: [{ title: "Only one" }] },
      faq: { items: Array.from({ length: 30 }, (_, i) => ({ question: `Q${i}`, answer: "A" })) },
    });
    expect(content.steps.items).toHaveLength(4);
    expect(content.steps.items[0].title).toBe("Only one");
    expect(content.steps.items[1]).toEqual(DEFAULT_LANDING_CONTENT.steps.items[1]);
    expect(content.faq.items).toHaveLength(12);
  });
});

describe("brand", () => {
  it("keeps only safe logo URLs, hex colours and slug-shaped communities", () => {
    const bad = sanitizeLandingContent({
      brand: { logoUrl: "javascript:alert(1)", primaryColor: "red", accentColor: "#12345", communitySlug: "Bad Slug!" },
    }).brand;
    expect(bad).toEqual(DEFAULT_LANDING_CONTENT.brand);
    const good = sanitizeLandingContent({
      brand: { logoUrl: "https://x.supabase.co/logo.png", primaryColor: "#AA0000", accentColor: "#ffee00", communitySlug: "ioe-bct" },
    }).brand;
    expect(good).toEqual({ logoUrl: "https://x.supabase.co/logo.png", iconUrl: "", primaryColor: "#aa0000", accentColor: "#ffee00", communitySlug: "ioe-bct" });
    expect(sanitizeLandingContent({ brand: { iconUrl: "javascript:alert(1)" } }).brand.iconUrl).toBe("");
    expect(sanitizeLandingContent({ brand: { iconUrl: "https://x.supabase.co/icon.png" } }).brand.iconUrl).toBe("https://x.supabase.co/icon.png");
    expect(sanitizeLandingContent({ brand: { logoUrl: "//evil.com/x.png" } }).brand.logoUrl).toBe("");
  });

  it("derives the page's colour variables from the two brand colours", () => {
    const vars = landingColorVars({ ...DEFAULT_LANDING_CONTENT.brand, primaryColor: "#000000" });
    expect(vars["--lp-primary"]).toBe("#000000");
    expect(vars["--lp-primary-soft"]).toBe("#e6e6e6");
    expect(vars["--lp-accent"]).toBe("#dcfa72");
  });
});
