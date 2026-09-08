"use client";

/**
 * Dev-only performance HUD.
 *
 * A small always-on readout in the corner of every screen while `next dev` is
 * running. It exists because this app's slow part is invisible in a flame
 * chart: almost none of the cost is rendering, it is server round trips — the
 * auth check, the RSC payload for the next route, and the /api calls each
 * screen fires on mount. The HUD puts those next to the Core Web Vitals so a
 * regression shows up while you are clicking around, not a week later.
 *
 * It never ships. `app/layout.tsx` only renders it when NODE_ENV is
 * development (or NEXT_PUBLIC_PERF_HUD=1 is set for a deliberate check against
 * a production build), so the whole module drops out of the production bundle.
 *
 * Shortcuts: ctrl+alt+P toggles between the collapsed pill and the full panel,
 * ctrl+alt+H hides it for the session.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";

type Rating = "good" | "ok" | "poor" | "none";

type Vitals = {
  TTFB?: number;
  FCP?: number;
  LCP?: number;
  CLS?: number;
  INP?: number;
};

type ServerCall = {
  id: number;
  label: string;
  kind: "rsc" | "api" | "other";
  ms: number;
  status: number;
  bytes: number;
  at: number;
};

/** Core Web Vitals thresholds, plus locally chosen budgets for the round trips. */
const THRESHOLDS: Record<string, [number, number]> = {
  TTFB: [800, 1800],
  FCP: [1800, 3000],
  LCP: [2500, 4000],
  CLS: [0.1, 0.25],
  INP: [200, 500],
  route: [300, 800],
  api: [300, 800],
  hydrate: [500, 1200],
};

function rate(metric: string, value: number | undefined): Rating {
  if (value === undefined || Number.isNaN(value)) return "none";
  const bounds = THRESHOLDS[metric];
  if (!bounds) return "none";
  if (value <= bounds[0]) return "good";
  if (value <= bounds[1]) return "ok";
  return "poor";
}

const COLORS: Record<Rating, string> = {
  good: "#34d399",
  ok: "#fbbf24",
  poor: "#f87171",
  none: "#64748b",
};

function formatMs(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) return "–";
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
}

