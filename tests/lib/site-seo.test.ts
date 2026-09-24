import { describe, expect, it } from "vitest";
import { buildCanonicalUrl } from "@/lib/site";

describe("SEO canonical URLs", () => {
  it("uses the canonical origin for app routes", () => {
    expect(buildCanonicalUrl("/")).toBe("https://nanosyllabus.com/");
    expect(buildCanonicalUrl("/exams")).toBe("https://nanosyllabus.com/exams");
    expect(buildCanonicalUrl("/exams/mbbs")).toBe("https://nanosyllabus.com/exams/mbbs");
  });

  it("supports overriding the site origin with an env value", () => {
    const previous = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.nanosyllabus.com";

    try {
      expect(buildCanonicalUrl("/communities")).toBe("https://www.nanosyllabus.com/communities");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = previous;
    }
  });
});
