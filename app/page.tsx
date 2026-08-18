import Link from "next/link";
import { ArrowRight, BookOpen, FileUp, Sparkles, Users } from "lucide-react";
import { listPublishedCourses } from "@/lib/student-courses";
import type { TeacherCourse } from "@/lib/teacher-courses";
import { LandingHeader } from "@/components/landing-header";
import { titleCase } from "@/lib/utils";

export const metadata = {
  title: "NanoSyllabus — Know where you stand before the exam",
  description:
    "Practice your actual exam before the real exam. Upload your syllabus. NanoSyllabus becomes your personal exam coach.",
};

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const publishedCourses = await listPublishedCourses().catch(() => []);
  const displayCourses = publishedCourses.length ? publishedCourses.slice(0, 6) : null;

  return (
    <div className="landing-v2 min-h-screen bg-white text-[#111b33] antialiased">
      <style>{`
        .landing-v2 {
          --ink: #111b33;
          --muted: #66738a;
          --muted-2: #8b96a8;
          --blue: #2f6fff;
          --blue-dark: #2057d5;
          --cyan: #58d7ff;
          --green: #14a68f;
          --bg: #f7faff;
          --white: #fff;
          --line: #e3e9f2;
          --dark: #07101e;
          --dark-2: #0a1422;
          --shadow: 0 24px 70px rgba(29,54,100,.12);
          --max: 1180px;
          --radius: 22px;
          font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          line-height: 1.55;
        }

        .landing-v2 * {
          box-sizing: border-box;
        }

        .landing-v2 .container {
          width: min(var(--max), calc(100% - 48px));
          margin: 0 auto;
        }

        .landing-v2 .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 850;
          letter-spacing: -0.03em;
        }

        .landing-v2 .brand-mark {
          width: 27px;
          height: 27px;
          border-radius: 8px;
          position: relative;
          background: linear-gradient(135deg, #2f6fff, #62b6ff);
          box-shadow: 0 8px 20px rgba(47, 111, 255, 0.18);
        }

        .landing-v2 .brand-mark:before,
        .landing-v2 .brand-mark:after {
          content: "";
          position: absolute;
          background: #fff;
          border-radius: 999px;
        }

        .landing-v2 .brand-mark:before {
          width: 10px;
          height: 4px;
          left: 8px;
          top: 8px;
          transform: rotate(-20deg);
        }

        .landing-v2 .brand-mark:after {
          width: 8px;
          height: 4px;
          left: 10px;
          top: 14px;
          transform: rotate(24deg);
          opacity: 0.88;
        }

        .landing-v2 .btn-primary-glow {
          background: var(--blue);
          color: #fff;
          box-shadow: 0 14px 28px rgba(47, 111, 255, 0.18);
        }

        .landing-v2 .btn-primary-glow:hover {
          background: var(--blue-dark);
          transform: translateY(-1px);
        }

        .landing-v2 .hero {
          position: relative;
          overflow: hidden;
          text-align: center;
          padding: 116px 0 105px;
          background:
            radial-gradient(circle at 28% 36%, rgba(153, 244, 143, 0.18), transparent 24%),
            radial-gradient(circle at 67% 30%, rgba(71, 207, 255, 0.18), transparent 28%),
            linear-gradient(180deg, #ffffff 0%, #fbffff 44%, #f7fbff 100%);
        }

        .landing-v2 .hero:after {
          content: "";
          position: absolute;
          left: -10%;
          right: -10%;
          bottom: -160px;
          height: 300px;
          background: radial-gradient(ellipse at center, rgba(47, 111, 255, 0.12), transparent 65%);
          pointer-events: none;
        }

        .landing-v2 .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #3f6fd7;
          font-size: 11px;
          font-weight: 850;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .landing-v2 .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--blue);
        }

        .landing-v2 h1 {
          margin: 20px auto 0;
          max-width: 920px;
          font-size: clamp(48px, 6vw, 78px);
          line-height: 1.01;
          letter-spacing: -0.06em;
          font-weight: 900;
        }

        .landing-v2 .grad {
          background: linear-gradient(90deg, #2d66ec, #4f8cff 48%, #58c9ff);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .landing-v2 .micro-proof i {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          color: var(--blue);
          background: #eef4ff;
          font-style: normal;
          font-size: 9px;
        }

        .landing-v2 .ring-bg {
          background: conic-gradient(var(--blue) 0 72%, #e9eef5 72% 100%);
        }

        .landing-v2 .score-ring-bg {
          background: conic-gradient(var(--blue) 0 68%, #edf1f6 68% 100%);
        }

        .landing-v2 .b1 { background: linear-gradient(90deg, #3778ff, #63b1ff); }
        .landing-v2 .b2 { background: #19b28f; }
        .landing-v2 .b3 { background: #eab24e; }
        .landing-v2 .b4 { background: #ed6f79; }

        .landing-v2 .soft-section {
          background:
            radial-gradient(circle at 20% 10%, rgba(145, 238, 140, 0.15), transparent 22%),
            radial-gradient(circle at 80% 30%, rgba(88, 215, 255, 0.14), transparent 25%),
            linear-gradient(180deg, #f9fdff, #f7faff);
        }

        .landing-v2 .blue-fade-section {
          background:
            radial-gradient(circle at 50% 0%, rgba(68, 128, 255, 0.14), transparent 38%),
            linear-gradient(180deg, #fff, #f6faff 52%, #fff);
        }

        .landing-v2 .dark-section {
          background:
            radial-gradient(circle at 50% 0%, rgba(47, 111, 255, 0.18), transparent 28%),
            linear-gradient(180deg, #07101e, #08111f);
          color: #fff;
        }

        .landing-v2 .cta-section {
          text-align: center;
          padding: 115px 0 125px;
          background:
            radial-gradient(circle at 50% 0%, rgba(49, 111, 255, 0.18), transparent 34%),
            linear-gradient(180deg, #fff, #f7fbff);
        }

        .landing-v2 .check i {
          width: 19px;
          height: 19px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: #eaf9f4;
          color: #0d9a7f;
          font-style: normal;
          font-size: 10px;
          flex: none;
        }
      `}</style>

      {/* Navigation Header */}
      <LandingHeader />

      <main id="top">
        {/* Hero Section */}
        <section className="hero">
          <div className="container">
            <div className="eyebrow">
              <span className="dot" /> Your exam. Your syllabus. Your readiness.
            </div>
            <h1>
              Practice your actual exam <span className="grad">before the real exam.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-[670px] text-base text-[#68758a]">
              Upload your syllabus. NanoSyllabus becomes your personal exam coach—so you know what
              you know, what you don&apos;t, and where your marks are going.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-2.5">
              <Link
                className="btn-primary-glow inline-flex items-center justify-center gap-2 rounded-xl border border-transparent px-[20px] py-3 text-[13px] font-[800] transition-all"
                href="/exams"
              >
                Browse Community Courses →
              </Link>
              <a
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#cbd5e3] bg-white px-[20px] py-3 text-[13px] font-[800] text-[#111b33] transition-all hover:border-[#99a8bc] hover:bg-[#f8fbff]"
                href="#how"
              >
                See how it works
              </a>
            </div>
            <div className="micro-proof mt-9 flex flex-wrap justify-center gap-3.5 text-[11px] text-[#707d90]">
              <span className="flex items-center gap-1.5">
                <i>✓</i> Syllabus-grounded
              </span>
              <span className="flex items-center gap-1.5">
                <i>✓</i> Handwritten evaluation
              </span>
              <span className="flex items-center gap-1.5">
                <i>✓</i> MCQ + subjective
              </span>
              <span className="flex items-center gap-1.5">
                <i>✓</i> Readiness tracking
              </span>
            </div>

            {/* Product Visual Mockup */}
            <div className="relative mx-auto mt-[58px] max-w-[1010px]">
              <div className="overflow-hidden rounded-[26px] border border-[#dce5f1] bg-white text-left shadow-[0_24px_70px_rgba(29,54,100,.12)]">
                <div className="flex h-12 items-center justify-between border-b border-[#e8edf4] bg-[#fbfcfe] px-[18px]">
                  <div className="flex gap-1.5">
                    <span className="h-[7px] w-[7px] rounded-full bg-[#c5ceda]" />
                    <span className="h-[7px] w-[7px] rounded-full bg-[#c5ceda]" />
                    <span className="h-[7px] w-[7px] rounded-full bg-[#c5ceda]" />
                  </div>
                  <div className="text-[11px] font-bold text-[#6d798d]">
                    NanoSyllabus · Exam Readiness
                  </div>
                  <div className="text-[11px] font-bold text-[#6d798d]">
                    BCA · Database Management Systems
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1.05fr_0.95fr]">
                  <div className="bg-gradient-to-b from-[#f9fbff] to-white p-6">
                    <div className="text-[9px] font-[900] uppercase tracking-[0.14em] text-[#7e899c]">
                      Your readiness
                    </div>
                    <div className="mt-3 flex flex-col items-center gap-6 rounded-[18px] border border-[#e0e7f1] bg-gradient-to-br from-[#f7fbff] to-white p-5 sm:flex-row">
                      <div className="ring-bg relative grid h-32 w-32 shrink-0 place-items-center rounded-full">
                        <div className="absolute inset-3 rounded-full bg-white" />
                        <strong className="relative z-10 text-[28px] tracking-[-0.04em]">72%</strong>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="m-0 text-[19px] tracking-[-0.03em]">You&apos;re getting closer.</h3>
                        <div className="mt-1 text-[11px] text-[#7c899d]">
                          Your latest mock shows where you are strong—and where you are still
                          leaving marks behind.
                        </div>
                        <div className="mt-3.5 grid gap-2.5">
                          <div className="grid grid-cols-[75px_1fr_26px] items-center gap-2 text-[9px] text-[#7b879a]">
                            <span>SQL</span>
                            <div className="h-1.5 overflow-hidden rounded-full bg-[#edf1f6]">
                              <div className="b1 h-full rounded-full" style={{ width: "88%" }} />
                            </div>
                            <b>88</b>
                          </div>
                          <div className="grid grid-cols-[75px_1fr_26px] items-center gap-2 text-[9px] text-[#7b879a]">
                            <span>ER model</span>
                            <div className="h-1.5 overflow-hidden rounded-full bg-[#edf1f6]">
                              <div className="b2 h-full rounded-full" style={{ width: "76%" }} />
                            </div>
                            <b>76</b>
                          </div>
                          <div className="grid grid-cols-[75px_1fr_26px] items-center gap-2 text-[9px] text-[#7b879a]">
                            <span>Normal.</span>
                            <div className="h-1.5 overflow-hidden rounded-full bg-[#edf1f6]">
                              <div className="b3 h-full rounded-full" style={{ width: "48%" }} />
                            </div>
                            <b>48</b>
                          </div>
                          <div className="grid grid-cols-[75px_1fr_26px] items-center gap-2 text-[9px] text-[#7b879a]">
                            <span>Txns.</span>
                            <div className="h-1.5 overflow-hidden rounded-full bg-[#edf1f6]">
                              <div className="b4 h-full rounded-full" style={{ width: "35%" }} />
                            </div>
                            <b>35</b>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                      <div className="rounded-[14px] border border-[#e5ebf3] bg-[#fbfcfe] p-3.5">
                        <b className="block text-[18px]">74</b>
                        <span className="mt-1 block text-[9px] text-[#8290a2]">
                          Likely marks on next mock
                        </span>
                      </div>
                      <div className="rounded-[14px] border border-[#e5ebf3] bg-[#fbfcfe] p-3.5">
                        <b className="block text-[18px]">4</b>
                        <span className="mt-1 block text-[9px] text-[#8290a2]">
                          High-priority weak areas
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#e9eef5] bg-white p-6 md:border-l md:border-t-0">
                    <div className="text-[9px] font-[900] uppercase tracking-[0.14em] text-[#7e899c]">
                      Your next move
                    </div>
                    <div className="mt-2 text-[19px] font-[850] tracking-[-0.03em]">
                      Fix what is costing you marks.
                    </div>
                    <div className="mt-1 text-[11px] text-[#7c899d]">
                      Don&apos;t reread everything. Work on what matters next.
                    </div>
                    <div className="mt-2.5 space-y-2.5">
                      <div className="rounded-[14px] border border-[#e4eaf2] bg-[#fbfcff] p-4">
                        <b className="block text-xs">1 · Revise normalization</b>
                        <p className="m-0 mt-1 text-[10px] text-[#7c899b]">
                          Low performance + high exam weight.
                        </p>
                      </div>
                      <div className="rounded-[14px] border border-[#e4eaf2] bg-[#fbfcff] p-4">
                        <b className="block text-xs">2 · Practice OS scheduling</b>
                        <p className="m-0 mt-1 text-[10px] text-[#7c899b]">
                          You understand the idea. Your written answers need depth.
                        </p>
                      </div>
                      <div className="rounded-[14px] border border-[#e4eaf2] bg-[#fbfcff] p-4">
                        <b className="block text-xs">3 · Retest network layers</b>
                        <p className="m-0 mt-1 text-[10px] text-[#7c899b]">
                          You&apos;re close to exam-ready here.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features / The Problem Section */}
        <section className="bg-white py-24 sm:py-28" id="features">
          <div className="container">
            <div className="mx-auto max-w-[740px] text-center">
              <div className="text-[10px] font-[900] uppercase tracking-[0.15em] text-[#4c79d6]">
                The problem
              </div>
              <h2 className="mb-4 mt-3 text-[34px] font-[900] tracking-[-0.055em] sm:text-[52px]">
                You studied. <span className="grad">But do you know?</span>
              </h2>
              <p className="mx-auto m-0 max-w-[640px] text-sm text-[#738095]">
                Reading notes can feel like progress. Exams expose what you can actually recall,
                explain and write under pressure.
              </p>
            </div>
            <div className="mt-14 grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
              <article className="rounded-[20px] border border-[#e3e9f2] bg-white p-7 shadow-[0_10px_30px_rgba(29,54,100,.035)]">
                <div className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-[#eef4ff] font-[900] text-[#2f6fff]">
                  01
                </div>
                <h3 className="mb-2 mt-4 text-[17px] font-semibold tracking-[-0.02em]">
                  Too much to cover
                </h3>
                <p className="m-0 text-[13px] text-[#7d899a]">
                  Notes. PDFs. Videos. Past papers. You still don&apos;t know what deserves your
                  next hour.
                </p>
              </article>
              <article className="rounded-[20px] border border-[#e3e9f2] bg-white p-7 shadow-[0_10px_30px_rgba(29,54,100,.035)]">
                <div className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-[#eef4ff] font-[900] text-[#2f6fff]">
                  02
                </div>
                <h3 className="mb-2 mt-4 text-[17px] font-semibold tracking-[-0.02em]">
                  No real calibration
                </h3>
                <p className="m-0 text-[13px] text-[#7d899a]">
                  You can recognize the answer without being able to write it in the exam.
                  That&apos;s a different skill.
                </p>
              </article>
              <article className="rounded-[20px] border border-[#e3e9f2] bg-white p-7 shadow-[0_10px_30px_rgba(29,54,100,.035)] sm:col-span-2 lg:col-span-1">
                <div className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-[#eef4ff] font-[900] text-[#2f6fff]">
                  03
                </div>
                <h3 className="mb-2 mt-4 text-[17px] font-semibold tracking-[-0.02em]">
                  Gaps found too late
                </h3>
                <p className="m-0 text-[13px] text-[#7d899a]">
                  The worst time to discover a weakness is when the real paper is already in front
                  of you.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="soft-section py-24 sm:py-28" id="how">
          <div className="container">
            <div className="mx-auto max-w-[740px] text-center">
              <div className="text-[10px] font-[900] uppercase tracking-[0.15em] text-[#4c79d6]">
                How it works
              </div>
              <h2 className="mb-4 mt-3 text-[34px] font-[900] tracking-[-0.055em] sm:text-[52px]">
                From <span className="grad">“I think I know it”</span> to “I’m ready.”
              </h2>
              <p className="mx-auto m-0 max-w-[640px] text-sm text-[#738095]">
                Practice the way your exam actually works. Then use the result to decide what to do
                next.
              </p>
            </div>
            <div className="mt-14 grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
              <Link
                href="/teachers"
                className="group block rounded-[20px] border border-[#dde5ef] bg-white p-8 transition-all hover:-translate-y-1 hover:border-[#2f6fff]/60 hover:shadow-lg"
              >
                <div className="text-[44px] font-[900] leading-none text-[#d8e7ff] group-hover:text-[#2f6fff]/30 transition-colors">
                  01
                </div>
                <h3 className="mb-2 mt-5 text-[17px] font-semibold flex items-center justify-between">
                  <span>Upload your syllabus</span>
                  <span className="text-xs font-semibold text-[#2f6fff]">Upload →</span>
                </h3>
                <p className="m-0 text-[13px] text-[#7c899b]">
                  Add your syllabus, notes, question bank and past papers.
                </p>
              </Link>
              <Link
                href="/app/exams"
                className="group block rounded-[20px] border border-[#dde5ef] bg-white p-8 transition-all hover:-translate-y-1 hover:border-[#2f6fff]/60 hover:shadow-lg"
              >
                <div className="text-[44px] font-[900] leading-none text-[#d8e7ff] group-hover:text-[#2f6fff]/30 transition-colors">
                  02
                </div>
                <h3 className="mb-2 mt-5 text-[17px] font-semibold flex items-center justify-between">
                  <span>Take the mock</span>
                  <span className="text-xs font-semibold text-[#2f6fff]">Start mock →</span>
                </h3>
                <p className="m-0 text-[13px] text-[#7c899b]">
                  Practice MCQs or write subjective answers under exam conditions.
                </p>
              </Link>
              <Link
                href="/app/today"
                className="group block rounded-[20px] border border-[#dde5ef] bg-white p-8 transition-all hover:-translate-y-1 hover:border-[#2f6fff]/60 hover:shadow-lg sm:col-span-2 lg:col-span-1"
              >
                <div className="text-[44px] font-[900] leading-none text-[#d8e7ff] group-hover:text-[#2f6fff]/30 transition-colors">
                  03
                </div>
                <h3 className="mb-2 mt-5 text-[17px] font-semibold flex items-center justify-between">
                  <span>See your readiness</span>
                  <span className="text-xs font-semibold text-[#2f6fff]">Dashboard →</span>
                </h3>
                <p className="m-0 text-[13px] text-[#7c899b]">
                  Get marks, feedback, weak topics and the next best thing to study.
                </p>
              </Link>
            </div>
          </div>
        </section>

        {/* Readiness Section */}
        <section className="blue-fade-section py-24 sm:py-28" id="readiness">
          <div className="container">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
              <div>
                <div className="text-[10px] font-[900] uppercase tracking-[0.15em] text-[#4c79d6]">
                  Exam readiness
                </div>
                <h2 className="mb-4 mt-3 text-[34px] font-[900] tracking-[-0.055em] sm:text-[52px]">
                  Know where you stand. <span className="grad">Fix what you don&apos;t.</span>
                </h2>
                <p className="max-w-[560px] text-sm text-[#748196]">
                  NanoSyllabus turns every mock into a diagnosis. Your score is only the beginning.
                </p>
                <div className="checklist mt-7 grid gap-3">
                  <div className="check flex items-start gap-2.5 text-[13px] text-[#526077]">
                    <i>✓</i>
                    <span>See topic-by-topic performance</span>
                  </div>
                  <div className="check flex items-start gap-2.5 text-[13px] text-[#526077]">
                    <i>✓</i>
                    <span>Find where marks are being lost</span>
                  </div>
                  <div className="check flex items-start gap-2.5 text-[13px] text-[#526077]">
                    <i>✓</i>
                    <span>Get feedback on handwritten answers</span>
                  </div>
                  <div className="check flex items-start gap-2.5 text-[13px] text-[#526077]">
                    <i>✓</i>
                    <span>Know what to study next</span>
                  </div>
                  <div className="check flex items-start gap-2.5 text-[13px] text-[#526077]">
                    <i>✓</i>
                    <span>Retest and measure improvement</span>
                  </div>
                </div>
                <div className="mt-8">
                  <Link
                    href="/app/exams"
                    className="btn-primary-glow inline-flex items-center justify-center gap-2 rounded-xl border border-transparent px-[18px] py-3 text-[13px] font-[800] transition-all"
                  >
                    Check your readiness score →
                  </Link>
                </div>
              </div>

              <div className="dashboard rounded-[24px] border border-[#dce5f0] bg-white p-5 shadow-[0_24px_70px_rgba(29,54,100,.12)]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13px] font-[850]">Exam readiness</div>
                    <div className="mt-0.5 text-[10px] text-[#8390a2]">
                      Database Management Systems
                    </div>
                  </div>
                  <div className="rounded-full bg-[#f0f5ff] px-2.5 py-1.5 text-[9px] font-[800] text-[#4577d8]">
                    Latest mock
                  </div>
                </div>
                <div className="dashboard-main mt-4 grid grid-cols-1 items-center gap-5 sm:grid-cols-[150px_1fr]">
                  <div className="score-ring-bg relative mx-auto grid h-[145px] w-[145px] place-items-center rounded-full">
                    <div className="absolute inset-[13px] rounded-full bg-white" />
                    <b className="relative z-10 text-[30px]">68%</b>
                  </div>
                  <div className="grid gap-2.5">
                    <div className="grid grid-cols-[82px_1fr_28px] items-center gap-2 text-[9px] text-[#7e899b]">
                      <span>SQL</span>
                      <div className="h-[7px] overflow-hidden rounded-full bg-[#edf1f6]">
                        <div className="b2 h-full rounded-full" style={{ width: "88%" }} />
                      </div>
                      <b>88</b>
                    </div>
                    <div className="grid grid-cols-[82px_1fr_28px] items-center gap-2 text-[9px] text-[#7e899b]">
                      <span>ER model</span>
                      <div className="h-[7px] overflow-hidden rounded-full bg-[#edf1f6]">
                        <div className="b1 h-full rounded-full" style={{ width: "76%" }} />
                      </div>
                      <b>76</b>
                    </div>
                    <div className="grid grid-cols-[82px_1fr_28px] items-center gap-2 text-[9px] text-[#7e899b]">
                      <span>Normal.</span>
                      <div className="h-[7px] overflow-hidden rounded-full bg-[#edf1f6]">
                        <div className="b3 h-full rounded-full" style={{ width: "48%" }} />
                      </div>
                      <b>48</b>
                    </div>
                    <div className="grid grid-cols-[82px_1fr_28px] items-center gap-2 text-[9px] text-[#7e899b]">
                      <span>Txns.</span>
                      <div className="h-[7px] overflow-hidden rounded-full bg-[#edf1f6]">
                        <div className="b4 h-full rounded-full" style={{ width: "35%" }} />
                      </div>
                      <b>35</b>
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  <div className="rounded-[14px] border border-[#e7ecf2] bg-[#fbfcfe] p-3.5">
                    <b className="block text-[19px]">74</b>
                    <span className="text-[9px] text-[#8591a3]">Likely score range</span>
                  </div>
                  <div className="rounded-[14px] border border-[#e7ecf2] bg-[#fbfcfe] p-3.5">
                    <b className="block text-[19px]">11↑</b>
                    <span className="text-[9px] text-[#8591a3]">
                      Improvement since first mock
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* More than a chatbot - Dark Section */}
        <section className="dark-section py-24 sm:py-28">
          <div className="container">
            <div className="mx-auto max-w-[740px] text-center">
              <div className="text-[10px] font-[900] uppercase tracking-[0.15em] text-[#76a4ff]">
                More than a chatbot
              </div>
              <h2 className="mb-4 mt-3 text-[34px] font-[900] tracking-[-0.055em] sm:text-[52px]">
                Ask anything. <span className="grad">Practice everything.</span>
              </h2>
              <p className="mx-auto m-0 max-w-[640px] text-sm text-[#93a1b5]">
                NanoSyllabus combines your course material with an exam loop: learn → practice →
                answer → evaluate → improve → retest.
              </p>
            </div>
            <div className="mt-14 grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
              <Link
                href="/app/chat"
                className="group rounded-[20px] border border-white/10 bg-white/[0.045] p-7 transition-all hover:bg-white/[0.08] hover:border-white/20"
              >
                <div className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-[#5491ff]/10 font-[900] text-[#2f6fff]">
                  A
                </div>
                <h3 className="mb-2 mt-4 text-[17px] font-semibold tracking-[-0.02em] text-white flex items-center justify-between">
                  <span>Ask your syllabus</span>
                  <span className="text-xs font-semibold text-[#58d7ff]">Chat tutor →</span>
                </h3>
                <p className="m-0 text-[13px] text-[#97a5b8]">
                  Get explanations grounded in the material you actually need to study.
                </p>
              </Link>
              <Link
                href="/app/exams"
                className="group rounded-[20px] border border-white/10 bg-white/[0.045] p-7 transition-all hover:bg-white/[0.08] hover:border-white/20"
              >
                <div className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-[#5491ff]/10 font-[900] text-[#2f6fff]">
                  ✎
                </div>
                <h3 className="mb-2 mt-4 text-[17px] font-semibold tracking-[-0.02em] text-white flex items-center justify-between">
                  <span>Write your real answer</span>
                  <span className="text-xs font-semibold text-[#58d7ff]">Mock tests →</span>
                </h3>
                <p className="m-0 text-[13px] text-[#97a5b8]">
                  Upload handwritten work for marks and feedback on how you answered.
                </p>
              </Link>
              <Link
                href="/app/exams"
                className="group rounded-[20px] border border-white/10 bg-white/[0.045] p-7 transition-all hover:bg-white/[0.08] hover:border-white/20 sm:col-span-2 lg:col-span-1"
              >
                <div className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-[#5491ff]/10 font-[900] text-[#2f6fff]">
                  ↻
                </div>
                <h3 className="mb-2 mt-4 text-[17px] font-semibold tracking-[-0.02em] text-white flex items-center justify-between">
                  <span>Retest yourself</span>
                  <span className="text-xs font-semibold text-[#58d7ff]">Retest →</span>
                </h3>
                <p className="m-0 text-[13px] text-[#97a5b8]">
                  Turn feedback into another attempt and see whether your readiness changes.
                </p>
              </Link>
            </div>
          </div>
        </section>

        {/* Community Courses Section */}
        <section className="soft-section py-24 sm:py-28" id="courses">
          <div className="container">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-[740px]">
                <div className="text-[10px] font-[900] uppercase tracking-[0.15em] text-[#4c79d6]">
                  Community courses
                </div>
                <h2 className="mb-4 mt-3 text-[34px] font-[900] tracking-[-0.055em] sm:text-[52px]">
                  Start with a course. <span className="grad">Or bring your own.</span>
                </h2>
                <p className="m-0 text-sm text-[#738095]">
                  Browse community-built course spaces or upload your own syllabus and material.
                </p>
              </div>
              <Link
                href="/exams"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#cbd5e3] bg-white px-4 py-2.5 text-xs font-[800] text-[#111b33] transition hover:bg-[#f8fbff]"
              >
                Browse all community courses <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
              {displayCourses && displayCourses.length > 0 ? (
                displayCourses.map((course: TeacherCourse) => (
                  <Link
                    key={course.id}
                    href={`/exams/${course.slug}`}
                    className="group rounded-[18px] border border-[#dfe7f1] bg-white p-[22px] transition-all duration-200 hover:-translate-y-1 hover:border-[#2f6fff]/60 hover:shadow-[0_18px_42px_rgba(29,54,100,.08)] flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <small className="text-[9px] font-[900] uppercase tracking-[0.13em] text-[#4e7ddd]">
                          {[course.category, course.level].filter(Boolean).join(" · ")}
                        </small>
                        <span className="text-[11px] font-medium text-[#7d899b] flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" /> {course.enrollmentCount}
                        </span>
                      </div>
                      <h3 className="mb-2 mt-3 text-[17px] font-semibold text-[#111b33] group-hover:text-[#2f6fff] transition-colors">
                        {titleCase(course.name)}
                      </h3>
                      <p className="m-0 text-[12px] leading-relaxed text-[#7d899b] line-clamp-3">
                        {course.tagline || course.description}
                      </p>
                    </div>
                    <div className="mt-5 flex items-center justify-between border-t border-[#f0f4f9] pt-3 text-[12px]">
                      <span className="text-[#7d899b] flex items-center gap-1.5 font-medium">
                        <BookOpen className="h-3.5 w-3.5" /> {course.subjects.length} {course.subjects.length === 1 ? "subject" : "subjects"}
                      </span>
                      <span className="font-[850] text-[#2f6fff] group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-1">
                        Open course →
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <>
                  <Link
                    href="/exams"
                    className="group rounded-[18px] border border-[#dfe7f1] bg-white p-[22px] transition-all duration-200 hover:-translate-y-1 hover:border-[#2f6fff]/60 hover:shadow-[0_18px_42px_rgba(29,54,100,.08)] flex flex-col justify-between"
                  >
                    <div>
                      <small className="text-[9px] font-[900] uppercase tracking-[0.13em] text-[#4e7ddd]">
                        BCA · 3RD SEM
                      </small>
                      <h3 className="mb-2 mt-3 text-base font-semibold group-hover:text-[#2f6fff] transition-colors">
                        Database Management Systems
                      </h3>
                      <p className="m-0 text-[11px] text-[#7d899b]">
                        Mock sets, past questions and answer practice.
                      </p>
                    </div>
                    <span className="mt-4 inline-block text-[11px] font-[850] text-[#2f6fff]">
                      Open course →
                    </span>
                  </Link>
                  <Link
                    href="/exams"
                    className="group rounded-[18px] border border-[#dfe7f1] bg-white p-[22px] transition-all duration-200 hover:-translate-y-1 hover:border-[#2f6fff]/60 hover:shadow-[0_18px_42px_rgba(29,54,100,.08)] flex flex-col justify-between"
                  >
                    <div>
                      <small className="text-[9px] font-[900] uppercase tracking-[0.13em] text-[#4e7ddd]">
                        BIM · 4TH SEM
                      </small>
                      <h3 className="mb-2 mt-3 text-base font-semibold group-hover:text-[#2f6fff] transition-colors">
                        Operating Systems
                      </h3>
                      <p className="m-0 text-[11px] text-[#7d899b]">
                        Practice the concepts you have to write under pressure.
                      </p>
                    </div>
                    <span className="mt-4 inline-block text-[11px] font-[850] text-[#2f6fff]">
                      Open course →
                    </span>
                  </Link>
                  <Link
                    href="/exams"
                    className="group rounded-[18px] border border-[#dfe7f1] bg-white p-[22px] transition-all duration-200 hover:-translate-y-1 hover:border-[#2f6fff]/60 hover:shadow-[0_18px_42px_rgba(29,54,100,.08)] flex flex-col justify-between"
                  >
                    <div>
                      <small className="text-[9px] font-[900] uppercase tracking-[0.13em] text-[#4e7ddd]">
                        BSc CSIT · 2ND SEM
                      </small>
                      <h3 className="mb-2 mt-3 text-base font-semibold group-hover:text-[#2f6fff] transition-colors">
                        Object-Oriented Programming
                      </h3>
                      <p className="m-0 text-[11px] text-[#7d899b]">
                        Turn your syllabus into targeted practice.
                      </p>
                    </div>
                    <span className="mt-4 inline-block text-[11px] font-[850] text-[#2f6fff]">
                      Open course →
                    </span>
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>

        {/* The Outcome - Dark Quotes Section */}
        <section className="dark-section py-24 sm:py-28">
          <div className="container">
            <div className="mx-auto max-w-[740px] text-center">
              <div className="text-[10px] font-[900] uppercase tracking-[0.15em] text-[#76a4ff]">
                The outcome
              </div>
              <h2 className="mb-4 mt-3 text-[34px] font-[900] tracking-[-0.055em] sm:text-[52px]">
                Study less blindly. <span className="grad">Walk in more certain.</span>
              </h2>
              <p className="mx-auto m-0 max-w-[640px] text-sm text-[#93a1b5]">
                The goal is not more content. It&apos;s knowing where you stand before the stakes
                are real.
              </p>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
              <article className="rounded-[20px] border border-white/10 bg-white/[0.045] p-[26px]">
                <p className="m-0 text-[13px] text-[#d0d8e4]">
                  “I knew the notes. I didn&apos;t know the answers. The mock made that obvious.”
                </p>
                <footer className="mt-5 text-[10px] text-[#8190a5]">
                  Student · Bachelor program
                </footer>
              </article>
              <article className="rounded-[20px] border border-white/10 bg-white/[0.045] p-[26px]">
                <p className="m-0 text-[13px] text-[#d0d8e4]">
                  “The most useful part was knowing what to revise first instead of rereading
                  everything.”
                </p>
                <footer className="mt-5 text-[10px] text-[#8190a5]">
                  Student · Bachelor program
                </footer>
              </article>
              <article className="rounded-[20px] border border-white/10 bg-white/[0.045] p-[26px] sm:col-span-2 lg:col-span-1">
                <p className="m-0 text-[13px] text-[#d0d8e4]">
                  “I wanted a score before the real exam. Now I know what I need to fix.”
                </p>
                <footer className="mt-5 text-[10px] text-[#8190a5]">
                  Student · Bachelor program
                </footer>
              </article>
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="cta-section" id="start">
          <div className="container">
            <div className="text-[10px] font-[900] uppercase tracking-[0.15em] text-[#4c79d6]">
              Your next exam
            </div>
            <h2 className="mx-auto mb-4 mt-3 max-w-[800px] text-[34px] font-[900] tracking-[-0.055em] sm:text-[52px]">
              Your most confident attempt starts before exam day.
            </h2>
            <p className="mx-auto m-0 max-w-[600px] text-sm text-[#738095]">
              Upload your syllabus. Take a mock. Submit your answer. Find out where you stand.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                className="btn-primary-glow inline-flex items-center justify-center gap-2 rounded-xl border border-transparent px-[22px] py-3 text-[13px] font-[800] transition-all"
                href="/app"
              >
                Start free →
              </Link>
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#cbd5e3] bg-white px-[20px] py-3 text-[13px] font-[800] text-[#111b33] transition-all hover:border-[#99a8bc] hover:bg-[#f8fbff]"
                href="/exams"
              >
                Browse Community Courses
              </Link>
            </div>
            <div className="mt-3 text-[10px] text-[#9aa4b2]">
              No credit card · Start with your own course material
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#e6ebf2] bg-white py-8 text-[11px] text-[#7e899a]">
        <div className="container flex flex-col items-center justify-between gap-5 sm:flex-row">
          <div>© {new Date().getFullYear()} NanoSyllabus</div>
          <div className="flex flex-wrap gap-4">
            <a href="#features" className="hover:text-[#111b33]">
              Features
            </a>
            <a href="#how" className="hover:text-[#111b33]">
              How it works
            </a>
            <Link href="/exams" className="hover:text-[#111b33]">
              Community Courses
            </Link>
            <Link href="/app/chat" className="hover:text-[#111b33]">
              AI Tutor
            </Link>
            <Link href="/login" className="hover:text-[#111b33]">
              Log in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