function formatBytes(value: number) {
  if (!value) return "–";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)}MB`;
  if (value >= 1024) return `${Math.round(value / 1024)}kB`;
  return `${value}B`;
}

/**
 * Wraps window.fetch once per page load to time every request the app makes.
 * RSC payloads (`?_rsc=`) are what a client-side route change waits on, and
 * /api calls are where the per-request auth cost shows up, so they are counted
 * separately from everything else.
 */
function useServerCalls(enabled: boolean) {
  const [calls, setCalls] = useState<ServerCall[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const original = window.fetch;
    if ((original as { __perfHud?: boolean }).__perfHud) return;

    const patched: typeof window.fetch = async (input, init) => {
      const started = performance.now();
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const response = await original(input, init);
      const ms = performance.now() - started;

      let path = url;
      try {
        path = new URL(url, window.location.href).pathname;
      } catch {
        /* keep the raw string for non-URL inputs */
      }

      const isRsc = url.includes("_rsc=") || init?.headers?.toString().includes("RSC");
      const kind: ServerCall["kind"] = isRsc ? "rsc" : path.startsWith("/api/") ? "api" : "other";

      // Reading the body here would consume it for the caller, so size comes
      // from the header when the server sends one.
      const bytes = Number(response.headers.get("content-length") || 0);

      counter.current += 1;
      const entry: ServerCall = {
        id: counter.current,
        label: path,
        kind,
        ms,
        status: response.status,
        bytes,
        at: Date.now(),
      };
      setCalls((previous) => [entry, ...previous].slice(0, 40));
      return response;
    };

    (patched as { __perfHud?: boolean }).__perfHud = true;
    window.fetch = patched;
    return () => {
      window.fetch = original;
    };
  }, [enabled]);

  return calls;
}
/**
 * `useReportWebVitals` only emits LCP and CLS when the page is hidden, which is
 * useless for a HUD you are watching while you work. These observers stream the
 * running values instead, so the panel is populated the moment a screen
 * settles; the web-vitals callback still overwrites them with the final figures
 * on page hide.
 */
function useLiveVitals(onChange: (patch: Vitals) => void) {
  const handler = useRef(onChange);
  handler.current = onChange;

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const observers: PerformanceObserver[] = [];

    try {
      const lcp = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const latest = entries[entries.length - 1];
        if (latest) handler.current({ LCP: latest.startTime });
      });
      lcp.observe({ type: "largest-contentful-paint", buffered: true });
      observers.push(lcp);
    } catch {
      /* unsupported browser - the panel just shows a dash */
    }

    try {
      let total = 0;
      const cls = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        })[]) {
          // Shifts right after a real interaction are the user's own doing.
          if (entry.hadRecentInput) continue;
          total += entry.value;
        }
        handler.current({ CLS: total });
      });
      cls.observe({ type: "layout-shift", buffered: true });
      observers.push(cls);
    } catch {
      /* same */
    }

    return () => observers.forEach((observer) => observer.disconnect());
  }, []);
}

/**
 * Times client-side route changes: from the click that starts one until the
 * frame after the pathname actually changes. That span is what a student
 * experiences as "the app is thinking".
 */
function useRouteChangeTiming() {
  const pathname = usePathname();
  const startedAt = useRef<number | null>(null);
  const previousPath = useRef(pathname);
  const [lastRoute, setLastRoute] = useState<{ to: string; ms: number } | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      const href = anchor?.getAttribute("href");
      if (!href || !href.startsWith("/") || anchor?.target === "_blank") return;
      if (href.split("?")[0] === window.location.pathname) return;
      startedAt.current = performance.now();
      setPending(true);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    const started = startedAt.current;
    startedAt.current = null;
    setPending(false);
    if (started == null) return;
    // One frame later the new screen has actually painted.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setLastRoute({ to: pathname, ms: performance.now() - started })),
    );
  }, [pathname]);

  return { lastRoute, pending };
}

function Metric({
  name,
  value,
  metric,
  suffix,
}: {
  name: string;
  value: number | undefined;
  metric: string;
  suffix?: string;
}) {
  const rating = rate(metric, value);
  const text =
    metric === "CLS"
      ? value === undefined
        ? "–"
        : value.toFixed(3)
      : `${formatMs(value)}${suffix ?? ""}`;
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
      <span style={{ color: "#94a3b8" }}>{name}</span>
      <span style={{ color: COLORS[rating], fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
        {text}
      </span>
    </div>
  );
}

export function DevPerfHud() {
  const [vitals, setVitals] = useState<Vitals>({});
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [hydrateMs, setHydrateMs] = useState<number | undefined>();
  const calls = useServerCalls(!hidden);
  const { lastRoute, pending } = useRouteChangeTiming();

  useLiveVitals((patch) => setVitals((previous) => ({ ...previous, ...patch })));

  /**
   * THE CALLBACK MUST BE STABLE, AND THIS IS NOT A STYLE POINT.
   *
   * `useReportWebVitals` is, in full:
   *
   *     useEffect(() => {
   *       onCLS(fn); onFID(fn); onLCP(fn); onINP(fn); onFCP(fn); onTTFB(fn);
   *     }, [reportWebVitalsFn]);
   *
   * The dependency is the callback's IDENTITY, and the effect has no cleanup —
   * because `web-vitals` offers no way to unsubscribe. So an inline arrow, new
   * on every render, re-subscribed all six metrics every time this component
   * rendered, and every one of those subscriptions permanently attached its own
   * `visibilitychange`, `pageshow`, `keydown` and `click` listeners.
   *
   * This component re-renders constantly by design: `useServerCalls` sets state
   * on every fetch, `useLiveVitals` sets state on every layout-shift entry, and
   * the callback below sets state too. That closed the loop — each render added
   * ~24 permanent listeners, which made every subsequent `addEventListener`
   * slower, which lengthened tasks, which produced more entries, which caused
   * more renders.
   *
   * Measured before this fix: 42,776 listeners on a 1,115-node page right after
   * login, climbing ~5,000 per navigation to 95,966, with single main-thread
   * tasks of 4.7s and 8.9s. The app was not slow; it was strangling itself with
   * its own instrument.
   *
   * `useCallback` with an empty dependency list is correct here: the body
   * closes over nothing but `setVitals`, and a `useState` setter is guaranteed
   * stable for the life of the component.
   */
  const reportVital = useCallback((metric: { name: string; value: number }) => {
    if (!["TTFB", "FCP", "LCP", "CLS", "INP"].includes(metric.name)) return;
    setVitals((previous) => ({ ...previous, [metric.name]: metric.value }));
  }, []);

  useReportWebVitals(reportVital);

  // Hydration is done once React has committed on the client; the first frame
  // after mount is a close enough marker and costs nothing to measure.
  useEffect(() => {
    requestAnimationFrame(() => {
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      const origin = nav ? nav.responseEnd : 0;
      setHydrateMs(performance.now() - origin);
    });
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!event.ctrlKey || !event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "p") {
        event.preventDefault();
        setExpanded((value) => !value);
      }
      if (key === "h") {
        event.preventDefault();
        setHidden((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const summary = useMemo(() => {
    const rsc = calls.filter((call) => call.kind === "rsc");
    const api = calls.filter((call) => call.kind === "api");
    const slowest = [...calls].sort((a, b) => b.ms - a.ms)[0];
    const apiMedian = api.length
      ? [...api].sort((a, b) => a.ms - b.ms)[Math.floor(api.length / 2)].ms
      : undefined;
    return { rsc, api, slowest, apiMedian };
  }, [calls]);

  if (hidden) return null;

  const worst: Rating = (["LCP", "INP", "CLS", "TTFB"] as const).reduce<Rating>((acc, key) => {
    const rating = rate(key, vitals[key]);
    const order: Rating[] = ["none", "good", "ok", "poor"];
    return order.indexOf(rating) > order.indexOf(acc) ? rating : acc;
  }, "none");

  const shell: React.CSSProperties = {
    position: "fixed",
    bottom: 12,
    right: 12,
    zIndex: 2147483647,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 11,
    lineHeight: 1.5,
    color: "#e2e8f0",
    background: "rgba(9, 13, 22, 0.92)",
    border: "1px solid rgba(148, 163, 184, 0.25)",
    borderRadius: 10,
    backdropFilter: "blur(8px)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
    userSelect: "none",
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        title="Performance HUD — ctrl+alt+P to expand, ctrl+alt+H to hide"
        style={{ ...shell, cursor: "pointer", padding: "5px 9px", display: "flex", gap: 8, alignItems: "center" }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: COLORS[worst],
            boxShadow: `0 0 6px ${COLORS[worst]}`,
          }}
        />
        <span style={{ color: COLORS[rate("LCP", vitals.LCP)], fontVariantNumeric: "tabular-nums" }}>
          LCP {formatMs(vitals.LCP)}
        </span>
        <span style={{ color: "#475569" }}>|</span>
        <span
          style={{
            color: pending ? "#fbbf24" : COLORS[rate("route", lastRoute?.ms)],
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {pending ? "nav…" : `nav ${formatMs(lastRoute?.ms)}`}
        </span>
      </button>
    );
  }

  return (
    <div style={{ ...shell, width: 268, padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ color: "#f1f5f9", letterSpacing: 0.3 }}>perf</strong>
        <span style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 0 }}
          >
            collapse
          </button>
          <button
            type="button"
            onClick={() => setHidden(true)}
            style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 0 }}
          >
            ✕
          </button>
        </span>
      </div>

      <div style={{ display: "grid", gap: 2 }}>
        <Metric name="TTFB" value={vitals.TTFB} metric="TTFB" />
        <Metric name="FCP" value={vitals.FCP} metric="FCP" />
        <Metric name="LCP" value={vitals.LCP} metric="LCP" />
        <Metric name="INP" value={vitals.INP} metric="INP" />
        <Metric name="CLS" value={vitals.CLS} metric="CLS" />
        <Metric name="hydrate" value={hydrateMs} metric="hydrate" />
      </div>

      <div style={{ height: 1, background: "rgba(148,163,184,0.18)", margin: "8px 0" }} />

      <div style={{ display: "grid", gap: 2 }}>
        <Metric
          name={pending ? "route (…)" : "route change"}
          value={lastRoute?.ms}
          metric="route"
        />
        <Metric name={`api median (${summary.api.length})`} value={summary.apiMedian} metric="api" />
      </div>

      {summary.slowest ? (
        <>
          <div style={{ height: 1, background: "rgba(148,163,184,0.18)", margin: "8px 0" }} />
          <div style={{ color: "#94a3b8", marginBottom: 4 }}>slowest requests</div>
          <div style={{ display: "grid", gap: 2 }}>
            {[...calls]
              .sort((a, b) => b.ms - a.ms)
              .slice(0, 5)
              .map((call) => (
                <div
                  key={call.id}
                  style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
                  title={`${call.label} — ${call.status} — ${formatBytes(call.bytes)}`}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: call.kind === "rsc" ? "#a5b4fc" : "#cbd5e1",
                    }}
                  >
                    {call.kind === "rsc" ? "rsc " : ""}
                    {call.label}
                  </span>
                  <span
                    style={{
                      color: COLORS[rate("api", call.ms)],
                      fontVariantNumeric: "tabular-nums",
                      flexShrink: 0,
                    }}
                  >
                    {formatMs(call.ms)}
                  </span>
                </div>
              ))}
          </div>
        </>
      ) : null}

      <div style={{ color: "#475569", marginTop: 8, fontSize: 10 }}>
        ctrl+alt+P collapse · ctrl+alt+H hide
      </div>
    </div>
  );
}

export default DevPerfHud;
