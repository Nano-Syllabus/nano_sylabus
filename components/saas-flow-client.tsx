"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  Check, 
  Copy, 
  CheckCircle2, 
  Sparkles, 
  X,
  Lock,
  Mail,
  User,
  ArrowLeft
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getGoogleAuthRedirectUrl, setOAuthNextCookie } from "@/lib/auth-redirect";
import { cn } from "@/lib/utils";
import type { PaymentMethodConfig, SubscriptionPlan } from "@/lib/types";

type CheckoutInvoice = {
  id: string;
  planId: string;
  status: string;
  amount: number;
  subtotal: number;
  discountAmount: number;
  currency: string;
  invoiceCode: string;
  expiresAt: string;
};

export type FlowStep = 
  | "q1" | "q2" | "q3" 
  | "fact1" 
  | "q4" | "q5" | "q6" 
  | "founderSlide" 
  | "solutionSlide" 
  | "login" 
  | "pricing" 
  | "checkout1" 
  | "checkout2" 
  | "groupCheckout" 
  | "paymentPending";

export type UserAnswer = {
  questionIndex: number;
  optionIndex: number;
  text: string;
};

const QUESTIONS = [
  {
    id: 1,
    title: "Do you study hard—but still get disappointing marks?",
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
    title: "Do unseen questions make you freeze—even when you studied the topic?",
    options: ["Yes", "Sometimes", "No"],
  },
  {
    id: 5,
    title: "Do you get confused about what to study first?",
    options: ["Yes", "No"],
  },
  {
    id: 6,
    title: "Do you run out of time to practise enough past question papers?",
    options: ["Yes", "Sometimes", "No"],
  },
];

