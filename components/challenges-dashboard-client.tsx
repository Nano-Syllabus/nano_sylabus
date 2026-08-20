"use client";

import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";

type ChallengeTopic = {
  id: string;
  subject: string;
  topicName: string;
  initials: string;
  title: string;
  recommended?: boolean;
  solvedCount: number;
  pastCount: number;
  durationMin: number;
  description: string;
  lesson: {
    title: string;
    content: string[];
    focus: string;
  };
  solvedQuestions: Array<{
    year: string;
    question: string;
    solution: string;
  }>;
  exam: {
    questionCount: number;
    durationMin: number;
  };
};

const CHALLENGES_DATA: ChallengeTopic[] = [
  {
    id: "laplace-transform",
    subject: "Control Systems",
    topicName: "Laplace Transform",
    initials: "LT",
    title: "Master Laplace Transform",
    recommended: true,
    solvedCount: 2,
    pastCount: 2,
    durationMin: 20,
    description: "Read the material, study two solved questions, then prove it with two past questions.",
    lesson: {
      title: "What you need to know",
      content: [
        "The Laplace transform converts a time-domain function into a complex-frequency representation. For control systems, it makes differential equations easier to analyze and helps describe transfer functions, system response, poles, and zeros.",
        "Focus for this challenge: know the common transform pairs, understand the transform of derivatives, and be able to move between a differential equation and its transfer-function representation."
      ],
      focus: "know the common transform pairs, understand the transform of derivatives, and be able to move between a differential equation and its transfer-function representation.",
    },
    solvedQuestions: [
      {
        year: "Past Question · 2024",
        question: "Find the Laplace transform of f(t) = t e⁻²ᵗ.",
        solution: "Using L{t f(t)} = -d/ds F(s) and L{e⁻²ᵗ} = 1/(s+2), the result is 1/(s+2)².",
      },
      {
        year: "Past Question · 2023",
        question: "Obtain the transfer function of a system described by y'' + 3y' + 2y = x(t), assuming zero initial conditions.",
        solution: "Taking the Laplace transform gives (s² + 3s + 2)Y(s) = X(s), so G(s) = Y(s)/X(s) = 1/(s² + 3s + 2).",
      },
    ],
    exam: {
      questionCount: 2,
      durationMin: 20,
    },
  },
  {
    id: "frequency-response",
    subject: "Control Systems",
    topicName: "Frequency Response",
    initials: "FR",
    title: "Practice Frequency Response",
    recommended: false,
    solvedCount: 2,
    pastCount: 2,
    durationMin: 25,
    description: "Read the material, study two solved questions, then prove it with two past questions.",
    lesson: {
      title: "What you need to know",
      content: [
        "Frequency response describes the steady-state output of a linear time-invariant system to a sinusoidal input across various frequencies.",
        "Focus for this challenge: understand Gain Margin, Phase Margin, Bode plots, and stability analysis in frequency domain."
      ],
      focus: "understand Gain Margin, Phase Margin, Bode plots, and stability analysis in frequency domain.",
    },
    solvedQuestions: [
      {
        year: "Past Question · 2023",
        question: "For G(s) = 10 / (s(s+1)), determine the frequency where the phase angle is -135°.",
        solution: "∠G(jω) = -90° - arctan(ω). Setting -90° - arctan(ω) = -135° gives arctan(ω) = 45°, so ω = 1 rad/s.",
      },
      {
        year: "Past Question · 2022",
        question: "Calculate the Gain Margin for an open loop system with phase crossover frequency ω_pc = 2 rad/s and |G(jω_pc)| = 0.25.",
        solution: "Gain Margin GM = 1 / |G(jω_pc)| = 1 / 0.25 = 4 (or 12.04 dB).",
      },
    ],
    exam: {
      questionCount: 2,
      durationMin: 25,
    },
  },
  {
    id: "attention-mechanism",
    subject: "Deep Learning",
    topicName: "Attention Mechanism",
    initials: "AM",
    title: "Understand Attention Mechanism",
    recommended: true,
    solvedCount: 2,
    pastCount: 2,
    durationMin: 20,
    description: "Read the material, study two solved questions, then prove it with two past questions.",
    lesson: {
      title: "What you need to know",
      content: [
        "Attention allows neural models to dynamically focus on different parts of an input sequence, calculating similarity scores between Queries and Keys to weight Values.",
        "Focus for this challenge: understand Scaled Dot-Product Attention, Multi-Head Attention equations, and why softmax scaling by √d_k is necessary."
      ],
      focus: "understand Scaled Dot-Product Attention, Multi-Head Attention equations, and why softmax scaling by √d_k is necessary.",
    },
    solvedQuestions: [
      {
        year: "Past Question · 2024",
        question: "Why is the dot-product scaled by 1/√d_k in Scaled Dot-Product Attention?",
        solution: "For large values of d_k, dot products grow large, pushing the softmax function into regions with tiny gradients. Dividing by √d_k counters this effect.",
      },
      {
        year: "Past Question · 2023",
        question: "Given Query Q ∈ ℝ^(N×d) and Key K ∈ ℝ^(M×d), what is the shape of the attention weight matrix?",
        solution: "The matrix multiplication QKᵀ produces shape N × M. Applying softmax preserves this N × M shape.",
      },
    ],
    exam: {
      questionCount: 2,
      durationMin: 20,
    },
  },
];

