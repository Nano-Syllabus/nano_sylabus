"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Database,
  Download,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  adminControl,
  adminPanel,
  ContentSummary,
  Definitions,
  GrowthChange,
  GrowthSummary,
  LearningChart,
  LearningDetails,
  Metric,
  PanelHeading,
  ReceiptSummary,
  SignupChart,
  StatRow,
} from "@/components/admin-analytics-panels";
import { DailyLedger, RequestDetails, RevenueDetails } from "@/components/admin-analytics-ledger";
import {
  adminAnalyticsSchema,
  formatMetric as num,
  type AdminAnalytics,
} from "@/lib/admin-analytics";
import {
  analyticsWindow,
  dailyActivityCsv,
  type AnalyticsWindow,
} from "@/lib/admin-analytics-presentation";

const views = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    description: "Your platform, at a glance. Follow growth, learning and revenue.",
  },
  {
    id: "growth",
    label: "Users & growth",
    icon: Users,
    description: "Registered accounts and new signups. See when your community grows.",
  },
  {
    id: "learning",
    label: "Learning activity",
    icon: GraduationCap,
    description: "Passed challenges, completed exams and measured performance.",
  },
  {
    id: "revenue",
    label: "Revenue",
    icon: Wallet,
    description: "Confirmed payment receipts. Each currency stays separate.",
  },
  {
    id: "requests",
    label: "API usage",
    icon: Activity,
    description: "Recorded upstream requests and retained chat activity.",
  },
  {
    id: "data",
    label: "Data & definitions",
    icon: Database,
    description: "Inspect the daily records behind the charts and how each metric is calculated.",
  },
] as const;

function DashboardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading analytics"
      className="space-y-5 motion-safe:animate-pulse"
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className={`${adminPanel} h-36 p-5`}>
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="mt-5 h-8 w-16 rounded bg-muted" />
            <div className="mt-4 h-3 w-32 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <div className={`${adminPanel} h-80`} />
        <div className={`${adminPanel} h-80`} />
      </div>
      <span className="sr-only">Loading database snapshot…</span>
    </div>
  );
}

