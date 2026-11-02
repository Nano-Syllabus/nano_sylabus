import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// nanosyllabus.com's own page; faculty and exam sites keep LandingView.
const mainSource = readFileSync("components/main-landing-view.tsx", "utf8");
const pageSource = readFileSync("app/page.tsx", "utf8");

describe("main site landing page", () => {
  it("renders the main page unless an exam needs LandingView's join door", () => {
    expect(pageSource).toContain("if (!exam) return <MainLandingView />;");
  });

  it("sends the waitlist and Start free buttons to a booked call, the sample lesson to the demo", () => {
    expect(mainSource).toContain("const JOIN_HREF = BOOK_CALL_URL;");
    expect(mainSource.match(/<Cta href=\{JOIN_HREF\}/g)).toHaveLength(3);
    expect(mainSource).toContain("href={FREE_DEMO_URL}");
  });

  it("keeps the courses section unclickable", () => {
    const courses = mainSource.slice(mainSource.indexOf('id="courses"'), mainSource.indexOf("7. Why NanoSyllabus"));
    expect(courses).toContain("cursor-default");
    expect(courses).not.toMatch(/<a\b|<Link\b|<Cta\b|hover:/);
  });
});
