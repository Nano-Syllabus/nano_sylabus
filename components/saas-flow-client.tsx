"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Copy,
  Lock,
  Mail,
  User,
  ArrowLeft,
  Lightbulb,
} from "lucide-react";
import { loadSupabaseBrowserClient } from "@/lib/supabase/browser-lazy";
import { getGoogleAuthRedirectUrl, setOAuthNextCookie } from "@/lib/auth-redirect";
import {
  hasCompletedStudyDiagnostic,
  PENDING_STUDY_ANSWERS_KEY,
  readPendingStudyAnswers,
  saveStudyDiagnostic,
  STUDY_DIAGNOSTIC_QUESTION_COUNT,
  STUDY_DIAGNOSTIC_STARTED_KEY,
  type StudyAnswer,
} from "@/lib/study-diagnostic";
import { cn } from "@/lib/utils";
import { forgetCommunityScopedCaches } from "@/lib/query/membership";
import type { PaymentMethodConfig, SubscriptionPlan } from "@/lib/types";

type CheckoutInvoice = {
  id: string;
  planId: string;
  status: string;
  amount: number;
  subtotal: number;
  currency: string;
  invoiceCode: string;
  expiresAt: string;
};

export type FlowStep =
  | "systemSlide"
  | "q1"
  | "q2"
  | "q3"
  | "q4"
  | "q5"
  | "solutionSlide"
  | "login"
  | "pricing"
  | "checkout1"
  | "groupCheckout"
  | "paymentPending";

const PAYMENT_FLOW_ENABLED = false;
const PAYMENT_FLOW_STEPS = new Set<FlowStep>([
  "pricing",
  "checkout1",
  "groupCheckout",
  "paymentPending",
]);
const FLOW_STEPS = new Set<FlowStep>([
  "systemSlide",
  "q1",
  "q2",
  "q3",
  "q4",
  "q5",
  "solutionSlide",
  "login",
  ...PAYMENT_FLOW_STEPS,
]);

function resolveInitialStep(value: string | null): FlowStep {
  const requested = value as FlowStep | null;
  if (!requested || !FLOW_STEPS.has(requested)) return "q1";
  if (!PAYMENT_FLOW_ENABLED && PAYMENT_FLOW_STEPS.has(requested)) return "q1";
  return requested;
}

export type UserAnswer = StudyAnswer;

function clearPendingStudyAnswers() {
  try {
    sessionStorage.removeItem(PENDING_STUDY_ANSWERS_KEY);
  } catch {
    // Local cleanup must not block navigation after the account save succeeds.
  }
}

