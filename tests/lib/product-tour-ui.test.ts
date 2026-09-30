import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tour = readFileSync("public/nanosyllabus-features-minimal-animation.html", "utf8");

describe("landing product tour", () => {
  it("uses the same primary destinations as the shipped student sidebar", () => {
    const labels = [...tour.matchAll(/<div class="nav"[^>]*>.*?<\/svg>([^<]+)<\/div>/g)].map(
      (match) => match[1],
    );

    expect(labels).toEqual([
      "Micro-Topics",
      "Library",
      "Revision",
      "Performance",
      "Community",
      "Cash Prize",
      "Pricing",
    ]);
  });

  it("does not present in-product capabilities as made-up top-level tabs", () => {
    expect(tour).not.toMatch(/<\/svg>(Today|Communities|Challenges|Past papers|AI grader|NanoAI)<\/div>/);
    expect(tour).not.toContain("Every past question");
    expect(tour).not.toContain("Top scorers win every week");
  });

  it("uses the published BCT catalogue and grounded Applied Mechanics examples", () => {
    const visibleText = tour.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const value of [
      "TU · Bachelor in Computer Engineering",
      "4 years · 8 semesters",
      "Applied Mechanics",
      "Engineering Physics",
      "Basic Electrical Engineering",
      "Computer Programming",
      "Definitions and scope of Applied Mechanics",
      "2073 Bhadra · 3 marks",
      "2073 Magh · 3 marks",
      "of 37 topics",
    ]) {
      expect(visibleText).toContain(value);
    }
  });

  it("keeps the chapter slider smooth, scrollable and keyboard operable", () => {
    expect(tour).toContain("scroll-behavior: smooth");
    expect(tour).toContain("scroll-snap-type: x proximity");
    expect(tour).toContain("chipsBox.scrollTo({left: chipLeft");
    expect(tour).toContain("chipsBox.addEventListener('wheel'");
    expect(tour).toContain("chipsBox.addEventListener('keydown'");
    expect(tour).toContain("'ArrowLeft', 'ArrowRight', 'Home', 'End'");
  });
});