export function AdminAnalyticsDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = views.find((item) => item.id === params.get("view")) ?? views[0];
  const days: AnalyticsWindow = params.get("days") === "7" ? 7 : 30;
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exported, setExported] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const exportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hrefFor = (changes: Record<string, string>) => {
    const query = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([key, value]) => query.set(key, value));
    return `${pathname}?${query.toString()}`;
  };
  const updateQuery = (changes: Record<string, string>) =>
    router.replace(hrefFor(changes), { scroll: false });

  const refresh = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError(null);
    setData(null);
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch("/api/admin/analytics", {
        cache: "no-store",
        signal: controller.signal,
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Analytics could not be loaded.";
        throw new Error(message);
      }
      const result = adminAnalyticsSchema.safeParse(body);
      if (!result.success)
        throw new Error(
          "The database returned an incomplete analytics snapshot. No replacement values have been shown.",
        );
      if (pending.current === controller) setData(result.data);
    } catch (cause) {
      if (pending.current === controller)
        setError(
          controller.signal.aborted
            ? "The database took too long to respond. Please try again."
            : cause instanceof Error
              ? cause.message
              : "Analytics could not be loaded.",
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
      if (exportTimer.current) clearTimeout(exportTimer.current);
    };
  }, [refresh]);

  const rows = data ? analyticsWindow(data.daily, days) : [];
  const currency = data?.revenue.currencies.some((item) => item.currency === params.get("currency"))
    ? params.get("currency")!
    : (data?.revenue.currencies[0]?.currency ?? "");
  const exportCsv = () => {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", dailyActivityCsv(rows, data.timezone, data.generatedAt)], {
        type: "text/csv;charset=utf-8;",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `nano-syllabus-daily-${rows[0].date}-to-${rows[rows.length - 1].date}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(true);
    if (exportTimer.current) clearTimeout(exportTimer.current);
    exportTimer.current = setTimeout(() => setExported(false), 2500);
  };
  const snapshot = data
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: data.timezone,
      }).format(new Date(data.generatedAt))
    : null;

  const navigation = (mobile = false) => (
    <nav
      aria-label={mobile ? "Mobile admin navigation" : "Admin navigation"}
      className={mobile ? "flex gap-1 overflow-x-auto px-4 py-2 lg:hidden" : "space-y-1 px-3"}
    >
      {views.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={hrefFor({ view: item.id, page: "1" })}
            scroll={false}
            aria-current={view.id === item.id ? "page" : undefined}
            className={`flex min-h-10 shrink-0 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${view.id === item.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <Icon size={17} strokeWidth={1.7} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-muted/45 text-foreground">
      <a
        href="#admin-content"
        className="sr-only z-50 rounded-md bg-card p-3 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to dashboard content
      </a>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-border bg-card lg:flex">
        <Link
          href="/admin"
          className="flex h-[73px] items-center gap-2.5 border-b border-border px-5 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Image
            src="/nano_logo.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 object-contain"
          />
          <span className="font-display text-lg font-semibold tracking-tight">Nano Syllabus</span>
        </Link>
        <p className="px-6 pb-3 pt-7 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
          Administration
        </p>
        {navigation()}
        <div className="mt-auto border-t border-border p-3">
          <Link
            href="/app/today"
            className="flex min-h-10 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft size={17} />
            Back to app
          </Link>
          <div className="mt-3 flex items-center gap-3 rounded-md bg-muted/60 px-3 py-3">
            <ShieldCheck size={18} className="shrink-0" />
            <div>
              <p className="text-xs font-medium">Administrator</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Restricted workspace</p>
            </div>
          </div>
        </div>
      </aside>
      <div className="min-w-0 lg:pl-60">
        <header className="border-b border-border bg-card">
          <div className="flex h-[72px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <ShieldCheck size={17} className="lg:hidden" />
              <span className="text-muted-foreground">Admin</span>
              <ChevronRight size={13} className="text-muted-foreground" />
              <span className="truncate font-medium">{view.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
                <ShieldCheck size={14} />
                Admin access
              </span>
              <Link
                href="/app/today"
                className={`${adminControl} lg:hidden`}
                aria-label="Back to app"
              >
                <ArrowLeft size={15} />
              </Link>
              <ThemeToggle className="rounded-md bg-card" />
            </div>
          </div>
          {navigation(true)}
        </header>
        <main id="admin-content" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight">{view.label}</h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
                {view.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={adminControl}
                onClick={() => void refresh()}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? "motion-safe:animate-spin" : ""} />
                Refresh
              </button>
              <button
                type="button"
                className={`${adminControl} !border-foreground !bg-foreground !text-background hover:opacity-85`}
                onClick={exportCsv}
                disabled={!data || loading}
                aria-live="polite"
              >
                {exported ? <Check size={14} /> : <Download size={14} />}
                {exported ? "Downloaded" : "Export daily CSV"}
              </button>
            </div>
          </div>
          <div className="my-5 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Database size={12} />
              {loading
                ? "Loading database snapshot…"
                : snapshot
                  ? `Updated ${snapshot} · Nepal time`
                  : "Snapshot unavailable"}
            </p>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Charts & ledger
              <select
                aria-label="Chart and ledger period"
                value={days}
                onChange={(event) => updateQuery({ days: event.target.value, page: "1" })}
                className={`${adminControl} text-foreground`}
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </label>
          </div>
          {loading ? (
            <DashboardSkeleton />
          ) : error ? (
            <section role="alert" className={`${adminPanel} p-6`}>
              <CircleAlert size={24} className="text-destructive" />
              <h2 className="mt-3 text-base font-semibold">Couldn’t load the dashboard</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{error}</p>
              <div className="mt-5 flex gap-2">
                <button type="button" className={adminControl} onClick={() => void refresh()}>
                  Try again
                </button>
                <Link href="/login?next=%2Fadmin" className={adminControl}>
                  Sign in again
                </Link>
              </div>
            </section>
          ) : (
            data && (
              <div className="space-y-5">
                {view.id === "overview" && (
                  <>
                    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <Metric
                        icon={Users}
                        label="Total users"
                        value={num(data.users.total)}
                        detail="Registered accounts · all time"
                      />
                      <Metric
                        icon={BookOpen}
                        label="Total courses"
                        value={num(data.content.courses)}
                        detail={`${num(data.content.subjects)} subjects · ${num(data.content.publishedCourses)} published courses`}
                      />
                      <Metric
                        icon={CheckCheck}
                        label="Challenges passed"
                        value={num(data.challenges.passed)}
                        detail={`${num(data.challenges.today)} today · unique completions`}
                      />
                      <Metric
                        icon={FileCheck2}
                        label="Exams completed"
                        value={num(data.exams.completed)}
                        detail={`${num(data.exams.today)} today · graded submissions`}
                      />
                    </dl>
                    <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
                      <SignupChart rows={rows} days={days} />
                      <GrowthSummary data={data} />
                    </div>
                    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
                      <LearningChart rows={rows} days={days} />
                      <div className="space-y-5">
                        <ReceiptSummary data={data} />
                        <section className={`${adminPanel} p-5`}>
                          <PanelHeading
                            title="API requests"
                            action={
                              <Link
                                href={hrefFor({ view: "requests" })}
                                scroll={false}
                                className="flex min-h-10 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                              >
                                Details
                                <ArrowUpRight size={13} />
                              </Link>
                            }
                          />
                          <dl>
                            <StatRow
                              label="Recorded requests"
                              value={num(data.requests.recorded)}
                            />
                            <StatRow label="Failed requests" value={num(data.requests.failed)} />
                          </dl>
                        </section>
                      </div>
                    </div>
                  </>
                )}
                {view.id === "growth" && (
                  <>
                    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <Metric
                        icon={Users}
                        label="Total registered users"
                        value={num(data.users.total)}
                        detail="Anonymous sessions excluded"
                      />
                      {data.users.growth.map((row) => (
                        <Metric
                          key={row.days}
                          icon={Users}
                          label={
                            row.days === 1 ? "New users today" : `New users · ${row.days} days`
                          }
                          value={num(row.current)}
                          detail={
                            <span className="flex flex-wrap items-center gap-2">
                              <GrowthChange row={row} />
                              <span>{num(row.previous)} previously</span>
                            </span>
                          }
                        />
                      ))}
                    </dl>
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
                      <SignupChart rows={rows} days={days} />
                      <ContentSummary data={data} />
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Growth counts signups, not active users. Each comparison uses the preceding
                      window of the same length. Current windows include today and are still in
                      progress.
                    </p>
                  </>
                )}
                {view.id === "learning" && <LearningDetails data={data} rows={rows} days={days} />}
                {view.id === "revenue" && (
                  <RevenueDetails
                    data={data}
                    rows={rows}
                    days={days}
                    currency={currency}
                    onCurrency={(value) => updateQuery({ currency: value })}
                  />
                )}
                {view.id === "requests" && <RequestDetails data={data} />}
                {view.id === "data" && (
                  <>
                    <DailyLedger
                      data={data}
                      rows={rows}
                      days={days}
                      page={Number(params.get("page") ?? 1)}
                      activeOnly={params.get("active") === "1"}
                      onPage={(page) => updateQuery({ page: String(page) })}
                      onActiveOnly={(active) =>
                        updateQuery({ active: active ? "1" : "0", page: "1" })
                      }
                    />
                    <Definitions />
                  </>
                )}
              </div>
            )
          )}
          <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-[11px] leading-5 text-muted-foreground">
            <p>
              Database snapshot · totals use all retained records unless labelled · refresh to
              update
            </p>
            <Link
              href={hrefFor({ view: "data", page: "1" })}
              scroll={false}
              className="inline-flex min-h-10 items-center gap-1 hover:text-foreground"
            >
              Sources & definitions
              <ArrowUpRight size={12} />
            </Link>
          </footer>
        </main>
      </div>
    </div>
  );
}
