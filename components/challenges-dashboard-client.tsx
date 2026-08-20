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
    <div className="w-full bg-white text-[#111111] min-h-screen">
      {!activeChallenge ? (
        /* ═════════════════════════════════════════════════════════════════════
           DASHBOARD / CHALLENGES LIST
           ═════════════════════════════════════════════════════════════════════ */
        <div className="max-w-[1160px] mx-auto px-5 sm:px-10 py-9 pb-20">
          {/* Today's minimum */}
          <div className="border border-[#e5e5e7] bg-[#fafafa] rounded-[15px] p-[17px_20px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 mb-[30px]">
            <div>
              <div className="font-[750] text-[15px] mb-1 text-[#111111]">Today&apos;s minimum</div>
              <div className="text-[13px] text-[#737780]">
                <strong className="text-[#111111] font-semibold">1 challenge</strong> keeps your 12-day streak alive.
              </div>
            </div>
            <div className="w-full sm:w-[190px]">
              <span className="block text-right text-[12px] text-[#777] mb-[5px]">0 / 1</span>
              <div className="h-[7px] bg-[#eeeeef] rounded-full overflow-hidden">
                <i 
                  className="block h-full bg-[#72a5ff] rounded-full transition-all duration-500" 
                  style={{ width: Object.keys(completedChallenges).length > 0 ? "100%" : "0%" }}
                />
              </div>
            </div>
          </div>

          {/* Hero Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_.9fr] gap-[18px] mb-6">
            {/* Exam Readiness */}
            <div className="border border-[#e7e7e7] rounded-[18px] bg-white p-[25px_27px]">
              <div className="text-[18px] font-[730] mb-[5px] text-[#111111]">Exam readiness</div>
              <div className="text-[14px] text-[#7b7e85]">Across all your subjects</div>
              <div className="text-[40px] font-[760] tracking-[-1.5px] mt-5 text-[#111111]">68%</div>
              <div className="h-[12px] bg-[#eeeeef] rounded-full overflow-hidden my-[9px_12px]">
                <span className="block h-full w-[68%] bg-[#72a5ff] rounded-full" />
              </div>
              <div className="flex justify-between text-[13px] text-[#777]">
                <span>12 of 18 topics practiced</span>
                <span>+8% this week</span>
              </div>
              <div className="mt-[18px] pt-[15px] border-t border-[#eee]">
                <div className="grid grid-cols-[145px_1fr_35px] gap-[10px] items-center text-[12px] text-[#666] my-[9px]">
                  <span>Control Systems</span>
                  <div className="h-[6px] bg-[#eee] rounded-full overflow-hidden">
                    <i className="block h-full bg-[#8db6ff] rounded-full" style={{ width: "76%" }} />
                  </div>
                  <b className="text-[12px] text-[#333] text-right font-bold">76%</b>
                </div>
                <div className="grid grid-cols-[145px_1fr_35px] gap-[10px] items-center text-[12px] text-[#666] my-[9px]">
                  <span>Deep Learning</span>
                  <div className="h-[6px] bg-[#eee] rounded-full overflow-hidden">
                    <i className="block h-full bg-[#8db6ff] rounded-full" style={{ width: "61%" }} />
                  </div>
                  <b className="text-[12px] text-[#333] text-right font-bold">61%</b>
                </div>
                <div className="grid grid-cols-[145px_1fr_35px] gap-[10px] items-center text-[12px] text-[#666] my-[9px]">
                  <span>Signals &amp; Systems</span>
                  <div className="h-[6px] bg-[#eee] rounded-full overflow-hidden">
                    <i className="block h-full bg-[#8db6ff] rounded-full" style={{ width: "67%" }} />
                  </div>
                  <b className="text-[12px] text-[#333] text-right font-bold">67%</b>
                </div>
              </div>
            </div>

            {/* Consistency Streak */}
            <div className="border border-[#e7e7e7] rounded-[18px] p-[25px_27px] bg-gradient-to-br from-[#fbfdff] to-[#f4f8ff] flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[18px] font-[730] mb-[5px] text-[#111111]">Consistency streak</div>
                    <div className="text-[39px] font-[760] tracking-[-1.5px] mt-3 text-[#111111]">12 days</div>
                    <div className="text-[#777] text-[14px]">You · current streak</div>
                  </div>
                  <div className="text-[31px] select-none">♨</div>
                </div>

                <div className="flex justify-between items-center border-t border-[#e5ecf7] pt-[10px] mt-[14px] text-[13px] text-[#707782]">
                  <span>Your rank</span>
                  <strong className="text-[#111] font-bold">#18</strong>
                </div>
                <div className="flex justify-between items-center border-t border-[#e5ecf7] pt-[10px] mt-2 text-[13px] text-[#707782]">
                  <span>Best streak</span>
                  <strong className="text-[#111] font-bold">47 days · #1</strong>
                </div>
              </div>

              <div className="inline-flex items-center gap-[7px] bg-white border border-[#dce8ff] rounded-[20px] p-[7px_11px] text-[#4c7fd9] text-[12px] font-bold mt-[17px] w-fit">
                You&apos;re 35 days away from the current #1 streak
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
            <div className="p-[18px_20px] border border-[#e7e7e7] rounded-[15px] bg-white">
              <div className="text-[13px] text-[#7d8087] mb-[7px] font-medium tracking-wide">YOUR CHALLENGES / DAY</div>
              <div className="text-[24px] font-[750] text-[#111]">2.4</div>
              <div className="text-[12px] text-[#777] mt-1">Your rank · #31</div>
            </div>

            <div className="p-[18px_20px] border border-[#dce8ff] bg-[#fbfdff] rounded-[15px]">
              <div className="text-[13px] text-[#7d8087] mb-[7px] font-medium tracking-wide">TOP CHALLENGES / DAY</div>
              <div className="text-[24px] font-[750] text-[#111]">6.8</div>
              <div className="text-[12px] text-[#777] mt-1">Current #1 · 7-day average</div>
            </div>

            <div className="p-[18px_20px] border border-[#e7e7e7] rounded-[15px] bg-white">
              <div className="text-[13px] text-[#7d8087] mb-[7px] font-medium tracking-wide">COMPLETED</div>
              <div className="text-[24px] font-[750] text-[#111]">{29 + Object.keys(completedChallenges).length}</div>
              <div className="text-[12px] text-[#777] mt-1">This month · +11 this week</div>
            </div>

            <div className="p-[18px_20px] border border-[#e7e7e7] rounded-[15px] bg-white">
              <div className="text-[13px] text-[#7d8087] mb-[7px] font-medium tracking-wide">CHALLENGE PASS RATE</div>
              <div className="text-[24px] font-[750] text-[#111]">84%</div>
              <div className="text-[12px] text-[#777] mt-1">Last 30 days</div>
            </div>
          </div>

          {/* Section Head */}
          <div className="flex items-end justify-between mt-[30px] mb-[14px]">
            <div>
              <h2 className="text-[22px] font-[750] tracking-[-.5px] m-0 text-[#111]">Challenges</h2>
              <p className="text-[13px] text-[#7b7e85] mt-1.5 mb-0">Complete one to keep your streak. More challenges appear as you finish them.</p>
            </div>
          </div>

          {/* Subject 1: Control Systems */}
          <div className="mb-[25px]">
            <div className="flex justify-between items-center px-[2px] pb-[10px] border-b border-[#ededee] mb-[10px]">
              <div>
                <div className="text-[17px] font-[750] text-[#111]">Control Systems</div>
                <div className="text-[12px] text-[#7d8188] mt-1">76% ready · 2 weak topics</div>
              </div>
              <div className="text-[20px] font-[750] text-[#568ce8]">76%</div>
            </div>
            <div className="flex flex-col gap-3">
              {/* Challenge 1 */}
              <div 
                onClick={() => handleOpenChallenge("laplace-transform")}
                className="border border-[#e7e7e7] rounded-[16px] p-[19px_20px] grid grid-cols-[48px_1fr_auto] gap-4 items-center cursor-pointer transition-all duration-150 hover:border-[#bcd3ff] hover:shadow-[0_6px_22px_rgba(0,0,0,.04)] hover:-translate-y-px bg-white"
              >
                <div className="w-[48px] h-[48px] rounded-[14px] bg-[#eef5ff] text-[#528cf3] grid place-items-center font-[800] text-[15px]">
                  LT
                </div>
                <div>
                  <div className="text-[17px] font-[720] mb-[5px] text-[#111]">Master Laplace Transform</div>
                  <div className="text-[13px] text-[#777] flex gap-3 flex-wrap items-center">
                    <span className="bg-[#eaf3ff] text-[#4d84e5] p-[5px_8px] rounded-[7px] font-bold text-[12px]">Recommended</span>
                    <span className="bg-[#f5f5f6] p-[5px_8px] rounded-[7px] text-[#696c73] text-[12px]">2 solved questions</span>
                    <span className="bg-[#f5f5f6] p-[5px_8px] rounded-[7px] text-[#696c73] text-[12px]">2 past questions</span>
                  </div>
                </div>
                <div className="flex items-center">
                  <span className="text-[13px] text-[#777] mr-3">~20 min</span>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenChallenge("laplace-transform");
                    }}
                    className="border-0 bg-[#111] text-white rounded-[22px] p-[10px_16px] text-[13px] font-[700] cursor-pointer hover:opacity-90 transition active:scale-95"
                  >
                    Start →
                  </button>
                </div>
              </div>

              {/* Challenge 2 */}
              <div 
                onClick={() => handleOpenChallenge("frequency-response")}
                className="border border-[#e7e7e7] rounded-[16px] p-[19px_20px] grid grid-cols-[48px_1fr_auto] gap-4 items-center cursor-pointer transition-all duration-150 hover:border-[#bcd3ff] hover:shadow-[0_6px_22px_rgba(0,0,0,.04)] hover:-translate-y-px bg-white"
              >
                <div className="w-[48px] h-[48px] rounded-[14px] bg-[#eef5ff] text-[#528cf3] grid place-items-center font-[800] text-[15px]">
                  FR
                </div>
                <div>
                  <div className="text-[17px] font-[720] mb-[5px] text-[#111]">Practice Frequency Response</div>
                  <div className="text-[13px] text-[#777] flex gap-3 flex-wrap items-center">
                    <span className="bg-[#f5f5f6] p-[5px_8px] rounded-[7px] text-[#696c73] text-[12px]">2 solved questions</span>
                    <span className="bg-[#f5f5f6] p-[5px_8px] rounded-[7px] text-[#696c73] text-[12px]">2 past questions</span>
                  </div>
                </div>
                <div className="flex items-center">
                  <span className="text-[13px] text-[#777] mr-3">~25 min</span>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenChallenge("frequency-response");
                    }}
                    className="border-0 bg-[#111] text-white rounded-[22px] p-[10px_16px] text-[13px] font-[700] cursor-pointer hover:opacity-90 transition active:scale-95"
                  >
                    Start →
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Subject 2: Deep Learning */}
          <div className="mb-[25px]">
            <div className="flex justify-between items-center px-[2px] pb-[10px] border-b border-[#ededee] mb-[10px]">
              <div>
                <div className="text-[17px] font-[750] text-[#111]">Deep Learning</div>
                <div className="text-[12px] text-[#7d8188] mt-1">61% ready · 4 weak topics</div>
              </div>
              <div className="text-[20px] font-[750] text-[#568ce8]">61%</div>
            </div>
            <div className="flex flex-col gap-3">
              <div 
                onClick={() => handleOpenChallenge("attention-mechanism")}
                className="border border-[#e7e7e7] rounded-[16px] p-[19px_20px] grid grid-cols-[48px_1fr_auto] gap-4 items-center cursor-pointer transition-all duration-150 hover:border-[#bcd3ff] hover:shadow-[0_6px_22px_rgba(0,0,0,.04)] hover:-translate-y-px bg-white"
              >
                <div className="w-[48px] h-[48px] rounded-[14px] bg-[#eef5ff] text-[#528cf3] grid place-items-center font-[800] text-[15px]">
                  AM
                </div>
                <div>
                  <div className="text-[17px] font-[720] mb-[5px] text-[#111]">Understand Attention Mechanism</div>
                  <div className="text-[13px] text-[#777] flex gap-3 flex-wrap items-center">
                    <span className="bg-[#eaf3ff] text-[#4d84e5] p-[5px_8px] rounded-[7px] font-bold text-[12px]">Recommended</span>
                    <span className="bg-[#f5f5f6] p-[5px_8px] rounded-[7px] text-[#696c73] text-[12px]">2 solved questions</span>
                    <span className="bg-[#f5f5f6] p-[5px_8px] rounded-[7px] text-[#696c73] text-[12px]">2 past questions</span>
                  </div>
                </div>
                <div className="flex items-center">
                  <span className="text-[13px] text-[#777] mr-3">~20 min</span>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenChallenge("attention-mechanism");
                    }}
                    className="border-0 bg-[#111] text-white rounded-[22px] p-[10px_16px] text-[13px] font-[700] cursor-pointer hover:opacity-90 transition active:scale-95"
                  >
                    Start →
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Subject 3: Signals & Systems */}
          <div className="mb-[25px]">
            <div className="flex justify-between items-center px-[2px] pb-[10px] border-b border-[#ededee] mb-[10px]">
              <div>
                <div className="text-[17px] font-[750] text-[#111]">Signals &amp; Systems</div>
                <div className="text-[12px] text-[#7d8188] mt-1">67% ready · No urgent challenge in today&apos;s top 3</div>
              </div>
              <div className="text-[20px] font-[750] text-[#568ce8]">67%</div>
            </div>
            <div className="border border-dashed border-[#ddd] rounded-[14px] p-[17px] text-[#888] text-[13px] bg-[#fcfcfc]">
              You&apos;re caught up for now. Finish one of today&apos;s challenges and the next Signals &amp; Systems challenge can enter your queue.
            </div>
          </div>
        </div>
      ) : (
        /* ═════════════════════════════════════════════════════════════════════
           CHALLENGE DETAIL VIEW (Matches HTML #detailPage 100%)
           ═════════════════════════════════════════════════════════════════════ */
        <div className="max-w-[1160px] mx-auto px-5 sm:px-10 py-9 pb-20">
          <button 
            type="button"
            onClick={() => setSelectedChallengeId(null)}
            className="border-0 bg-transparent p-0 text-[#666] cursor-pointer text-[14px] mb-[22px] hover:text-[#111] flex items-center gap-1.5"
          >
            ← Back to challenges
          </button>

          <div className="text-[14px] text-[#6d7179] font-[650] mb-2 uppercase tracking-wide">
            CHALLENGE · {activeChallenge.subject.toUpperCase()}
          </div>
          <h1 className="text-[38px] tracking-[-1.4px] m-[0_0_8px] font-[760] text-[#111]">
            {activeChallenge.title}
          </h1>
          <p className="text-[#777] text-[16px] mb-[25px] mt-0">
            Read the material, study two solved questions, then prove it with two past questions.
          </p>

          {/* Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-[22px]">
            <div className="border border-[#e7e7e7] rounded-[15px] p-[18px] bg-white">
              <div className="w-[28px] h-[28px] rounded-full bg-[#eaf8f0] text-[#23935a] grid place-items-center font-[750] text-[13px] mb-[13px]">
                1
              </div>
              <h3 className="m-[0_0_6px] text-[15px] font-[700] text-[#111]">Learn</h3>
              <p className="m-0 text-[#777] text-[13px] leading-[1.45]">Read the short topic explanation from your uploaded material.</p>
            </div>

            <div className="border border-[#e7e7e7] rounded-[15px] p-[18px] bg-white">
              <div className="w-[28px] h-[28px] rounded-full bg-[#f1f1f2] text-[#111] grid place-items-center font-[750] text-[13px] mb-[13px]">
                2
              </div>
              <h3 className="m-[0_0_6px] text-[15px] font-[700] text-[#111]">Study 2 solved questions</h3>
              <p className="m-0 text-[#777] text-[13px] leading-[1.45]">Understand how this topic is used in real exam questions.</p>
            </div>

            <div className="border border-[#e7e7e7] rounded-[15px] p-[18px] bg-white">
              <div className="w-[28px] h-[28px] rounded-full bg-[#f1f1f2] text-[#111] grid place-items-center font-[750] text-[13px] mb-[13px]">
                3
              </div>
              <h3 className="m-[0_0_6px] text-[15px] font-[700] text-[#111]">Pass the exam</h3>
              <p className="m-0 text-[#777] text-[13px] leading-[1.45]">Answer two past questions without help. Pass to complete the challenge.</p>
            </div>
          </div>

          {/* Lesson */}
          <div className="border border-[#e7e7e7] rounded-[18px] p-[27px] mb-[15px] bg-white">
            <div className="text-[14px] text-[#6d7179] font-[650] mb-2 uppercase tracking-wide">STEP 1 · READ</div>
            <h2 className="text-[22px] font-[750] m-[0_0_12px] text-[#111]">{activeChallenge.lesson.title}</h2>
            {activeChallenge.lesson.content.map((p, idx) => (
              <p key={idx} className="text-[15px] leading-[1.7] text-[#444] my-2">
                {idx === 1 ? (
                  <>
                    <strong className="text-[#111]">Focus for this challenge:</strong> {activeChallenge.lesson.focus}
                  </>
                ) : (
                  p
                )}
              </p>
            ))}
          </div>

          {/* Solved Questions */}
          <div className="border border-[#e7e7e7] rounded-[18px] p-[27px] mb-[15px] bg-white">
            <div className="text-[14px] text-[#6d7179] font-[650] mb-2 uppercase tracking-wide">STEP 2 · SOLVED QUESTIONS</div>
            <h2 className="text-[22px] font-[750] m-[0_0_12px] text-[#111]">Study these two examples</h2>

            {activeChallenge.solvedQuestions.map((q, idx) => (
              <div key={idx} className="mt-[17px] p-[17px] rounded-[13px] bg-[#fafafa] border border-[#ededed]">
                <div className="flex justify-between gap-[10px] text-[13px] text-[#777] mb-[9px]">
                  <span>{q.year}</span>
                  <span className="font-semibold text-[#23935a]">Solved</span>
                </div>
                <div className="font-[680] text-[15px] leading-[1.5] text-[#111]">
                  {q.question}
                </div>
                <div className="mt-[11px] text-[#555] text-[14px] leading-[1.55]">
                  <strong className="text-[#111]">Solution: </strong>{q.solution}
                </div>
              </div>
            ))}
          </div>

          {/* Exam Box */}
          <div className="border border-[#cfe0ff] bg-[#f8fbff] rounded-[18px] p-[25px] mt-[20px]">
            <div className="text-[14px] text-[#6d7179] font-[650] mb-2 uppercase tracking-wide">STEP 3 · PROVE IT</div>
            <h2 className="m-[0_0_7px] text-[22px] font-[750] text-[#111]">Take the challenge exam</h2>
            <p className="text-[#686d76] text-[14px] leading-[1.5] my-2">
              Two past questions. No notes. Submit your answers and pass the evaluation to complete this challenge.
            </p>
            <div className="flex gap-5 my-[18px] text-[#555] text-[13px] font-medium">
              <span>{activeChallenge.exam.questionCount} questions</span>
              <span>{activeChallenge.exam.durationMin} minutes</span>
              <span>Pass required</span>
            </div>

            <button
              type="button"
              disabled={examStarted[activeChallenge.id]}
              onClick={() => handleTakeExam(activeChallenge.id)}
              className={cn(
                "border-0 text-white rounded-[25px] p-[12px_20px] font-[700] text-[14px] cursor-pointer transition active:scale-95",
                examStarted[activeChallenge.id]
                  ? "bg-[#23935a] opacity-80 cursor-default"
                  : "bg-[#5f96ff] hover:bg-[#4a85f5]"
              )}
            >
              {examStarted[activeChallenge.id] ? "Exam started ✓" : "Take exam →"}
            </button>

            {completedChallenges[activeChallenge.id] && (
              <div className="p-[18px_20px] rounded-[15px] bg-[#eaf8f0] text-[#207c4d] font-[700] mt-[15px] text-[14px]">
                ✓ Challenge completed. Your streak and progress have been updated.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
