import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { AppUser, StudentBillingOverview, SubscriptionPlan, UserSubscription } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { BillingPageClient } from "@/components/billing-page-client";

function plan(slug: string, price: number, isUnlimited: boolean): SubscriptionPlan {
  return {
    id: `${slug}-id`,
    name: slug === "plus-monthly" ? "Plus" : "Pro",
    slug,
    credits: 0,
    price,
    currency: "NPR",
    billingType: "monthly",
    productType: "individual",
    seatLimit: 1,
    isUnlimited,
    features: [],
    isActive: true,
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
  };
}

const plus = plan("plus-monthly", 450, false);
const pro = plan("individual-unlimited", 1500, true);
const user: AppUser = {
  id: "user-id",
  email: "student@example.com",
  fullName: "Student",
  onboarded: true,
  role: "student",
  creditBalance: 15,
  hasUnlimitedAccess: false,
};

function activeSubscription(planId: string): UserSubscription {
  return {
    id: "subscription-id",
    userId: "user-id",
    planId,
    invoiceId: "invoice-id",
    status: "active",
    startsAt: "2026-09-09T00:00:00.000Z",
    endsAt: "2026-10-09T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: "2026-09-09T00:00:00.000Z",
  };
}

function markup(subscriptions: UserSubscription[] = [], paidUser = user) {
  const overview: StudentBillingOverview = {
    balance: 15,
    plans: [plus, pro],
    invoices: [],
    subscriptions,
  };
  return renderToStaticMarkup(
    createElement(BillingPageClient, { overview, paymentConfig: null, user: paidUser }),
  );
}

describe("billing pricing UI", () => {
  it("matches every visible Figma pricing value, plan feature, and story", () => {
    const html = markup();

    for (const value of [
      "Simple plans. Bigger dreams.",
      "1 month",
      "3 months",
      "Rs. 0",
      "Rs. 450",
      "Rs. 1,350",
      "Rs. 1,500",
      "Rs. 4,500",
      "3 challenges / day",
      "AI answer grading",
      "All semesters &amp; subjects",
      "Community PDFs &amp; materials",
      "Learning analytics",
      "Group study sessions",
      "Everything in Free",
      "Unlimited challenges",
      "Exam calendar &amp; study plan",
      "Romanized Nepali",
      "Everything in Plus",
      "AI tutor",
      "AI concept videos &amp; animations",
      "English &amp; Nepali",
      "Choose Plus",
      "Choose Pro",
      "You don’t have to prepare alone.",
      "1,248",
      "Challenges completed this week",
      "386",
      "Handwritten answers reviewed",
      "72",
      "Students joined study sessions",
      "Real Stories, Real Growth",
      "Aayush K.",
      "Sneha P.",
      "Resha D.",
      "Ready for more than 3 challenges a day?",
      "Choose Plus - Rs. 450/month ↗",
      "Keep using Free",
    ]) {
      expect(html).toContain(value);
    }
    expect(html).not.toContain("Rs. 5,000");
    expect(html).not.toMatch(/discount|coupon/i);
    expect(html).toContain("font-[family-name:var(--font-poppins)]");
    expect(html).toContain("bg-[#d9ff69]");
    expect(html).toContain("bg-[#3548f5]");
    expect(html).toContain("max-w-[1000px]");
  });

  it("keeps Free separate and sends the selected paid tier and duration to checkout", () => {
    const source = readFileSync("components/billing-page-client.tsx", "utf8");
    const invoiceRoute = readFileSync("app/api/billing/invoices/route.ts", "utf8");

    expect(source).toContain('"Included in your plan" : "Current plan"');
    expect(source).toContain('onAction={() => startPlan(plans.plus)}');
    expect(source).toContain('onAction={() => startPlan(plans.pro)}');
    expect(source).toContain("onClick={() => setBillingMonths(3)}");
    expect(source).toContain("billingMonths: months");
    expect(invoiceRoute).toContain("plan.price * payload.billingMonths");
    expect(invoiceRoute).toContain("payload.billingMonths * 30");
    expect(invoiceRoute).toContain('.eq("amount", invoiceAmount)');
  });

  it("does not mark a missing paid plan as current when the user is on Free", () => {
    const overview: StudentBillingOverview = {
      balance: 15,
      plans: [pro],
      invoices: [],
      subscriptions: [],
    };
    const html = renderToStaticMarkup(
      createElement(BillingPageClient, { overview, paymentConfig: null, user }),
    );

    expect(html.match(/>Current plan<\/button>/g)).toHaveLength(1);
    expect(html).toContain("Choose Plus");
    expect(html).not.toContain("Active with no expiry date");
  });

  it("shows the active Plus plan even though it does not grant unlimited AI", () => {
    const html = markup([activeSubscription(plus.id)]);
    expect(html).toContain("Plus plan active");
    expect(html).toContain("Active until");
    expect(html).toContain("Cancel subscription");
    expect(html).toContain("Base plan");
    expect(html).not.toContain("Ready for more than 3 challenges a day?");
  });

  it("shows the active Pro plan and prevents duplicate checkout", () => {
    const html = markup([activeSubscription(pro.id)], { ...user, hasUnlimitedAccess: true });
    expect(html).toContain("Pro plan active");
    expect(html).toContain("Current plan");
    expect(html).toContain("Active until");
    expect(html).toContain("Cancel subscription");
    expect(html).toContain("Cancelling ends access immediately");
    expect(html).toContain("Base plan");
    expect(html).not.toContain("Choose Plus - Rs. 450/month");
  });

  it("cancels paid access immediately and makes every paid plan selectable again", () => {
    const source = readFileSync("components/billing-page-client.tsx", "utf8");
    const route = readFileSync("app/api/billing/subscriptions/cancel/route.ts", "utf8");
    const html = markup([
      {
        ...activeSubscription(plus.id),
        status: "cancelled",
        endsAt: "2026-09-13T08:00:00.000Z",
        cancelledAt: "2026-09-13T08:00:00.000Z",
      },
    ]);

    expect(source).toContain("/api/billing/subscriptions/cancel");
    expect(source).toContain("Cancel now");
    expect(source).toContain("same plan or a different plan now");
    expect(source).toContain("payload.cancelledSubscriptionIds");
    expect(route).toContain('status: "cancelled"');
    expect(route).toContain("cancelledSubscriptionIds: subscriptionIds");
    expect(route).toContain("subscriptionsToCancel.map");
    expect(route).toContain("ends_at: cancelledAt");
    expect(route).toContain("cancel_at_period_end: false");
    expect(route).toContain('["individual", "group"].includes(plan.product_type)');
    expect(html).toContain("Choose Plus");
    expect(html).toContain("Choose Pro");
    expect(html).not.toContain("Cancel subscription");
    expect(html).toContain("Current plan</button>");
    expect(html).not.toContain("Pro plan active");
    expect(html).not.toContain("Plus plan active");
  });

  it("retains the receipt activation confirmation", () => {
    const source = readFileSync("components/billing-page-client.tsx", "utf8");
    expect(source).toContain("Activating your access");
    expect(source).toContain("Please wait a few seconds...");
    expect(source).toContain("Your paid access is active");
  });
});
