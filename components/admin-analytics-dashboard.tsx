"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CircleAlert, CircleCheck, Download, RefreshCw } from "lucide-react";
import { AdminActivityChart } from "@/components/admin-activity-chart";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminTokenUsageCard } from "@/components/admin-token-usage-card";
import {
  adminAnalyticsSchema,
  formatMetric as num,
  formatReceipt,
  type AdminAnalytics,
} from "@/lib/admin-analytics";
import {
  activityTotal,
  analyticsWindow,
  dailyActivityCsv,
  receiptTotal,
  type ActivityKey,
  type AnalyticsWindow,
} from "@/lib/admin-analytics-presentation";

const charts: Array<{ key: ActivityKey; label: string; noun: string }> = [
  { key: "newUsers", label: "Sign-ups", noun: "new students" },
  { key: "challengesPassed", label: "Challenges passed", noun: "challenges passed" },
  { key: "examsCompleted", label: "Exams finished", noun: "exams finished" },
];

const outlineButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

export function AdminAnalyticsDashboard({ pendingPayments }: { pendingPayments: number | null }) {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chart, setChart] = useState<ActivityKey>("newUsers");
  const [days, setDays] = useState<AnalyticsWindow>(30);
  const pending = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError(null);
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch("/api/admin/analytics", { cache: "no-store", signal: controller.signal });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "The numbers could not be loaded.";
        throw new Error(message);
      }
      const result = adminAnalyticsSchema.safeParse(body);
      if (!result.success) throw new Error("The database sent back incomplete numbers.");
      if (pending.current === controller) setData(result.data);
    } catch (cause) {
      if (pending.current === controller)
        setError(
          controller.signal.aborted
            ? "The database took too long to answer."
            : cause instanceof Error
              ? cause.message
              : "The numbers could not be loaded.",
        );
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, [refresh]);

  const rows = data ? analyticsWindow(data.daily, days) : [];
  const updated = data
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: data.timezone,
      }).format(new Date(data.generatedAt))
    : null;

  const downloadCsv = () => {
    if (!data) return;
    const all = analyticsWindow(data.daily, 30);
    const url = URL.createObjectURL(
      new Blob(["﻿", dailyActivityCsv(all, data.timezone, data.generatedAt)], {
        type: "text/csv;charset=utf-8;",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `nano-syllabus-daily-${all[0].date}-to-${all[all.length - 1].date}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <AdminPageHeader
        title="Overview"
        description={
          updated
            ? `How Nano Syllabus is doing. Updated ${updated}, Nepal time.`
            : "How Nano Syllabus is doing."
        }
        actions={
          <button type="button" className={outlineButton} onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={15} className={loading ? "motion-safe:animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      <Attention pendingPayments={pendingPayments} unlinked={data?.revenue.unreconciledPaidInvoices ?? 0} />

      {error ? (
        <section role="alert" className="mt-6 rounded-xl border border-border bg-card p-6">
          <CircleAlert size={22} className="text-destructive" />
          <h2 className="mt-3 font-semibold">Couldn’t load the numbers</h2>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
            onClick={() => void refresh()}
          >
            Try again
          </button>
        </section>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="Students"
              value={data ? num(data.users.total) : null}
              note={data ? `+${num(growth(data, 7).current)} this week` : null}
            />
            <Tile
              label="Joined today"
              value={data ? num(growth(data, 1).current) : null}
              note={data ? `${num(growth(data, 1).previous)} yesterday` : null}
            />
            <Tile
              label="Challenges passed today"
              value={data ? num(data.challenges.today) : null}
              note={data ? `${num(data.challenges.last7)} this week` : null}
            />
            <MoneyTile data={data} />
          </dl>

          <section className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="tablist" aria-label="Chart" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
                {charts.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={chart === item.key}
                    onClick={() => setChart(item.key)}
                    className={`min-h-9 rounded-md px-3 text-sm font-medium ${
                      chart === item.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 rounded-lg bg-muted p-1" aria-label="Period">
                {([7, 30] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={days === value}
                    onClick={() => setDays(value)}
                    className={`min-h-9 rounded-md px-3 text-sm font-medium ${
                      days === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {value} days
                  </button>
                ))}
              </div>
            </div>
            {data ? (
              <>
                <p className="mt-5 text-2xl font-semibold tabular-nums">
                  {num(activityTotal(rows, chart))}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {charts.find((item) => item.key === chart)!.noun} in the last {days} days
                  </span>
                </p>
                <AdminActivityChart
                  label={`${charts.find((item) => item.key === chart)!.label} per day`}
                  dates={rows.map((row) => row.date)}
                  series={[
                    {
                      label: charts.find((item) => item.key === chart)!.label,
                      values: rows.map((row) => row[chart]),
                    },
                  ]}
                />
              </>
            ) : (
              <div className="mt-5 space-y-4 motion-safe:animate-pulse" aria-hidden="true">
                <div className="h-7 w-48 rounded bg-border" />
                <div className="h-48 rounded-lg bg-border/60" />
              </div>
            )}
          </section>

          <section className="mt-6 rounded-xl border border-border bg-card">
            <h2 className="border-b border-border px-5 py-4 font-semibold">All-time totals</h2>
            <dl className="grid sm:grid-cols-2">
              <Line label="Challenges passed" value={data && num(data.challenges.passed)} />
              <Line label="Exams finished" value={data && num(data.exams.completed)} />
              <Line
                label="Average exam score"
                value={data && (data.exams.averagePercent === null ? "—" : `${num(data.exams.averagePercent, 1)}%`)}
              />
              <Line label="Questions asked to NanoAI" value={data && num(data.requests.chatMessages)} />
              <Line
                label="Courses published"
                value={data && `${num(data.content.publishedCourses)} of ${num(data.content.courses)}`}
              />
              <Line label="Subjects" value={data && num(data.content.subjects)} />
            </dl>
          </section>

          <AdminTokenUsageCard />

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={downloadCsv}
              disabled={!data}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <Download size={15} />
              Download last 30 days (CSV)
            </button>
          </div>
        </>
      )}
    </>
  );
}

const growth = (data: AdminAnalytics, days: 1 | 7 | 30) =>
  data.users.growth.find((row) => row.days === days) ?? { current: 0, previous: 0 };

function Attention({ pendingPayments, unlinked }: { pendingPayments: number | null; unlinked: number }) {
  const items: Array<{ text: string; href: string; action: string }> = [];
  if (pendingPayments)
    items.push({
      text: `${pendingPayments} ${pendingPayments === 1 ? "payment is" : "payments are"} waiting for your review`,
      href: "/admin/billing?status=submitted",
      action: "Review",
    });
  if (unlinked)
    items.push({
      text: `${unlinked} paid ${unlinked === 1 ? "invoice has" : "invoices have"} no plan attached`,
      href: "/admin/billing",
      action: "Open payments",
    });

  if (!items.length) {
    return (
      <p className="mt-6 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <CircleCheck size={17} className="text-emerald-600 dark:text-emerald-400" />
        Nothing needs your attention right now.
      </p>
    );
  }
  return (
    <div className="mt-6 space-y-2">
      {items.map((item) => (
        <div
          key={item.text}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <CircleAlert size={17} className="text-amber-600 dark:text-amber-400" />
            {item.text}
          </p>
          <Link
            href={item.href}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            {item.action}
            <ArrowRight size={15} />
          </Link>
        </div>
      ))}
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string | null; note: string | null }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
        {value ?? <span className="block h-9 w-16 rounded bg-border motion-safe:animate-pulse" />}
      </dd>
      <dd className="mt-1 text-xs text-muted-foreground">
        {note ?? <span className="block h-4 w-24 rounded bg-border motion-safe:animate-pulse" />}
      </dd>
    </div>
  );
}

function MoneyTile({ data }: { data: AdminAnalytics | null }) {
  const currencies = data?.revenue.currencies ?? [];
  const main = currencies[0]?.currency;
  const month = data && main ? receiptTotal(analyticsWindow(data.daily, 30), main) : null;
  return (
    <Tile
      label="Money received · 30 days"
      value={!data ? null : main && month !== null ? formatReceipt(month, main).replace(/\.00$/, "") : "—"}
      note={
        !data
          ? null
          : main
            ? `${formatReceipt(currencies[0].today, main).replace(/\.00$/, "")} today${
                currencies.length > 1 ? ` · +${currencies.length - 1} other currency` : ""
              }`
            : "No payments yet"
      }
    />
  );
}

function Line({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 last:border-b-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0 sm:odd:border-r">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">
        {value ?? <span className="block h-4 w-12 rounded bg-border motion-safe:animate-pulse" />}
      </dd>
    </div>
  );
}
