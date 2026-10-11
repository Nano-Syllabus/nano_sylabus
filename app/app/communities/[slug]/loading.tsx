import { LoadingRows, SummaryLoading } from "@/components/loading-states";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

export default function CommunityStudyLoading() {
  return (
    <main aria-busy="true" className="student-page-frame" aria-label="Loading community">
      <LoadingStatus label="Opening community" />
      <Skeleton className="mt-5 h-8 w-64 max-w-full" />
      <Skeleton className="mt-3 h-3 w-44" />
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card px-5 pt-5">
          <h2 className="text-sm font-semibold">Subjects</h2>
          <LoadingRows />
        </section>
        <SummaryLoading title="Community overview" />
      </div>
    </main>
  );
}
