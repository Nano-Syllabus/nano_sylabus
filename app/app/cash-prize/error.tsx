"use client";

export default function CashPrizeError({ reset }: { reset: () => void }) {
  return (
    <main className="font-figma-library flex min-h-full items-center justify-center bg-bg-primary px-4 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-[#e2e8f0] bg-white p-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#475569]">Cash Prize</p>
        <h1 className="mt-3 text-2xl font-bold text-[#0f172a]">
          Challenge progress couldn&apos;t be loaded
        </h1>
        <p className="mt-2 text-base text-[#475569]">
          Your progress has not been replaced with an estimate. Try loading the real result again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 min-h-11 rounded-full bg-[#0066ff] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#0059df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066ff] focus-visible:ring-offset-2"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
