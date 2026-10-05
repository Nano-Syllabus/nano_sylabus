"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GraduationCap,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { EnrollmentExam, StudentExamEnrollment } from "@/lib/data/exam-enrollment";
import { examText, examBillingMonths, type ExamIntent } from "@/lib/exam-enrollment";
import type { PaymentMethodConfig, SubscriptionPlan } from "@/lib/types";
import { FacultySelectionDialog } from "@/components/faculty-selection-dialog";
import { PaymentSubmissionModal, type CheckoutInvoice } from "@/components/billing-page-client";

const actionClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40";

function FlowFrame({
  exam,
  active,
  children,
}: {
  exam: EnrollmentExam;
  active: number;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5">
          <Link
            href={exam.slug === "main" ? "/" : `/sites/${exam.slug}`}
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-text-primary text-bg-primary">
              n.
            </span>
            Nano Syllabus
          </Link>
          <span className="rounded-full border border-border px-3 py-1.5 text-xs font-medium">
            {exam.name}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8 sm:py-14">
        <ol aria-label="Preparation progress" className="mb-10 grid grid-cols-3 gap-3">
          {["Your preparation", "Supported faculties", "Your plan"].map((label, index) => (
            <li
              key={label}
              aria-current={active === index ? "step" : undefined}
              className={`border-t-2 pt-3 text-xs sm:text-sm ${active >= index ? "border-blue-600 text-text-primary" : "border-border text-text-muted"}`}
            >
              <span
                className={`mr-2 inline-grid size-6 place-items-center rounded-full text-xs ${active > index ? "bg-blue-600 text-white" : "bg-bg-secondary"}`}
              >
                {active > index ? <Check size={12} /> : `0${index + 1}`}
              </span>
              {label}
            </li>
          ))}
        </ol>
        {children}
        <p className="mt-10 flex items-center justify-center gap-2 text-xs text-text-muted">
          <ShieldCheck size={14} />
          Your exam. Your faculty. One focused study space.
        </p>
      </main>
    </div>
  );
}

