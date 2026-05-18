"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { AdminSubscriptionSummary, AdminUserSummary, BillingType, SubscriptionPlan } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type PlanFormState = {
  name: string;
  slug: string;
  credits: string;
  price: string;
  currency: string;
  billingType: BillingType;
  isActive: boolean;
};

const EMPTY_PLAN: PlanFormState = {
  name: "",
  slug: "",
  credits: "200",
  price: "299",
  currency: "NPR",
  billingType: "monthly",
  isActive: true,
};

function toPlanForm(plan: SubscriptionPlan): PlanFormState {
  return {
    name: plan.name,
    slug: plan.slug,
    credits: String(plan.credits),
    price: String(plan.price),
    currency: plan.currency,
    billingType: plan.billingType,
    isActive: plan.isActive,
  };
}

export function AdminSubscriptionManager({
  initialPlans,
  initialSubscriptions,
  users,
}: {
  initialPlans: SubscriptionPlan[];
  initialSubscriptions: AdminSubscriptionSummary[];
  users: AdminUserSummary[];
}) {
  const [plans, setPlans] = useState(initialPlans);
  const [subscriptions, setSubscriptions] = useState(initialSubscriptions);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(initialPlans[0]?.id ?? "new");
  const [planForm, setPlanForm] = useState<PlanFormState>(initialPlans[0] ? toPlanForm(initialPlans[0]) : EMPTY_PLAN);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "saving-plan" | "granting" | "subscription-action">("idle");
  const [grantUserId, setGrantUserId] = useState<string>(users[0]?.userId ?? "");
  const [grantPlanId, setGrantPlanId] = useState<string>(initialPlans[0]?.id ?? "");
  const [grantEndsAt, setGrantEndsAt] = useState("");
  const [extendDaysById, setExtendDaysById] = useState<Record<string, string>>({});

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const activeSubscriptions = useMemo(
    () => subscriptions.filter((subscription) => subscription.status === "active"),
    [subscriptions],
  );

  function updatePlanForm<K extends keyof PlanFormState>(key: K, value: PlanFormState[K]) {
    setPlanForm((current) => ({ ...current, [key]: value }));
  }

  function primeNewPlan() {
    setSelectedPlanId("new");
    setPlanForm(EMPTY_PLAN);
    setFeedback(null);
  }

  function selectPlan(plan: SubscriptionPlan) {
    setSelectedPlanId(plan.id);
    setPlanForm(toPlanForm(plan));
    setFeedback(null);
  }

  async function refreshAll() {
    const [planResponse, subscriptionResponse] = await Promise.all([
      fetch("/api/admin/subscriptions/plans"),
      fetch("/api/admin/subscriptions/user-subscriptions"),
    ]);

    const planPayload = await planResponse.json();
    const subscriptionPayload = await subscriptionResponse.json();

    if (!planResponse.ok) throw new Error(planPayload.error || "Failed to refresh plans.");
    if (!subscriptionResponse.ok) throw new Error(subscriptionPayload.error || "Failed to refresh subscriptions.");

    setPlans(planPayload.plans);
    setSubscriptions(subscriptionPayload.subscriptions);
  }

  async function handlePlanSave() {
    const credits = Number(planForm.credits);
    const price = Number(planForm.price);
    if (!Number.isInteger(credits) || credits <= 0) {
      setFeedback("Credits must be a positive whole number.");
      return;
    }
    if (!Number.isInteger(price) || price < 0) {
      setFeedback("Price must be a whole number 0 or higher.");
      return;
    }

    setBusy("saving-plan");
    setFeedback(null);
    try {
      const response = await fetch(
        selectedPlanId === "new"
          ? "/api/admin/subscriptions/plans"
          : `/api/admin/subscriptions/plans/${selectedPlanId}`,
        {
          method: selectedPlanId === "new" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...planForm,
            credits,
            price,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save plan.");
      }

      await refreshAll();
      const latestPlan = payload.plan as SubscriptionPlan;
      setSelectedPlanId(latestPlan.id);
      setPlanForm(toPlanForm(latestPlan));
      setGrantPlanId(latestPlan.id);
      setFeedback(selectedPlanId === "new" ? "Plan created." : "Plan updated.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to save plan.");
    } finally {
      setBusy("idle");
    }
  }

  async function handleGrantSubscription() {
    if (!grantUserId || !grantPlanId) {
      setFeedback("Choose both a user and a plan before granting access.");
      return;
    }

    setBusy("granting");
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/subscriptions/user-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: grantUserId,
          planId: grantPlanId,
          startsAt: null,
          endsAt: grantEndsAt || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to grant subscription.");
      }

      await refreshAll();
      setFeedback("Subscription granted.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to grant subscription.");
    } finally {
      setBusy("idle");
    }
  }

  async function handleSubscriptionAction(
    subscriptionId: string,
    action: "cancel" | "extend",
  ) {
    setBusy("subscription-action");
    setFeedback(null);
    try {
      const body =
        action === "extend"
          ? {
              action,
              extraDays: Number(extendDaysById[subscriptionId] || "30"),
            }
          : { action };

      const response = await fetch(`/api/admin/subscriptions/user-subscriptions/${subscriptionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || `Failed to ${action} subscription.`);
      }

      await refreshAll();
      setFeedback(action === "cancel" ? "Subscription cancelled." : "Subscription extended.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : `Failed to ${action} subscription.`);
    } finally {
      setBusy("idle");
    }
  }

  return (
    <div className="mx-auto space-y-6 px-5 py-8">
      {feedback ? (
        <div className="rounded-2xl border border-border bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
          {feedback}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-border bg-bg-primary p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-display text-2xl">Plans</p>
              <p className="mt-1 text-sm text-text-secondary">Create and edit sellable packs</p>
            </div>
            <Button size="sm" onClick={primeNewPlan}>
              New
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => selectPlan(plan)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  selectedPlanId === plan.id
                    ? "border-border-strong bg-bg-secondary"
                    : "border-border bg-bg-primary hover:bg-bg-secondary"
                }`}
              >
                <p className="text-sm font-medium">{plan.name}</p>
                <p className="mt-1 text-xs text-text-secondary">
                  {plan.credits} credits · {plan.currency} {plan.price}
                </p>
                <p className="mt-1 text-[11px] text-text-muted">
                  {plan.billingType} · {plan.isActive ? "active" : "inactive"}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-3xl border border-border bg-bg-primary p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-display text-3xl">
                {selectedPlanId === "new" ? "Create subscription plan" : selectedPlan?.name ?? "Plan detail"}
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                Maintain pricing, credits, billing cycle, and active state for student billing.
              </p>
            </div>
            <Button onClick={handlePlanSave} disabled={busy !== "idle"}>
              {busy === "saving-plan" ? "Saving..." : selectedPlanId === "new" ? "Create plan" : "Save plan"}
            </Button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Name">
              <Input value={planForm.name} onChange={(event) => updatePlanForm("name", event.target.value)} />
            </Field>
            <Field label="Slug">
              <Input value={planForm.slug} onChange={(event) => updatePlanForm("slug", event.target.value)} />
            </Field>
            <Field label="Credits">
              <Input value={planForm.credits} onChange={(event) => updatePlanForm("credits", event.target.value)} />
            </Field>
            <Field label="Price">
              <Input value={planForm.price} onChange={(event) => updatePlanForm("price", event.target.value)} />
            </Field>
            <Field label="Currency">
              <Input value={planForm.currency} onChange={(event) => updatePlanForm("currency", event.target.value)} />
            </Field>
            <Field label="Billing type">
              <select
                value={planForm.billingType}
                onChange={(event) => updatePlanForm("billingType", event.target.value as BillingType)}
                className="block h-11 w-full rounded-md border border-border bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-strong/40"
              >
                <option value="one_time">one_time</option>
                <option value="monthly">monthly</option>
              </select>
            </Field>
            <label className="flex items-center gap-3 rounded-2xl border border-border bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={planForm.isActive}
                onChange={(event) => updatePlanForm("isActive", event.target.checked)}
              />
              Active for students
            </label>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="rounded-3xl border border-border bg-bg-primary p-5">
          <p className="font-display text-3xl">Grant subscription</p>
          <p className="mt-2 text-sm text-text-secondary">
            Give a student direct access without waiting for an invoice flow.
          </p>
          <div className="mt-6 space-y-4">
            <Field label="Student">
              <select
                value={grantUserId}
                onChange={(event) => setGrantUserId(event.target.value)}
                className="block h-11 w-full rounded-md border border-border bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-strong/40"
              >
                <option value="">Select user</option>
                {users.map((user) => (
                  <option key={user.userId} value={user.userId}>
                    {user.fullName} · {user.email}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Plan">
              <select
                value={grantPlanId}
                onChange={(event) => setGrantPlanId(event.target.value)}
                className="block h-11 w-full rounded-md border border-border bg-bg-primary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-strong/40"
              >
                <option value="">Select plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {plan.credits} credits
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ends at (optional ISO)">
              <Input
                value={grantEndsAt}
                onChange={(event) => setGrantEndsAt(event.target.value)}
                placeholder="2026-06-30T00:00:00.000Z"
              />
            </Field>
            <Button onClick={handleGrantSubscription} disabled={busy !== "idle"}>
              {busy === "granting" ? "Granting..." : "Grant access"}
            </Button>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-bg-primary p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-display text-3xl">Active subscriptions</p>
              <p className="mt-2 text-sm text-text-secondary">
                Extend or cancel live access windows.
              </p>
            </div>
            <div className="rounded-full border border-border px-4 py-2 text-sm text-text-secondary">
              {activeSubscriptions.length} active
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {subscriptions.length ? (
              subscriptions.map((subscription) => (
                <div key={subscription.id} className="rounded-2xl border border-border bg-bg-secondary p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">
                        {subscription.studentName} · {subscription.planName}
                      </p>
                      <p className="mt-1 text-xs text-text-secondary">{subscription.studentEmail}</p>
                      <p className="mt-1 text-[11px] text-text-muted">
                        {subscription.status} · starts {formatDate(subscription.startsAt)}
                        {subscription.endsAt ? ` · ends ${formatDate(subscription.endsAt)}` : " · no end date"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        className="w-24"
                        value={extendDaysById[subscription.id] ?? "30"}
                        onChange={(event) =>
                          setExtendDaysById((current) => ({
                            ...current,
                            [subscription.id]: event.target.value,
                          }))
                        }
                      />
                      <Button
                        variant="outline"
                        onClick={() => void handleSubscriptionAction(subscription.id, "extend")}
                        disabled={busy !== "idle"}
                      >
                        Extend days
                      </Button>
                      {subscription.status === "active" ? (
                        <Button
                          variant="danger"
                          onClick={() => void handleSubscriptionAction(subscription.id, "cancel")}
                          disabled={busy !== "idle"}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-text-secondary">
                No subscriptions found.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
