import type { AdminAnalytics } from "@/lib/admin-analytics";

export type AnalyticsDay = AdminAnalytics["daily"][number];
export type AnalyticsWindow = 7 | 30;
export type ActivityKey = "newUsers" | "challengesPassed" | "examsCompleted";

// SQL supplies every Nepal calendar day, including genuine zero-activity days.
// Sort copies: charts are chronological; the ledger stays newest-first.
export function analyticsWindow(daily: AnalyticsDay[], days: AnalyticsWindow): AnalyticsDay[] {
  return [...daily]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, days)
    .reverse();
}

export function activityTotal(rows: AnalyticsDay[], key: ActivityKey): number {
  return rows.reduce((total, row) => total + row[key], 0);
}

export function receiptTotal(rows: AnalyticsDay[], currency: string): number {
  return rows.reduce(
    (total, row) =>
      total +
      row.revenue
        .filter((item) => item.currency === currency)
        .reduce((sum, item) => sum + item.amount, 0),
    0,
  );
}

export function activityDate(date: string): string {
  // Date strings already represent Nepal days; never shift them into a browser's timezone.
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function chartCeiling(values: number[]): number {
  const maximum = Math.max(0, ...values);
  if (!maximum) return 4;
  return Math.ceil(maximum / 4) * 4;
}

function csvCell(value: string | number): string {
  const text = String(value);
  // Keep spreadsheet formulas inert, even if a currency label contains unexpected text.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function dailyActivityCsv(
  rows: AnalyticsDay[],
  timezone: string,
  generatedAt: string,
): string {
  const currencies = [
    ...new Set(rows.flatMap((row) => row.revenue.map((item) => item.currency))),
  ].sort();
  const headers = [
    "Date",
    "Timezone",
    "New users",
    "Challenges passed",
    "Exams completed",
    ...currencies.map((currency) => `Confirmed receipts (${currency})`),
    "Snapshot at",
  ];
  const values = rows.map((row) => [
    row.date,
    timezone,
    row.newUsers,
    row.challengesPassed,
    row.examsCompleted,
    ...currencies.map((currency) => receiptTotal([row], currency)),
    generatedAt,
  ]);
  return [headers, ...values].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
