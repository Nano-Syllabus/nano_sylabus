import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every student can share a referral link now (the weekly Cash Prize counts
 * referrals for everyone), but the 2-for-1 Pro bonus is still paid only on a
 * paid-Pro referrer's link — the reward trigger voids any other. Nothing a free
 * student's friend sees or receives may promise that bonus.
 */
const landing = readFileSync("app/r/[code]/page.tsx", "utf8");
const claim = readFileSync("components/billing-referral-claim.tsx", "utf8");
const data = readFileSync("lib/data/billing-referrals.ts", "utf8");
const route = readFileSync("app/api/billing/referrals/route.ts", "utf8");
const community = readFileSync("components/community-hub-client.tsx", "utf8");

describe("referral links for every student", () => {
  it("keeps a free student's link usable, and reports the bonus separately", () => {
    expect(data).toContain("active: Boolean(link.active),");
    expect(data).toContain("billingRewardEligible: Boolean(link.active) && referrerEligible,");
    expect(landing).not.toContain("needs an active paid Pro");
  });

  it("promises the Pro bonus on the landing page only for a paid-Pro referrer", () => {
    expect(landing).toContain("const proBonus = referral.billingRewardEligible;");
    const bonusCard = landing.indexOf("2 months for the price of 1");
    expect(bonusCard).toBeGreaterThan(-1);
    expect(landing.lastIndexOf("{proBonus ? (", bonusCard)).toBeGreaterThan(-1);
    expect(landing).toContain('invited you to NanoSyllabus{proBonus ? " Pro" : ""}');
    expect(landing).toContain("<BillingReferralClaim code={normalizedCode} billingReward={proBonus} />");
    expect(claim).toMatch(/billingReward\s*\?\s*"Referral saved\. Buy one month of Individual Pro/);
  });

  it("words the community share message by whether the bonus applies", () => {
    expect(route).toContain("billingReward,");
    expect(community).toContain("setReferralProBonus(payload.referral.billingReward === true);");
    expect(community).toContain("referralShareMessage(referralLink, referralProBonus)");
    expect(community).not.toContain("You must have an active paid Pro subscription to create");
  });
});
