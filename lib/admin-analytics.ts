import { z } from "zod";

const count = z.number().int().nonnegative();
const amount = z.number().finite().nonnegative();
const money = z.object({ currency: z.string().min(1), amount });

// Validate the entire snapshot. An incompatible/missing result is an error,
// never a partially successful dashboard filled with invented zeroes.
export const adminAnalyticsSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  timezone: z.literal("Asia/Kathmandu"),
  users: z.object({
    total: count,
    growth: z.array(z.object({
      days: z.union([z.literal(1), z.literal(7), z.literal(30)]),
      current: count, previous: count, percentChange: z.number().finite().nullable(),
    })).length(3),
  }),
  content: z.object({ subjects: count, courses: count, publishedCourses: count, subjectsPerUser: amount.nullable() }),
  requests: z.object({ recorded: count, failed: count, trackedSince: z.string().datetime({ offset: true }).nullable(), chatMessages: count }),
  challenges: z.object({ passed: count, today: count, last7: count, averagePerDay: amount, topStudentPerDay: amount, bestDay: count, gradedAttempts30: count, passedAttempts30: count }),
  exams: z.object({ completed: count, today: count, practice: count, teacher: count, perUser: amount.nullable(), averagePercent: z.number().min(0).max(100).nullable(), scored: count }),
  revenue: z.object({ currencies: z.array(z.object({ currency: z.string().min(1), total: amount, today: amount, payments: count })), unreconciledPaidInvoices: count }),
  daily: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), newUsers: count, challengesPassed: count, examsCompleted: count, revenue: z.array(money) })).length(30),
});

export type AdminAnalytics = z.infer<typeof adminAnalyticsSchema>;

export function formatMetric(value: number | null, decimals = 0): string {
  if (value === null) return "—";
  // Counts are never abbreviated; averages retain useful precision.
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals }).format(value);
}

export function formatReceipt(amount: number, currency: string): string {
  // Invoices store major currency units, unlike course.price_paisa.
  return `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}
