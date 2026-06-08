import Link from "next/link";
import { MarketingNav } from "@/components/marketing-nav";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: "💬",
    title: "Bilingual AI chat",
    body: "Ask in English or Roman Nepali. Get answers in the language you naturally think in.",
  },
  {
    icon: "🎯",
    title: "Profile-aware guidance",
    body: "Your grade, target, and study context shape how explanations are delivered.",
  },
  {
    icon: "📚",
    title: "Built for revision",
    body: "Phase 1 focuses on real chat foundations so study workflows can become real next.",
  },
  {
    icon: "🇳🇵",
    title: "Made for Nepal",
    body: "Designed around Nepali academic habits and local curriculum expectations.",
  },
];

export default function HomePage() {
  return (
    <div className="bg-bg-primary text-text-primary">
      <MarketingNav />

      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-dotgrid opacity-60 animate-drift" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-5 pb-24 pt-20 text-center sm:pb-32 sm:pt-28">
          <h1 className="font-display text-5xl font-bold leading-[1.1] tracking-tighter sm:text-7xl">
            Your AI Study Companion,
            <br />
            <span className="bg-gradient-to-r from-neutral-600 to-neutral-900 bg-clip-text text-transparent dark:from-neutral-300 dark:to-neutral-50">Built For Nepal.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base font-light text-text-secondary sm:text-lg">
            Ask in English or Roman Nepali. Get personalized AI support that feels closer to how Nepali students actually study.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup">
              <Button size="lg">Create account →</Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">
                Login
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section id="features" className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="mx-auto mb-16 max-w-3xl text-center">
            <h2 className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              A clearer path from doubt to understanding.
            </h2>
          </div>
          <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div key={feature.title} className="bg-bg-primary p-7 transition hover:bg-bg-secondary">
                <div className="text-2xl">{feature.icon}</div>
                <h3 className="mt-5 text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="border-b border-border bg-bg-secondary">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center">
          <h2 className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl">What ships first?</h2>
          <div className="mt-8 space-y-4 text-sm text-text-secondary">
            <p>Real auth, real onboarding, real persistent chat, and real AI responses.</p>
            <p>
              Notes, revision mode persistence, billing, and syllabus-grounded retrieval will come after the foundation is stable.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
