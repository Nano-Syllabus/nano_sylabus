import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CashPrizeCampaign } from "@/components/cash-prize-campaign";
import { CashPrizeHeader, IoeAwardCard } from "@/components/cash-prize-page-frame";
import type { WeeklyCampaignState } from "@/lib/data/cash-prize-weekly";
import CashPrizeLoading from "@/app/app/cash-prize/loading";

const page = readFileSync("app/app/cash-prize/page.tsx", "utf8");
const campaign = readFileSync("components/cash-prize-campaign.tsx", "utf8");
const frame = readFileSync("components/cash-prize-campaign-frame.tsx", "utf8");
const skeleton = readFileSync("app/app/cash-prize/loading.tsx", "utf8");
const sidebar = readFileSync("components/app-sidebar.tsx", "utf8");
const appNav = readFileSync("components/app-nav.tsx", "utf8");

function campaignState(overrides: Partial<WeeklyCampaignState> = {}): WeeklyCampaignState {
  return {
    drawDate: "2026-09-25",
    streakDays: 5,
    verifiedReferrals: 7,
    eligibleCommunity: { id: "community-1", name: "Pulchowk BCT 2081" },
    entries: { qualified: false, base: 0, bonus: 1, active: 0, potential: 2 },
    referralCode: "REFABC123",
    participation: null,
    ...overrides,
  };
}

const render = (state: WeeklyCampaignState) =>
  renderToStaticMarkup(createElement(CashPrizeCampaign, { state }));

