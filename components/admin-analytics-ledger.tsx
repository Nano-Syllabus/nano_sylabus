"use client";

import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  MessagesSquare,
  Receipt,
  Wallet,
} from "lucide-react";
import {
  adminControl,
  adminPanel,
  Metric,
  PanelHeading,
  ReceiptSummary,
} from "@/components/admin-analytics-panels";
import { formatMetric as num, formatReceipt, type AdminAnalytics } from "@/lib/admin-analytics";
import {
  activityDate,
  receiptTotal,
  type AnalyticsDay,
  type AnalyticsWindow,
} from "@/lib/admin-analytics-presentation";

const tableCell = "whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums";

export function RevenueDetails({
  data,
  rows,
  days,
  currency,
  onCurrency,
}: {
  data: AdminAnalytics;
  rows: AnalyticsDay[];
  days: AnalyticsWindow;
  currency: string;
  onCurrency: (currency: string) => void;
}) {
  const selected = data.revenue.currencies.find((row) => row.currency === currency);
  if (!selected) return <ReceiptSummary data={data} />;
  const receiptDays = [...rows]
    .reverse()
    .filter((row) =>
      row.revenue.some((receipt) => receipt.currency === currency && receipt.amount > 0),
    );
  return (
    <div className="space-y-5">
      <label className="flex flex-wrap items-center gap-3 text-xs font-medium">
        Receipt currency
        <select
          className={adminControl}
          value={currency}
          onChange={(event) => onCurrency(event.target.value)}
        >
          {data.revenue.currencies.map((row) => (
            <option key={row.currency}>{row.currency}</option>
          ))}
        </select>
        <span className="font-normal text-muted-foreground">Currencies are never combined.</span>
      </label>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Wallet}
          label="Total confirmed revenue"
          value={formatReceipt(selected.total, currency)}
          detail="Gross receipts · all retained records"
        />
        <Metric
          icon={Receipt}
          label="Revenue today"
          value={formatReceipt(selected.today, currency)}
          detail="Approved today · Nepal time"
        />
        <Metric
          icon={Receipt}
          label={`Revenue · ${days} days`}
          value={formatReceipt(receiptTotal(rows, currency), currency)}
          detail="Reconciled receipts in selected window"
        />
        <Metric
          icon={Wallet}
          label="Confirmed payments"
          value={num(selected.payments)}
          detail={`Paid invoices in ${currency} · all time`}
        />
      </dl>
      <section className={`${adminPanel} overflow-hidden`}>
        <div className="p-5">
          <PanelHeading
            title="Receipt activity"
            description={`Days with confirmed ${currency} receipts · last ${days} days`}
          />
        </div>
        {receiptDays.length ? (
          <table className="w-full">
            <thead className="border-y border-border bg-muted/50 text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-3 text-left text-xs font-medium">
                  Approval date
                </th>
                <th scope="col" className="px-5 py-3 text-right text-xs font-medium">
                  Gross receipts
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {receiptDays.map((row) => (
                <tr key={row.date}>
                  <td className="px-5 py-3 text-xs">
                    {activityDate(row.date)}
                    <span className="ml-2 text-muted-foreground">{row.date}</span>
                  </td>
                  <td className="px-5 py-3 text-right text-sm tabular-nums">
                    {formatReceipt(receiptTotal([row], currency), currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="border-t border-border px-5 py-10 text-center text-sm text-muted-foreground">
            No confirmed receipts in this period.
          </p>
        )}
        <p className="border-t border-border px-5 py-4 text-xs leading-5 text-muted-foreground">
          Only positive paid invoices matched to approved payments. Pending proofs, free invoices
          and unreconciled records are excluded.
        </p>
      </section>
      {data.revenue.unreconciledPaidInvoices > 0 && (
        <p role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm">
          {num(data.revenue.unreconciledPaidInvoices)} paid invoice(s) need reconciliation and are
          not included in revenue.
        </p>
      )}
    </div>
  );
}

export function RequestDetails({ data }: { data: AdminAnalytics }) {
  const since = data.requests.trackedSince
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: data.timezone,
      }).format(new Date(data.requests.trackedSince))
    : null;
  return (
    <div className="space-y-5">
      <dl className="grid gap-3 sm:grid-cols-3">
        <Metric
          icon={Activity}
          label="Recorded API requests"
          value={num(data.requests.recorded)}
          detail="Tracked upstream API calls"
        />
        <Metric
          icon={CircleAlert}
          label="Failed requests"
          value={num(data.requests.failed)}
          detail="Recorded unsuccessful calls"
        />
        <Metric
          icon={MessagesSquare}
          label="Saved chat messages"
          value={num(data.requests.chatMessages)}
          detail="User messages retained in app history"
        />
      </dl>
      <section className={`${adminPanel} p-5`}>
        <PanelHeading
          title="Request tracking coverage"
          description={
            since
              ? `First recorded request: ${since} · Nepal time`
              : "No requests have been recorded by the new tracker yet."
          }
        />
        <div className="mt-5 max-w-3xl space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            API calls and chat messages measure different things. A message can trigger more than
            one upstream call; background requests and retries may also be recorded.
          </p>
          <p>
            Tracking begins with this release. Historical API traffic cannot be reconstructed from
            saved chats, so it is not added to these totals. Calls made outside this app and
            tracking writes that fail are not covered.
          </p>
          <p>
            No latency or daily request chart is shown because this analytics response does not
            provide those measurements.
          </p>
        </div>
      </section>
    </div>
  );
}

export function DailyLedger({
  data,
  rows,
  days,
  page,
  activeOnly,
  onPage,
  onActiveOnly,
}: {
  data: AdminAnalytics;
  rows: AnalyticsDay[];
  days: AnalyticsWindow;
  page: number;
  activeOnly: boolean;
  onPage: (page: number) => void;
  onActiveOnly: (active: boolean) => void;
}) {
  const filtered = [...rows]
    .reverse()
    .filter(
      (row) =>
        !activeOnly ||
        row.newUsers + row.challengesPassed + row.examsCompleted > 0 ||
        row.revenue.some((receipt) => receipt.amount > 0),
    );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 7));
  const currentPage = Math.min(
    totalPages,
    Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1),
  );
  const visible = filtered.slice((currentPage - 1) * 7, currentPage * 7);
  const currencies = Array.from(
    new Set(rows.flatMap((row) => row.revenue.map((receipt) => receipt.currency))),
  ).sort();
  return (
    <section className={`${adminPanel} overflow-hidden`}>
      <div className="p-5">
        <PanelHeading
          title="Daily activity ledger"
          description={`Exact daily totals · last ${days} calendar days · ${data.timezone}`}
          action={
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(event) => onActiveOnly(event.target.checked)}
                className="h-4 w-4 accent-foreground"
              />
              Days with activity only
            </label>
          }
        />
      </div>
      <div
        className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"
        tabIndex={0}
        role="region"
        aria-label="Scrollable daily activity table"
      >
        <table className="w-full">
          <caption className="sr-only">
            Database daily counts. Zero means no recorded activity, not missing data.
          </caption>
          <thead className="border-y border-border bg-muted/50 text-muted-foreground">
            <tr>
              <th scope="col" className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium">
                Date
              </th>
              {[
                "New users",
                "Challenges passed",
                "Exams completed",
                ...currencies.map((currency) => `Receipts (${currency})`),
              ].map((label) => (
                <th key={label} scope="col" className={`${tableCell} font-medium`}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((row) => (
              <tr key={row.date} className="hover:bg-muted/40">
                <th
                  scope="row"
                  className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium"
                >
                  {row.date}
                </th>
                <td className={tableCell}>{num(row.newUsers)}</td>
                <td className={tableCell}>{num(row.challengesPassed)}</td>
                <td className={tableCell}>{num(row.examsCompleted)}</td>
                {currencies.map((currency) => (
                  <td key={currency} className={tableCell}>
                    {formatReceipt(receiptTotal([row], currency), currency)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          No activity in this window. Uncheck the filter to see every calendar day.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">
          {filtered.length
            ? `${(currentPage - 1) * 7 + 1}–${Math.min(currentPage * 7, filtered.length)} of ${filtered.length} days`
            : "0 days"}
        </p>
        <div className="flex items-center gap-2">
          <button
            className={adminControl}
            disabled={currentPage <= 1}
            onClick={() => onPage(currentPage - 1)}
            aria-label="Previous page"
          >
            <ArrowLeft size={14} />
          </button>
          <span className="px-1 text-xs tabular-nums">
            {currentPage} / {totalPages}
          </span>
          <button
            className={adminControl}
            disabled={currentPage >= totalPages}
            onClick={() => onPage(currentPage + 1)}
            aria-label="Next page"
          >
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}
