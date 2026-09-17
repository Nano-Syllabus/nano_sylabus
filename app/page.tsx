import Image from "next/image";
import Link from "next/link";
import { DM_Sans, Manrope } from "next/font/google";
import { LandingPrimaryCta } from "@/components/landing-primary-cta";
import { DISCORD_STUDY_ROOM_URL } from "@/lib/product-links";

const dmSans = DM_Sans({ subsets: ["latin"], display: "swap" });
const manrope = Manrope({ subsets: ["latin"], display: "swap" });

export const metadata = {
  title: "NanoSyllabus — A little less stuck. A lot more learning.",
  description:
    "Turn your syllabus into small learning challenges. Practise on paper, find your gaps, and study with people who get it.",
};

function Brand() {
  return (
    <Link
      href="/"
      className="inline-flex items-center text-[#1c1e1a] group"
      aria-label="NanoSyllabus home"
    >
      <span
        className={`${manrope.className} mr-2.5 grid size-[38px] place-items-center rounded-[10px] bg-[#1c1e1a] text-[20px] font-extrabold tracking-[-0.08em] text-[#dcfa72] shadow-xs group-hover:scale-105 transition-transform`}
      >
        n.
      </span>
      <span className="text-[22px] font-extrabold tracking-[-0.05em] text-[#1c1e1a]">nano</span>
      <span className="text-[22px] font-medium tracking-[-0.05em] text-[#1c1e1a]">syllabus</span>
    </Link>
  );
}

