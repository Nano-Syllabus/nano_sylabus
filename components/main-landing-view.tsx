import { DM_Sans, Manrope } from "next/font/google";
import { Brand, Cta } from "@/components/landing-view";
import { BOOK_CALL_URL, DISCORD_STUDY_ROOM_URL, FREE_DEMO_URL } from "@/lib/product-links";
import { DEFAULT_LANDING_CONTENT, landingColorVars } from "@/lib/landing-content";
import { landingDesignVars } from "@/lib/landing-templates";
import designStyles from "@/components/landing-template-view.module.css";

const dmSans = DM_Sans({ subsets: ["latin"], display: "swap" });
const manrope = Manrope({ subsets: ["latin"], display: "swap" });

// Every visitor action on the main site is a call booked on Calendly, except
// the sample lesson, which is the free demo.
const JOIN_HREF = BOOK_CALL_URL;
const JOIN_NEW_TAB = BOOK_CALL_URL.startsWith("http");

const steps = [
  {
    title: "Start from your syllabus",
    detail: "Lessons follow your course, split into micro-topics you can finish in one sitting.",
  },
  {
    title: "Watch and participate",
    detail: "Each video explains an idea, then asks you something. You answer and get instant feedback.",
  },
  {
    title: "Test what you remember",
    detail: "Exam-style questions show exactly what you missed.",
  },
  {
    title: "See your progress",
    detail: "Track every topic and subject, so you know what needs revision.",
  },
];

const audiences = [
  {
    title: "Students aiming for higher marks",
    detail: "See which topics cost you marks and spend your time there.",
  },
  {
    title: "Students of difficult science subjects",
    detail: "Hard concepts explained step by step, then practised straight away.",
  },
  {
    title: "Students preparing independently",
    detail: "No tutor? A clear path through your syllabus replaces guesswork.",
  },
  {
    title: "Students who struggle with revision",
    detail: "Short lessons and visible progress make revision manageable.",
  },
];

const courses = ["CSI", "BEI", "BCT"];

const comparison: Array<{ feature: string; lectures: string; qa: string; nano: string }> = [
  { feature: "Clear explanation", lectures: "Yes", qa: "Rarely", nano: "Yes" },
  { feature: "You take part while learning", lectures: "No", qa: "No", nano: "Yes" },
  { feature: "Instant feedback on your answers", lectures: "No", qa: "No", nano: "Yes" },
  { feature: "Focused on your exam", lectures: "Sometimes", qa: "Yes", nano: "Yes" },
  { feature: "Shows what you still don't know", lectures: "No", qa: "No", nano: "Yes" },
];

const faqs = [
  {
    question: "What is NanoSyllabus?",
    answer:
      "Interactive video lessons built from your syllabus. You answer as you learn and see what you still need to work on.",
  },
  {
    question: "How is it different from YouTube lectures or my notes?",
    answer: "Lectures and notes are one-way. NanoSyllabus asks, checks and shows your gaps.",
  },
  {
    question: "Why not just use ChatGPT?",
    answer:
      "It doesn't know your syllabus or track what you've covered, and it won't tell you if you're not ready. NanoSyllabus follows your course topic by topic and measures what you actually know.",
  },
  {
    question: "Can it replace my classes or teacher?",
    answer: "No. It works alongside them for understanding, practice and revision.",
  },
];

const navLinks = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#courses", label: "Courses" },
  { href: "#questions", label: "FAQ" },
];

const sectionHeading = `${manrope.className} text-[clamp(2.2rem,4.2vw,3.65rem)] font-extrabold leading-[1.08] tracking-[-0.055em] text-[#1c1e1a]`;

function Verdict({ value, highlight = false }: { value: string; highlight?: boolean }) {
  const tone =
    value === "Yes"
      ? highlight
        ? "bg-[var(--lp-accent)] text-[#1c1e1a]"
        : "bg-[#eff1e9] text-[#1c1e1a]"
      : value === "No"
        ? "text-[#8a8d83]"
        : "bg-[#fafbf7] text-[#5b5e55]";
  return (
    <span className={`inline-flex min-w-[64px] justify-center rounded-full px-3 py-1 text-xs font-bold ${tone}`}>
      {value}
    </span>
  );
}

/**
 * nanosyllabus.com's own landing page. Its words live here rather than in
 * /admin/sites: faculty and exam sites keep the editor-driven `LandingView`.
 */
