import { LandingHeader } from "@/components/landing-header";

export default function CommunitiesLoading() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <LandingHeader />
      <main
        className="mx-auto w-full max-w-7xl animate-pulse px-4 py-10 sm:px-6 lg:px-8"
        aria-label="Loading communities"
      >
        <div className="h-5 w-44 rounded bg-bg-tertiary" />
        <div className="mt-4 h-11 max-w-2xl rounded bg-bg-tertiary" />
        <div className="mt-3 h-5 max-w-xl rounded bg-bg-tertiary" />
        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-72 rounded-xl bg-bg-tertiary" />
          ))}
        </div>
      </main>
    </div>
  );
}
