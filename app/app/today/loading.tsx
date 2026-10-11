import { CalendarLoading, SummaryLoading } from "@/components/loading-states";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

/** The route fallback and dashboard query use the same panel layout. */
export default function TodayLoading() {
  return (
    <main className="student-page-frame" aria-busy="true" aria-label="Loading dashboard">
      <header className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <h1 className="type-student-page-title">Welcome.</h1>
        <LoadingStatus label="Loading your study day" />
      </header>
      <div aria-hidden="true" className="mt-5 rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="mt-3 h-3 w-1/2" />
      </div>
      <SummaryLoading title="Your next challenge" className="mt-5 min-h-[190px]" />
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <CalendarLoading />
        <SummaryLoading title="Your exam day" className="min-h-[150px]" />
      </div>
    </main>
  );
}