export function ExamPreparationFlow({
  exam,
  plans,
  initialStep = 0,
  initialIntent,
}: {
  exam: EnrollmentExam;
  plans: SubscriptionPlan[];
  initialStep?: 0 | 1 | 2;
  initialIntent?: ExamIntent | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [answers, setAnswers] = useState<Record<string, string>>(initialIntent?.answers || {});
  const durations = examBillingMonths(exam.config);
  const [months, setMonths] = useState<1 | 3>(
    initialIntent && durations.includes(initialIntent.billingMonths)
      ? initialIntent.billingMonths
      : durations[0],
  );
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const complete = exam.config.questions.every((q) => q.options.includes(answers[q.id]));
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`exam-preparation:${exam.slug}`) || "null");
      if (saved && typeof saved === "object") setAnswers((current) => ({ ...saved, ...current }));
    } catch {
      /* A stale draft starts fresh. */
    }
  }, [exam.slug]);

  function continueQuestions() {
    try {
      sessionStorage.setItem(`exam-preparation:${exam.slug}`, JSON.stringify(answers));
    } catch {
      /* The current form remains usable. */
    }
    setStep(1);
  }
  function continueFaculties() {
    if (!complete) {
      setStep(0);
      return;
    }
    router.push(`/payment/${exam.slug}`);
  }
  async function choosePlan(plan: SubscriptionPlan) {
    if (!complete) {
      setStep(0);
      return;
    }
    setPending(plan.id);
    setError("");
    try {
      const response = await fetch(`/api/exam-enrollment/${exam.slug}/intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examSlug: exam.slug,
          planId: plan.id,
          billingMonths: months,
          answers,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not prepare your plan.");
      router.push(`/login?next=${encodeURIComponent(result.next)}`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending("");
    }
  }

  return (
    <FlowFrame exam={exam} active={step}>
      {step === 0 ? (
        <div className="mx-auto max-w-2xl">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-600">
            <Sparkles size={14} />A plan that fits your day
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {examText(exam.config.copy.onboardingTitle, exam.name)}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-text-secondary">
            {examText(exam.config.copy.onboardingDescription, exam.name)}
          </p>
          <form
            className="mt-8 space-y-7"
            onSubmit={(e) => {
              e.preventDefault();
              if (complete) continueQuestions();
            }}
          >
            {exam.config.questions.map((q, index) => (
              <fieldset key={q.id}>
                <legend className="mb-3 text-sm font-semibold">
                  <span className="mr-2 text-text-muted">0{index + 1}</span>
                  {q.prompt}
                </legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {q.options.map((option) => (
                    <label
                      key={option}
                      className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm transition ${answers[q.id] === option ? "border-blue-600 bg-blue-600/5 ring-1 ring-blue-600" : "border-border hover:bg-bg-secondary"}`}
                    >
                      <input
                        required
                        type="radio"
                        name={q.id}
                        value={option}
                        checked={answers[q.id] === option}
                        onChange={() => setAnswers({ ...answers, [q.id]: option })}
                        className="accent-blue-600"
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <button className={`${actionClass} w-full`} disabled={!complete}>
              {examText(exam.config.copy.exploreButton, exam.name)}
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      ) : null}
      {step === 1 ? (
        <div>
          <div className="mx-auto mb-8 max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
              One exam. More ways to prepare.
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {examText(exam.config.copy.facultiesTitle, exam.name)}
            </h1>
            <p className="mt-3 text-text-secondary">
              {examText(exam.config.copy.facultiesDescription, exam.name)}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {exam.faculties.map((faculty) => (
              <article
                key={faculty.id}
                className="flex flex-col rounded-2xl border border-border bg-bg-primary p-6 shadow-xs"
              >
                <span className="mb-4 grid size-11 place-items-center rounded-xl bg-blue-600/10 text-blue-600">
                  <GraduationCap size={24} />
                </span>
                <h2 className="text-lg font-semibold">{faculty.name}</h2>
                <p className="mt-1 text-sm text-text-muted">
                  {faculty.faculty} {faculty.university ? `· ${faculty.university}` : ""}
                </p>
                <details className="mt-5 border-t border-border pt-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    {faculty.subjects.length} published subjects
                  </summary>
                  <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                    {faculty.subjects.map((subject) => (
                      <li key={subject.id} className="flex items-center gap-2">
                        <Check size={12} className="text-blue-600" />
                        {subject.name}
                      </li>
                    ))}
                    {!faculty.subjects.length ? (
                      <li>Subjects will appear as your faculty publishes them.</li>
                    ) : null}
                  </ul>
                </details>
              </article>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="min-h-12 px-5 text-sm font-medium"
            >
              <ArrowLeft className="mr-2 inline" size={16} />
              Questions
            </button>
            <button
              type="button"
              onClick={continueFaculties}
              disabled={!exam.faculties.length}
              className={actionClass}
            >
              {complete ? "Continue to payment plans" : "Answer questions & continue"}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : null}
      {step === 2 ? (
        <div>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
              Invest in your next step
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {examText(exam.config.copy.paymentTitle, exam.name)}
            </h1>
            <p className="mt-3 text-text-secondary">
              {examText(exam.config.copy.paymentDescription, exam.name)}
            </p>
            <div className="mx-auto mt-6 inline-flex gap-1 rounded-xl border border-border bg-bg-secondary p-1">
              {durations.map((period) => (
                <button
                  key={period}
                  type="button"
                  aria-pressed={months === period}
                  onClick={() => setMonths(period)}
                  className={`min-h-10 rounded-lg px-5 text-sm font-medium ${months === period ? "bg-bg-primary shadow-sm" : "text-text-muted"}`}
                >
                  {period} {period === 1 ? "month" : "months"}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {plans.map((plan, index) => (
              <article
                key={plan.id}
                className={`relative flex flex-col rounded-3xl border p-7 sm:p-8 ${index === plans.length - 1 ? "border-blue-600 bg-blue-600/5" : "border-border"}`}
              >
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                <p className="mt-5 text-4xl font-semibold tracking-tight">
                  <span className="mr-2 text-sm font-medium text-text-muted">{plan.currency}</span>
                  {(plan.price * months).toLocaleString()}
                  <span className="ml-2 text-sm font-normal text-text-muted">
                    / {months} {months === 1 ? "month" : "months"}
                  </span>
                </p>
                <p className="mt-3 text-sm text-text-secondary">
                  {plan.isUnlimited
                    ? "Unlimited learning and exam practice"
                    : "Focused study, one topic at a time"}
                </p>
                <ul className="my-6 flex-1 space-y-3 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check size={16} className="mt-0.5 shrink-0 text-blue-600" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={Boolean(pending)}
                  onClick={() => void choosePlan(plan)}
                  className={`${actionClass} w-full`}
                >
                  {pending === plan.id
                    ? "Preparing your plan…"
                    : examText(exam.config.copy.signInButton, exam.name)}
                  <ArrowRight size={16} />
                </button>
              </article>
            ))}
          </div>
          {!plans.length ? (
            <p
              role="status"
              className="mt-8 rounded-xl border border-border p-6 text-center text-text-secondary"
            >
              Payment plans are being prepared for this exam. Please check again soon.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-5 text-center text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setStep(1)}
            className="mt-6 min-h-10 text-sm text-text-secondary"
          >
            <ArrowLeft className="mr-2 inline" size={14} />
            Back to faculties
          </button>
        </div>
      ) : null}
    </FlowFrame>
  );
}

export function ExamCheckout({
  exam,
  plans,
  intent,
  enrollment,
  paymentConfig,
}: {
  exam: EnrollmentExam;
  plans: SubscriptionPlan[];
  intent: ExamIntent | null;
  enrollment: StudentExamEnrollment | null;
  paymentConfig: PaymentMethodConfig | null;
}) {
  const router = useRouter();
  const [facultyId, setFacultyId] = useState(enrollment?.facultyId || "");
  const [planId, setPlanId] = useState(
    plans.some((p) => p.id === intent?.planId) ? intent!.planId : plans[0]?.id || "",
  );
  const durations = examBillingMonths(exam.config);
  const [months, setMonths] = useState<1 | 3>(
    intent && durations.includes(intent.billingMonths) ? intent.billingMonths : durations[0],
  );
  const [invoice, setInvoice] = useState<CheckoutInvoice | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const plan = plans.find((p) => p.id === planId);
  const faculty = exam.faculties.find((f) => f.id === facultyId);
  const wrongExam = enrollment && enrollment.examSlug !== exam.slug;
  async function openPayment() {
    if (!plan || !facultyId) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          billingMonths: months,
          paymentMethod: "bank_transfer",
          examSlug: exam.slug,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not open payment.");
      setInvoice({ ...result.invoice, plan, paymentSubmission: null });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <FlowFrame exam={exam} active={2}>
      {wrongExam ? (
        <div className="mx-auto max-w-xl rounded-3xl border border-border p-8">
          <h1 className="text-2xl font-semibold">Your study space is already set.</h1>
          <p className="mt-3 text-text-secondary">
            You’re enrolled in {enrollment.examName} · {enrollment.facultyName}. An admin can help
            you change exams.
          </p>
          <Link href={`/payment/${enrollment.examSlug}`} className={`${actionClass} mt-6`}>
            Open your exam payment
          </Link>
        </div>
      ) : (
        <div className="mx-auto max-w-xl rounded-3xl border border-border bg-bg-primary p-7 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
            You’re signed in
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {examText(exam.config.copy.checkoutTitle, exam.name)}
          </h1>
          <div className="mt-6 flex items-center gap-3 rounded-xl bg-bg-secondary p-4">
            <LockKeyhole size={20} className="text-blue-600" />
            <div>
              <p className="text-sm font-semibold">
                {faculty?.name || enrollment?.facultyName || "Choose your faculty to continue"}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Faculty stays locked across your study space.
              </p>
            </div>
          </div>
          <label className="mt-6 block text-sm font-medium">
            Your plan
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="mt-2 min-h-12 w-full rounded-xl border border-border bg-bg-primary px-3"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.currency} {p.price} / month
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 block text-sm font-medium">
            Duration
            <select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value) as 1 | 3)}
              className="mt-2 min-h-12 w-full rounded-xl border border-border bg-bg-primary px-3"
            >
              {durations.map((period) => (
                <option key={period} value={period}>
                  {period} {period === 1 ? "month" : "months"}
                </option>
              ))}
            </select>
          </label>
          <p className="my-6 flex items-center justify-between border-t border-border pt-5 text-sm">
            <span>Total</span>
            <strong className="text-2xl">
              {plan?.currency} {plan ? (plan.price * months).toLocaleString() : "—"}
            </strong>
          </p>
          <button
            type="button"
            disabled={!facultyId || !plan || pending || !paymentConfig}
            onClick={() => void openPayment()}
            className={`${actionClass} w-full`}
          >
            {pending ? "Preparing payment…" : examText(exam.config.copy.qrButton, exam.name)}
            <ArrowRight size={16} />
          </button>
          {!paymentConfig ? (
            <p className="mt-3 text-sm text-text-muted">
              The official payment QR is being configured. Please check again soon.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      )}
      {!enrollment && !facultyId ? (
        <FacultySelectionDialog
          exams={[exam]}
          initialExamSlug={exam.slug}
          initialAnswers={intent?.answers}
          onSelected={(_slug, id) => setFacultyId(id)}
        />
      ) : null}
      {invoice ? (
        <PaymentSubmissionModal
          invoice={invoice}
          paymentConfig={paymentConfig}
          onClose={() => setInvoice(null)}
          onSaved={() => {
            router.push("/app/challenges");
            router.refresh();
          }}
        />
      ) : null}
    </FlowFrame>
  );
}