export function MainLandingView() {
  const { brand, design, hero } = DEFAULT_LANDING_CONTENT;
  return (
    <div
      data-landing-template="original"
      data-font={design.font}
      data-corners={design.corners}
      data-spacing={design.spacing}
      style={{ ...landingColorVars(brand), ...landingDesignVars(design) } as React.CSSProperties}
      className={`${designStyles.original} ${dmSans.className} min-h-screen overflow-x-hidden bg-[#fafbf7] text-[#1c1e1a] antialiased selection:bg-[var(--lp-accent)] selection:text-[#1c1e1a]`}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:shadow-lg focus:outline-none"
      >
        Skip to content
      </a>

      {/* ── Top Navigation Bar ── */}
      <header className="sticky top-0 z-40 border-b border-[#e5e8df] bg-[#fafbf7]/90 backdrop-blur-md">
        <div className="mx-auto flex h-[84px] max-w-[1320px] items-center justify-between gap-4 px-5 2xl:px-0">
          <Brand />
          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-9 text-[15px] font-medium text-[#1c1e1a] md:flex"
          >
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-[var(--lp-primary)] focus-visible:rounded focus-visible:outline-2 focus-visible:outline-[var(--lp-primary)]"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <Cta href={JOIN_HREF} size="nav" newTab={JOIN_NEW_TAB}>
            Join Waitlist
          </Cta>
        </div>
      </header>

      <main id="main-content">
        {/* ── 1. Hero ── */}
        <section className="relative isolate overflow-hidden px-5 pb-20 pt-16 lg:pb-28 lg:pt-24 2xl:px-0">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, transparent 0, transparent 47px, #e8ebdf 48px)",
              maskImage: "radial-gradient(ellipse 70% 65% at 50% 35%, black, transparent)",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[550px] w-[800px] max-w-full -translate-x-1/2 rounded-full bg-[var(--lp-accent)]/20 blur-[110px]"
          />

          <div className="mx-auto max-w-[1200px]">
            <div className="mx-auto max-w-[1050px] text-center">
              <h1
                className={`${manrope.className} text-[clamp(2.5rem,5.2vw,5.2rem)] font-extrabold leading-[1.08] tracking-[-0.055em] text-[#1c1e1a]`}
              >
                Transforming syllabus into short{" "}
                <span className="relative isolate inline-block px-1">
                  interactive video lessons.
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-[0.06em] -z-10 h-[0.36em] -rotate-1 rounded-sm bg-[var(--lp-accent)]"
                  />
                </span>
              </h1>

              <p className="mx-auto mt-7 max-w-[690px] text-[17px] leading-relaxed text-[#5b5e55] sm:text-[19px]">
                Think, respond and test yourself as you learn. Walk into the exam knowing the topic, not
                just having watched it.
              </p>

              <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
                <Cta href={JOIN_HREF} blue size="hero" newTab={JOIN_NEW_TAB}>
                  Join Waitlist
                </Cta>
                <a
                  href={FREE_DEMO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[58px] items-center justify-center gap-2.5 rounded-lg border border-[#1c1e1a] bg-white px-8 text-[15px] font-semibold text-[#1c1e1a] transition-colors hover:bg-[#eff1e9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1e1a] focus-visible:ring-offset-2"
                >
                  <span>Watch a sample lesson</span>
                  <span aria-hidden="true" className="text-base font-bold leading-none">
                    ▶
                  </span>
                </a>
              </div>
            </div>

            {/* Product demo video: nothing downloads until the visitor presses play */}
            <div className="mx-auto mt-14 max-w-[1050px] lg:mt-20">
              <div className="overflow-hidden rounded-[22px] border border-[#dfe4d6] bg-white p-2 shadow-[0_24px_70px_rgba(28,30,26,0.12)] sm:rounded-[30px] sm:p-3">
                <video
                  src="/demo-video/nanosyllabus-demo.mp4"
                  poster="/demo-video/nanosyllabus-demo-poster.jpg"
                  title={hero.demoCaption}
                  aria-label={hero.demoCaption}
                  controls
                  playsInline
                  preload="none"
                  className="block aspect-video w-full rounded-[15px] bg-[#f4f6f1] sm:rounded-[20px]"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── 2. The problem ── */}
        <section className="mx-auto max-w-[1320px] px-5 py-24 lg:py-28 2xl:px-0">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <h2 className={sectionHeading}>Watching a lecture is not the same as knowing it.</h2>
            <div className="space-y-5 text-[17px] leading-relaxed text-[#5b5e55]">
              <p>
                You watch, you nod, you feel ready. Then the exam asks something slightly different, and
                the feeling disappears.
              </p>
              <p className="rounded-2xl border border-[var(--lp-accent-strong)] bg-[var(--lp-accent)] p-6 font-semibold text-[#1c1e1a]">
                Passive study leaves gaps you only find on exam day. We fix that.
              </p>
            </div>
          </div>
        </section>

        {/* ── 3. Why interactive matters now ── */}
        <section className="bg-[#1c1e1a] py-24 text-white lg:py-28">
          <div className="mx-auto max-w-[1320px] px-5 2xl:px-0">
            <h2
              className={`${manrope.className} max-w-[900px] text-[clamp(2.2rem,4.2vw,3.65rem)] font-extrabold leading-[1.08] tracking-[-0.055em]`}
            >
              In the age of AI, answers are easy.{" "}
              <span className="text-[var(--lp-accent)]">Understanding is not.</span>
            </h2>
            <div className="mt-12 grid gap-6 md:grid-cols-2">
              <p className="text-[17px] leading-relaxed text-white/75">
                An exam doesn&apos;t test whether you can find an answer. It tests whether you can build one,
                from memory, under time pressure.
              </p>
              <p className="text-[17px] leading-relaxed text-white/75">
                In every lesson you stop, think, respond and fix your mistakes.{" "}
                <strong className="font-semibold text-white">What you work out yourself is what you remember.</strong>
              </p>
            </div>
          </div>
        </section>

        {/* ── 4. How it works ── */}
        <section id="how-it-works" className="bg-[#eff1e9] py-24 lg:py-28">
          <div className="mx-auto max-w-[1320px] px-5 2xl:px-0">
            <h2 className={`${sectionHeading} max-w-[860px]`}>
              From your syllabus to exam-ready, one small step at a time.
            </h2>
            <ol className="mt-14 grid border-t border-[#c8cec0] md:grid-cols-4">
              {steps.map(({ title, detail }, index) => (
                <li
                  key={title}
                  className="flex min-h-[220px] flex-col border-b border-[#c8cec0] py-8 pr-5 md:border-r md:px-7 md:first:pl-0 md:last:border-r-0"
                >
                  <span className="text-sm font-extrabold text-[var(--lp-primary)]">0{index + 1}</span>
                  <h3 className={`${manrope.className} mt-6 text-xl font-bold tracking-tight text-[#1c1e1a]`}>
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#5b5e55]">{detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── 5. Who it's for ── */}
        <section className="mx-auto max-w-[1320px] px-5 py-24 lg:py-28 2xl:px-0">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <h2 className={`${sectionHeading} max-w-[820px]`}>
              Made for students who want results, not just more content.
            </h2>
            <p className="max-w-[340px] text-base leading-relaxed text-[#5b5e55]">
              If you&apos;ve ever finished a lecture and still felt unsure, this is for you.
            </p>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {audiences.map(({ title, detail }, index) => (
              <article
                key={title}
                className={`flex flex-col rounded-2xl border p-7 ${
                  index === 1
                    ? "border-[var(--lp-accent-strong)] bg-[var(--lp-accent)]"
                    : "border-[#e5e8df] bg-white"
                }`}
              >
                <h3 className={`${manrope.className} text-lg font-bold leading-snug tracking-tight text-[#1c1e1a]`}>
                  {title}
                </h3>
                <p className={`mt-3 text-sm leading-relaxed ${index === 1 ? "text-[#1c1e1a]" : "text-[#5b5e55]"}`}>
                  {detail}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* ── 6. Courses on the way: nothing here is clickable yet ── */}
        <section id="courses" className="cursor-default bg-[#eff1e9] py-24 lg:py-28">
          <div className="mx-auto max-w-[1320px] px-5 2xl:px-0">
            <h2 className={sectionHeading}>Courses on the way</h2>
            <p className="mt-4 text-base text-[#5b5e55]">We&apos;re building program by program. These are first.</p>
            <ul className="mt-12 grid gap-5 sm:grid-cols-3">
              {courses.map((course) => (
                <li key={course} className="rounded-2xl border border-[#d9ddd3] bg-white p-7">
                  <p className={`${manrope.className} text-3xl font-extrabold tracking-[-0.04em] text-[#1c1e1a]`}>
                    {course}
                  </p>
                  <p className="mt-6 inline-flex rounded-full bg-[#eff1e9] px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-[#5b5e55]">
                    Coming soon
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-10 flex flex-wrap items-center gap-5">
              <span
                aria-disabled="true"
                className="inline-flex min-h-[48px] items-center rounded-lg border border-[#d9ddd3] bg-[#f4f6f1] px-6 text-sm font-semibold text-[#9a9d93]"
              >
                Browse all courses · Coming soon
              </span>
              <p className="text-sm text-[#5b5e55]">More programs will be added as we grow.</p>
            </div>
          </div>
        </section>

        {/* ── 7. Why NanoSyllabus ── */}
        <section className="mx-auto max-w-[1320px] px-5 py-24 lg:py-28 2xl:px-0">
          <h2 className={sectionHeading}>What makes it different.</h2>
          <div className="mt-12 overflow-x-auto rounded-2xl border border-[#e5e8df] bg-white">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#e5e8df] text-xs font-bold uppercase tracking-[0.08em] text-[#5b5e55]">
                  <th scope="col" className="px-6 py-5">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th scope="col" className="px-4 py-5 text-center">Recorded lectures</th>
                  <th scope="col" className="px-4 py-5 text-center">Q&amp;A collections</th>
                  <th scope="col" className="bg-[var(--lp-accent)]/30 px-4 py-5 text-center text-[#1c1e1a]">
                    NanoSyllabus
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef0ea]">
                {comparison.map(({ feature, lectures, qa, nano }) => (
                  <tr key={feature}>
                    <th scope="row" className="px-6 py-4 font-semibold text-[#1c1e1a]">
                      {feature}
                    </th>
                    <td className="px-4 py-4 text-center">
                      <Verdict value={lectures} />
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Verdict value={qa} />
                    </td>
                    <td className="bg-[var(--lp-accent)]/30 px-4 py-4 text-center">
                      <Verdict value={nano} highlight />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-8 max-w-[640px] text-[17px] font-medium leading-relaxed text-[#1c1e1a]">
            Clear explanation, active participation, and exam-focused preparation, together.
          </p>
        </section>

        {/* ── 8. FAQ ── */}
        <section
          id="questions"
          className="mx-auto grid max-w-[1320px] gap-12 px-5 py-24 lg:grid-cols-[0.75fr_1.25fr] lg:py-28 2xl:px-0"
        >
          <h2 className={sectionHeading}>Frequently asked questions</h2>
          <div className="divide-y divide-[#d9ddd3] border-t border-[#d9ddd3]">
            {faqs.map(({ question, answer }) => (
              <details key={question} className="group py-6">
                <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold text-[#1c1e1a] transition-colors hover:text-[var(--lp-primary)] focus-visible:rounded focus-visible:outline-2 focus-visible:outline-[var(--lp-primary)]">
                  <span>{question}</span>
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[#d9ddd3] text-lg font-bold text-[#1c1e1a] transition-transform duration-200 group-open:rotate-45"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="max-w-[700px] pt-3 text-[15px] leading-relaxed text-[#5b5e55]">{answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── 10. Final call to action ── */}
        <section className="mx-auto max-w-[1320px] px-5 pb-16 2xl:px-0">
          <div className="relative overflow-hidden rounded-[28px] bg-[var(--lp-accent)] p-8 shadow-sm sm:p-14 lg:p-16">
            <h2
              className={`${manrope.className} max-w-[860px] text-[clamp(2.4rem,4.5vw,4.4rem)] font-extrabold leading-[1.05] tracking-[-0.055em] text-[#1c1e1a]`}
            >
              Your exam won&apos;t wait. Start preparing the right way.
            </h2>
            <p className="mt-6 max-w-[560px] text-[17px] leading-relaxed text-[#1c1e1a]/80">
              Try your first micro-topic today. If it doesn&apos;t help, you&apos;ve lost ten minutes.
            </p>
            <div className="mt-9">
              <Cta href={JOIN_HREF} size="hero" newTab={JOIN_NEW_TAB}>
                Start free
              </Cta>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="mx-auto max-w-[1320px] border-t border-[#e5e8df] px-5 py-10 2xl:px-0">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <Brand />
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-7 gap-y-3 text-xs font-semibold text-[#5b5e55]">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="transition-colors hover:text-[#1c1e1a]">
                {link.label}
              </a>
            ))}
            <a href={DISCORD_STUDY_ROOM_URL} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#1c1e1a]">
              Discord
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
