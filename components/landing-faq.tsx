"use client";

import Image from "next/image";
import { useState } from "react";

const FAQ_ITEMS = [
  {
    question: "What is NanoSyllabus?",
    answer:
      "NanoSyllabus turns your syllabus into a focused study system with guided practice, mock exams, feedback, and readiness tracking.",
  },
  {
    question: "Is NanoSyllabus just another AI tutor?",
    answer:
      "No. NanoSyllabus stays grounded in your course material so your practice, explanations, and feedback stay relevant to the exam you are preparing for.",
  },
  {
    question: "What do I actually do on NanoSyllabus?",
    answer:
      "Choose your community and subjects, study the material, practise questions, take mocks, and use your results to decide what to revise next.",
  },
  {
    question: "Is NanoSyllabus only for students with backlogs?",
    answer:
      "No. It is built for anyone who wants a clearer plan, regular practice, and a realistic picture of their exam readiness.",
  },
  {
    question: "What makes NanoSyllabus different from YouTube, books, or ChatGPT?",
    answer:
      "NanoSyllabus connects your syllabus, practice, written answers, and progress in one place instead of leaving you to guess what to study next.",
  },
] as const;

const FIGMA_DISPLAY_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif';

export function LandingFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="bg-white text-[#1b1139]"
    >
      <div className="mx-auto max-w-[1520px] px-6 pb-20 pt-16 sm:px-10 sm:pb-24 sm:pt-20 lg:px-16 lg:pb-[92px] lg:pt-[76px] xl:px-20">
        <h2
          id="faq-title"
          style={{ fontFamily: FIGMA_DISPLAY_FONT }}
          className="text-center text-[36px] font-[800] leading-[1.15] tracking-[-0.035em] text-[#22262a] sm:text-[44px] lg:text-[48px]"
        >
          Frequently Ask Questions
        </h2>

        <div className="mx-auto mt-12 grid max-w-[1120px] items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[500px_500px] xl:gap-[120px]">
          <div className="flex flex-col gap-[22px]">
            {FAQ_ITEMS.map((item, index) => {
              const isOpen = openIndex === index;
              const answerId = `faq-answer-${index}`;

              return (
                <article
                  key={item.question}
                  className="overflow-hidden rounded-[5px] bg-white shadow-[0px_24.556px_32.742px_-14.734px_rgba(149,149,149,0.25)]"
                >
                  <button
                    type="button"
                    id={`faq-question-${index}`}
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="flex min-h-[90px] w-full items-center justify-between gap-5 px-9 py-5 text-left transition-colors hover:bg-[#fbfcff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d57fd] focus-visible:ring-inset"
                  >
                    <span className="max-w-[360px] text-[16px] font-semibold leading-[1.3] text-[#1b1139]/[0.88] sm:text-[17px]">
                      {item.question}
                    </span>
                    <Image
                      src="/landing/faq-chevron-down.svg"
                      alt=""
                      aria-hidden="true"
                      width={24}
                      height={24}
                      className={`h-6 w-6 shrink-0 transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <div
                    id={answerId}
                    role="region"
                    aria-labelledby={`faq-question-${index}`}
                    className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="min-h-0 overflow-hidden px-9">
                      <p className="border-t border-[#eef1f6] pb-6 pt-4 text-sm leading-6 text-[#64748b]">
                        {item.answer}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="flex flex-col items-center text-center lg:-translate-y-3">
            <Image
              src="/landing/faq-illustration.png"
              alt="Students asking questions and learning together"
              width={559}
              height={447}
              className="h-auto w-full max-w-[500px] object-cover"
              priority={false}
            />

            <div className="mt-3 w-full max-w-[500px]">
              <h3
                style={{ fontFamily: FIGMA_DISPLAY_FONT }}
                className="text-[28px] font-[700] leading-[1.5] tracking-[-0.02em] text-[#1d57fd] sm:text-[30px]"
              >
                Any Question?
              </h3>
              <p className="mt-0 text-[13px] font-semibold leading-[1.5] text-[#1b1139] sm:text-[14px]">
                You can ask anything you want to know Feedback!
              </p>

              <div className="mx-auto mt-4 w-full max-w-[390px] text-left">
                <label
                  htmlFor="faq-feedback"
                  className="block text-[13px] font-semibold leading-[1.5] text-[#1b1139]"
                >
                  Let me know
                </label>
                <input
                  id="faq-feedback"
                  type="text"
                  placeholder="Enter Here"
                  aria-label="Share your question or feedback"
                  className="mt-[5px] h-9 w-full rounded-none border border-[#929292] bg-transparent px-1 text-[13px] text-[#1b1139] placeholder:text-[11px] placeholder:font-semibold placeholder:text-[#1b1139]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d57fd] focus-visible:ring-offset-2"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
