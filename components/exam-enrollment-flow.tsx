"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, GraduationCap, LockKeyhole, Sparkles } from "lucide-react";
import type { EnrollmentExam, StudentExamEnrollment } from "@/lib/data/exam-enrollment";
import {
  examText,
  examBillingMonths,
  examPlanMonthlyPrice,
  type ExamIntent,
} from "@/lib/exam-enrollment";
import type { PaymentMethodConfig, SubscriptionPlan } from "@/lib/types";
import { ExamFacultyBrowse } from "@/components/exam-faculty-browse";
import { FacultySelectionDialog } from "@/components/faculty-selection-dialog";
import { PaymentSubmissionModal, type CheckoutInvoice } from "@/components/billing-page-client";

const actionClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40";

export type FlowStep = "questions" | "faculties" | "plans";
/** The steps this exam's admin configured, in order: landing → questions → faculties → payment. */
export function examFlowSteps(exam: EnrollmentExam): FlowStep[] {
  return exam.config.askQuestions ? ["questions", "faculties", "plans"] : ["faculties", "plans"];
}

/**
 * The page around every step, styled like the main app's onboarding (/flow):
 * white page, logo and a Back link on top, one task per screen.
 */
function FlowFrame({
  exam,
  onBack,
  backLabel = "Back",
  wide = false,
  children,
}: {
  exam: EnrollmentExam;
  /** Omitted = Back returns to the exam's landing page. */
  onBack?: () => void;
  backLabel?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const landing = exam.slug === "main" ? "/" : `/sites/${exam.slug}`;
  const backClass =
    "inline-flex items-center gap-1.5 p-1 text-[13px] font-semibold text-[#777] transition hover:text-[#111]";
  return (
    <div className="min-h-screen bg-white text-[#111111] antialiased">
      <main className={`mx-auto px-6 py-10 sm:py-14 ${wide ? "max-w-5xl" : "max-w-[760px]"}`}>
        <div className="mb-6 flex items-center justify-between">
          <Link href={landing} className="flex items-center gap-2.5 no-underline">
            <Image
              src="/nanologo.png"
              alt=""
              width={26}
              height={26}
              className="h-[26px] w-[26px] rounded-lg object-contain"
            />
            <span className="text-[21px] font-extrabold tracking-[-0.7px] text-[#111111]">
              Nano Syllabus
            </span>
          </Link>
          {onBack ? (
            <button type="button" onClick={onBack} className={backClass}>
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </button>
          ) : (
            <Link href={landing} className={backClass}>
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
          )}
        </div>
        {children}
      </main>
    </div>
  );
}

/**
 * The pricing screen: the chosen faculty, the duration, and a card per plan with
 * that faculty's price. Used before sign-in (a plan button signs you in) and
 * after it (a plan button opens the payment QR), so it looks the same both times.
 */
function PricingView({
  facultyName,
  onChangeFaculty,
  durations,
  months,
  onMonths,
  plans,
  priceFor,
  highlightId,
  pendingId,
  actionLabel,
  onChoose,
  disabled,
  error,
  notice,
}: {
  facultyName?: string;
  /** Omitted = the faculty is locked and cannot be changed here. */
  onChangeFaculty?: () => void;
  durations: Array<1 | 3>;
  months: 1 | 3;
  onMonths: (months: 1 | 3) => void;
  plans: SubscriptionPlan[];
  priceFor: (plan: SubscriptionPlan) => number;
  highlightId?: string;
  pendingId?: string;
  actionLabel: (plan: SubscriptionPlan) => string;
  onChoose: (plan: SubscriptionPlan) => void;
  disabled?: boolean;
  error?: string;
  notice?: string;
}) {
  return (
    <div>
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Choose your plan</h1>
        {facultyName ? (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-bg-secondary py-1.5 pl-3 pr-3 text-sm">
            {onChangeFaculty ? (
              <GraduationCap size={16} className="text-blue-600" />
            ) : (
              <LockKeyhole size={16} className="text-blue-600" />
            )}
            <span className="font-semibold">{facultyName}</span>
            {onChangeFaculty ? (
              <button
                type="button"
                onClick={onChangeFaculty}
                className="-mr-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-600/10"
              >
                Change
              </button>
            ) : null}
          </p>
        ) : null}
        {durations.length > 1 ? (
          <div className="mx-auto mt-5 flex w-fit gap-1 rounded-xl border border-border bg-bg-secondary p-1">
            {durations.map((period) => (
              <button
                key={period}
                type="button"
                aria-pressed={months === period}
                onClick={() => onMonths(period)}
                className={`min-h-10 rounded-lg px-5 text-sm font-medium ${months === period ? "bg-bg-primary shadow-sm" : "text-text-muted"}`}
              >
                {period} {period === 1 ? "month" : "months"}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {plans.map((plan, index) => (
          <article
            key={plan.id}
            className={`relative flex flex-col rounded-3xl border p-7 sm:p-8 ${
              (highlightId ? highlightId === plan.id : index === plans.length - 1)
                ? "border-blue-600 bg-blue-600/5"
                : "border-border"
            }`}
          >
            <h2 className="text-xl font-semibold">{plan.name}</h2>
            <p className="mt-5 text-4xl font-semibold tracking-tight">
              <span className="mr-2 text-sm font-medium text-text-muted">{plan.currency}</span>
              {(priceFor(plan) * months).toLocaleString()}
              <span className="ml-2 text-sm font-normal text-text-muted">
                / {months} {months === 1 ? "month" : "months"}
              </span>
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
              disabled={disabled || Boolean(pendingId)}
              onClick={() => onChoose(plan)}
              className={`${actionClass} w-full`}
            >
              {pendingId === plan.id ? "Just a moment…" : actionLabel(plan)}
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
      {notice ? <p className="mt-5 text-center text-sm text-text-muted">{notice}</p> : null}
      {error ? (
        <p role="alert" className="mt-5 text-center text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ExamPreparationFlow({
  exam,
  plans,
  initialStep,
  initialIntent,
  appOrigin = "",
}: {
  exam: EnrollmentExam;
  plans: SubscriptionPlan[];
  initialStep?: FlowStep;
  initialIntent?: ExamIntent | null;
  /** Where sign-in lives: the main domain when this page is on a subdomain, else "". */
  appOrigin?: string;
}) {
  const router = useRouter();
  const flow = examFlowSteps(exam);
  const [step, setStep] = useState<FlowStep>(
    initialStep &&
      flow.includes(initialStep) &&
      (initialStep !== "plans" || initialIntent?.facultySlug)
      ? initialStep
      : flow[0],
  );
  const [answers, setAnswers] = useState<Record<string, string>>(initialIntent?.answers || {});
  const durations = examBillingMonths(exam.config);
  const [months, setMonths] = useState<1 | 3>(
    initialIntent && durations.includes(initialIntent.billingMonths)
      ? initialIntent.billingMonths
      : durations[0],
  );
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [facultySlug, setFacultySlug] = useState(
    exam.faculties.some((f) => f.slug === initialIntent?.facultySlug)
      ? initialIntent!.facultySlug!
      : "",
  );
  const chosenFaculty = exam.faculties.find((f) => f.slug === facultySlug);
  const complete =
    exam.config.askQuestions === false ||
    exam.config.questions.every((q) => q.options.includes(answers[q.id]));
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`exam-preparation:${exam.slug}`) || "null");
      if (saved && typeof saved === "object") setAnswers((current) => ({ ...saved, ...current }));
    } catch {
      /* A stale draft starts fresh. */
    }
  }, [exam.slug]);

  function continueQuestions(finalAnswers: Record<string, string>) {
    try {
      sessionStorage.setItem(`exam-preparation:${exam.slug}`, JSON.stringify(finalAnswers));
    } catch {
      /* The current form remains usable. */
    }
    setStep("faculties");
  }
  /** Picking an answer moves on, like the main app's questions. */
  function answerQuestion(questionId: string, option: string) {
    const next = { ...answers, [questionId]: option };
    setAnswers(next);
    window.setTimeout(() => {
      if (questionIndex >= exam.config.questions.length - 1) continueQuestions(next);
      else setQuestionIndex(questionIndex + 1);
    }, 180);
  }
  function continueFaculties() {
    if (!chosenFaculty) return;
    if (!complete) {
      setStep("questions");
      return;
    }
    router.push(`/payment/${exam.slug}`);
  }
  async function choosePlan(plan: SubscriptionPlan) {
    if (!complete) {
      setStep("questions");
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
          ...(facultySlug ? { facultySlug } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not prepare your plan.");
      // The choices travel in the link: a subdomain's cookie never reaches the
      // main domain, where sign-in and payment happen.
      const intent = {
        examSlug: exam.slug,
        planId: plan.id,
        billingMonths: months,
        answers,
        ...(facultySlug ? { facultySlug } : {}),
      };
      const next = `${result.next}?intent=${encodeURIComponent(JSON.stringify(intent))}`;
      const login = `${appOrigin}/login?next=${encodeURIComponent(next)}`;
      if (appOrigin) window.location.assign(login);
      else router.push(login);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending("");
    }
  }

  if (step === "faculties")
    return (
      <ExamFacultyBrowse
        title={examText(exam.config.copy.facultiesTitle, exam.name)}
        description={examText(exam.config.copy.facultiesDescription, exam.name)}
        landingHref={exam.slug === "main" ? "/" : `/sites/${exam.slug}`}
        faculties={exam.faculties}
        selectedSlug={facultySlug}
        onSelect={setFacultySlug}
        continueLabel={chosenFaculty ? `Continue as ${chosenFaculty.name}` : "Choose your faculty"}
        onContinue={continueFaculties}
        onBack={exam.config.askQuestions ? () => setStep("questions") : undefined}
        backLabel={exam.config.askQuestions ? "Questions" : "Home"}
      />
    );

  return (
    <FlowFrame
      exam={exam}
      wide={step !== "questions"}
      onBack={
        step === "questions"
          ? questionIndex > 0
            ? () => setQuestionIndex(questionIndex - 1)
            : undefined
          : () => setStep("faculties")
      }
      backLabel={step === "questions" && questionIndex === 0 ? "Home" : "Back"}
    >
      {step === "questions" ? (
        <section aria-live="polite">
          {(() => {
            const total = exam.config.questions.length;
            const question = exam.config.questions[Math.min(questionIndex, total - 1)];
            return (
              <>
                <div className="flex items-center justify-between text-[13px] text-[#777]">
                  <span>{examText(exam.config.copy.onboardingTitle, exam.name)}</span>
                  <span>
                    {questionIndex + 1} / {total}
                  </span>
                </div>
                <div className="mt-2.5 h-[7px] w-full overflow-hidden rounded-[20px] bg-[#eee]">
                  <div
                    className="h-full rounded-[20px] bg-[#6195ee] transition-all duration-300"
                    style={{ width: `${Math.round(((questionIndex + 1) / total) * 100)}%` }}
                  />
                </div>
                <div className="mt-12 sm:mt-14">
                  <h1 className="m-0 text-[34px] font-[760] leading-[1.15] tracking-[-1.5px] text-[#111111] sm:text-[38px]">
                    {question.prompt}
                  </h1>
                  <p className="mb-7 mt-2.5 text-[15px] text-[#777]">
                    There is no right answer. Choose what is closest to your situation.
                  </p>
                  <div className="grid gap-2.5">
                    {question.options.map((option) => {
                      const selected = answers[question.id] === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => answerQuestion(question.id, option)}
                          aria-pressed={selected}
                          className={`flex cursor-pointer items-center justify-between rounded-[14px] border p-[17px] text-left text-[15px] font-medium transition active:scale-[0.99] ${
                            selected
                              ? "border-[#6195ee] bg-[#f7faff] text-[#111]"
                              : "border-[#ddd] bg-white text-[#111] hover:border-[#6195ee] hover:bg-[#f7faff]"
                          }`}
                        >
                          <span>{option}</span>
                          <span
                            className={`h-[18px] w-[18px] shrink-0 rounded-full border transition ${
                              selected ? "border-[5px] border-[#6195ee] bg-white" : "border-[#aaa]"
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            );
          })()}
        </section>
      ) : null}
      {step === "plans" ? (
        <PricingView
          facultyName={chosenFaculty?.name}
          onChangeFaculty={() => setStep("faculties")}
          durations={durations}
          months={months}
          onMonths={setMonths}
          plans={plans}
          priceFor={(plan) => examPlanMonthlyPrice(exam.config, facultySlug, plan)}
          pendingId={pending}
          actionLabel={() => examText(exam.config.copy.signInButton, exam.name)}
          onChoose={(plan) => void choosePlan(plan)}
          error={error}
        />
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
  const intentFaculty = exam.faculties.find((f) => f.slug === intent?.facultySlug);
  const [facultyId, setFacultyId] = useState(enrollment?.facultyId || intentFaculty?.id || "");
  // Joined at "Find your faculty" before sign-in: lock it now, without asking again.
  const [lock, setLock] = useState<"idle" | "joining" | "failed">(
    !enrollment && intentFaculty && intent ? "joining" : "idle",
  );
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
  useEffect(() => {
    if (lock !== "joining" || !intentFaculty || !intent) return;
    let cancelled = false;
    fetch("/api/student/exam-enrollment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        examSlug: exam.slug,
        facultyId: intentFaculty.id,
        answers: intent.answers,
      }),
    })
      .then((response) => {
        if (cancelled) return;
        if (!response.ok) throw new Error("Could not lock your faculty.");
        setLock("idle");
        router.refresh();
      })
      .catch(() => !cancelled && setLock("failed"));
    return () => {
      cancelled = true;
    };
  }, [lock, intentFaculty, intent, exam.slug, router]);
  const plan = plans.find((p) => p.id === planId);
  // Signed in with a plan already chosen: the payment QR comes first, no extra clicks.
  const autoOpened = useRef(false);
  const faculty = exam.faculties.find((f) => f.id === facultyId);
  const monthly = (p: SubscriptionPlan) => examPlanMonthlyPrice(exam.config, faculty?.slug, p);
  const wrongExam = enrollment && enrollment.examSlug !== exam.slug;
  async function openPayment(target: SubscriptionPlan | undefined = plan) {
    if (!target || !facultyId) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: target.id,
          billingMonths: months,
          paymentMethod: "bank_transfer",
          examSlug: exam.slug,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not open payment.");
      setInvoice({ ...result.invoice, plan: target, paymentSubmission: null });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    if (autoOpened.current || invoice || wrongExam) return;
    // Only when the student arrives with a plan from the subdomain, with their faculty locked.
    if (!enrollment || !intent || !plan || !paymentConfig) return;
    autoOpened.current = true;
    void openPayment();
    // openPayment reads the same state this effect is keyed on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollment, intent, plan, paymentConfig, invoice, wrongExam]);

  return (
    <FlowFrame exam={exam} wide>
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
        <PricingView
          facultyName={
            lock === "joining"
              ? `Joining ${intentFaculty?.name}…`
              : faculty?.name || enrollment?.facultyName
          }
          durations={durations}
          months={months}
          onMonths={setMonths}
          plans={plans}
          priceFor={monthly}
          highlightId={planId}
          pendingId={pending ? planId : undefined}
          actionLabel={(p) => `Pay ${p.currency} ${(monthly(p) * months).toLocaleString()}`}
          onChoose={(p) => {
            setPlanId(p.id);
            void openPayment(p);
          }}
          disabled={!facultyId || lock === "joining" || !paymentConfig}
          notice={
            !paymentConfig
              ? "The official payment QR is being configured. Please check again soon."
              : undefined
          }
          error={error}
        />
      )}
      {!enrollment && (!facultyId || lock === "failed") && lock !== "joining" ? (
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