export function SaaSFlowClient({
  initialUser = null,
}: {
  initialUser?: { id: string; email?: string; fullName?: string } | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const initialStep = (searchParams.get("step") as FlowStep) || "q1";
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
  const googleAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";

  const continueWithGoogle = async () => {
    if (!googleAuthEnabled) {
      setAuthError("Google sign-in is not enabled in this environment.");
      return;
    }

    setAuthError("");
    setGoogleLoading(true);
    const supabase = createSupabaseBrowserClient();
    const redirectTo = getGoogleAuthRedirectUrl();
    setOAuthNextCookie("/flow?step=pricing");

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    setGoogleLoading(false);

    if (oauthError) {
      setAuthError(oauthError.message);
    }
  };
  
  // Modal, coupon, and real checkout state
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [copiedInvoice, setCopiedInvoice] = useState(false);
  const [checkoutInvoice, setCheckoutInvoice] = useState<CheckoutInvoice | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionPlan | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentMethodConfig | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);
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

  const isStruggle = (qNum: number) => {
    const ans = answers[qNum];
    if (!ans) return false;
    return qNum === 3 ? ans.text !== "Yes" : ans.text !== "No";
  };

  const handleSelectAnswer = (qNum: number, optIndex: number, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [qNum]: { questionIndex: qNum, optionIndex: optIndex, text },
    }));

    setTimeout(() => {
      if (qNum === 3) {
        setCurrentStep("fact1");
      } else if (qNum === 6) {
        setCurrentStep("founderSlide");
      } else {
        const nextQ = `q${qNum + 1}` as FlowStep;
        setCurrentStep(nextQ);
      }
    }, 220);
  };

  // Dynamic analysis for Fact 1
  const recallStruggleCount = [1, 2, 3].filter(isStruggle).length;
  // Dynamic analysis for Founder slide
  const totalStruggles = [1, 2, 3, 4, 5, 6].filter(isStruggle).length;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    const supabase = createSupabaseBrowserClient();

    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: {
            data: {
              full_name: authName || "Student",
              study_answers: answers,
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
        }
      }

      // Proceed to pricing after auth
      setCurrentStep("pricing");
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
      new Set(studentEmails.split(/[\n,]/).map((email) => email.trim().toLowerCase()).filter(Boolean)),
    );
    if (groupName.trim().length < 2 || !groupEmail.includes("@") || emails.length < 1 || emails.length > 5) {
      setCheckoutError("Enter a group name, organizer email, and 1–5 student emails.");
      return;
    }
    await beginCheckout("group-unlimited", {
      groupName: groupName.trim(),
      organizerEmail: groupEmail.trim().toLowerCase(),
      studentEmails: emails,
    });
  }

  const handleApplyCoupon = async (codeToApply?: string) => {
    const code = (codeToApply || couponInput).trim().toUpperCase();
    if (!code) {
      setCheckoutError("Enter a coupon code.");
      return;
    }

    setCouponLoading(true);
    setCheckoutError("");
    try {
      const invoice = checkoutInvoice && checkoutPlan?.slug === "individual-unlimited"
        ? checkoutInvoice
        : await createCheckoutInvoice("individual-unlimited");
      const response = await fetch("/api/billing/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, code }),
      });
      const payload = (await response.json()) as {
        redemption?: {
          amount: number;
          subtotal: number;
          discountAmount: number;
          status: string;
          couponCode: string;
        };
        error?: string;
      };
      if (!response.ok || !payload.redemption) {
        throw new Error(payload.error || "Coupon could not be applied.");
      }

      setCheckoutInvoice((current) => current ? {
        ...current,
        amount: payload.redemption!.amount,
        subtotal: payload.redemption!.subtotal,
        discountAmount: payload.redemption!.discountAmount,
        status: payload.redemption!.status,
      } : current);
      setDiscountModalOpen(false);
      setCouponInput(code);
      setCurrentStep("checkout2");
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Coupon could not be applied.");
    } finally {
      setCouponLoading(false);
    }
  };

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
      case "q1":
        router.push("/");
        break;
      case "q2":
        setCurrentStep("q1");
        break;
      case "q3":
        setCurrentStep("q2");
        break;
      case "fact1":
        setCurrentStep("q3");
        break;
      case "q4":
        setCurrentStep("fact1");
        break;
      case "q5":
        setCurrentStep("q4");
        break;
      case "q6":
        setCurrentStep("q5");
        break;
      case "founderSlide":
        setCurrentStep("q6");
        break;
      case "solutionSlide":
        setCurrentStep("founderSlide");
        break;
      case "login":
        setCurrentStep("solutionSlide");
        break;
      case "pricing":
        setCurrentStep("solutionSlide");
        break;
      case "checkout1":
      case "checkout2":
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
          src="/nano_logo.png"
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

  return (
    <div className="min-h-screen bg-white text-[#111111] antialiased">
      {/* ═════════════════════════════════════════════════════════════════════
          1. QUESTION SCREENS (q1 to q6)
          ═════════════════════════════════════════════════════════════════════ */}
      {["q1", "q2", "q3", "q4", "q5", "q6"].includes(currentStep) && (() => {
        const qIndex = parseInt(currentStep.replace("q", ""), 10);
        const qData = QUESTIONS[qIndex - 1];
        const progressPercent = Math.round((qIndex / 6) * 100);

        return (
          <main className="mx-auto max-w-[760px] px-6 py-12 sm:py-16">
            {renderFlowHeader(qIndex === 1 ? "Home" : "Back")}

            <div className="flex items-center justify-between text-[13px] text-[#777]">
              <span>Let&apos;s understand how you study</span>
              <span>{qIndex} / 6</span>
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
                          : "border-[#ddd] bg-white text-[#111] hover:border-[#6195ee] hover:bg-[#f7faff]"
                      )}
                    >
                      <span>{opt}</span>
                      <span className={cn(
                        "h-[18px] w-[18px] rounded-full border transition",
                        isSelected ? "border-[5px] border-[#6195ee] bg-white" : "border-[#aaa] bg-transparent"
                      )} />
                    </button>
                  );
                })}
              </div>
            </div>
          </main>
        );
      })()}

      {/* ═════════════════════════════════════════════════════════════════════
          2. EVIDENCE / RESEARCH SLIDE (fact1)
          ═════════════════════════════════════════════════════════════════════ */}
      {currentStep === "fact1" && (
        <main className="mx-auto max-w-[840px] px-6 py-12 sm:py-16">
          {renderFlowHeader()}

          <div className="rounded-[22px] border border-[#e2e7ef] bg-gradient-to-br from-[#f7faff] to-white p-7 sm:p-9 shadow-sm">
            <div className="text-[11px] font-[800] uppercase tracking-[1.8px] text-[#5d91ef]">
              YOUR ANSWERS + REAL STUDENT EXPERIENCES
            </div>

            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#edf4ff] px-3 py-1.5 text-[12px] font-[800] text-[#477bd4]">
              <Sparkles className="h-3.5 w-3.5" />
              <span>
                {recallStruggleCount > 0
                  ? `${recallStruggleCount} of your first 3 answers point to a recall gap`
                  : "Your recall foundation looks strong. Keep protecting it."}
              </span>
            </div>

            <h2 className="mt-3 text-[28px] sm:text-[34px] font-[760] tracking-[-1.3px] leading-[1.2] text-[#111111]">
              {recallStruggleCount > 0
                ? "You are putting in effort—but recall is blocking the result."
                : "Studying longer does not always mean remembering more."}
            </h2>

            <p className="mt-3 text-[15px] leading-[1.65] text-[#666]">
              {recallStruggleCount > 0 ? (
                <>
                  You are not alone. One student on Reddit described <b>failing after 250 hours of studying</b>. Another reported studying <b>11–13 hours a day</b> and still forgetting calculus before the exam.
                </>
              ) : (
                <>
                  Even students who study for long hours report forgetting under exam pressure. One Reddit post described <b>250 hours of preparation</b> that still ended in failure.
                </>
              )}
            </p>

            <p className="mt-2 text-[15px] leading-[1.65] text-[#666]">
              {recallStruggleCount > 0
                ? "Your answers suggest the problem is not simply effort. You need more chances to retrieve formulas, steps and concepts without looking."
                : "Your answers do not show a major recall problem right now. Regular self-testing can help keep it that way."}
            </p>

            {/* Research Callout */}
            <div className="mt-5 rounded-[14px] border border-[#dbe7fa] bg-[#f5f8ff] p-[17px_19px] text-[14px] leading-[1.6] text-[#596574]">
              <strong className="block text-[#111] font-bold mb-1">
                61% remembered after one week with retrieval practice—versus 40% with repeated studying.
              </strong>
              In the classic experiment, students who tested themselves remembered 21 percentage points more after one week.
            </div>

            <div className="mt-4 text-[12px] text-[#8a9099]">
              Student experiences: <a href="https://www.reddit.com/r/GetStudying/comments/1ldvpwb/failed_exam_despite_250_hours_of_studying_feeling/" target="_blank" rel="noopener noreferrer" className="text-[#5d84c8] underline underline-offset-2">250 hours but failed · Reddit</a> and <a href="https://pubmed.ncbi.nlm.nih.gov/16507066/" target="_blank" rel="noopener noreferrer" className="text-[#5d84c8] underline underline-offset-2">Roediger &amp; Karpicke, 2006</a>.
            </div>
          </div>

          <button
            onClick={() => setCurrentStep("q4")}
            className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#111] py-3.5 text-[14px] font-[700] text-white transition hover:opacity-90 active:scale-[0.99] cursor-pointer"
          >
            Continue →
          </button>
        </main>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          3. FOUNDER'S MESSAGE SLIDE (founderSlide)
          ═════════════════════════════════════════════════════════════════════ */}
      {currentStep === "founderSlide" && (
        <main className="mx-auto max-w-[790px] px-6 py-12 sm:py-16">
          {renderFlowHeader()}

          <div className="rounded-[30px] border border-[rgba(0,0,0,0.08)] bg-gradient-to-br from-[#fff8e8]/70 via-[#f2f7ff]/70 to-[#f8efff]/70 p-7 sm:p-10 shadow-[0_22px_70px_rgba(52,57,92,0.12)]">
            <div className="flex items-center gap-2.5 text-[11px] font-[850] uppercase tracking-[1.7px] text-[#7d61c8]">
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#fff0be] text-[17px]">✦</span>
              <span>ONE LAST THING</span>
            </div>

            <h1 className="mt-4 text-[34px] sm:text-[43px] font-[760] tracking-[-2px] leading-[1.08] text-[#111111]">
              You are not bad at studying.<br />
              You need a better feedback loop.
            </h1>

            <p className="mt-4 text-[17px] leading-[1.7] text-[#575d67]">
              I built Nano Syllabus because capable students spend too much energy wondering what to study, whether they remember it, and how to turn what they know into marks.
            </p>

            <div className="mt-5 rounded-[16px] border border-[#d9e7ff] bg-[#eef5ff] p-[17px_19px] text-[14px] font-[700] text-[#42628f] leading-[1.5]">
              {totalStruggles > 0 ? (
                <>Your answers revealed <b>{totalStruggles} areas</b> where a clearer study system could reduce stress and improve exam readiness.</>
              ) : (
                <>Your answers show a strong foundation. Nano Syllabus can help you keep it consistent and measurable.</>
              )}
            </div>

            <p className="mt-4 text-[17px] leading-[1.7] text-[#575d67]">
              You do not need to fix everything today. Start with one weak topic, study one clear example, attempt one real question, and improve from the feedback.
            </p>

            <div className="mt-6 flex items-center gap-3 border-t border-[#eee] pt-5">
              <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-[#111] text-[16px] font-[850] text-white">
                P
              </div>
              <div>
                <div className="font-bold text-[#111] text-[16px]">Prashant Soni</div>
                <div className="text-[13px] text-[#858a92]">Founder, Nano Syllabus</div>
              </div>
            </div>

            <button
              onClick={() => setCurrentStep("solutionSlide")}
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#111] py-4 text-[14px] font-[700] text-white transition hover:opacity-90 active:scale-[0.99] cursor-pointer"
            >
              See how NanoSyllabus helps →
            </button>
          </div>
        </main>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          4. SOLUTION ROADMAP SLIDE (solutionSlide)
          ═════════════════════════════════════════════════════════════════════ */}
      {currentStep === "solutionSlide" && (
        <main className="mx-auto max-w-[1200px] px-6 py-10 sm:py-14">
          {renderFlowHeader()}

          <div className="text-center max-w-[800px] mx-auto">
            <h1 className="text-[34px] sm:text-[40px] font-[760] tracking-[-2px] text-[#111111] m-[5px_0_9px]">
              How a NanoSyllabus challenge works
            </h1>
            <p className="text-[15px] text-[#6e747d] leading-[1.45] m-0">
              Every day, one challenge takes you from learning a topic to proving you can answer it in the exam.
            </p>
            <div className="text-[12px] font-[850] tracking-[2px] text-[#5d91ef] uppercase mt-5 mb-1.5">
              Daily Challenge Lifecycle
            </div>
          </div>

          {/* 4-Step Pipeline */}
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {/* Step 1 */}
            <div className="relative rounded-[24px] border border-[#dce3ed] bg-white p-[22px] shadow-[0_14px_38px_rgba(43,62,91,0.09)] min-h-[180px]">
              <div className="flex h-[47px] w-[47px] items-center justify-center rounded-[15px] bg-[#e9f2ff] font-[850] text-[18px] text-[#4f83dc] mb-[17px]">
                1
              </div>
              <b className="block text-[17px] text-[#111] mb-2">Learn the content</b>
              <span className="text-[13px] text-[#757b84] leading-[1.5] block">
                Study one small topic from your own notes and books.
              </span>
            </div>

            {/* Step 2 */}
            <div className="relative rounded-[24px] border border-[#dce3ed] bg-white p-[22px] shadow-[0_14px_38px_rgba(43,62,91,0.09)] min-h-[180px] lg:translate-y-8">
              <div className="flex h-[47px] w-[47px] items-center justify-center rounded-[15px] bg-[#fff0c9] font-[850] text-[18px] text-[#9b6b00] mb-[17px]">
                2
              </div>
              <b className="block text-[17px] text-[#111] mb-2">Study a solved past question</b>
              <span className="text-[13px] text-[#757b84] leading-[1.5] block">
                See how that topic is used in a real exam answer, step by step.
              </span>
            </div>

            {/* Step 3 */}
            <div className="relative rounded-[24px] border border-[#dce3ed] bg-white p-[22px] shadow-[0_14px_38px_rgba(43,62,91,0.09)] min-h-[180px]">
              <div className="flex h-[47px] w-[47px] items-center justify-center rounded-[15px] bg-[#e9f9ef] font-[850] text-[18px] text-[#2b8650] mb-[17px]">
                3
              </div>
              <b className="block text-[17px] text-[#111] mb-2">Solve a new past question</b>
              <span className="text-[13px] text-[#757b84] leading-[1.5] block">
                Write the answer yourself without looking at the solution.
              </span>
            </div>

            {/* Step 4 */}
            <div className="relative rounded-[24px] border border-[#dce3ed] bg-white p-[22px] shadow-[0_14px_38px_rgba(43,62,91,0.09)] min-h-[180px] lg:translate-y-8">
              <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-[#fff3c8] px-2.5 py-1 text-[11px] font-[850] text-[#7c5900] shadow-sm">
                <i>🏁</i> Finish
              </div>
              <div className="flex h-[47px] w-[47px] items-center justify-center rounded-[15px] bg-[#f3eaff] font-[850] text-[18px] text-[#7a4ab7] mb-[17px]">
                4
              </div>
              <b className="block text-[17px] text-[#111] mb-2">Get AI-graded marks</b>
              <span className="text-[13px] text-[#757b84] leading-[1.5] block">
                Upload your handwritten answer and get marks, feedback and the exact steps to improve.
              </span>
            </div>
          </div>

          <div className="mt-16 text-center">
            <button
              onClick={() => {
                if (user) {
                  setCurrentStep("pricing");
                } else {
                  setCurrentStep("login");
                }
              }}
              className="inline-flex w-full max-w-[380px] items-center justify-center gap-2 rounded-[12px] bg-[#111] py-4 text-[15px] font-[700] text-white shadow-sm transition hover:opacity-90 active:scale-[0.99] cursor-pointer"
            >
              Create my Nano Syllabus →
            </button>
          </div>
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
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
                  authMode === "signup" ? "bg-white text-[#111] shadow-xs" : "text-[#777]"
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
                  authMode === "login" ? "bg-white text-[#111] shadow-xs" : "text-[#777]"
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
                <label className="block text-[12px] font-[700] text-[#555] mb-1.5">
                  Password
                </label>
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
      {currentStep === "pricing" && (
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

              <div className="mt-8 space-y-2.5">
                <button
                  onClick={() => void beginCheckout("individual-unlimited")}
                  disabled={checkoutLoading}
                  aria-busy={checkoutLoading}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[#111] py-3.5 text-[14px] font-[700] text-white transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
                >
                  {checkoutLoading ? "Creating invoice..." : "Get Individual →"}
                </button>
                <button
                  onClick={() => setDiscountModalOpen(true)}
                  disabled={couponLoading}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[#f1f1f1] py-3 text-[14px] font-[700] text-[#111] transition hover:bg-[#e7e7e7] disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
                >
                  Check discount code
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
            <p role="alert" className="mx-auto mt-5 max-w-xl rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-center text-[13px] text-red-700">
              {checkoutError}
            </p>
          ) : null}
        </main>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          7. STANDARD MOBILE BANKING CHECKOUT (checkout1)
          ═════════════════════════════════════════════ */}
      {currentStep === "checkout1" && (
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
              {checkoutPlan ? `${checkoutPlan.currency} ${checkoutPlan.price} / month` : "Your selected plan"} · Access activates after verification.
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
                        <small className="block text-[11px] text-[#777] mb-1 font-bold">PAYMENT REMARK / INVOICE</small>
                        <b className="block truncate font-mono text-[16px] text-[#111] tracking-wider">{invoiceNumber}</b>
                      </div>
                      <button
                        type="button"
                        onClick={copyInvoiceText}
                        className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-[10px] bg-[#eceef1] px-3.5 py-2 text-[13px] font-[700] text-[#111] transition hover:bg-[#dfe2e6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
                      >
                        {copiedInvoice ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                        <span>{copiedInvoice ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[13px] border border-amber-200 bg-amber-50 p-4 text-[13px] leading-6 text-amber-900">
                  <b>Official payment QR is not configured yet.</b> You can still use the free coupon below. Paid receipt submission will open after an admin adds the official QR.
                </div>
              )}

              <div className="mt-6 border-t border-[#eee] pt-5">
                <label htmlFor="checkout-coupon" className="block text-[12px] font-[700] text-[#555] mb-2">
                  Have a discount code?
                </label>
                <div className="flex gap-2">
                  <input
                    id="checkout-coupon"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={couponInput}
                    onChange={(event) => setCouponInput(event.target.value)}
                    placeholder="WELCOME100"
                    className="min-h-11 flex-1 rounded-[10px] border border-[#bbb] bg-white px-4 py-2.5 text-[14px] uppercase text-[#111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
                  />
                  <button
                    type="button"
                    onClick={() => void handleApplyCoupon()}
                    disabled={couponLoading}
                    aria-busy={couponLoading}
                    className="min-h-11 rounded-[10px] bg-[#111] px-5 py-2.5 text-[13px] font-[700] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
                  >
                    {couponLoading ? "Applying..." : "Apply"}
                  </button>
                </div>
              </div>

              <form onSubmit={submitManualPayment} className="mt-6 space-y-4 border-t border-[#eee] pt-5">
                <div>
                  <label htmlFor="payment-reference" className="mb-1.5 block text-[12px] font-[700] text-[#555]">Transaction reference *</label>
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
                  <label htmlFor="payment-payer-name" className="mb-1.5 block text-[12px] font-[700] text-[#555]">Payer name *</label>
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
                  <label htmlFor="payment-receipt" className="mb-1.5 block text-[12px] font-[700] text-[#555]">Payment receipt *</label>
                  <input
                    id="payment-receipt"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    required
                    onChange={(event) => setPaymentReceipt(event.target.files?.[0] ?? null)}
                    className="block min-h-11 w-full rounded-[10px] border border-[#bbb] bg-white px-3 py-2 text-[13px] text-[#555] file:mr-3 file:rounded-md file:border-0 file:bg-[#eceef1] file:px-3 file:py-1.5 file:font-[700] file:text-[#111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
                  />
                  <p className="mt-1 text-[12px] text-[#666]">JPG, PNG, WebP, or PDF · maximum 5 MB</p>
                </div>
                <div>
                  <label htmlFor="payment-note" className="mb-1.5 block text-[12px] font-[700] text-[#555]">Note (optional)</label>
                  <textarea
                    id="payment-note"
                    rows={3}
                    value={paymentNote}
                    onChange={(event) => setPaymentNote(event.target.value)}
                    className="w-full rounded-[10px] border border-[#bbb] bg-white px-3 py-2 text-[14px] text-[#111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
                  />
                </div>

                {checkoutError ? <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-[13px] text-red-700">{checkoutError}</p> : null}

                <button
                  type="submit"
                  disabled={!paymentConfig || !checkoutInvoice || paymentSubmitting || !paymentReference.trim() || !paymentPayerName.trim() || !paymentReceipt}
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
                    <span>{checkoutInvoice?.currency ?? "NPR"} {checkoutInvoice?.subtotal ?? checkoutPlan?.price ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-[#777]">
                    <span>Discount</span>
                    <span>{checkoutInvoice?.discountAmount ? `− ${checkoutInvoice.currency} ${checkoutInvoice.discountAmount}` : "—"}</span>
                  </div>
                  <div className="flex justify-between border-t border-[#eee] pt-3 text-[18px] font-[800] text-[#111]">
                    <span>Total today</span>
                    <span>{checkoutInvoice?.currency ?? "NPR"} {checkoutInvoice?.amount ?? checkoutPlan?.price ?? 0}</span>
                  </div>
                </div>
                <p className="mt-5 text-[12px] leading-5 text-[#666]">Invoice {invoiceNumber} expires in 24 hours. Payment is usually verified within one business day.</p>
              </div>

              <button
                type="button"
                onClick={() => setDiscountModalOpen(true)}
                className="mt-8 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[#eceef1] py-3 text-[13px] font-[700] text-[#111] transition hover:bg-[#dfe2e6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
              >
                Use a discount code
              </button>
            </div>
          </div>
        </main>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          8. 100% DISCOUNT FREE TRIAL CHECKOUT (checkout2)
          ═════════════════════════════════════════════ */}
      {currentStep === "checkout2" && (
        <main className="mx-auto max-w-[1050px] px-6 py-12 sm:py-16">
          {renderFlowHeader()}

          <div className="mb-6">
            <div className="text-[11px] font-[800] uppercase tracking-[1.8px] text-[#26905a]">
              100% DISCOUNT APPLIED
            </div>
            <h1 className="mt-1 text-[34px] sm:text-[40px] font-[760] tracking-[-2px] text-[#111111]">
              Your first month is free.
            </h1>
            <p className="mt-1 text-[14px] text-[#777]">
              You pay Rs. 0 today.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_.7fr]">
            <div className="rounded-[20px] border border-[#e2e2e2] bg-white p-7 shadow-xs">
              <h3 className="text-[17px] font-[750] text-[#111] mb-4">
                Payment details
              </h3>

              <div className="space-y-3.5 text-[14px]">
                <div>
                  <label htmlFor="coupon-customer-name" className="block text-[12px] font-[700] text-[#555] mb-1">Name</label>
                  <input 
                    id="coupon-customer-name"
                    type="text" 
                    readOnly 
                    value={user?.fullName || "Student"}
                    className="w-full rounded-[10px] border border-[#ddd] bg-[#f9f9f9] p-3 text-[14px] text-[#111]"
                  />
                </div>
                <div>
                  <label htmlFor="coupon-payment-method" className="block text-[12px] font-[700] text-[#555] mb-1">Payment method</label>
                  <input 
                    id="coupon-payment-method"
                    type="text" 
                    readOnly 
                    value="No payment required for this invoice"
                    className="w-full rounded-[10px] border border-[#ddd] bg-[#f9f9f9] p-3 text-[14px] text-[#111]"
                  />
                </div>
              </div>

              <div className="mt-5 rounded-[13px] bg-[#f5f8ff] border border-[#dbe8ff] p-3.5 text-[13px] leading-[1.5] text-[#555]">
                <b className="text-[#487fdc]">{couponInput || "WELCOME100"}</b> has been verified by the server and gives 100% off this invoice. We do not store a payment method; renewal requires a new payment.
              </div>

              <button
                onClick={() => router.push("/app/today")}
                className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[#111] py-4 text-[14px] font-[700] text-white shadow-sm transition hover:opacity-90 active:scale-[0.99] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
              >
                Start Unlimited for Rs. 0 →
              </button>
            </div>

            {/* Order summary */}
            <div className="rounded-[20px] border border-[#e2e2e2] bg-white p-7 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-[17px] font-[750] text-[#111] mb-4">
                  Order summary
                </h3>
                <div className="space-y-2.5 text-[14px]">
                  <div className="flex justify-between text-[#666]">
                    <span>{checkoutPlan?.name ?? "Individual Unlimited"}</span>
                    <span>{checkoutInvoice?.currency ?? "NPR"} {checkoutInvoice?.subtotal ?? 1500}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-[#26905a]">
                    <span>{couponInput || "WELCOME100"} · 100% off</span>
                    <span>− {checkoutInvoice?.currency ?? "NPR"} {checkoutInvoice?.discountAmount ?? 1500}</span>
                  </div>
                  <div className="flex justify-between border-t border-[#eee] pt-3 text-[18px] font-[800] text-[#111]">
                    <span>Total today</span>
                    <span>{checkoutInvoice?.currency ?? "NPR"} {checkoutInvoice?.amount ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          9. GROUP CHECKOUT (groupCheckout)
          ═════════════════════════════════════════════════════════════════════ */}
      {currentStep === "groupCheckout" && (
        <main className="mx-auto max-w-[1050px] px-6 py-12 sm:py-16">
          {renderFlowHeader()}

          <div className="mb-6">
            <div className="text-[11px] font-[800] uppercase tracking-[1.8px] text-[#5d91ef]">
              GROUP PLAN
            </div>
            <h1 className="mt-1 text-[34px] sm:text-[40px] font-[760] tracking-[-2px] text-[#111111]">
              Study together.
            </h1>
            <p className="mt-1 text-[14px] text-[#777]">
              5 student accounts · Rs. 5,000 / month
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_.7fr]">
            <div className="rounded-[20px] border border-[#e2e2e2] bg-white p-7 shadow-xs">
              <h3 className="text-[17px] font-[750] text-[#111] mb-4">
                Group details
              </h3>

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
                <b className="text-[#487fdc]">Five students in one package.</b> Each student gets their own account, progress and exam-readiness view.
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
              {checkoutError ? <p role="alert" className="mt-3 text-[13px] text-red-700">{checkoutError}</p> : null}
            </div>

            {/* Order summary */}
            <div className="rounded-[20px] border border-[#e2e2e2] bg-white p-7 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-[17px] font-[750] text-[#111] mb-4">
                  Order summary
                </h3>
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
      {currentStep === "paymentPending" && (
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
              Receipt and transaction details for invoice <b>{invoiceNumber}</b> were submitted securely. We&apos;ll notify you after an admin matches the payment.
            </p>

            <div className="mt-5 rounded-[13px] bg-[#f5f8ff] border border-[#dbe8ff] p-3.5 text-[13px] leading-[1.5] text-[#555]">
              <b className="text-[#487fdc]">What happens next:</b> approval activates the subscription automatically. Payment is usually verified within one business day.
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

      {/* ═════════════════════════════════════════════════════════════════════
          DISCOUNT CODE MODAL (WELCOME100)
          ═════════════════════════════════════════════════════════════════════ */}
      {discountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="relative w-full max-w-[430px] rounded-[22px] border border-[#ddd] bg-white p-7 sm:p-8 shadow-2xl">
            <button
              type="button"
              onClick={() => setDiscountModalOpen(false)}
              aria-label="Close discount dialog"
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#f1f1f1] text-[#666] hover:text-[#111] transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="text-[11px] font-[800] uppercase tracking-[1.8px] text-[#d88916]">
              LIMITED OFFER
            </div>
            <h2 className="mt-1 text-[24px] font-[750] text-[#111]">
              Get your first month free.
            </h2>
            <p className="mt-2 text-[14px] text-[#777] leading-[1.5]">
              Use this code to get <b>100% off</b> your Rs. 1,500/month Individual plan. Offer valid until <b>August 31, 2026</b>.
            </p>

            <div className="my-5 rounded-[12px] border border-dashed border-[#aaa] bg-[#f5f5f5] p-3.5 text-center">
              <div className="font-mono text-[24px] font-[800] tracking-[2px] text-[#111]">
                WELCOME100
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleApplyCoupon("WELCOME100")}
              disabled={couponLoading}
              aria-busy={couponLoading}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[#111] py-3.5 text-[14px] font-[700] text-white transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6195ee] focus-visible:ring-offset-2"
            >
              {couponLoading ? "Applying securely..." : "Use this code →"}
            </button>
            {checkoutError ? <p role="alert" className="mt-3 text-[13px] text-red-700">{checkoutError}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}
