"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUp,
  ArrowDown,
  Check,
  ChevronDown,
  Layers3,
  LockKeyhole,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { AdminExamBillingDialog } from "@/components/admin-exam-billing-dialog";
import { AdminFacultyCreate } from "@/components/admin-faculty-create";
import type { CommunityChoice } from "@/lib/data/landing-sites";
import type { ExamConfig } from "@/lib/exam-enrollment";
import type { SubscriptionPlan } from "@/lib/types";

const inputClass =
  "min-h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
type LockedStudent = {
  userId: string;
  name: string;
  facultyId: string;
  facultyName: string;
  selectedAt: string;
};

export function AdminExamSettings({
  slug,
  initialConfig,
  communities: initialCommunities,
  plans,
}: {
  slug: string;
  initialConfig: ExamConfig;
  communities: CommunityChoice[];
  plans: SubscriptionPlan[];
}) {
  const [config, setConfig] = useState(initialConfig);
  const [communities, setCommunities] = useState(initialCommunities);
  const [addingFaculty, setAddingFaculty] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [students, setStudents] = useState<LockedStudent[] | null>(null);
  const [facultyChanges, setFacultyChanges] = useState<Record<string, string>>({});
  const selected = config.facultySlugs.flatMap((slug) =>
    communities.filter((c) => c.slug === slug),
  );

  function move<T>(items: T[], index: number, offset: number): T[] {
    const next = [...items];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    return next;
  }

  const pricedPlans = plans.filter(
    (p) =>
      p.productType === "individual" &&
      p.billingType === "monthly" &&
      p.price > 0 &&
      (!config.planIds.length || config.planIds.includes(p.id)),
  );

  function setFacultyPrice(facultySlug: string, planId: string, raw: string) {
    setMessage("");
    const price = Number(raw);
    setConfig((current) => {
      const forFaculty = { ...(current.facultyPrices[facultySlug] ?? {}) };
      if (Number.isInteger(price) && price > 0) forFaculty[planId] = price;
      else delete forFaculty[planId];
      const facultyPrices = { ...current.facultyPrices, [facultySlug]: forFaculty };
      if (!Object.keys(forFaculty).length) delete facultyPrices[facultySlug];
      return { ...current, facultyPrices };
    });
  }

  function toggleFaculty(value: string) {
    setMessage("");
    setConfig((current) => ({
      ...current,
      facultySlugs: current.facultySlugs.includes(value)
        ? current.facultySlugs.filter((slug) => slug !== value)
        : [...current.facultySlugs, value],
    }));
  }

  async function save() {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/sites/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examConfig: config }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save exam setup.");
      setConfig(result.site.examConfig);
      setMessage(
        "Exam setup saved. The website’s main buttons now open this exam’s preparation flow.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save exam setup.");
    } finally {
      setPending(false);
    }
  }

  async function loadStudents() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/sites/${slug}/enrollments`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load students.");
      setStudents(result.students);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function changeFaculty(student: LockedStudent) {
    const facultyId = facultyChanges[student.userId];
    if (!facultyId || facultyId === student.facultyId) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/sites/${slug}/enrollments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: student.userId, facultyId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not change this faculty.");
      await loadStudents();
      setMessage(`${student.name}’s faculty has been updated and locked to the new selection.`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="rounded-xl border border-border bg-card" open={config.enabled}>
      <summary className="flex cursor-pointer list-none items-center gap-3 p-5">
        <span className="grid size-10 place-items-center rounded-xl bg-blue-600/10 text-blue-600">
          <Layers3 size={20} />
        </span>
        <span className="flex-1">
          <span className="block text-base font-semibold">Exam, faculties & checkout</span>
          <span className="block text-sm text-muted-foreground">
            One exam → multiple faculties → their subjects
          </span>
        </span>
        <ChevronDown size={18} />
      </summary>
      <div className="grid gap-6 border-t border-border p-5 lg:grid-cols-2">
        <div className="space-y-5">
          <label className="flex items-start gap-3 rounded-xl bg-muted/50 p-4">
            <input
              type="checkbox"
              aria-label="Use this website as an exam"
              aria-describedby={`exam-description-${slug}`}
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              className="mt-1 size-4 accent-blue-600"
            />
            <span>
              <span className="block font-medium">Use this website as an exam</span>
              <span id={`exam-description-${slug}`} className="text-sm text-muted-foreground">
                Give this exam one landing page and one payment page. Students can explore faculties
                before signing in.
              </span>
            </span>
          </label>
          <div>
            <label className="mb-2 block text-sm font-semibold">Supported faculties</label>
            <div className="mb-3 flex flex-wrap gap-3 text-sm">
              <button
                type="button"
                onClick={() => setAddingFaculty(true)}
                className="inline-flex items-center gap-1 text-blue-600"
              >
                <Plus size={14} />
                Add a faculty
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const response = await fetch("/api/admin/faculties");
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error);
                    setCommunities(
                      result.faculties.filter(
                        (f: { status: string; visibility: string }) =>
                          f.status === "active" && f.visibility === "public",
                      ),
                    );
                  } catch (cause) {
                    setError((cause as Error).message);
                  }
                }}
                className="text-muted-foreground underline"
              >
                Refresh faculties
              </button>
            </div>
            {addingFaculty ? (
              <div className="mb-4">
                <AdminFacultyCreate
                  onCancel={() => setAddingFaculty(false)}
                  onCreated={(faculty) => {
                    setAddingFaculty(false);
                    if (faculty.visibility === "public") {
                      setCommunities((current) => [...current, faculty]);
                      setConfig((current) => ({
                        ...current,
                        facultySlugs: [...current.facultySlugs, faculty.slug],
                      }));
                    }
                    setMessage(
                      faculty.visibility === "public"
                        ? "Faculty created. Save exam setup to apply your selection."
                        : "Faculty created. Make it public before adding it to an exam.",
                    );
                  }}
                />
              </div>
            ) : null}
            <details className="rounded-lg border border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-sm">
                <span>
                  {selected.length
                    ? `${selected.length} faculties selected`
                    : "Choose multiple faculties"}
                </span>
                <ChevronDown size={16} />
              </summary>
              <div className="border-t border-border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Search size={16} />
                  <input
                    aria-label="Search faculties"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search BCT, BEI, BCE…"
                    className={inputClass}
                  />
                </div>
                <div className="max-h-56 overflow-auto">
                  {communities
                    .filter((c) =>
                      `${c.name} ${c.faculty}`.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((c) => (
                      <label
                        key={c.slug}
                        className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          checked={config.facultySlugs.includes(c.slug)}
                          onChange={() => toggleFaculty(c.slug)}
                          className="size-4 accent-blue-600"
                        />
                        <span className="text-sm">
                          <span className="block font-medium">{c.name}</span>
                          <span className="text-xs text-muted-foreground">{c.faculty}</span>
                        </span>
                      </label>
                    ))}
                  {!communities.length ? (
                    <p className="py-3 text-sm text-muted-foreground">
                      Create an active public faculty first.
                    </p>
                  ) : null}
                </div>
              </div>
            </details>
            <div className="mt-3 space-y-2">
              {selected.map((c, index) => (
                <div key={c.slug} className="rounded-lg bg-blue-600/5">
                  <div className="flex items-center gap-2 p-2 text-xs">
                    <Check size={12} className="shrink-0 text-blue-600" />
                    <span className="min-w-0 flex-1 font-medium">
                      {index + 1}. {c.name}
                    </span>
                    <button
                      type="button"
                      aria-label={`Move ${c.name} up`}
                      disabled={config.facultySlugs.indexOf(c.slug) === 0}
                      onClick={() =>
                        setConfig({
                          ...config,
                          facultySlugs: move(
                            config.facultySlugs,
                            config.facultySlugs.indexOf(c.slug),
                            -1,
                          ),
                        })
                      }
                      className="p-2 disabled:opacity-30"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${c.name} down`}
                      disabled={
                        config.facultySlugs.indexOf(c.slug) === config.facultySlugs.length - 1
                      }
                      onClick={() =>
                        setConfig({
                          ...config,
                          facultySlugs: move(
                            config.facultySlugs,
                            config.facultySlugs.indexOf(c.slug),
                            1,
                          ),
                        })
                      }
                      className="p-2 disabled:opacity-30"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${c.name} from exam`}
                      onClick={() => toggleFaculty(c.slug)}
                      className="p-2"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <details className="border-t border-blue-600/10 px-3 py-2 text-xs">
                    <summary className="cursor-pointer text-muted-foreground">
                      {Object.keys(config.facultyPrices[c.slug] ?? {}).length
                        ? "Custom price set for this faculty"
                        : "Use each plan’s standard price"}
                    </summary>
                    <div className="mt-2 space-y-2">
                      {pricedPlans.map((p) => (
                        <label key={p.id} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1">{p.name}</span>
                          <span className="text-muted-foreground">{p.currency}</span>
                          <input
                            inputMode="numeric"
                            aria-label={`${c.name} ${p.name} monthly price`}
                            placeholder={String(p.price)}
                            value={config.facultyPrices[c.slug]?.[p.id] ?? ""}
                            onChange={(e) => setFacultyPrice(c.slug, p.id, e.target.value)}
                            className="min-h-9 w-24 rounded-lg border border-border bg-background px-2 text-right"
                          />
                        </label>
                      ))}
                      <p className="text-muted-foreground">
                        Per month. Leave blank for the standard price. Students see this after they
                        sign in and their faculty is confirmed.
                      </p>
                    </div>
                  </details>
                </div>
              ))}
            </div>
            {config.facultySlugs
              .filter((slug) => !communities.some((c) => c.slug === slug))
              .map((slug) => (
                <div
                  key={slug}
                  className="mt-2 flex items-center justify-between rounded-lg bg-amber-500/10 p-3 text-xs"
                >
                  <span>Unavailable faculty: {slug}</span>
                  <button type="button" onClick={() => toggleFaculty(slug)} className="underline">
                    Remove
                  </button>
                </div>
              ))}
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Payment plans</legend>
            <p className="mb-3 text-xs text-muted-foreground">
              Leave all unchecked to use every active individual plan. Set each plan’s monthly price
              right here.
            </p>
            {plans
              .filter(
                (p) => p.productType === "individual" && p.billingType === "monthly" && p.price > 0,
              )
              .map((p) => (
                <div key={p.id} className="mb-2 flex items-center gap-3 text-sm">
                  <label className="flex min-w-0 flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={config.planIds.includes(p.id)}
                      onChange={() =>
                        setConfig({
                          ...config,
                          planIds: config.planIds.includes(p.id)
                            ? config.planIds.filter((id) => id !== p.id)
                            : [...config.planIds, p.id],
                        })
                      }
                      className="size-4 accent-blue-600"
                    />
                    {p.name}
                  </label>
                  <PlanPriceEditor plan={p} onError={setError} onSaved={setMessage} />
                </div>
              ))}
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Payment durations</legend>
            <div className="flex gap-5">
              {([1, 3] as const).map((period) => (
                <label key={period} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={config.billingMonths.includes(period)}
                    disabled={
                      config.billingMonths.length === 1 && config.billingMonths.includes(period)
                    }
                    onChange={() =>
                      setConfig({
                        ...config,
                        billingMonths: config.billingMonths.includes(period)
                          ? config.billingMonths.filter((m) => m !== period)
                          : [...config.billingMonths, period].sort(),
                      })
                    }
                    className="size-4 accent-blue-600"
                  />
                  {period} {period === 1 ? "month" : "months"}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setBillingOpen(true)}
              className="mt-3 inline-block text-sm text-blue-600 underline underline-offset-4"
            >
              Edit prices, plan features & payment QR
            </button>
          </fieldset>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={`/prepare/${slug}`} className="text-blue-600 underline underline-offset-4">
              Preview preparation flow ↗
            </Link>
            <Link href={`/payment/${slug}`} className="text-blue-600 underline underline-offset-4">
              Exam payment page ↗
            </Link>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Student journey</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Landing page → {config.askQuestions ? "onboarding questions → " : ""}supported
              faculties → payment plans → sign in → payment QR → app
            </p>
          </div>
          <label className="flex items-start gap-3 rounded-xl bg-muted/50 p-3 text-sm">
            <input
              type="checkbox"
              checked={config.askQuestions}
              onChange={(e) => {
                setMessage("");
                setConfig({ ...config, askQuestions: e.target.checked });
              }}
              className="mt-0.5 size-4 accent-blue-600"
            />
            <span>
              <span className="block font-medium">Ask onboarding questions first</span>
              <span className="text-xs text-muted-foreground">
                Off: this website’s buttons open the faculty list straight away.
              </span>
            </span>
          </label>
          {config.askQuestions ? (
            <p className="text-xs text-muted-foreground">
              Questions are asked before faculties and payment. Put one answer option on each line.
            </p>
          ) : null}
          {(config.askQuestions ? config.questions : []).map((q, index) => (
            <fieldset key={q.id} className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  Question {index + 1}
                </span>
                <div className="ml-auto flex gap-1">
                  <button
                    type="button"
                    aria-label={`Move question ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() =>
                      setConfig({ ...config, questions: move(config.questions, index, -1) })
                    }
                    className="p-2 disabled:opacity-30"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move question ${index + 1} down`}
                    disabled={index === config.questions.length - 1}
                    onClick={() =>
                      setConfig({ ...config, questions: move(config.questions, index, 1) })
                    }
                    className="p-2 disabled:opacity-30"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
                <button
                  aria-label={`Remove question ${index + 1}`}
                  type="button"
                  disabled={config.questions.length === 1}
                  onClick={() =>
                    setConfig({
                      ...config,
                      questions: config.questions.filter((item) => item.id !== q.id),
                    })
                  }
                  className="rounded-md p-2 hover:bg-muted disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                aria-label={`Question ${index + 1}`}
                value={q.prompt}
                maxLength={180}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    questions: config.questions.map((item) =>
                      item.id === q.id ? { ...item, prompt: e.target.value } : item,
                    ),
                  })
                }
                className={inputClass}
              />
              <textarea
                aria-label={`Answer options for question ${index + 1}`}
                value={q.options.join("\n")}
                rows={3}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    questions: config.questions.map((item) =>
                      item.id === q.id ? { ...item, options: e.target.value.split("\n") } : item,
                    ),
                  })
                }
                className={inputClass}
              />
            </fieldset>
          ))}
          {config.askQuestions ? (
            <button
              type="button"
              disabled={config.questions.length >= 8}
              onClick={() =>
                setConfig({
                  ...config,
                  questions: [
                    ...config.questions,
                    { id: `question_${Date.now()}`, prompt: "", options: ["", ""] },
                  ],
                })
              }
              className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 disabled:opacity-40"
            >
              <Plus size={14} />
              Add question
            </button>
          ) : null}
        </div>
        <details className="rounded-xl border border-border lg:col-span-2">
          <summary className="cursor-pointer p-4 text-sm font-semibold">
            Student journey text & buttons
          </summary>
          <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-2">
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Customize each exam’s onboarding, faculty preview, sign-in and checkout text. Use
              &#123;exam&#125; to insert the exam name.
            </p>
            {Object.entries(config.copy).map(([key, value]) => (
              <label key={key} className="text-sm">
                <span className="capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                <textarea
                  aria-label={key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (letter) => letter.toUpperCase())}
                  required
                  maxLength={400}
                  rows={key.includes("Description") ? 3 : 2}
                  value={value}
                  onChange={(e) =>
                    setConfig({ ...config, copy: { ...config.copy, [key]: e.target.value } })
                  }
                  className={`${inputClass} mt-1`}
                />
              </label>
            ))}
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={pending}
            className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save exam setup"}
          </button>
          <span className="text-xs text-muted-foreground">
            Setup changes take effect when saved; hidden websites stay hidden.
          </span>
        </div>
        <div className="border-t border-border pt-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <LockKeyhole size={16} />
              Student faculty locks
            </h3>
            <button
              type="button"
              onClick={() => void loadStudents()}
              disabled={pending}
              className="min-h-10 rounded-lg border border-border px-3 text-sm"
            >
              Load students
            </button>
          </div>
          {students ? (
            <div className="mt-3 space-y-3">
              {students.length ? (
                students.map((s) => (
                  <div
                    key={s.userId}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-40 flex-1">
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.facultyName}</p>
                    </div>
                    <select
                      aria-label={`Change faculty for ${s.name}`}
                      value={facultyChanges[s.userId] || s.facultyId}
                      onChange={(e) =>
                        setFacultyChanges({ ...facultyChanges, [s.userId]: e.target.value })
                      }
                      className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm"
                    >
                      {communities
                        .filter((c) => config.facultySlugs.includes(c.slug))
                        .map((c) => (
                          <option key={c.slug} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={pending || !facultyChanges[s.userId]}
                      onClick={() => void changeFaculty(s)}
                      className="min-h-10 rounded-lg bg-foreground px-3 text-sm text-background disabled:opacity-40"
                    >
                      Change & lock
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No students have selected a faculty for this exam yet.
                </p>
              )}
            </div>
          ) : null}
        </div>
        {message ? (
          <p role="status" className="text-sm text-emerald-600 lg:col-span-2">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-600 lg:col-span-2">
            {error}
          </p>
        ) : null}
      </div>
      {billingOpen ? <AdminExamBillingDialog onClose={() => setBillingOpen(false)} /> : null}
    </details>
  );
}

/** Edits one plan's monthly price in place; the plan's other fields are sent back unchanged. */
function PlanPriceEditor({
  plan,
  onError,
  onSaved,
}: {
  plan: SubscriptionPlan;
  onError: (message: string) => void;
  onSaved: (message: string) => void;
}) {
  const [saved, setSaved] = useState(plan.price);
  const [value, setValue] = useState(String(plan.price));
  const [pending, setPending] = useState(false);
  const price = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(price) && price > 0;
  async function save() {
    if (!valid || price === saved) return;
    setPending(true);
    onError("");
    try {
      const response = await fetch(`/api/admin/subscriptions/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: plan.name,
          slug: plan.slug,
          credits: plan.credits,
          price,
          currency: plan.currency,
          billingType: plan.billingType,
          isActive: plan.isActive,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save the price.");
      setSaved(price);
      onSaved(`${plan.name} is now ${plan.currency} ${price} a month.`);
    } catch (cause) {
      onError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <span className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{plan.currency}</span>
      <input
        aria-label={`${plan.name} monthly price`}
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void save()}
        className="min-h-9 w-24 rounded-lg border border-border bg-background px-2 text-right text-sm"
      />
      {valid && price !== saved ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => void save()}
          className="min-h-9 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      ) : null}
    </span>
  );
}
