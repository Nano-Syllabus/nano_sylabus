import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

/** The admin sidebar stays visible while payment data loads. */
export default function AdminBillingLoading() {
  return (
    <div aria-busy="true">
      <h1 className="font-display text-2xl font-semibold">Payments</h1>
      <LoadingStatus label="Loading payment submissions" className="mt-2" />
      <div aria-hidden="true" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="mt-4 h-6 w-16" />
          </div>
        ))}
      </div>
      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 border-b border-border bg-bg-secondary p-4 text-xs font-medium text-text-muted">
          <span>Submission</span>
          <span>Amount</span>
          <span>Status</span>
        </div>
        <div aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="grid grid-cols-[2fr_1fr_1fr] gap-4 border-b border-border p-4 last:border-0"
            >
              <div>
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="mt-2 h-2 w-1/2" />
              </div>
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
