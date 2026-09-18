import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminBillingFrame } from "@/components/admin-billing-frame";
import { AdminCashPrizeEntries } from "@/components/admin-cash-prize-entries";
import { assertAdminRequest } from "@/lib/admin-access";
import {
  getNepalDateKey,
  isNepalDateKey,
  listAdminCashPrizeEntries,
} from "@/lib/data/cash-prize";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Prize entries · Nano Syllabus Admin",
  robots: { index: false, follow: false },
};

export default async function AdminCashPrizePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const access = await assertAdminRequest();
  if ("error" in access) {
    if (access.status === 401) redirect("/login?next=%2Fadmin%2Fcash-prize");
    if (access.status === 403) redirect("/app/today");
    throw new Error("Admin access could not be verified. Please retry.");
  }

  const requestedDate = (await searchParams).date;
  const entryDate = isNepalDateKey(requestedDate) ? requestedDate : getNepalDateKey();
  const entries = await listAdminCashPrizeEntries(entryDate);

  return (
    <AdminBillingFrame active="cash-prize" title="Prize entries">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Daily lottery operations
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Cash prize entries
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            Every student is captured once after their first passing challenge of each Nepal day.
          </p>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Nepal date
            <input
              type="date"
              name="date"
              defaultValue={entryDate}
              className="min-h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground"
            />
          </label>
          <button
            type="submit"
            className="min-h-10 rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            View day
          </button>
        </form>
      </div>

      <AdminCashPrizeEntries entries={entries} entryDate={entryDate} />
    </AdminBillingFrame>
  );
}
