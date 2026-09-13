import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type {
  AppUser,
  StudentBillingOverview,
  SubscriptionPlan,
  UserSubscription,
} from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { BillingPageClient } from "@/components/billing-page-client";

function plan(productType: "individual" | "group", price: number): SubscriptionPlan {
  return {
    id: `${productType}-id`,
    name: `${productType} plan`,
    slug: `${productType}-unlimited`,
    credits: 1,
    price,
    currency: "NPR",
    billingType: "monthly",
    productType,
    seatLimit: productType === "group" ? 5 : 1,
    isUnlimited: true,
    features: [`${productType} feature from API`],
    isActive: true,
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
  };
}

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

describe("billing pricing UI", () => {
  it("renders the Figma plan hierarchy while keeping paid values API-driven", () => {
    const overview: StudentBillingOverview = {
      balance: 15,
      plans: [plan("individual", 1600), plan("group", 5200)],
      invoices: [],
      subscriptions: [],
    };
    const html = renderToStaticMarkup(
      createElement(BillingPageClient, { overview, paymentConfig: null, user }),
    );

    expect(html).toContain("Study without limits!");
    expect(html).toContain("Start learning for free. Upgrade when you’re ready for more.");
    expect(html).toContain("Monthly");
    expect(html).toContain("Yearly");
    expect(html).toContain("font-[family-name:var(--font-poppins)]");
    expect(html).toContain("Get Started");
    expect(html).toContain("Most Popular");
    expect(html).toContain("Rs. 1,600");
    expect(html).toContain("Rs. 5,200");
    expect(html).toContain("Handwritten Answer Feedback");
    expect(html).toContain("Shared Accountability");
    expect(html).not.toMatch(/discount|coupon/i);
    // The visual hierarchy these assert is unchanged: standard plans get a
    // plain border, the featured plan gets a blue border and a gradient lift.
    // What moved is where the colours come from — the card surface and border
    // used to be hardcoded light literals (`border-[#979797]`, and a
    // `from-white` gradient), which rendered as a white card in the dark theme
    // while the text followed the theme to near-white and became unreadable.
    // They are theme tokens now, so the same hierarchy holds in both themes.
    expect(html).toContain("border-border");
    expect(html).toContain("border-[#20a8ff]");
    expect(html).toContain("bg-gradient-to-b");
    expect(html).toContain("#20a8ff_16%");
  });

  it("keeps free access separate from paid checkout without promotional-code paths", () => {
    const source = readFileSync("components/billing-page-client.tsx", "utf8");

    expect(source).not.toMatch(/discount|coupon/i);
    expect(source).toContain('"Included with your plan" : "Get Started"');
    expect(source).toContain('onAction={() => router.push("/app/today")}');
    expect(source).toContain('"Current plan" : "Get Individual"');
    expect(source).toContain("onAction={() => startPlan(plans.individual)}");
    expect(source).toContain('className="mt-[30px]"');
  });

  it("shows processing and active-access confirmation after receipt submission", () => {
    const source = readFileSync("components/billing-page-client.tsx", "utf8");

    expect(source).toContain("Activating your access");
    expect(source).toContain("Access will be ready in about five seconds.");
    expect(source).toContain("Your paid access is active");
    expect(source).toContain("Plan access activated by Nano Syllabus");
  });

  it("shows the approved plan as current and prevents duplicate checkout", () => {
    const individual = plan("individual", 1500);
    const paidUser = { ...user, hasUnlimitedAccess: true };
    const overview: StudentBillingOverview = {
      balance: 1,
      plans: [individual, plan("group", 5000)],
      invoices: [],
      subscriptions: [activeSubscription(individual.id)],
    };

    const html = renderToStaticMarkup(
      createElement(BillingPageClient, { overview, paymentConfig: null, user: paidUser }),
    );

    expect(html).toContain(
      "Your Individual Unlimited plan is active with unlimited NanoAI access.",
    );
    expect(html).toContain("Current Plan");
    expect(html).toContain("Current plan");
    expect(html).toContain("Active until");
    expect(html).toContain("Upgrade to Group");
    expect(html).toContain("Unlimited plan active");
    expect(html).toContain("Cancel subscription");
    expect(html).toContain(
      "You can cancel anytime without losing the time you have already paid for.",
    );
  });

  it("uses a scheduled end-of-period cancellation flow instead of removing paid access immediately", () => {
    const source = readFileSync("components/billing-page-client.tsx", "utf8");
    const route = readFileSync("app/api/billing/subscriptions/cancel/route.ts", "utf8");

    expect(source).toContain("/api/billing/subscriptions/cancel");
    expect(source).toContain("Cancel at period end");
    expect(source).toContain("Keep subscription");
    expect(route).toContain("cancel_at_period_end: true");
    expect(route).toContain('status !== "active"');
    expect(route).toContain("subscription_cancellation_scheduled");
  });

  it("labels a scheduled cancellation by its final access date", () => {
    const individual = plan("individual", 1500);
    const paidUser = { ...user, hasUnlimitedAccess: true };
    const overview: StudentBillingOverview = {
      balance: 1,
      plans: [individual],
      invoices: [],
      subscriptions: [{ ...activeSubscription(individual.id), cancelAtPeriodEnd: true }],
    };

    const html = renderToStaticMarkup(
      createElement(BillingPageClient, { overview, paymentConfig: null, user: paidUser }),
    );

    expect(html).toContain("Cancellation is scheduled.");
    expect(html).toContain("Plan ends Oct 9, 2026");
    expect(html).toContain("Keep subscription");
  });
});