export function ChallengesDashboardClient({
  fullName = "Student",
}: {
  fullName?: string;
}) {
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [completedChallenges, setCompletedChallenges] = useState<Record<string, boolean>>({});
  const [examStarted, setExamStarted] = useState<Record<string, boolean>>({});

  const activeChallenge = useMemo(() => {
    return CHALLENGES_DATA.find((c) => c.id === selectedChallengeId) || null;
  }, [selectedChallengeId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [selectedChallengeId]);

  const handleOpenChallenge = (id: string) => {
    setSelectedChallengeId(id);
  };

  const handleTakeExam = (id: string) => {
    setExamStarted((prev) => ({ ...prev, [id]: true }));
    setCompletedChallenges((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <div className="w-full bg-bg-primary text-text-primary min-h-screen transition-colors duration-200">
      {!activeChallenge ? (
        /* ═════════════════════════════════════════════════════════════════════
           DASHBOARD / CHALLENGES LIST
           ═════════════════════════════════════════════════════════════════════ */
        <div className="max-w-[1160px] mx-auto px-4 sm:px-8 py-8 pb-20">
          {/* Today's minimum */}
          <div className="border border-border bg-bg-secondary rounded-[15px] p-[17px_20px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 mb-[30px]">
            <div>
              <div className="font-[750] text-[15px] mb-1 text-text-primary">Today&apos;s minimum</div>
              <div className="text-[13px] text-text-secondary">
                <strong className="text-text-primary font-semibold">1 challenge</strong> keeps your 12-day streak alive.
              </div>
            </div>
            <div className="w-full sm:w-[190px]">
              <span className="block text-right text-[12px] text-text-muted mb-[5px]">
                {Object.keys(completedChallenges).length > 0 ? "1 / 1" : "0 / 1"}
              </span>
              <div className="h-[7px] bg-bg-tertiary rounded-full overflow-hidden">
                <i 
                  className="block h-full bg-[#5d98ff] dark:bg-[#4c84eb] rounded-full transition-all duration-500"
                  style={{ width: Object.keys(completedChallenges).length > 0 ? "100%" : "0%" }}
                />
              </div>
            </div>
          </div>

          {/* Hero Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_.9fr] gap-[18px] mb-6">
            {/* Exam Readiness */}
            <div className="border border-border rounded-[18px] bg-card p-[25px_27px]">
              <div className="text-[18px] font-[730] mb-[5px] text-text-primary">Exam readiness</div>
              <div className="text-[14px] text-text-muted">Across all your subjects</div>
              <div className="text-[40px] font-[760] tracking-[-1.5px] mt-5 text-text-primary">68%</div>
              <div className="h-[12px] bg-bg-secondary rounded-full overflow-hidden my-[9px_12px]">
                <span className="block h-full w-[68%] bg-[#5d98ff] dark:bg-[#4c84eb] rounded-full" />
              </div>
              <div className="flex justify-between text-[13px] text-text-muted">
                <span>12 of 18 topics practiced</span>
                <span className="text-blue-600 dark:text-blue-400 font-medium">+8% this week</span>
              </div>
              <div className="mt-[18px] pt-[15px] border-t border-border">
                <div className="grid grid-cols-[145px_1fr_35px] gap-[10px] items-center text-[12px] text-text-secondary my-[9px]">
                  <span>Control Systems</span>
                  <div className="h-[6px] bg-bg-secondary rounded-full overflow-hidden">
                    <i className="block h-full bg-[#8db6ff] dark:bg-[#4c84eb] rounded-full" style={{ width: "76%" }} />
                  </div>
                  <b className="text-[12px] text-text-primary text-right font-bold">76%</b>
                </div>
                <div className="grid grid-cols-[145px_1fr_35px] gap-[10px] items-center text-[12px] text-text-secondary my-[9px]">
                  <span>Deep Learning</span>
                  <div className="h-[6px] bg-bg-secondary rounded-full overflow-hidden">
                    <i className="block h-full bg-[#8db6ff] dark:bg-[#4c84eb] rounded-full" style={{ width: "61%" }} />
                  </div>
                  <b className="text-[12px] text-text-primary text-right font-bold">61%</b>
                </div>
                <div className="grid grid-cols-[145px_1fr_35px] gap-[10px] items-center text-[12px] text-text-secondary my-[9px]">
                  <span>Signals &amp; Systems</span>
                  <div className="h-[6px] bg-bg-secondary rounded-full overflow-hidden">
                    <i className="block h-full bg-[#8db6ff] dark:bg-[#4c84eb] rounded-full" style={{ width: "67%" }} />
                  </div>
                  <b className="text-[12px] text-text-primary text-right font-bold">67%</b>
                </div>
              </div>
            </div>

            {/* Consistency Streak */}
            <div className="border border-border rounded-[18px] p-[25px_27px] bg-gradient-to-br from-bg-primary via-bg-primary to-blue-500/5 dark:to-blue-950/20 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[18px] font-[730] mb-[5px] text-text-primary">Consistency streak</div>
                    <div className="text-[39px] font-[760] tracking-[-1.5px] mt-3 text-text-primary">12 days</div>
                    <div className="text-text-muted text-[14px]">You · current streak</div>
                  </div>
                  <div className="text-[31px] select-none">♨</div>
                </div>

                <div className="flex justify-between items-center border-t border-border pt-[10px] mt-[14px] text-[13px] text-text-muted">
                  <span>Your rank</span>
                  <strong className="text-text-primary font-bold">#18</strong>
                </div>
                <div className="flex justify-between items-center border-t border-border pt-[10px] mt-2 text-[13px] text-text-muted">
                  <span>Best streak</span>
                  <strong className="text-text-primary font-bold">47 days · #1</strong>
                </div>
              </div>

              <div className="inline-flex items-center gap-[7px] bg-card border border-blue-500/30 rounded-[20px] p-[7px_11px] text-blue-600 dark:text-blue-400 text-[12px] font-bold mt-[17px] w-fit">
                You&apos;re 35 days away from the current #1 streak
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
            <div className="p-[18px_20px] border border-border rounded-[15px] bg-card">
              <div className="text-[13px] text-text-muted mb-[7px] font-medium tracking-wide">YOUR CHALLENGES / DAY</div>
              <div className="text-[24px] font-[750] text-text-primary">2.4</div>
              <div className="text-[12px] text-text-muted mt-1">Your rank · #31</div>
            </div>

            <div className="p-[18px_20px] border border-blue-500/30 bg-blue-500/5 dark:bg-blue-950/20 rounded-[15px]">
              <div className="text-[13px] text-blue-600 dark:text-blue-400 mb-[7px] font-medium tracking-wide">TOP CHALLENGES / DAY</div>
              <div className="text-[24px] font-[750] text-text-primary">6.8</div>
              <div className="text-[12px] text-text-muted mt-1">Current #1 · 7-day average</div>
            </div>

            <div className="p-[18px_20px] border border-border rounded-[15px] bg-card">
              <div className="text-[13px] text-text-muted mb-[7px] font-medium tracking-wide">COMPLETED</div>
              <div className="text-[24px] font-[750] text-text-primary">{29 + Object.keys(completedChallenges).length}</div>
              <div className="text-[12px] text-text-muted mt-1">This month · +11 this week</div>
            </div>

            <div className="p-[18px_20px] border border-border rounded-[15px] bg-card">
              <div className="text-[13px] text-text-muted mb-[7px] font-medium tracking-wide">CHALLENGE PASS RATE</div>
              <div className="text-[24px] font-[750] text-text-primary">84%</div>
              <div className="text-[12px] text-text-muted mt-1">Last 30 days</div>
            </div>
          </div>

          {/* Section Head */}
          <div className="flex items-end justify-between mt-[30px] mb-[14px]">
            <div>
              <h2 className="text-[22px] font-[750] tracking-[-.5px] m-0 text-text-primary">Challenges</h2>
              <p className="text-[13px] text-text-muted mt-1.5 mb-0">Complete one to keep your streak. More challenges appear as you finish them.</p>
            </div>
          </div>

          {/* Subject 1: Control Systems */}
          <div className="mb-[25px]">
            <div className="flex justify-between items-center px-[2px] pb-[10px] border-b border-border mb-[10px]">
              <div>
                <div className="text-[17px] font-[750] text-text-primary">Control Systems</div>
                <div className="text-[12px] text-text-muted mt-1">76% ready · 2 weak topics</div>
              </div>
              <div className="text-[20px] font-[750] text-blue-600 dark:text-blue-400">76%</div>
            </div>
            <div className="flex flex-col gap-3">
              {/* Challenge 1 */}
              <div 
                onClick={() => handleOpenChallenge("laplace-transform")}
                className="border border-border rounded-[16px] p-[19px_20px] grid grid-cols-[48px_1fr_auto] gap-4 items-center cursor-pointer transition-all duration-150 hover:border-blue-500/50 hover:shadow-md bg-card"
              >
                <div className="w-[48px] h-[48px] rounded-[14px] bg-blue-500/10 text-blue-600 dark:text-blue-400 grid place-items-center font-[800] text-[15px]">
                  LT
                </div>
                <div>
                  <div className="text-[17px] font-[720] mb-[5px] text-text-primary">Master Laplace Transform</div>
                  <div className="text-[13px] text-text-muted flex gap-2.5 flex-wrap items-center">
                    <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-[7px] font-bold text-[12px]">Recommended</span>
                    <span className="bg-bg-secondary px-2 py-1 rounded-[7px] text-text-secondary text-[12px]">2 solved questions</span>
                    <span className="bg-bg-secondary px-2 py-1 rounded-[7px] text-text-secondary text-[12px]">2 past questions</span>
                  </div>
                </div>
                <div className="flex items-center">
                  <span className="text-[13px] text-text-muted mr-3">~20 min</span>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenChallenge("laplace-transform");
                    }}
                    className="border-0 bg-text-primary text-text-inverse rounded-[22px] px-4 py-2 text-[13px] font-[700] cursor-pointer hover:opacity-90 transition active:scale-95"
                  >
                    Start →
                  </button>
                </div>
              </div>

              {/* Challenge 2 */}
              <div 
                onClick={() => handleOpenChallenge("frequency-response")}
                className="border border-border rounded-[16px] p-[19px_20px] grid grid-cols-[48px_1fr_auto] gap-4 items-center cursor-pointer transition-all duration-150 hover:border-blue-500/50 hover:shadow-md bg-card"
              >
                <div className="w-[48px] h-[48px] rounded-[14px] bg-blue-500/10 text-blue-600 dark:text-blue-400 grid place-items-center font-[800] text-[15px]">
                  FR
                </div>
                <div>
                  <div className="text-[17px] font-[720] mb-[5px] text-text-primary">Practice Frequency Response</div>
                  <div className="text-[13px] text-text-muted flex gap-2.5 flex-wrap items-center">
                    <span className="bg-bg-secondary px-2 py-1 rounded-[7px] text-text-secondary text-[12px]">2 solved questions</span>
                    <span className="bg-bg-secondary px-2 py-1 rounded-[7px] text-text-secondary text-[12px]">2 past questions</span>
                  </div>
                </div>
                <div className="flex items-center">
                  <span className="text-[13px] text-text-muted mr-3">~25 min</span>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenChallenge("frequency-response");
                    }}
                    className="border-0 bg-text-primary text-text-inverse rounded-[22px] px-4 py-2 text-[13px] font-[700] cursor-pointer hover:opacity-90 transition active:scale-95"
                  >
                    Start →
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Subject 2: Deep Learning */}
          <div className="mb-[25px]">
            <div className="flex justify-between items-center px-[2px] pb-[10px] border-b border-border mb-[10px]">
              <div>
                <div className="text-[17px] font-[750] text-text-primary">Deep Learning</div>
                <div className="text-[12px] text-text-muted mt-1">61% ready · 4 weak topics</div>
              </div>
              <div className="text-[20px] font-[750] text-blue-600 dark:text-blue-400">61%</div>
            </div>
            <div className="flex flex-col gap-3">
              <div 
                onClick={() => handleOpenChallenge("attention-mechanism")}
                className="border border-border rounded-[16px] p-[19px_20px] grid grid-cols-[48px_1fr_auto] gap-4 items-center cursor-pointer transition-all duration-150 hover:border-blue-500/50 hover:shadow-md bg-card"
              >
                <div className="w-[48px] h-[48px] rounded-[14px] bg-blue-500/10 text-blue-600 dark:text-blue-400 grid place-items-center font-[800] text-[15px]">
                  AM
                </div>
                <div>
                  <div className="text-[17px] font-[720] mb-[5px] text-text-primary">Understand Attention Mechanism</div>
                  <div className="text-[13px] text-text-muted flex gap-2.5 flex-wrap items-center">
                    <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-[7px] font-bold text-[12px]">Recommended</span>
                    <span className="bg-bg-secondary px-2 py-1 rounded-[7px] text-text-secondary text-[12px]">2 solved questions</span>
                    <span className="bg-bg-secondary px-2 py-1 rounded-[7px] text-text-secondary text-[12px]">2 past questions</span>
                  </div>
                </div>
                <div className="flex items-center">
                  <span className="text-[13px] text-text-muted mr-3">~20 min</span>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenChallenge("attention-mechanism");
                    }}
                    className="border-0 bg-text-primary text-text-inverse rounded-[22px] px-4 py-2 text-[13px] font-[700] cursor-pointer hover:opacity-90 transition active:scale-95"
                  >
                    Start →
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Subject 3: Signals & Systems */}
          <div className="mb-[25px]">
            <div className="flex justify-between items-center px-[2px] pb-[10px] border-b border-border mb-[10px]">
              <div>
                <div className="text-[17px] font-[750] text-text-primary">Signals &amp; Systems</div>
                <div className="text-[12px] text-text-muted mt-1">67% ready · No urgent challenge in today&apos;s top 3</div>
              </div>
              <div className="text-[20px] font-[750] text-text-muted">67%</div>
            </div>
            <div className="border border-dashed border-border rounded-[14px] p-[17px] text-text-muted text-[13px] bg-bg-secondary/40">
              You&apos;re caught up for now. Finish one of today&apos;s challenges and the next Signals &amp; Systems challenge can enter your queue.
            </div>
          </div>
        </div>
      ) : (
        /* ═════════════════════════════════════════════════════════════════════
           CHALLENGE DETAIL VIEW
           ═════════════════════════════════════════════════════════════════════ */
        <div className="max-w-[1160px] mx-auto px-4 sm:px-8 py-8 pb-20">
          <button 
            type="button"
            onClick={() => setSelectedChallengeId(null)}
            className="border-0 bg-transparent p-0 text-text-muted cursor-pointer text-[14px] mb-[22px] hover:text-text-primary flex items-center gap-1.5 transition"
          >
            ← Back to challenges
          </button>

          <div className="text-[14px] text-blue-600 dark:text-blue-400 font-[650] mb-2 uppercase tracking-wide">
            CHALLENGE · {activeChallenge.subject.toUpperCase()}
          </div>
          <h1 className="text-[38px] tracking-[-1.4px] m-[0_0_8px] font-[760] text-text-primary">
            {activeChallenge.title}
          </h1>
          <p className="text-text-secondary text-[16px] mb-[25px] mt-0">
            Read the material, study two solved questions, then prove it with two past questions.
          </p>

          {/* Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-[22px]">
            <div className="border border-border rounded-[15px] p-[18px] bg-card">
              <div className="w-[28px] h-[28px] rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 grid place-items-center font-[750] text-[13px] mb-[13px]">
                1
              </div>
              <h3 className="m-[0_0_6px] text-[15px] font-[700] text-text-primary">Learn</h3>
              <p className="m-0 text-text-muted text-[13px] leading-[1.45]">Read the short topic explanation from your uploaded material.</p>
            </div>

            <div className="border border-border rounded-[15px] p-[18px] bg-card">
              <div className="w-[28px] h-[28px] rounded-full bg-bg-secondary text-text-primary grid place-items-center font-[750] text-[13px] mb-[13px]">
                2
              </div>
              <h3 className="m-[0_0_6px] text-[15px] font-[700] text-text-primary">Study 2 solved questions</h3>
              <p className="m-0 text-text-muted text-[13px] leading-[1.45]">Understand how this topic is used in real exam questions.</p>
            </div>

            <div className="border border-border rounded-[15px] p-[18px] bg-card">
              <div className="w-[28px] h-[28px] rounded-full bg-bg-secondary text-text-primary grid place-items-center font-[750] text-[13px] mb-[13px]">
                3
              </div>
              <h3 className="m-[0_0_6px] text-[15px] font-[700] text-text-primary">Pass the exam</h3>
              <p className="m-0 text-text-muted text-[13px] leading-[1.45]">Answer two past questions without help. Pass to complete the challenge.</p>
            </div>
          </div>

          {/* Lesson */}
          <div className="border border-border rounded-[18px] p-[27px] mb-[15px] bg-card">
            <div className="text-[14px] text-blue-600 dark:text-blue-400 font-[650] mb-2 uppercase tracking-wide">STEP 1 · READ</div>
            <h2 className="text-[22px] font-[750] m-[0_0_12px] text-text-primary">{activeChallenge.lesson.title}</h2>
            {activeChallenge.lesson.content.map((p, idx) => (
              <p key={idx} className="text-[15px] leading-[1.7] text-text-secondary my-2">
                {idx === 1 ? (
                  <>
                    <strong className="text-text-primary">Focus for this challenge:</strong> {activeChallenge.lesson.focus}
                  </>
                ) : (
                  p
                )}
              </p>
            ))}
          </div>

          {/* Solved Questions */}
          <div className="border border-border rounded-[18px] p-[27px] mb-[15px] bg-card">
            <div className="text-[14px] text-blue-600 dark:text-blue-400 font-[650] mb-2 uppercase tracking-wide">STEP 2 · SOLVED QUESTIONS</div>
            <h2 className="text-[22px] font-[750] m-[0_0_12px] text-text-primary">Study these two examples</h2>

            {activeChallenge.solvedQuestions.map((q, idx) => (
              <div key={idx} className="mt-[17px] p-[17px] rounded-[13px] bg-bg-secondary/60 border border-border">
                <div className="flex justify-between gap-[10px] text-[13px] text-text-muted mb-[9px]">
                  <span className="font-semibold text-text-primary">{q.year}</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">Solved</span>
                </div>
                <div className="font-[680] text-[15px] leading-[1.5] text-text-primary">
                  {q.question}
                </div>
                <div className="mt-[11px] text-text-secondary text-[14px] leading-[1.55] pt-2 border-t border-border">
                  <strong className="text-text-primary">Solution: </strong>{q.solution}
                </div>
              </div>
            ))}
          </div>

          {/* Exam Box */}
          <div className="border border-blue-500/30 bg-blue-500/5 dark:bg-blue-950/20 rounded-[18px] p-[25px] mt-[20px]">
            <div className="text-[14px] text-blue-600 dark:text-blue-400 font-[650] mb-2 uppercase tracking-wide">STEP 3 · PROVE IT</div>
            <h2 className="m-[0_0_7px] text-[22px] font-[750] text-text-primary">Take the challenge exam</h2>
            <p className="text-text-secondary text-[14px] leading-[1.5] my-2">
              Two past questions. No notes. Submit your answers and pass the evaluation to complete this challenge.
            </p>
            <div className="flex gap-5 my-[18px] text-text-muted text-[13px] font-medium">
              <span>{activeChallenge.exam.questionCount} questions</span>
              <span>{activeChallenge.exam.durationMin} minutes</span>
              <span>Pass required</span>
            </div>

            <button
              type="button"
              disabled={examStarted[activeChallenge.id]}
              onClick={() => handleTakeExam(activeChallenge.id)}
              className={cn(
                "border-0 text-white rounded-[25px] px-6 py-3 font-[700] text-[14px] cursor-pointer transition active:scale-95",
                examStarted[activeChallenge.id]
                  ? "bg-emerald-600 opacity-80 cursor-default"
                  : "bg-blue-600 hover:bg-blue-700"
              )}
            >
              {examStarted[activeChallenge.id] ? "Exam started ✓" : "Take exam →"}
            </button>

            {completedChallenges[activeChallenge.id] && (
              <div className="p-[18px_20px] rounded-[15px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-[700] mt-[15px] text-[14px]">
                ✓ Challenge completed. Your streak and progress have been updated.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