/** Visible text, tags stripped, whitespace collapsed. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

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
    // Performance follows Revision, before the community and reward surfaces.
    expect(appNav.indexOf('label: "Revision"')).toBeLessThan(appNav.indexOf('label: "Performance"'));
    expect(appNav.indexOf('label: "Performance"')).toBeLessThan(appNav.indexOf('label: "Community"'));
    expect(appNav.indexOf('label: "Community"')).toBeLessThan(appNav.indexOf('label: "Cash Prize"'));
    // The sidebar's Revision and Cash Prize come from its NAV array, so source
    // order says nothing there: Performance and Community are rendered from
    // inside that map, directly after Revision.
    expect(sidebar.indexOf('item.href === "/app/notes"')).toBeLessThan(
      sidebar.indexOf('href="/app/today"'),
    );
    expect(sidebar.indexOf('href="/app/today"')).toBeLessThan(
      sidebar.indexOf('href="/app/community"'),
    );
    expect(sidebar.indexOf('href="/app/challenges"')).toBeLessThan(sidebar.indexOf('href="/app/community"'));
    expect(appNav.indexOf('label: "Cash Prize"')).toBeLessThan(appNav.indexOf('label: "Pricing"'));
  });

  it("keeps the page header and the IOE award around the campaign", () => {
    // Only the daily lottery card was replaced; the rebuild once took these too.
    expect(page).toContain("<CashPrizeHeader />");
    expect(page.indexOf("<CashPrizeHeader />")).toBeLessThan(page.indexOf("<CashPrizeCampaign"));
    expect(page.indexOf("<CashPrizeCampaign")).toBeLessThan(page.indexOf("<IoeAwardCard />"));

    const surroundings = text(
      renderToStaticMarkup(createElement(CashPrizeHeader)) +
        renderToStaticMarkup(createElement(IoeAwardCard)),
    );
    for (const copy of [
      "Earn while you learn",
      "Complete challenges. Score higher. Win cash.",
      "1 active campaign",
      "IOE Top Scorer Award",
      "Rs. 40,000",
      "Score highest in the IOE exam",
      "Dropping Soon",
    ]) {
      expect(surroundings).toContain(copy);
    }
    expect(existsSync("public/figma/cash-prize/ioe-award.png")).toBe(true);
  });

  it("replaces the daily lottery with the weekly streak campaign", () => {
    expect(page).toContain("getWeeklyCampaignState(user.id)");
    expect(page).toContain("<CashPrizeCampaign state={state} />");
    expect(page).not.toContain("getDailyCashPrizeProgress");
    expect(existsSync("components/cash-prize-participation.tsx")).toBe(false);

    const html = text(render(campaignState()));
    expect(html).toContain("BCT STUDENTS ONLY");
    expect(html).toContain("Build your streak.");
    expect(html).toContain("Rs. 5,000");
    expect(html).toContain("+ 3 months of unlimited challenges");
    expect(html).toContain("3 months unlimited");
    expect(html).toContain("1 month unlimited");
    expect(html).toContain("Friday draw");
    expect(html).not.toContain("Daily Challenge Lottery");
  });

  it("carries none of the design file's broken characters", () => {
    // The pasted design was UTF-8 read as Latin-1: "Â·", "à¤°à¥", "â†—", "â€™", "Ã—", "âœ“".
    for (const source of [campaign, frame, skeleton]) {
      expect(source).not.toMatch(/Â|à¤|â†|â€|Ã—|âœ/);
    }
    const html = render(campaignState({ streakDays: 7, entries: { qualified: true, base: 1, bonus: 1, active: 2, potential: 2 } }));
    expect(html).toContain("रु");
    expect(html).toContain("↗");
    expect(html).toContain("✓");
    expect(text(html)).toContain("Second winner · challenges");
  });

  it("shows a student short of the streak what is left, and no active entries", () => {
    const html = text(render(campaignState()));
    expect(html).toContain("2 more days to qualify");
    expect(html).toContain("5 / 7 days");
    expect(html).toContain("7 verified");
    expect(html).toContain("3 more referrals = +1 extra entry");
    expect(html).toContain("0 active");
    expect(html).toContain("+1 referral entry");
    expect(html).toContain("2 entries unlock at a 7-day streak.");
    expect(html).toContain("Keep going. You're almost there.");
    // The seven day cells: five done, then 6 and 7 still to go.
    const rendered = render(campaignState());
    expect(rendered.match(/>✓</g)).toHaveLength(5);
    expect(rendered).toContain('aria-label="5 of 7 streak days completed"');
    expect(rendered).toContain('aria-valuenow="2"');
  });

  it("confirms nothing until the streak qualifies; the button stays disabled", () => {
    const html = render(campaignState());
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Confirm participation<\/button>/);
    expect(text(html)).toContain("2 more days to go");
  });

  it("lets a qualified student confirm, and says what is checked on the server", () => {
    const html = render(
      campaignState({ streakDays: 9, entries: { qualified: true, base: 1, bonus: 1, active: 2, potential: 2 } }),
    );
    // `disabled=""`, not the class list's `disabled:` variants.
    expect(html).toMatch(/<button(?![^>]*disabled="")[^>]*>Confirm participation<\/button>/);
    const visible = text(html);
    expect(visible).toContain("Streak requirement met");
    expect(visible).toContain("9 days"); // past seven: no "/ 7"
    expect(visible).not.toContain("9 / 7");
    expect(visible).toContain("2 active");
    expect(visible).toContain("1 streak entry + 1 referral entry.");
    expect(visible).toContain("Your 9-day streak qualifies you for the draw on Friday 25 September.");
    expect(visible).toContain("checked again on our server");
  });

  it("tells a student outside BCT the draw is not theirs this week", () => {
    const visible = text(
      render(campaignState({ streakDays: 12, eligibleCommunity: null, entries: { qualified: false, base: 0, bonus: 1, active: 0, potential: 2 } })),
    );
    expect(visible).toContain("BCT students only");
    expect(visible).toContain("This week's draw is for BCT students.");
    expect(visible).toContain("Join your BCT community to take part.");
  });

  it("shows a confirmed student they are in, and offers to update for new referrals", () => {
    const confirmed = campaignState({
      streakDays: 8,
      entries: { qualified: true, base: 1, bonus: 1, active: 2, potential: 2 },
      participation: { entries: 2, confirmedAt: "2026-09-21T06:00:00.000Z" },
    });
    const visible = text(render(confirmed));
    expect(visible).toContain("You're in Friday's draw");
    expect(visible).toContain("You're in ✓");
    expect(visible).toContain("You're in the draw on Friday 25 September with 2 entries.");
    expect(visible).not.toContain("Confirm participation");

    const moreReferrals = text(
      render({ ...confirmed, verifiedReferrals: 10, entries: { qualified: true, base: 1, bonus: 2, active: 3, potential: 3 } }),
    );
    expect(moreReferrals).toContain("Update my entry to 3");
  });

  it("asks the server to register the entry, and never sends a count", () => {
    expect(campaign).toContain('fetch("/api/student/cash-prize/participate", {');
    expect(campaign).not.toMatch(/participate",\s*\{[^}]*body:/);
    // Keep my streak goes to the Challenge Hub, not an outside site.
    expect(campaign).toContain('<Link href="/app/challenges" className={secondaryButtonClass}>');
    expect(campaign).not.toContain("nanosyllabus.com");
    // A link the student already has is reused; otherwise one is created.
    expect(campaign).toContain("/r/${encodeURIComponent(state.referralCode)}");
    expect(campaign).toContain('fetch("/api/billing/referrals", {');
  });

  it("uses native modal dialogs, drawing the toast inside the one in front", () => {
    expect(campaign).toContain("dialog.showModal()");
    expect(campaign).toContain("<Toast message={rulesOpen ? toast : \"\"} />");
    expect(campaign).toContain("<Toast message={referralOpen ? toast : \"\"} />");
    expect(campaign).toContain("<Toast message={rulesOpen || referralOpen ? \"\" : toast} />");
    // Tailwind's preflight zeroes margins; without m-auto a modal dialog sits top-left.
    expect(campaign).toMatch(/const dialogClass =\s*"m-auto /);
  });
});

describe("the cash prize skeleton", () => {
  const html = renderToStaticMarkup(createElement(CashPrizeLoading));

  it("is built from the same frame as the page", () => {
    for (const piece of [
      "CampaignHero",
      "CampaignRewards",
      "campaignCardClass",
      "progressSectionClass",
      "metricsGridClass",
      "metricSecondClass",
      "metricThirdClass",
      "actionsClass",
      "ActionsCopy",
    ]) {
      expect(skeleton, `skeleton does not use ${piece}`).toContain(piece);
      expect(campaign, `page does not use ${piece}`).toContain(piece);
    }
  });

  it("draws the campaign and its labels for real, and pulses only the student's figures", () => {
    const visible = text(html);
    for (const label of [
      "Build your streak.",
      "Rs. 5,000",
      "How it works ↗",
      "Your progress",
      "Challenge streak",
      "Your referrals",
      "Wheel entries",
      "1 base",
      "Bring your study circle along.",
      "Keep my streak",
      "Participate",
    ]) {
      expect(visible).toContain(label);
    }
    // The header's campaign count is a constant, not the student's wheel entries.
    expect(visible).not.toMatch(/\d+ verified|\d+ active(?! campaign)|more days? to qualify/);
    expect(html).toContain("animate-pulse bg-border");
    expect(skeleton).not.toContain("bg-bg-secondary\"");
    expect(html).toContain('aria-busy="true"');
  });

  it("draws the buttons inert", () => {
    expect(html).not.toMatch(/<button|<a /);
  });
});

describe("the campaign in the dark theme", () => {
  it("gives every progress surface a themed face", () => {
    const dashboard = frame.slice(frame.indexOf("/* The progress dashboard."));
    for (const name of [
      "lineClass",
      "labelClass",
      "valueClass",
      "unitClass",
      "hintClass",
      "secondaryButtonClass",
      "progressSectionClass",
      "progressTitleClass",
      "statusPillClass",
      "streakDayClass",
      "referralTrackClass",
      "entryPillClass",
    ]) {
      const declaration = dashboard.match(new RegExp(`export const ${name} =[^;]+;`))?.[0] ?? "";
      expect(declaration, `${name} has no dark variant`).toMatch(/dark:(text|bg|border)-/);
    }
    expect(campaign).toContain("bg-card p-0 text-text-primary");
  });
});
