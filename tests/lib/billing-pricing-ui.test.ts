import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { AppUser, StudentBillingOverview, SubscriptionPlan } from "@/lib/types";

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

describe("billing pricing UI", () => {
  it("renders the Figma plan hierarchy while keeping paid values API-driven", () => {
    const overview: StudentBillingOverview = {
      balance: 15,
      plans: [plan("individual", 1600), plan("group", 5200)],
      invoices: [],
      subscriptions: [],
    };
    const html = renderToStaticMarkup(createElement(BillingPageClient, { overview, paymentConfig: null, user }));

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
    expect(html).toContain("border-[#979797]");
    expect(html).toContain("border-[#20a8ff]");
    expect(html).toContain("from-white to-[#eef7ff]");
  });

  it("keeps free access separate from paid checkout without promotional-code paths", () => {
    const source = readFileSync("components/billing-page-client.tsx", "utf8");

    expect(source).not.toMatch(/discount|coupon/i);
    expect(source).toContain('actionLabel="Get Started"');
    expect(source).toContain('onAction={() => router.push("/app/today")}');
    expect(source).toContain('actionLabel="Get Individual"');
    expect(source).toContain("onAction={() => startPlan(plans.individual)}");
    expect(source).toContain('className="mt-[30px]"');
  });

  it("shows a clear review confirmation after receipt submission", () => {
    const source = readFileSync("components/billing-page-client.tsx", "utf8");

    expect(source).toContain("We’re reviewing your payment");
    expect(source).toContain("Verification usually takes 2–5 minutes");
    expect(source).toContain("We’ll email you as soon as your paid access is activated.");
    expect(source).toContain("Activation update will be sent to {email}");
  });
});
