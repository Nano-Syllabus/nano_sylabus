import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/app/cash-prize/page.tsx", "utf8");
const participation = readFileSync("components/cash-prize-participation.tsx", "utf8");
const sidebar = readFileSync("components/app-sidebar.tsx", "utf8");
const appNav = readFileSync("components/app-nav.tsx", "utf8");

describe("student cash prize page", () => {
  it("links the cash prize campaign from the student sidebar", () => {
    expect(sidebar).toContain('href: "/app/cash-prize"');
    expect(sidebar).toContain('label: "Cash Prize"');
    expect(sidebar.indexOf('label: "Revision"')).toBeLessThan(
      sidebar.indexOf('label: "Cash Prize"'),
    );
    expect(sidebar.indexOf('label: "Cash Prize"')).toBeLessThan(
      sidebar.indexOf('label: "Pricing"'),
    );
    expect(appNav.indexOf('label: "Revision"')).toBeLessThan(appNav.indexOf('label: "Cash Prize"'));
    expect(appNav.indexOf('label: "Cash Prize"')).toBeLessThan(appNav.indexOf('label: "Pricing"'));
  });

  it("matches the two Figma campaign cards with committed artwork", () => {
    expect(page).toContain("Earn while you learn");
    expect(page).toContain("Daily Challenge Lottery");
    expect(page).toContain("IOE Top Scorer Award");
    expect(page).toContain("Rs. 1,000");
    expect(page).toContain("Rs. 40,000");
    expect(page).toContain("/figma/cash-prize");
    expect(page).toContain("daily-lottery-transparent.png");
    expect(page).toContain("ioe-award.png");
    expect(page).toContain("xl:block");
    expect(page).not.toContain("2xl:block");
    expect(page).toContain("xl:origin-top xl:scale-90");
  });

  it("renders daily lottery progress from durable challenge completion data", () => {
    expect(page).toContain("getDailyCashPrizeProgress(user.id)");
    expect(page).toContain("dailyProgress.completedForEntry");
    expect(page).toContain("dailyProgress.progressPercent");
    expect(page).not.toContain(">0/1 completed<");
  });

  it("shows the correct Figma dialog for completed and incomplete students", () => {
    expect(page).toContain("eligible={dailyProgress.isEligible}");
    expect(participation).toContain('router.push("/app/challenges")');
    expect(participation).toContain("{eligible ? (");
    expect(participation).toContain("Congratulations!");
    expect(participation).toContain("You&apos;ve completed today&apos;s challenge.");
    expect(participation).toContain("completion-trophy.png");
    expect(participation).toContain("Participate in today&apos;s draw");
    expect(participation).toContain("How to qualify");
    expect(participation).toContain("Complete challenge first");
    expect(participation).toContain("incomplete-lottery.png");
    expect(participation).toContain('role="dialog"');
    expect(participation).toContain('event.key === "Escape"');
    expect(participation).toContain("createPortal(");
    expect(participation).toContain("document.body");
  });
});