function Cta({
  href,
  children,
  blue = false,
  lime = false,
  size = "default",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  blue?: boolean;
  lime?: boolean;
  size?: "default" | "hero" | "nav";
  className?: string;
}) {
  const sizeClass =
    size === "hero"
      ? "min-h-[58px] px-8 text-[15px] font-semibold"
      : size === "nav"
        ? "min-h-[44px] px-5 text-[13.5px] font-semibold"
        : "min-h-[48px] px-6 text-sm font-semibold";

  let colorClass = "bg-[#1c1e1a] text-white hover:bg-[#33362e] focus-visible:ring-[#1c1e1a]";
  if (blue) {
    colorClass = "bg-[#3049ed] text-white hover:bg-[#2439d0] focus-visible:ring-[#3049ed]";
  } else if (lime) {
    colorClass = "bg-[#dcfa72] text-[#1c1e1a] hover:bg-[#e8ff9a] focus-visible:ring-[#dcfa72]";
  }

  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2.5 rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${sizeClass} ${colorClass} ${className}`}
    >
      <span>{children}</span>
      <span aria-hidden="true" className="text-base font-bold leading-none">
        ↗
      </span>
    </Link>
  );
}

const problems = [
  [
    "“I spent so long learning. I barely had time to practise.”",
    "Tabs, PDFs, shared folders. Everything is somewhere, but nothing gives you a clear way to study.",
    "The practice gap",
  ],
  [
    "“I really thought I would pass this time.”",
    "You put in the hours. The result still didn’t match. Now you’re left wondering what to change.",
    "The confidence gap",
  ],
  [
    "“I know the concept. Why am I stuck?”",
    "A whole semester feels overwhelming. Without a manageable daily routine, it’s easy to stop before you build momentum.",
    "The understanding gap",
  ],
];

const steps = [
  [
    "Learn one thing.",
    "Study one focused topic, guided by your official syllabus and question bank.",
    "Less ‘where do I start?’",
  ],
  [
    "See the working.",
    "Work through a past-question solution. Understand how the answer comes together.",
    "More ‘oh, that’s why.’",
  ],
  [
    "Make your attempt.",
    "Put pen to paper. Try a question without the solution doing the thinking.",
    "Your brain. Your turn.",
  ],
  [
    "Find your next step.",
    "Get your handwritten answer checked. Use detailed feedback to see what needs another try.",
    "A small win to build on.",
  ],
];

const testimonials = [
  [
    "NanoSyllabus made my preparation so organized. The mock tests and feedback helped me improve every week.",
    "Simrika Duwal",
    "CSIT, 3rd Year",
    "54%",
    "/landing-new/avatar-1.png",
  ],
  [
    "The chapter-wise practice and instant feedback helped me clear concepts I always found difficult.",
    "Rohit Paudel",
    "BCT, 4th Year",
    "62%",
    "/landing-new/avatar-2.png",
  ],
  [
    "Unlimited mock tests and smart analytics show exactly where I stand. It's like having a personal coach.",
    "Suman Giri",
    "CSIT, 4rd Year",
    "41%",
    "/landing-new/avatar-3.png",
  ],
];

const questions = [
  [
    "What is NanoSyllabus?",
    "NanoSyllabus turns your syllabus into focused learning challenges with practice, feedback, and a clearer next step.",
  ],
  [
    "Where does the learning content come from?",
    "Learning content and past-question solutions are guided by official syllabuses and question banks.",
  ],
  [
    "What do I actually do on NanoSyllabus?",
    "Choose your subjects, learn one topic, work through an example, attempt a question, and use feedback to decide what to practise next.",
  ],
  [
    "Can I start for free?",
    "Yes. You get 3 free learning challenges every day. Start with a topic and build your routine at your own pace.",
  ],
  [
    "What do I get for Rs. 450?",
    "Paid access gives you unlimited challenges and all semesters, subjects, and study material available on NanoSyllabus including unlimited handwritten exam grading.",
  ],
];

export default function LandingPage() {
  return (
    <div
      className={`${dmSans.className} min-h-screen overflow-x-hidden bg-[#fafbf7] text-[#1c1e1a] antialiased selection:bg-[#dcfa72] selection:text-[#1c1e1a]`}
    >
      {/* ── Skip Link ── */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:shadow-lg focus:outline-none"
      >
        Skip to content
      </a>

      {/* ── Top Navigation Bar ── */}
      <header className="border-b border-[#e5e8df] bg-[#fafbf7]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto flex h-[84px] max-w-[1320px] items-center justify-between px-5 2xl:px-0">
          <Brand />
          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-9 text-[15px] font-medium text-[#1c1e1a] md:flex"
          >
            <a
              href="#steps"
              className="transition-colors hover:text-[#3049ed] focus-visible:rounded focus-visible:outline-2 focus-visible:outline-[#3049ed]"
            >
              The little steps
            </a>
            <a
              href="#discord-community"
              className="transition-colors hover:text-[#3049ed] focus-visible:rounded focus-visible:outline-2 focus-visible:outline-[#3049ed]"
            >
              The people
            </a>
            <a
              href="#questions"
              className="transition-colors hover:text-[#3049ed] focus-visible:rounded focus-visible:outline-2 focus-visible:outline-[#3049ed]"
            >
              The questions
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <LandingPrimaryCta />
          </div>
        </div>
      </header>

      <main id="main-content">
        {/* ── Hero Section ── */}
        <section className="mx-auto max-w-[1320px] px-5 py-14 lg:py-24 2xl:px-0">
          <div className="grid items-center gap-12 lg:grid-cols-[1.12fr_0.88fr] lg:gap-14">
            {/* Left Content */}
            <div className="max-w-[620px]">
              <div className="mb-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#5b5e55]">
                <span className="text-[#3049ed]">✳</span>
                <span>FOR BACHELOR’S STUDENTS IN NEPAL</span>
              </div>
              <h1
                className={`${manrope.className} text-[clamp(2.9rem,5.3vw,5.5rem)] font-extrabold leading-[1.04] tracking-[-0.055em] text-[#1c1e1a]`}
              >
                Less searching
                <br />
           
                More{" "}
                <span className="relative isolate inline-block px-1">
                  learning.
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-[0.06em] -z-10 h-[0.36em] -rotate-1 rounded-sm bg-[#dcfa72]"
                  />
                </span>
              </h1>
              <p className="mt-6 text-[18px] leading-[1.55] text-[#5b5e55]">
                Scattered notes. No study routine.

                <br />
                Let’s give your preparation a clear next step.
              </p>
              <p className="mt-3 text-[18px] leading-[1.55] text-[#5b5e55]">
                Learn a topic, practise past questions, and get your handwritten answers checked. Build a daily study habit around your official syllabus.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-6">
                <LandingPrimaryCta blue size="hero" communityOnly>
                  Find your program
                </LandingPrimaryCta>
                <a
                  href="#steps"
                  className="border-b border-[#1c1e1a] text-sm font-semibold text-[#1c1e1a] transition-colors hover:text-[#3049ed] hover:border-[#3049ed] focus-visible:rounded focus-visible:outline-2 focus-visible:outline-[#3049ed]"
                >
                  How does it work?
                </a>
              </div>
            </div>

            {/* Right Card Mockup */}
            <div className="relative mx-auto w-full max-w-[540px] lg:max-w-none">
              {/* Lime decorative rays on top */}
              <div className="absolute -top-7 left-12 flex gap-1.5" aria-hidden="true">
                <span className="h-6 w-1.5 -rotate-25 rounded-full bg-[#dcfa72]" />
                <span className="h-7 w-1.5 -rotate-10 rounded-full bg-[#dcfa72]" />
                <span className="h-5 w-1.5 rotate-15 rounded-full bg-[#dcfa72]" />
              </div>

              {/* Main Lime Container */}
              <div
                className="relative rounded-[24px] bg-[#dcfa72] p-6 sm:p-8 lg:p-10 shadow-sm"
                aria-label="A small learning challenge preview"
              >
                <p className="mb-6 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.09em] text-[#1c1e1a]">
                  <span>A smaller way through a big syllabus</span>
                  <span aria-hidden="true" className="text-xl leading-none">
                    ↙
                  </span>
                </p>

                {/* Rotated White Challenge Note Card */}
                <div className="mx-auto w-full rotate-[-3.5deg] rounded-xl border border-[#23251e]/15 bg-white p-6 sm:p-8 shadow-[12px_12px_0_#bedb62] transition-transform duration-300 hover:rotate-0">
                  <div className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-widest text-[#5b5e55]">
                    <span>Nano challenge</span>
                    <span>Challenge no. 01</span>
                  </div>
                  <h2
                    className={`${manrope.className} mt-6 text-[clamp(1.85rem,2.5vw,2.4rem)] font-extrabold leading-[1.08] tracking-[-0.05em] text-[#1c1e1a]`}
                  >
                    One topic.
                    <br />
                    Actually understood.
                  </h2>

                  <div className="mt-6 divide-y divide-[#e3e6db] border-t border-[#e3e6db]">
                    {/* Step 01 */}
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3.5">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[#d9ddd3] text-xs font-bold text-[#1c1e1a]">
                          01
                        </span>
                        <div>
                          <strong className="block text-sm text-[#1c1e1a]">Learn the idea</strong>
                          <span className="block text-xs text-[#5b5e55]">
                            Make sense of the concept.
                          </span>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-[#1c1e1a]" aria-hidden="true">
                        ✓
                      </span>
                    </div>

                    {/* Step 02 */}
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3.5">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[#d9ddd3] text-xs font-bold text-[#1c1e1a]">
                          02
                        </span>
                        <div>
                          <strong className="block text-sm text-[#1c1e1a]">See it in action</strong>
                          <span className="block text-xs text-[#5b5e55]">
                            Work through a solved question.
                          </span>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-[#1c1e1a]" aria-hidden="true">
                        ✓
                      </span>
                    </div>

                    {/* Step 03 - Active / Highlighted */}
                    <div className="mt-1 flex items-center justify-between rounded-lg bg-[#3049ed] px-3.5 py-3 text-white shadow-xs">
                      <div className="flex items-center gap-3.5">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-white/40 text-xs font-bold text-white">
                          03
                        </span>
                        <div>
                          <strong className="block text-sm">Your turn</strong>
                          <span className="block text-xs text-white/80">
                            Close the solution. Give it a go.
                          </span>
                        </div>
                      </div>
                      <span className="text-sm font-bold" aria-hidden="true">
                        ↗
                      </span>
                    </div>
                  </div>

                  <p className="mt-4 flex items-center justify-between text-xs text-[#5b5e55]">
                    <span>Learning → practice → feedback</span>
                    <span aria-hidden="true" className="text-lg text-[#3049ed]">
                      ✳
                    </span>
                  </p>
                </div>

                {/* Hand-written style note */}
                <p className="mt-6 text-right font-serif text-[17px] italic leading-tight text-[#1c1e1a]">
                  Less “I think I know it.”
                  <br />
                  More “I can do it.”
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Marquee Ribbon 1 ── */}
        <div className="overflow-hidden bg-[#3049ed] py-4 text-white">
          <div
            className={`${manrope.className} mx-auto flex max-w-[1320px] flex-wrap items-center justify-center gap-x-12 gap-y-3 px-5 text-xs font-bold uppercase tracking-[0.1em]`}
          >
            {["Less panic", "More practice", "Your people", "Small wins", "Real learning"].map(
              (item, index) => (
                <span key={item} className="inline-flex items-center gap-12">
                  {index > 0 && (
                    <span aria-hidden="true" className="text-white/70">
                      ✳
                    </span>
                  )}
                  <span>{item}</span>
                </span>
              ),
            )}
          </div>
        </div>

        {/* ── Section 01 / Sound Familiar? ── */}
        <section id="little-steps" className="mx-auto max-w-[1320px] px-5 py-24 lg:py-28 2xl:px-0">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#5b5e55]">
            01 / Sound familiar?
          </div>
          <div className="mt-6 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <h2
              className={`${manrope.className} max-w-[820px] text-[clamp(2.4rem,4.2vw,3.65rem)] font-extrabold leading-[1.08] tracking-[-0.055em] text-[#1c1e1a]`}
            >
              More notes aren’t a study plan.
              <br />A clear next step is.
            </h2>
            <p className="max-w-[320px] text-base leading-relaxed text-[#5b5e55]">
            When your material is scattered and exams are getting closer, starting can feel like the hardest part.
            </p>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {problems.map(([quote, detail, label], index) => {
              const isLime = index === 1;
              return (
                <article
                  key={label}
                  className={`flex min-h-[320px] flex-col rounded-2xl border p-8 transition-all duration-300 ${
                    isLime
                      ? "rotate-[1.5deg] border-[#bedb62] bg-[#dcfa72] shadow-md hover:rotate-0"
                      : "border-[#e5e8df] bg-[#fafbf7] shadow-xs hover:shadow-md"
                  }`}
                >
                  <span className="text-xs font-bold text-[#5b5e55]">(0{index + 1})</span>
                  <h3
                    className={`${manrope.className} mt-7 text-[22px] font-bold leading-[1.35] tracking-[-0.035em] text-[#1c1e1a]`}
                  >
                    {quote}
                  </h3>
                  <p className="mt-4 flex-1 text-[15px] leading-relaxed text-[#5b5e55]">{detail}</p>
                  <p
                    className={`mt-7 border-t pt-4 text-xs font-semibold uppercase tracking-wider ${
                      isLime ? "border-[#bedb62] text-[#1c1e1a]" : "border-[#e5e8df] text-[#5b5e55]"
                    }`}
                  >
                    {label}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        {/* ── Section 02 / Meet Nano Challenges ── */}
        <section id="steps" className="bg-[#eff1e9] py-24 lg:py-28">
          <div className="mx-auto max-w-[1320px] px-5 2xl:px-0">
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#5b5e55]">
              02 / Meet Nano Challenges
            </div>
            <div className="mt-6 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <h2
                className={`${manrope.className} text-[clamp(2.7rem,4.6vw,4.4rem)] font-extrabold leading-[1.02] tracking-[-0.06em] text-[#1c1e1a]`}
              >
                Big syllabus.
                <br />
                <em className="font-serif font-normal italic">Little victories.</em>
              </h2>
              <p className="max-w-[340px] text-base leading-relaxed text-[#5b5e55]">
                A personal learning system that takes you from studying a topic to writing an answer and understanding what to improve.
              </p>
            </div>

            {/* 4-column steps */}
            <div className="mt-14 grid border-t border-[#c8cec0] md:grid-cols-4">
              {steps.map(([title, detail, foot], index) => (
                <article
                  key={title}
                  className="flex min-h-[260px] flex-col border-b border-[#c8cec0] py-8 pr-5 md:border-r md:px-7 md:first:pl-0 md:last:border-r-0"
                >
                  <span className="text-sm font-extrabold text-[#3049ed]">0{index + 1}</span>
                  <h3
                    className={`${manrope.className} mt-6 text-xl font-bold tracking-tight text-[#1c1e1a]`}
                  >
                    {title}
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-[#5b5e55]">{detail}</p>
                  <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.09em] text-[#1c1e1a]">
                    {foot}
                  </p>
                </article>
              ))}
            </div>

            {/* Bottom Row */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-5">
              <p className="text-sm font-medium text-[#5b5e55]">
                A challenge is a learning loop. Not just a quiz.
              </p>
              <LandingPrimaryCta size="default">Find my starting point</LandingPrimaryCta>
            </div>
          </div>
        </section>

        {/* ── Featured Article Card ── */}
        <section
          className="mx-auto max-w-[1320px] px-5 py-24 lg:py-28 2xl:px-0"
          aria-labelledby="featured-title"
        >
          <div className="grid overflow-hidden rounded-[28px] border border-[#e5e8df] bg-[#f5f7f1] lg:grid-cols-2">
            <div className="flex flex-col justify-between gap-8 p-8 sm:p-12 lg:p-14">
              <div>
                <span className="inline-block rounded-full bg-[#ebf1ff] px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[#0a2ec3]">
                  Featured
                </span>
                <h2
                  id="featured-title"
                  className={`${manrope.className} mt-8 text-[clamp(2rem,3.2vw,2.9rem)] font-extrabold leading-[1.18] tracking-[-0.045em] text-[#1c1e1a]`}
                >
                  From Syllabus to Success
                  <br />—{" "}
                  <span className="relative isolate inline-block px-1">
                    A Smarter Way
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-1 -z-10 h-3.5 bg-[#dcfa72]"
                    />
                  </span>{" "}
                  to Study.
                </h2>
                <p className="mt-5 max-w-[480px] text-base leading-relaxed text-[#5b5e55]">
                 A syllabus tells you what to cover. A study routine helps you actually cover it. Learn how focused topics, past questions, and written practice fit together.
                </p>
              </div>

              <div>
                <div className="mb-6 flex items-center gap-3 text-sm">
                  <span className="grid size-9 place-items-center rounded-full bg-[#dcfa72] text-sm font-bold text-[#1c1e1a]">
                    n.
                  </span>
                  <strong className="text-[#1c1e1a]">Nano Syllabus Team</strong>
                  <span className="text-[#5b5e55]">· 10 min read</span>
                </div>
                <Cta href="#steps">Read Article</Cta>
              </div>
            </div>

            {/* Right Photo Frame */}
            <div className="relative flex items-center justify-center bg-[#dcfa72] p-8 sm:p-12 lg:p-14">
              {/* Decorative rays */}
              <div className="absolute top-6 left-10 flex gap-1.5" aria-hidden="true">
                <span className="h-5 w-1.5 -rotate-25 rounded-full bg-white/70" />
                <span className="h-6 w-1.5 -rotate-10 rounded-full bg-white/70" />
                <span className="h-4 w-1.5 rotate-15 rounded-full bg-white/70" />
              </div>
              <div className="w-full max-w-[480px] rotate-[-4deg] rounded-xl border border-[#23251e]/15 bg-white p-5 shadow-[12px_12px_0_#bedb62] transition-transform duration-300 hover:rotate-0">
                <Image
                  src="/landing-new/notebook.png"
                  alt="Open study notebook beside a NanoSyllabus mug"
                  width={1184}
                  height={864}
                  className="aspect-[1.7] w-full rounded-md object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Marquee Ribbon 2 ── */}
        <div className="bg-[#3049ed] py-5 text-white">
          <p
            className={`${manrope.className} mx-auto flex max-w-[1320px] flex-wrap justify-center gap-x-12 gap-y-2 px-5 text-xs font-bold uppercase tracking-[0.1em]`}
          >
            Unlimited tests <span className="text-white/70">✳</span> AI feedback{" "}
            <span className="text-white/70">✳</span> Chapter-wise practice{" "}
            <span className="text-white/70">✳</span> Progress tracking{" "}
            <span className="text-white/70">✳</span> Study community
          </p>
        </div>

        {/* ── Testimonials Section ── */}
        <section
          id="people"
          className="mx-auto max-w-[1320px] px-5 py-24 text-center lg:py-28 2xl:px-0"
        >
          <h2
            className={`${manrope.className} text-[clamp(2rem,3.6vw,3.6rem)] font-extrabold tracking-[-0.05em] text-[#1c1e1a]`}
          >
            Loved by learners. Proven{" "}
            <span className="relative isolate inline-block px-1">
              by results.
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-1 -z-10 h-4 bg-[#dcfa72]"
              />
            </span>
          </h2>
          <p className="mx-auto mt-3 max-w-[660px] text-[15px] text-[#5b5e55]">
            Join thousands of students who are studying smarter and achieving more with
            NanoSyllabus.
          </p>

          <div className="relative mx-auto mt-14 grid max-w-[1180px] gap-6 text-left md:grid-cols-3">
            {testimonials.map(([quote, name, course, improvement, image], idx) => (
              <figure
                key={name}
                className={`flex min-h-[320px] flex-col rounded-2xl border border-[#e2e6dc] bg-white p-8 shadow-[0_8px_25px_rgba(28,30,26,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                  idx === 1 ? "md:-translate-y-1.5" : ""
                }`}
              >
                <span className="text-3xl font-extrabold text-[#99e218]" aria-hidden="true">
                  “
                </span>
                <blockquote className="mt-2 flex-1 text-sm leading-6 text-[#1c1e1a]">
                  {quote}
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3.5">
                  <Image
                    src={image}
                    alt={name}
                    width={44}
                    height={44}
                    className="size-11 rounded-full object-cover border border-[#e2e6dc]"
                  />
                  <div>
                    <strong className="block text-sm text-[#1c1e1a]">{name}</strong>
                    <span className="text-xs text-[#5b5e55]">{course}</span>
                  </div>
                </figcaption>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[#edf2ff] px-3.5 py-2 text-xs font-bold text-[#3049ed]">
                  <span>📈</span>
                  <span>{improvement} improvement in exam scores</span>
                </div>
              </figure>
            ))}
          </div>
        </section>

        {/* ── Section 04 / Community (Discord) ── */}
        <section
          id="discord-community"
          className="relative scroll-mt-24 overflow-hidden bg-[#3049ed] text-white"
        >
          <div className="relative mx-auto flex min-h-[780px] max-w-[1460px] flex-col gap-12 px-6 py-20 sm:px-10 lg:block lg:min-h-[780px] lg:px-12 lg:py-0 2xl:min-h-[690px] 2xl:px-0">
            {/* The reference deliberately lets the community visual sit between the copy and the detail list. */}
            <div
              className="pointer-events-none absolute left-[31%] top-[-12px] hidden opacity-[0.15] lg:block 2xl:left-[29%]"
              aria-hidden="true"
            >
              <svg width="244" height="244" viewBox="0 0 127.14 96.36" fill="currentColor">
                <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.12,53,91.08,65.69,84.69,65.69Z" />
              </svg>
            </div>

            <div className="relative z-10 max-w-[375px] lg:absolute lg:left-12 lg:top-[126px] 2xl:left-0">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/85">
                04 / Same syllabus. Your people.
              </p>
              <h2
                className={`${manrope.className} mt-6 text-[clamp(3rem,4vw,4rem)] font-extrabold leading-[1.01] tracking-[-0.065em] text-white`}
              >
                Study alone.
                <br />
                <em className="font-serif font-normal italic text-[#dcfa72]">
                  Just not on your own.
                </em>
              </h2>
              <p className="mt-7 max-w-[345px] text-[15px] leading-[1.8] text-white/85">
                You don’t always need someone to explain the chapter. Sometimes, you need people
                who’ll sit down and study alongside you.
              </p>
              <Cta
                href={DISCORD_STUDY_ROOM_URL}
                lime
                size="hero"
                className="mt-8 w-full sm:w-[304px] lg:min-h-[62px]"
              >
                Join Discord Community
              </Cta>
            </div>

            <div className="relative order-last mx-auto w-full max-w-[600px] lg:absolute lg:bottom-[190px] lg:left-[24%] lg:order-none lg:w-[500px] lg:max-w-none 2xl:bottom-[48px] 2xl:left-[27%] 2xl:w-[590px]">
              <div className="absolute right-[19%] top-[5%] z-10 inline-flex items-center gap-2 rounded-full border border-white/20 bg-[#1830a4]/80 px-3 py-1.5 text-[11px] font-medium text-white shadow-[0_8px_20px_rgba(13,25,110,0.32)] backdrop-blur-sm">
                <span className="size-2 rounded-full bg-[#55dd9b]" />
                <span>12 students studying now</span>
              </div>
              <Image
                src="/landing-new/community-visual.png"
                alt="Students sharing notes and studying together in a NanoSyllabus community chat"
                width={568}
                height={439}
                className="w-full object-contain drop-shadow-[0_24px_22px_rgba(13,25,110,0.28)]"
              />
            </div>

            <div className="relative z-10 w-full max-w-[560px] space-y-0 lg:absolute lg:right-12 lg:top-[118px] lg:max-w-[480px] 2xl:right-0 2xl:max-w-[560px]">
              {[
                [
                  "A community around your course.",
                  "Create or join a space with students studying the same subjects. Keep shared notes, past questions and learning material together.",
                  null,
                ],
                [
                  "Quiet company. Real studying.",
                  "Join a silent Discord study session. Open your material and get to work, with others doing the same.",
                  "Session and camera rules vary by community.",
                ],
                [
                  "Your pace still belongs to you.",
                  "A shared syllabus doesn’t mean an identical starting point. Work on the topic you need, one challenge at a time.",
                  null,
                ],
              ].map(([title, detail, extra], index) => (
                <article
                  key={title}
                  className="grid grid-cols-[26px_minmax(0,1fr)] gap-4 border-t border-white/30 py-6 first:pt-6"
                >
                  <span className="pt-0.5 text-[13px] font-medium text-[#dcfa72]">
                    0{index + 1}
                  </span>
                  <div>
                    <h3
                      className={`${manrope.className} text-[19px] font-bold tracking-[-0.035em] text-white`}
                    >
                      {title}
                    </h3>
                    <p className="mt-3 text-[15px] leading-[1.72] text-white/85">{detail}</p>
                    {extra ? <p className="mt-3 text-[13px] text-white/70">{extra}</p> : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section 05 / Fair Questions (FAQ) ── */}
        <section
          id="questions"
          className="mx-auto grid max-w-[1320px] gap-12 px-5 py-24 lg:grid-cols-[0.75fr_1.25fr] lg:py-28 2xl:px-0"
        >
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#5b5e55]">
              05 / Fair questions
            </div>
            <h2
              className={`${manrope.className} mt-6 text-[clamp(2.8rem,4.2vw,4.1rem)] font-extrabold leading-[1.08] tracking-[-0.055em] text-[#1c1e1a]`}
            >
              Before you
              <br />
              <em className="font-serif font-normal italic">jump in.</em>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-[#5b5e55]">
              No big promises.
              <br />
              Just a better way to practise.
            </p>
          </div>

          <div className="divide-y divide-[#d9ddd3] border-t border-[#d9ddd3]">
            {questions.map(([question, answer]) => (
              <details key={question} className="group py-6">
                <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold text-[#1c1e1a] transition-colors hover:text-[#3049ed] focus-visible:rounded focus-visible:outline-2 focus-visible:outline-[#3049ed]">
                  <span>{question}</span>
                  <span
                    className="flex size-7 items-center justify-center rounded-full border border-[#d9ddd3] text-lg font-bold text-[#1c1e1a] transition-transform duration-200 group-open:rotate-45"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="max-w-[700px] pt-3 text-[15px] leading-relaxed text-[#5b5e55]">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Final Call To Action Banner ── */}
        <section className="mx-auto max-w-[1320px] px-5 pb-16 2xl:px-0">
          <div className="relative overflow-hidden rounded-[28px] bg-[#dcfa72] p-8 sm:p-14 lg:p-16 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#1c1e1a]/80">
              3 free learning challenges a day. Your next step starts here.
            </div>
            <h2
              className={`${manrope.className} mt-6 text-[clamp(2.8rem,4.5vw,4.6rem)] font-extrabold leading-[1.05] tracking-[-0.055em] text-[#1c1e1a]`}
            >
              One topic today.
              <br />
              <em className="font-serif font-normal italic">A habit for the semester.</em>
            </h2>
            <div className="mt-9">
              <LandingPrimaryCta size="hero">
                Start my first learning challenges
              </LandingPrimaryCta>
            </div>

            {/* Big 8-point star graphic bottom right */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-6 right-8 opacity-90 sm:bottom-10 sm:right-14 text-[#1c1e1a]"
            >
              <svg width="120" height="120" viewBox="0 0 100 100" fill="currentColor">
                <path d="M47 0h6v100h-6z" />
                <path d="M0 47h100v6H0z" />
                <path d="M12.5 16.7l4.2-4.2 70.8 70.8-4.2 4.2z" />
                <path d="M83.3 12.5l4.2 4.2-70.8 70.8-4.2-4.2z" />
              </svg>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="mx-auto max-w-[1320px] border-t border-[#e5e8df] px-5 py-10 2xl:px-0">
        {/* Top Link Row */}
        <div className="flex flex-wrap items-center justify-between gap-6 pb-8 text-xs font-semibold text-[#5b5e55]">
          <nav aria-label="Footer primary navigation" className="flex flex-wrap gap-x-7 gap-y-3">
            <a href="#steps" className="hover:text-[#1c1e1a] transition-colors">
              Product
            </a>
            <Link href="/communities" className="hover:text-[#1c1e1a] transition-colors">
              Communities
            </Link>
            <Link href="/flow" className="hover:text-[#1c1e1a] transition-colors">
              Resources
            </Link>
            <a href="#people" className="hover:text-[#1c1e1a] transition-colors">
              About
            </a>
            <a href="#questions" className="hover:text-[#1c1e1a] transition-colors">
              Contact
            </a>
            <Link href="/app" className="hover:text-[#1c1e1a] transition-colors">
              Blog
            </Link>
          </nav>
          {/* Social Icons */}
          <div className="flex items-center gap-4 text-[#1c1e1a]">
            {/* Twitter / X */}
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Twitter"
              className="hover:opacity-70 transition-opacity"
            >
              <svg className="size-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            {/* LinkedIn */}
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="hover:opacity-70 transition-opacity"
            >
              <svg className="size-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
              </svg>
            </a>
            {/* Instagram */}
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="hover:opacity-70 transition-opacity"
            >
              <svg className="size-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </a>
            {/* Facebook */}
            <a
              href="https://facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="hover:opacity-70 transition-opacity"
            >
              <svg className="size-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.325-1.325z" />
              </svg>
            </a>
          </div>
        </div>

        {/* Bottom Logo & App Link Row */}
        <div className="flex flex-col justify-between gap-6 border-t border-[#e5e8df] pt-8 sm:flex-row sm:items-center">
          <Brand />
          <p className="text-xs text-[#5b5e55]">Small challenges. Shared ambition.</p>
          <Link
            href="/app/today"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1c1e1a] hover:text-[#3049ed] transition-colors underline underline-offset-4"
          >
            <span>Go to the app</span>
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </footer>
    </div>
  );
}