async function joinRequestedCommunity(communitySlug?: string | null) {
  if (!communitySlug) return;
  try {
    const response = await fetch(`/api/communities/${encodeURIComponent(communitySlug)}/join`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    if (response.ok) forgetCommunityScopedCaches();
  } catch {
    // Non-blocking if already joined or offline
  }
}

const QUESTIONS = [
  {
    id: 1,
    title: "Do you study hard but still get disappointing marks?",
    options: ["Yes", "Sometimes", "No"],
  },
  {
    id: 2,
    title: "Do you understand a topic today, then forget it in the exam?",
    options: ["Yes", "Sometimes", "No"],
  },
  {
    id: 3,
    title: "In the exam, can you remember every formula and step you need?",
    options: ["Yes", "Sometimes", "No"],
  },
  {
    id: 4,
    title: "Do unseen questions make you freeze even when you studied the topic?",
    options: ["Yes", "Sometimes", "No"],
  },
  {
    id: 5,
    title: "Do you run out of time to practise enough past question papers?",
    options: ["Yes", "Sometimes", "No"],
  },
];

const UNIVERSITY_PASS_RATES = [
  { rate: "30.1%", university: "Tribhuvan University", value: "30.1%" },
  { rate: "40.1%", university: "Far Western University", value: "40.1%" },
  { rate: "44.7%", university: "Mid-Western University", value: "44.7%" },
  { rate: "45%", university: "Pokhara University", value: "45%" },
];

export function SaaSFlowClient({
  initialUser = null,
  completionDestination = "/app/today",
}: {
  initialUser?: { id: string; email?: string; fullName?: string } | null;
  completionDestination?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialStep = resolveInitialStep(searchParams.get("step"));
  const [currentStep, setCurrentStep] = useState<FlowStep>(initialStep);
  const [answers, setAnswers] = useState<Record<number, UserAnswer>>({});

  // Auth state (only used at login step)
  const [user, setUser] = useState(initialUser);
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [resumingDiagnostic, setResumingDiagnostic] = useState(
    Boolean(initialUser && searchParams.get("resumeDiagnostic") === "1"),
  );
  const [checkingPriorStart, setCheckingPriorStart] = useState(
    searchParams.get("resumeDiagnostic") !== "1",
  );
  const googleAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";

  // Signed-out users have no account metadata yet. Keep a durable browser marker
  // so returning through another community card does not restart this one-time funnel.
  useEffect(() => {
    if (searchParams.get("resumeDiagnostic") === "1") {
      setCheckingPriorStart(false);
      return;
    }

    let previouslyStarted = false;
    try {
      previouslyStarted = localStorage.getItem(STUDY_DIAGNOSTIC_STARTED_KEY) === "1";
    } catch {
      // Storage may be unavailable in a hardened browser; account metadata still works.
    }

    if (!previouslyStarted) {
      setCheckingPriorStart(false);
      return;
    }

    if (initialUser) {
      router.replace(completionDestination);
    } else {
      const community = searchParams.get("community");
      const nextPath = community
        ? `/communities/${encodeURIComponent(community)}/join`
        : completionDestination;
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
    }
  }, [completionDestination, initialUser, router, searchParams]);

  // OAuth leaves the page before an account exists. Recover that one pending
  // submission, save it to the signed-in account, then discard the local copy.
  useEffect(() => {
    if (!initialUser || searchParams.get("resumeDiagnostic") !== "1") return;
    let cancelled = false;
    async function resume() {
      try {
        const pending = readPendingStudyAnswers(sessionStorage.getItem(PENDING_STUDY_ANSWERS_KEY));
        if (!pending) return;
        setAnswers(pending);
        setCurrentStep("solutionSlide");
        await saveStudyDiagnostic(await loadSupabaseBrowserClient(), pending);
        const community = searchParams.get("community");
        if (community) await joinRequestedCommunity(community);
        if (cancelled) return;
        clearPendingStudyAnswers();
        router.replace(completionDestination);
        router.refresh();
      } catch {
        if (!cancelled) setAuthError("Could not save your study answers. Please try again.");
      } finally {
        if (!cancelled) setResumingDiagnostic(false);
      }
    }
    void resume();
    return () => {
      cancelled = true;
    };
  }, [initialUser, searchParams, completionDestination, router]);

  const finishStudyFlow = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      const completed = await saveStudyDiagnostic(await loadSupabaseBrowserClient(), answers);
      if (!completed) {
        setCurrentStep("q1");
        return;
      }
      clearPendingStudyAnswers();
      const community = searchParams.get("community");
      if (community) await joinRequestedCommunity(community);
      if (PAYMENT_FLOW_ENABLED) {
        setCurrentStep("pricing");
      } else {
        router.replace(completionDestination);
        router.refresh();
      }
    } catch {
      setAuthError("Could not save your study answers. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const continueWithGoogle = async () => {
    if (!googleAuthEnabled) {
      setAuthError("Google sign-in is not enabled in this environment.");
      return;
    }

    setAuthError("");
    setGoogleLoading(true);
    try {
      if (hasCompletedStudyDiagnostic(answers)) {
        sessionStorage.setItem(
          PENDING_STUDY_ANSWERS_KEY,
          JSON.stringify({
            answers,
            expiresAt: Date.now() + 30 * 60 * 1000,
          }),
        );
      } else {
        clearPendingStudyAnswers();
      }
      const resumeParams = new URLSearchParams({ resumeDiagnostic: "1" });
      const community = searchParams.get("community");
      if (community) resumeParams.set("community", community);
      setOAuthNextCookie(`/flow?${resumeParams}`);

      const supabase = await loadSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: getGoogleAuthRedirectUrl() },
      });
      if (error) throw error;
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : "Could not start Google sign-in. Please try again.",
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  // Real checkout state
  const [copiedInvoice, setCopiedInvoice] = useState(false);
  const [checkoutInvoice, setCheckoutInvoice] = useState<CheckoutInvoice | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionPlan | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentMethodConfig | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentPayerName, setPaymentPayerName] = useState(initialUser?.fullName ?? "");
  const [paymentReceipt, setPaymentReceipt] = useState<File | null>(null);
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // Group checkout state
  const [groupName, setGroupName] = useState("");
  const [groupEmail, setGroupEmail] = useState("");
  const [studentEmails, setStudentEmails] = useState("");

  const invoiceNumber = checkoutInvoice?.invoiceCode ?? "Invoice generated at checkout";

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  useEffect(() => {
    if (!PAYMENT_FLOW_ENABLED && PAYMENT_FLOW_STEPS.has(currentStep)) {
      router.replace("/app/today");
    }
  }, [currentStep, router]);

  /**
   * The funnel counts as started only once the student commits with "Start your
   * first challenge", not on their first answer: someone who answers a question
   * and leaves can still come back to the questions. Signed-in students also get
   * `study_diagnostic_started` on their account from `saveStudyDiagnostic`.
   */
  const markFunnelStarted = () => {
    try {
      localStorage.setItem(STUDY_DIAGNOSTIC_STARTED_KEY, "1");
    } catch {
      // Storage may be unavailable in a hardened browser; account metadata still works.
    }
  };

  const handleSelectAnswer = (qNum: number, optIndex: number, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [qNum]: { questionIndex: qNum, optionIndex: optIndex, text },
    }));

    setTimeout(() => {
      if (qNum === 3) {
        setCurrentStep("q4");
      } else if (qNum === STUDY_DIAGNOSTIC_QUESTION_COUNT) {
        setCurrentStep("systemSlide");
      } else {
        const nextQ = `q${qNum + 1}` as FlowStep;
        setCurrentStep(nextQ);
      }
    }, 220);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    const supabase = await loadSupabaseBrowserClient();

    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: {
            data: {
              full_name: authName || "Student",
              ...(hasCompletedStudyDiagnostic(answers)
                ? { study_answers: answers, study_diagnostic_started: true }
                : {}),
            },
          },
        });

        if (error) throw error;
        if (data.user) {
          setUser({
            id: data.user.id,
            email: data.user.email,
            fullName: authName || "Student",
          });
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });

        if (error) throw error;
        if (data.user) {
          setUser({
            id: data.user.id,
            email: data.user.email,
            fullName: data.user.user_metadata?.full_name || "Student",
          });
          const completed = await saveStudyDiagnostic(supabase, answers);
          if (!completed) {
            setCurrentStep("q1");
            return;
          }
        }
      }

      const community = searchParams.get("community");
      if (community) await joinRequestedCommunity(community);

      if (PAYMENT_FLOW_ENABLED) {
        setCurrentStep("pricing");
      } else {
        router.replace(completionDestination);
        router.refresh();
      }
    } catch (err: any) {
      setAuthError(err?.message || "Authentication failed. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  async function createCheckoutInvoice(
    planSlug: string,
    purchaseDetails?: { groupName: string; organizerEmail: string; studentEmails: string[] },
  ) {
    setCheckoutLoading(true);
    setCheckoutError("");

    try {
      const plansResponse = await fetch("/api/billing/plans", { cache: "no-store" });
      const plansPayload = (await plansResponse.json()) as {
        plans?: SubscriptionPlan[];
        paymentConfig?: PaymentMethodConfig | null;
        error?: string;
      };
      if (!plansResponse.ok) throw new Error(plansPayload.error || "Could not load plans.");

      const plan = plansPayload.plans?.find((item) => item.slug === planSlug);
      if (!plan) throw new Error("This plan is not available right now.");

      const invoiceResponse = await fetch("/api/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, paymentMethod: "bank_transfer", purchaseDetails }),
      });
      const invoicePayload = (await invoiceResponse.json()) as {
        invoice?: CheckoutInvoice;
        paymentConfig?: PaymentMethodConfig | null;
        error?: string;
      };
      if (!invoiceResponse.ok || !invoicePayload.invoice) {
        throw new Error(invoicePayload.error || "Could not create invoice.");
      }

      setCheckoutPlan(plan);
      setCheckoutInvoice(invoicePayload.invoice);
      setPaymentConfig(invoicePayload.paymentConfig ?? plansPayload.paymentConfig ?? null);
      return invoicePayload.invoice;
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function beginCheckout(
    planSlug: string,
    purchaseDetails?: { groupName: string; organizerEmail: string; studentEmails: string[] },
  ) {
    try {
      await createCheckoutInvoice(planSlug, purchaseDetails);
      setCurrentStep("checkout1");
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Could not start checkout.");
    }
  }

  async function beginGroupCheckout() {
    const emails = Array.from(
      new Set(
        studentEmails
          .split(/[\n,]/)
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    if (
      groupName.trim().length < 2 ||
      !groupEmail.includes("@") ||
      emails.length < 1 ||
      emails.length > 5
    ) {
      setCheckoutError("Enter a group name, organizer email, and 1–5 student emails.");
      return;
    }
    await beginCheckout("group-unlimited", {
      groupName: groupName.trim(),
      organizerEmail: groupEmail.trim().toLowerCase(),
      studentEmails: emails,
    });
  }

  async function submitManualPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checkoutInvoice || !paymentReceipt) return;

    setPaymentSubmitting(true);
    setCheckoutError("");
    const formData = new FormData();
    formData.set("invoiceId", checkoutInvoice.id);
    formData.set("reference", paymentReference);
    formData.set("payerName", paymentPayerName);
    formData.set("note", paymentNote);
    formData.set("receipt", paymentReceipt);

    try {
      const response = await fetch("/api/billing/payments", { method: "POST", body: formData });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Payment could not be submitted.");
      setCurrentStep("paymentPending");
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Payment could not be submitted.");
    } finally {
      setPaymentSubmitting(false);
    }
  }

  const copyInvoiceText = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(invoiceNumber);
      setCopiedInvoice(true);
      setTimeout(() => setCopiedInvoice(false), 2000);
    }
  };

  const handleGoBack = () => {
    switch (currentStep) {
      case "systemSlide":
        setCurrentStep("q5");
        break;
      case "q1":
        router.push("/");
        break;
      case "q2":
        setCurrentStep("q1");
        break;
      case "q3":
        setCurrentStep("q2");
        break;
      case "q4":
        setCurrentStep("q3");
        break;
      case "q5":
        setCurrentStep("q4");
        break;
      case "solutionSlide":
        setCurrentStep("systemSlide");
        break;
      case "login":
        setCurrentStep("solutionSlide");
        break;
      case "pricing":
        setCurrentStep("solutionSlide");
        break;
      case "checkout1":
      case "groupCheckout":
        setCurrentStep("pricing");
        break;
      case "paymentPending":
        setCurrentStep("checkout1");
        break;
      default:
        router.push("/");
    }
  };

  const renderFlowHeader = (backLabel: string = "Back") => (
    <div className="flex items-center justify-between mb-6">
      <Link href="/" className="flex items-center gap-2.5 no-underline">
        <Image
          src="/nanologo.png"
          alt="Nano Syllabus"
          width={26}
          height={26}
          className="h-[26px] w-[26px] rounded-lg object-contain"
        />
        <span className="font-[800] text-[21px] tracking-[-0.7px] text-[#111111]">
          Nano Syllabus
        </span>
      </Link>
      <button
        type="button"
        onClick={handleGoBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-[600] text-[#777] hover:text-[#111] transition cursor-pointer p-1"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>{backLabel}</span>
      </button>
    </div>
  );

  if (resumingDiagnostic || checkingPriorStart) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg-primary px-6 text-text-primary">
        <p role="status">
          {resumingDiagnostic ? "Saving your study answers…" : "Opening Nano Syllabus…"}
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#111111] antialiased">
      {/* ═════════════════════════════════════════════════════════════════════
          1. STUDY-SYSTEM INTRO (systemSlide)
          ═════════════════════════════════════════════════════════════════════ */}
      {currentStep === "systemSlide" && (
        <main className="mx-auto w-full max-w-[1120px] px-3 py-6 sm:w-[calc(100%_-_36px)] sm:px-0 sm:py-[42px] lg:py-[64px]">
          {renderFlowHeader()}

          <section
            aria-labelledby="study-system-heading"
            className="grid overflow-hidden rounded-[25px] border border-[#dde2ea] bg-[linear-gradient(125deg,#fbfaf9_0%,#f7f8fa_54%,#f5f4f4_100%)] shadow-[0_22px_64px_rgba(30,34,40,0.09)] lg:min-h-[590px] lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:rounded-[30px]"
          >
            <div className="flex flex-col justify-center p-6 sm:p-[38px] lg:p-[58px_52px]">
              <h1
                id="study-system-heading"
                className="max-w-[540px] text-[36px] font-[760] leading-[1.04] tracking-[-0.057em] text-[#0d0d0e] sm:text-[42px] lg:text-[58px]"
              >
                Studying without a system has a real cost.
              </h1>
              <p className="mb-7 mt-[22px] max-w-[510px] text-[16px] leading-[1.48] tracking-[-0.015em] text-[#626a79] sm:text-[18px] lg:text-[19px]">
                Poor results can delay graduation and close doors to colleges, scholarships and
                careers.
              </p>
              <button
                type="button"
                onClick={() => setCurrentStep("solutionSlide")}
                className="inline-flex min-h-[52px] w-full items-center justify-center rounded-[11px] bg-[#101011] px-5 py-3 text-[15px] font-[680] text-white shadow-[0_8px_20px_rgba(10,10,12,0.12)] transition hover:bg-[#202024] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2 motion-reduce:transition-none lg:mt-auto lg:min-h-[64px] lg:text-[17px]"
              >
                Build a better study system →
              </button>
            </div>

            <div className="border-t border-[rgba(215,210,210,0.95)] p-6 sm:p-[38px] lg:border-l lg:border-t-0 lg:p-[58px_52px]">
              <h2 className="mb-[14px] mt-[3px] text-[12px] font-[800] leading-[1.35] tracking-[0.14em] text-[#6f6767] lg:text-[14px]">
                PASS RATES REPORTED BY UGC NEPAL
              </h2>

              <div className="grid gap-2.5" aria-label="University pass rates">
                {UNIVERSITY_PASS_RATES.map((item) => (
                  <article
                    key={item.university}
                    className="grid min-h-[62px] grid-cols-[88px_minmax(0,1fr)] items-center rounded-[14px] border border-[#e4dddd] bg-[rgba(251,250,250,0.84)] px-4 py-3 shadow-[0_5px_14px_rgba(54,60,70,0.025)] sm:grid-cols-[90px_minmax(0,1fr)] sm:px-[19px] lg:min-h-[78px] lg:grid-cols-[110px_minmax(0,1fr)] lg:px-6 lg:py-4"
                  >
                    <strong className="text-[28px] font-[770] leading-none tracking-[-0.045em] text-[#8f3636] lg:text-[36px]">
                      {item.rate}
                    </strong>
                    <div className="grid gap-2 sm:grid-cols-[minmax(72px,1fr)_minmax(102px,auto)] sm:items-center sm:gap-[14px] lg:gap-5">
                      <div
                        aria-hidden="true"
                        className="h-2.5 overflow-hidden rounded-full bg-[#eadcdc] lg:h-3"
                      >
                        <span
                          className="block h-full rounded-full bg-[linear-gradient(90deg,#a83f3f,#c95757)]"
                          style={{ width: item.value }}
                        />
                      </div>
                      <span className="text-left text-[13px] font-[520] leading-[1.25] text-[#686164] sm:text-right lg:text-[15px]">
                        {item.university}
                      </span>
                    </div>
                  </article>
                ))}
              </div>

              <aside className="mt-4 grid grid-cols-[46px_minmax(0,1fr)] items-center gap-3 rounded-[15px] border border-[#e2d3d3] bg-[rgba(248,241,241,0.9)] p-4 text-[#7f3f3f] sm:grid-cols-[62px_minmax(0,1fr)] sm:gap-[18px] sm:p-[14px_18px] lg:mt-5 lg:grid-cols-[68px_minmax(0,1fr)] lg:gap-5 lg:p-[18px_22px]">
                <span
                  aria-hidden="true"
                  className="grid h-11 w-11 place-items-center rounded-full bg-[#eedddd] text-[#b54848] sm:h-[42px] sm:w-[42px] lg:h-12 lg:w-12"
                >
                  <Lightbulb className="h-6 w-6 lg:h-7 lg:w-7" strokeWidth={2} />
                </span>
                <p className="border-l border-[#dfc8c8] pl-3 text-[14px] font-[720] leading-[1.4] sm:pl-[14px] lg:pl-[18px] lg:text-[16px]">
                  This is not a motivation problem.
                  <br />
                  It is a system problem.
                </p>
              </aside>
            </div>
          </section>
        </main>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          2. QUESTION SCREENS (q1 to q5)
          ═════════════════════════════════════════════════════════════════════ */}
      {["q1", "q2", "q3", "q4", "q5"].includes(currentStep) &&
        (() => {
          const qIndex = parseInt(currentStep.replace("q", ""), 10);
          const qData = QUESTIONS[qIndex - 1];
          const progressPercent = Math.round((qIndex / STUDY_DIAGNOSTIC_QUESTION_COUNT) * 100);

          return (
            <main className="mx-auto max-w-[760px] px-6 py-12 sm:py-16">
              {renderFlowHeader(qIndex === 1 ? "Home" : "Back")}

              <div className="flex items-center justify-between text-[13px] text-[#777]">
                <span>Let&apos;s understand how you study</span>
                <span>
                  {qIndex} / {STUDY_DIAGNOSTIC_QUESTION_COUNT}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-2.5 h-[7px] w-full overflow-hidden rounded-[20px] bg-[#eee]">
                <div
                  className="h-full bg-[#6195ee] rounded-[20px] transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="mt-12 sm:mt-14">
                <h2 className="text-[34px] sm:text-[38px] font-[760] tracking-[-1.5px] leading-[1.15] text-[#111111] m-0">
                  {qData.title}
                </h2>
                <p className="mt-2.5 text-[15px] text-[#777] mb-7">
                  There is no right answer. Choose what is closest to your real experience.
                </p>

                <div className="grid gap-2.5">
                  {qData.options.map((opt, idx) => {
                    const isSelected = answers[qIndex]?.optionIndex === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSelectAnswer(qIndex, idx, opt)}
                        className={cn(
                          "flex items-center justify-between rounded-[14px] border p-[17px] text-left text-[15px] font-medium transition cursor-pointer active:scale-[0.99]",
                          isSelected
                            ? "border-[#6195ee] bg-[#f7faff] text-[#111]"
                            : "border-[#ddd] bg-white text-[#111] hover:border-[#6195ee] hover:bg-[#f7faff]",
                        )}
                      >
                        <span>{opt}</span>
                        <span
                          className={cn(
                            "h-[18px] w-[18px] rounded-full border transition",
                            isSelected
                              ? "border-[5px] border-[#6195ee] bg-white"
                              : "border-[#aaa] bg-transparent",
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </main>
          );
        })()}

      {/* ═════════════════════════════════════════════════════════════════════
          3. 60-SECOND WALKTHROUGH (solutionSlide)
          ═════════════════════════════════════════════════════════════════════ */}
      {currentStep === "solutionSlide" && (
        <main className="mx-auto w-full max-w-[1440px] px-3 py-6 sm:w-[calc(100%_-_44px)] sm:px-0 sm:py-10 lg:w-[calc(100%_-_64px)] lg:py-[34px]">
          {renderFlowHeader()}

          <section className="mb-7 text-center lg:mb-[27px]" aria-labelledby="walkthrough-heading">
            <h1
              id="walkthrough-heading"
              className="text-[39px] font-[790] leading-[1.04] tracking-[-0.052em] text-[#111214] sm:text-[44px] lg:text-[46px]"
            >
              How to start the first challenge?
            </h1>
          </section>

          {/* The walkthrough fills the column's width, but never so tall that the
              heading and the start button leave the screen. */}
          <section
            className="mx-auto w-full max-w-[max(560px,calc((100dvh-290px)*16/9))]"
            aria-label="NanoSyllabus walkthrough"
          >
            <div className="relative isolate overflow-hidden rounded-[18px] border-[8px] border-[#151b1f] bg-[#f6f7f9] shadow-[0_22px_60px_rgba(54,69,92,0.08)] lg:rounded-[22px] lg:border-[10px]">
              <iframe
                src="/nanosyllabus-challenge-walkthrough.html"
                title="A challenge from start to finish: pick a micro-topic, learn it, answer past questions by hand and get graded"
                className="block aspect-video w-full border-0"
                loading="eager"
              />
            </div>
          </section>

          <div className="mt-[26px] flex justify-center lg:mt-7">
            <button
              type="button"
              onClick={() => {
                markFunnelStarted();
                if (user) {
                  void finishStudyFlow();
                } else {
                  setCurrentStep("login");
                }
              }}
              disabled={authLoading}
              aria-busy={authLoading}
              className="inline-flex min-h-[50px] w-full items-center justify-center rounded-[14px] bg-[#121313] px-7 py-3.5 text-[15px] font-[740] text-white shadow-[0_12px_28px_rgba(0,0,0,0.14)] transition hover:-translate-y-0.5 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1677f0] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none sm:w-auto sm:min-w-[344px]"
            >
              {authLoading ? "Saving answers…" : "Start your first challenge →"}
            </button>
          </div>
          {authError && (
            <p role="alert" className="mt-3 text-center text-sm text-destructive">
              {authError}
            </p>
          )}
        </main>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          5. AUTH STEP (login) - Clean Sign In / Sign Up After Quiz
          ═════════════════════════════════════════════════════════════════════ */}
      {currentStep === "login" && (
        <main className="mx-auto max-w-[480px] px-6 py-14 sm:py-20">
          {renderFlowHeader()}

          <div className="rounded-[24px] border border-[#e2e2e2] bg-white p-7 sm:p-9 shadow-sm">
            <div className="text-center">
              <div className="text-[11px] font-[800] uppercase tracking-[1.8px] text-[#5d91ef]">
                SAVE YOUR PROFILE
              </div>
              <h2 className="mt-2 text-[26px] font-[760] tracking-[-1px] text-[#111111]">
                {authMode === "signup" ? "Create your account" : "Log in to continue"}
              </h2>
              <p className="mt-1 text-[13px] text-[#777]">
                Your onboarding diagnostic answers will be saved to your account.
              </p>
            </div>

            {/* Google Sign-In Button */}
            <button
              type="button"
              onClick={() => void continueWithGoogle()}
              disabled={googleLoading || authLoading}
              className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-[12px] border border-[#ddd] bg-white py-3 text-[14px] font-[600] text-[#111] transition hover:bg-[#f9f9f9] active:scale-[0.99] cursor-pointer disabled:opacity-50"
            >
              {!googleLoading ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              ) : null}
              <span>{googleLoading ? "Connecting Google..." : "Continue with Google"}</span>
            </button>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#eee]" />
              <span className="text-[11px] font-[700] uppercase text-[#999]">or with email</span>
              <div className="h-px flex-1 bg-[#eee]" />
            </div>

            {/* Auth Switcher */}
            <div className="flex rounded-[12px] bg-[#f1f1f1] p-1">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("signup");
                  setAuthError("");
                }}
                className={cn(
                  "flex-1 rounded-[10px] py-2 text-[13px] font-[700] transition cursor-pointer",
                  authMode === "signup" ? "bg-white text-[#111] shadow-xs" : "text-[#777]",
                )}
              >
                Sign Up
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setAuthError("");
                }}
                className={cn(
                  "flex-1 rounded-[10px] py-2 text-[13px] font-[700] transition cursor-pointer",
                  authMode === "login" ? "bg-white text-[#111] shadow-xs" : "text-[#777]",
                )}
              >
                Log In
              </button>
            </div>

            {authError && (
              <div className="mt-4 rounded-[12px] bg-[#fff0f0] border border-[#ffd0d0] p-3 text-[13px] font-medium text-[#c53030]">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="mt-5 space-y-4">
              {authMode === "signup" && (
                <div>
                  <label className="block text-[12px] font-[700] text-[#555] mb-1.5">
                    Your Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 h-4 w-4 text-[#888]" />
                    <input
                      type="text"
                      required
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      placeholder="e.g. Prashant Soni"
                      className="w-full rounded-[10px] border border-[#ddd] bg-white pl-10 pr-4 py-3 text-[14px] text-[#111] focus:border-[#6195ee] focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[12px] font-[700] text-[#555] mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-[#888]" />
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-[10px] border border-[#ddd] bg-white pl-10 pr-4 py-3 text-[14px] text-[#111] focus:border-[#6195ee] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-[700] text-[#555] mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-[#888]" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-[10px] border border-[#ddd] bg-white pl-10 pr-4 py-3 text-[14px] text-[#111] focus:border-[#6195ee] focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#111] py-3.5 text-[14px] font-[700] text-white transition hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {authLoading ? "Saving..." : "Continue →"}
              </button>
            </form>
          </div>
        </main>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          6. PRICING STEP (pricing)
          ═════════════════════════════════════════════════════════════════════ */}
      {PAYMENT_FLOW_ENABLED && currentStep === "pricing" && (
        <main className="mx-auto max-w-[1080px] px-6 py-12 sm:py-16">
          {renderFlowHeader()}

          <div className="text-center">
            <div className="text-[11px] font-[800] uppercase tracking-[1.8px] text-[#5d91ef]">
              PRICING
            </div>
            <h1 className="mt-1 text-[38px] sm:text-[50px] font-[760] tracking-[-2.5px] text-[#111111]">
              Study without limits.
            </h1>
            <p className="mt-1 text-[16px] text-[#777]">
              Start free. Upgrade when you want unlimited access.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Individual Plan */}
            <div className="relative flex flex-col justify-between rounded-[22px] border-2 border-[#111] bg-white p-7 sm:p-8 shadow-xs">
              <span className="absolute -top-3 left-6 rounded-full bg-[#111] px-3 py-1 text-[10px] font-[800] text-white uppercase tracking-wider">
                MOST POPULAR
              </span>

              <div>
                <h2 className="text-[24px] font-[750] text-[#111111]">Individual</h2>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-[43px] font-[800] text-[#111]">Rs. 1,500</span>
                  <span className="text-[13px] font-[500] text-[#777]">/ month</span>
                </div>
                <p className="mt-2 text-[14px] text-[#777]">
                  A complete exam-preparation system for one student.
                </p>

                <ul className="mt-6 space-y-2.5 border-t border-[#eee] pt-4 text-[14px] text-[#444]">
                  {[
                    "Unlimited AI Tutor",
                    "Unlimited document conversations",
                    "Unlimited mock exams",
                    "Handwritten answer feedback",
                    "Knowledge graph & exam readiness",
                    "Daily challenges & consistency streak",
                  ].map((feat, i) => (
                    <li key={i} className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 shrink-0 text-[#6195ee]" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8">
                <button
                  onClick={() => void beginCheckout("individual-unlimited")}
                  disabled={checkoutLoading}
                  aria-busy={checkoutLoading}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[#111] py-3.5 text-[14px] font-[700] text-white transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
                >
                  {checkoutLoading ? "Creating invoice..." : "Get Individual →"}
                </button>
              </div>
            </div>

            {/* Group Plan */}
            <div className="flex flex-col justify-between rounded-[22px] border border-[#ddd] bg-white p-7 sm:p-8 shadow-xs">
              <div>
                <span className="inline-block rounded-full bg-[#eef4ff] px-3 py-1 text-[10px] font-[800] text-[#4f82dc] uppercase tracking-wider mb-2">
                  5 STUDENTS
                </span>
                <h2 className="text-[24px] font-[750] text-[#111111]">Group</h2>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-[43px] font-[800] text-[#111]">Rs. 5,000</span>
                  <span className="text-[13px] font-[500] text-[#777]">/ month</span>
                </div>
                <p className="mt-2 text-[14px] text-[#777]">
                  One package for five students studying together.
                </p>

                <ul className="mt-6 space-y-2.5 border-t border-[#eee] pt-4 text-[14px] text-[#444]">
                  {[
                    "5 student accounts",
                    "Unlimited AI Tutor for everyone",
                    "Unlimited mock exams",
                    "Handwritten answer feedback",
                    "Individual readiness & progress",
                    "Shared challenge accountability",
                  ].map((feat, i) => (
                    <li key={i} className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 shrink-0 text-[#6195ee]" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8">
                <button
                  onClick={() => setCurrentStep("groupCheckout")}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[#111] py-3.5 text-[14px] font-[700] text-white transition hover:opacity-90 active:scale-[0.99] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
                >
                  Get Group →
                </button>
              </div>
            </div>
          </div>
          {checkoutError ? (
            <p
              role="alert"
              className="mx-auto mt-5 max-w-xl rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-center text-[13px] text-red-700"
            >
              {checkoutError}
            </p>
          ) : null}
        </main>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          7. STANDARD MOBILE BANKING CHECKOUT (checkout1)
          ═════════════════════════════════════════════ */}
      {PAYMENT_FLOW_ENABLED && currentStep === "checkout1" && (
        <main className="mx-auto max-w-[1050px] px-6 py-12 sm:py-16">
          {renderFlowHeader()}

          <div className="mb-6">
            <div className="text-[11px] font-[800] uppercase tracking-[1.8px] text-[#5d91ef]">
              MOBILE BANKING PAYMENT
            </div>
            <h1 className="mt-1 text-[34px] sm:text-[40px] font-[760] tracking-[-2px] text-[#111111]">
              Scan, pay and send your receipt.
            </h1>
            <p className="mt-1 text-[14px] text-[#777]">
              {checkoutPlan
                ? `${checkoutPlan.currency} ${checkoutPlan.price} / month`
                : "Your selected plan"}{" "}
              · Access activates after verification.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_.7fr]">
            <div className="rounded-[20px] border border-[#e2e2e2] bg-white p-7 shadow-xs">
              <h3 className="text-[17px] font-[750] text-[#111] mb-4">
                Pay with your mobile banking app
              </h3>

              {paymentConfig ? (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-[210px_1fr]">
                  <div>
                    {/* The official QR can be hosted on any HTTPS origin configured by billing admins. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={paymentConfig.qrImageUrl}
                      alt={`Official ${paymentConfig.displayName} payment QR`}
                      width={210}
                      height={210}
                      className="h-[210px] w-[210px] rounded-[18px] border border-[#d9dde4] bg-white object-contain p-2 shadow-sm"
                    />
                    <p className="mt-2.5 text-[12px] font-[700] text-[#555]">
                      {paymentConfig.bankName || paymentConfig.displayName}
                    </p>
                    <p className="text-[12px] text-[#777]">{paymentConfig.accountName}</p>
                    {paymentConfig.accountNumber ? (
                      <p className="text-[12px] text-[#777]">A/C {paymentConfig.accountNumber}</p>
                    ) : null}
                  </div>

                  <div>
                    <ol className="space-y-3 text-[14px] text-[#626872] list-none p-0">
                      {[
                        `Scan the official QR and pay ${checkoutInvoice?.currency ?? "NPR"} ${checkoutInvoice?.amount ?? checkoutPlan?.price ?? 0}.`,
                        "Add the invoice number below in the payment remarks.",
                        "Save the successful payment receipt.",
                        "Enter the reference and upload the receipt below.",
                      ].map((step, index) => (
                        <li key={step} className="flex gap-2.5">
                          <span className="flex h-[25px] w-[25px] shrink-0 items-center justify-center rounded-[8px] bg-[#edf4ff] font-[800] text-[#4f7fd3] text-[12px]">
                            {index + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>

                    <div className="mt-4 flex items-center justify-between gap-3 rounded-[13px] border border-[#e4e6ea] bg-[#f7f8fa] px-4 py-3">
                      <div className="min-w-0">
                        <small className="block text-[11px] text-[#777] mb-1 font-bold">
                          PAYMENT REMARK / INVOICE
                        </small>
                        <b className="block truncate font-mono text-[16px] text-[#111] tracking-wider">
                          {invoiceNumber}
                        </b>
                      </div>
                      <button
                        type="button"
                        onClick={copyInvoiceText}
                        className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-[10px] bg-[#eceef1] px-3.5 py-2 text-[13px] font-[700] text-[#111] transition hover:bg-[#dfe2e6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
                      >
                        {copiedInvoice ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span>{copiedInvoice ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[13px] border border-amber-200 bg-amber-50 p-4 text-[13px] leading-6 text-amber-900">
                  <b>Official payment QR is not configured yet.</b> Paid receipt submission will
                  open after an admin adds the official QR.
                </div>
              )}

              <form
                onSubmit={submitManualPayment}
                className="mt-6 space-y-4 border-t border-[#eee] pt-5"
              >
                <div>
                  <label
                    htmlFor="payment-reference"
                    className="mb-1.5 block text-[12px] font-[700] text-[#555]"
                  >
                    Transaction reference *
                  </label>
                  <input
                    id="payment-reference"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    required
                    value={paymentReference}
                    onChange={(event) => setPaymentReference(event.target.value)}
                    className="min-h-11 w-full rounded-[10px] border border-[#bbb] bg-white px-3 text-[14px] text-[#111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
                  />
                </div>
                <div>
                  <label
                    htmlFor="payment-payer-name"
                    className="mb-1.5 block text-[12px] font-[700] text-[#555]"
                  >
                    Payer name *
                  </label>
                  <input
                    id="payment-payer-name"
                    type="text"
                    autoComplete="name"
                    required
                    value={paymentPayerName}
                    onChange={(event) => setPaymentPayerName(event.target.value)}
                    className="min-h-11 w-full rounded-[10px] border border-[#bbb] bg-white px-3 text-[14px] text-[#111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
                  />
                </div>
                <div>
                  <label
                    htmlFor="payment-receipt"
                    className="mb-1.5 block text-[12px] font-[700] text-[#555]"
                  >
                    Payment receipt *
                  </label>
                  <input
                    id="payment-receipt"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    required
                    onChange={(event) => setPaymentReceipt(event.target.files?.[0] ?? null)}
                    className="block min-h-11 w-full rounded-[10px] border border-[#bbb] bg-white px-3 py-2 text-[13px] text-[#555] file:mr-3 file:rounded-md file:border-0 file:bg-[#eceef1] file:px-3 file:py-1.5 file:font-[700] file:text-[#111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
                  />
                  <p className="mt-1 text-[12px] text-[#666]">
                    JPG, PNG, WebP, or PDF · maximum 5 MB
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="payment-note"
                    className="mb-1.5 block text-[12px] font-[700] text-[#555]"
                  >
                    Note (optional)
                  </label>
                  <textarea
                    id="payment-note"
                    rows={3}
                    value={paymentNote}
                    onChange={(event) => setPaymentNote(event.target.value)}
                    className="w-full rounded-[10px] border border-[#bbb] bg-white px-3 py-2 text-[14px] text-[#111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
                  />
                </div>

                {checkoutError ? (
                  <p
                    role="alert"
                    className="rounded-[10px] bg-red-50 px-3 py-2 text-[13px] text-red-700"
                  >
                    {checkoutError}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={
                    !paymentConfig ||
                    !checkoutInvoice ||
                    paymentSubmitting ||
                    !paymentReference.trim() ||
                    !paymentPayerName.trim() ||
                    !paymentReceipt
                  }
                  aria-busy={paymentSubmitting}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[#111] px-4 py-3 text-[14px] font-[700] text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
                >
                  {paymentSubmitting ? "Uploading receipt..." : "Submit payment for verification →"}
                </button>
              </form>
            </div>

            <div className="rounded-[20px] border border-[#e2e2e2] bg-white p-7 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-[17px] font-[750] text-[#111] mb-4">Order summary</h3>
                <div className="space-y-2.5 text-[14px]">
                  <div className="flex justify-between gap-4 text-[#666]">
                    <span>{checkoutPlan?.name ?? "Selected plan"}</span>
                    <span>
                      {checkoutInvoice?.currency ?? "NPR"}{" "}
                      {checkoutInvoice?.subtotal ?? checkoutPlan?.price ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-[#eee] pt-3 text-[18px] font-[800] text-[#111]">
                    <span>Total today</span>
                    <span>
                      {checkoutInvoice?.currency ?? "NPR"}{" "}
                      {checkoutInvoice?.amount ?? checkoutPlan?.price ?? 0}
                    </span>
                  </div>
                </div>
                <p className="mt-5 text-[12px] leading-5 text-[#666]">
                  Invoice {invoiceNumber} expires in 24 hours. Payment is usually verified within
                  one business day.
                </p>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          9. GROUP CHECKOUT (groupCheckout)
          ═════════════════════════════════════════════════════════════════════ */}
      {PAYMENT_FLOW_ENABLED && currentStep === "groupCheckout" && (
        <main className="mx-auto max-w-[1050px] px-6 py-12 sm:py-16">
          {renderFlowHeader()}

          <div className="mb-6">
            <div className="text-[11px] font-[800] uppercase tracking-[1.8px] text-[#5d91ef]">
              GROUP PLAN
            </div>
            <h1 className="mt-1 text-[34px] sm:text-[40px] font-[760] tracking-[-2px] text-[#111111]">
              Study together.
            </h1>
            <p className="mt-1 text-[14px] text-[#777]">5 student accounts · Rs. 5,000 / month</p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_.7fr]">
            <div className="rounded-[20px] border border-[#e2e2e2] bg-white p-7 shadow-xs">
              <h3 className="text-[17px] font-[750] text-[#111] mb-4">Group details</h3>

              <div className="space-y-3.5 text-[14px]">
                <div>
                  <label className="block text-[12px] font-[700] text-[#555] mb-1">
                    Group / institution name
                  </label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="e.g. Engineering Study Group"
                    className="w-full rounded-[10px] border border-[#ddd] bg-white p-3 text-[14px] text-[#111] focus:border-[#6195ee] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-[700] text-[#555] mb-1">
                    Your email
                  </label>
                  <input
                    type="email"
                    value={groupEmail}
                    onChange={(e) => setGroupEmail(e.target.value)}
                    placeholder="organizer@example.com"
                    className="w-full rounded-[10px] border border-[#ddd] bg-white p-3 text-[14px] text-[#111] focus:border-[#6195ee] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-[700] text-[#555] mb-1">
                    Student emails
                  </label>
                  <input
                    type="text"
                    value={studentEmails}
                    onChange={(e) => setStudentEmails(e.target.value)}
                    placeholder="student1@example.com, student2@example.com"
                    className="w-full rounded-[10px] border border-[#ddd] bg-white p-3 text-[14px] text-[#111] focus:border-[#6195ee] focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-5 rounded-[13px] bg-[#f5f8ff] border border-[#dbe8ff] p-3.5 text-[13px] leading-[1.5] text-[#555]">
                <b className="text-[#487fdc]">Five students in one package.</b> Each student gets
                their own account, progress and exam-readiness view.
              </div>

              <button
                type="button"
                onClick={() => void beginGroupCheckout()}
                disabled={checkoutLoading}
                aria-busy={checkoutLoading}
                className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[#111] py-4 text-[14px] font-[700] text-white shadow-sm transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
              >
                {checkoutLoading ? "Creating invoice..." : "Continue with Group →"}
              </button>
              {checkoutError ? (
                <p role="alert" className="mt-3 text-[13px] text-red-700">
                  {checkoutError}
                </p>
              ) : null}
            </div>

            {/* Order summary */}
            <div className="rounded-[20px] border border-[#e2e2e2] bg-white p-7 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-[17px] font-[750] text-[#111] mb-4">Order summary</h3>
                <div className="space-y-2.5 text-[14px]">
                  <div className="flex justify-between text-[#666]">
                    <span>Group · 5 students</span>
                    <span>Rs. 5,000</span>
                  </div>
                  <div className="flex justify-between border-t border-[#eee] pt-3 text-[18px] font-[800] text-[#111]">
                    <span>Monthly</span>
                    <span>Rs. 5,000</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          10. PAYMENT PENDING VERIFICATION SCREEN (paymentPending)
          ═════════════════════════════════════════════════════════════════════ */}
      {PAYMENT_FLOW_ENABLED && currentStep === "paymentPending" && (
        <main className="mx-auto max-w-[560px] px-6 py-16 sm:py-20">
          {renderFlowHeader("Home")}

          <div className="rounded-[20px] border border-[#e2e2e2] bg-white p-8 sm:p-10 shadow-sm">
            <div className="text-[11px] font-[800] uppercase tracking-[1.8px] text-[#26905a]">
              PAYMENT RECEIVED FOR REVIEW
            </div>
            <h2 className="mt-2 text-[26px] font-[760] tracking-[-1px] text-[#111111]">
              We&apos;ll activate your account after verification.
            </h2>
            <p className="mt-2 text-[14px] text-[#666] leading-[1.5]">
              Receipt and transaction details for invoice <b>{invoiceNumber}</b> were submitted
              securely. We&apos;ll notify you after an admin matches the payment.
            </p>

            <div className="mt-5 rounded-[13px] bg-[#f5f8ff] border border-[#dbe8ff] p-3.5 text-[13px] leading-[1.5] text-[#555]">
              <b className="text-[#487fdc]">What happens next:</b> approval activates the
              subscription automatically. Payment is usually verified within one business day.
            </div>

            <div className="mt-8 flex flex-col gap-3">
              <Link
                href="/"
                className="inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#111] py-3.5 text-[14px] font-[700] text-white shadow-sm transition hover:opacity-90"
              >
                Back to home
              </Link>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
