import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("app/globals.css", "utf8");
const billing = readFileSync("components/billing-page-client.tsx", "utf8");
const cashPrize = readFileSync("components/cash-prize-campaign.tsx", "utf8");
const cashPrizeFrame = readFileSync("components/cash-prize-campaign-frame.tsx", "utf8");
const calendar = readFileSync("components/practice-calendar.tsx", "utf8");
const library = readFileSync("components/library-nanoai-workspace.tsx", "utf8");

describe("student app dark theme", () => {
  it("uses the Challenge Hub near-black palette with readable secondary text", () => {
    expect(styles).toContain("--bg-primary: #121214");
    expect(styles).toContain("--bg-secondary: #161618");
    expect(styles).toContain("--bg-tertiary: #222225");
    expect(styles).toContain("--card: #18181a");
    expect(styles).toContain("--text-primary: #f7f7f8");
    expect(styles).toContain("--text-secondary: #d0d0d6");
    expect(styles).toContain("--text-muted: #a6a6af");
  });

  it("lets Pricing follow the app theme instead of forcing a light artboard", () => {
    expect(billing).toContain("min-h-full bg-bg-primary");
    expect(billing).toContain("border border-border bg-card");
    expect(billing).toContain("bg-bg-secondary");
    expect(billing).not.toContain("light-artboard palette");
    expect(billing).not.toContain("bg-[#fbfcfe]");
  });

  it("gives Cash Prize cards and dialogs dark themed surfaces and bright text", () => {
    // The dialogs sit on the card colour with the theme's text.
    expect(cashPrize).toContain("bg-card p-0 text-text-primary");
    expect(cashPrize).toContain("dark:text-text-secondary");
    // The campaign card and its progress panel.
    expect(cashPrizeFrame).toContain("bg-card shadow-");
    expect(cashPrizeFrame).toContain("dark:border-border");
    expect(cashPrizeFrame).toContain("dark:bg-card");
    expect(cashPrizeFrame).toContain("dark:text-text-primary");
  });

  it("renders the practice calendar and native date control with dark surfaces", () => {
    expect(styles).toContain('[data-theme="dark"] input[type="date"]');
    expect(styles).toContain("color-scheme: dark");
    expect(calendar).toContain("border border-border bg-card");
    expect(calendar).toContain("border border-border bg-bg-secondary");
    expect(calendar).toContain("bg-bg-tertiary");
    expect(calendar).not.toContain("border border-[#e2e8f0] bg-white");
    expect(calendar).not.toContain("border border-slate-200 bg-white");
  });

  it("keeps library and campaign icons visible on dark surfaces", () => {
    expect(library).toContain('className="size-7 text-text-primary"');
    expect(library).toContain('className="size-3 text-text-muted"');
    expect(library).toContain('className="size-4 text-text-secondary"');
    expect(library).not.toContain("/figma/library/book-open.svg");
    // Campaign icons are inline SVG in currentColor, so they take the themed text colour.
    expect(cashPrizeFrame).toContain('stroke="currentColor"');
  });
});
