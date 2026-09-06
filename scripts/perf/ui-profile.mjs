#!/usr/bin/env node
/**
 * UI-only performance profile — no login required, server latency ignored.
 *
 * The Lighthouse harness (`audit.mjs`) measures the whole trip, which is
 * dominated by network and server work. This one deliberately looks at only the
 * part the browser does: parsing and executing JS, hydrating React, building
 * the DOM, and staying responsive while you scroll.
 *
 * It needs no credentials — it relies on DEV_AUTH_BYPASS to render the gated
 * screens — and it throttles the CPU so main-thread cost is visible on a
 * developer machine the way it would be on a mid-range phone.
 *
 * Usage:
 *   DEV_AUTH_BYPASS=1 npm run dev            # in one terminal
 *   node scripts/perf/ui-profile.mjs --label=before
 *   node scripts/perf/ui-profile.mjs --label=after --base=http://localhost:3000
 *   node scripts/perf/ui-profile.mjs --compare=before,after
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { selectRoutes } from "./routes.mjs";
import { loadEnvFiles, signIn } from "./session.mjs";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "perf-results");

function parseArgs(argv) {
  const args = {};
  for (const entry of argv.slice(2)) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(entry);
    if (match) args[match[1]] = match[2] ?? "true";
  }
  return args;
}

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const round = (value, digits = 0) =>
  value === null || value === undefined || Number.isNaN(value)
    ? null
    : Number(value.toFixed(digits));

/**
 * Main-thread work attributable to the UI, straight from the renderer's own
 * counters. `ScriptDuration` is JS execution (bundle parse/eval plus React
 * hydration), the other two are the browser rebuilding style and layout.
 */
async function readRendererMetrics(client) {
  const { metrics } = await client.send("Performance.getMetrics");
  const value = (name) => metrics.find((metric) => metric.name === name)?.value ?? 0;
  return {
    scriptMs: value("ScriptDuration") * 1000,
    layoutMs: value("LayoutDuration") * 1000,
    recalcStyleMs: value("RecalcStyleDuration") * 1000,
    taskMs: value("TaskDuration") * 1000,
    domNodes: value("Nodes"),
    jsHeapMb: value("JSHeapUsedSize") / 1024 / 1024,
    layoutCount: value("LayoutCount"),
    recalcStyleCount: value("RecalcStyleCount"),
  };
}

/**
 * Installs the long-task recorder before any of the page's own code runs.
 *
 * The expensive part of a Next screen is hydration, and it is over long before
 * the page settles. An observer created after load misses it — `buffered: true`
 * only replays what fits in the entry buffer — so the recorder has to be in
 * place from the first script on the page.
 */
async function installRecorder(page) {
  await page.evaluateOnNewDocument(() => {
    const store = { tasks: [], lcp: null };
    window.__uiProfile = store;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          store.tasks.push({ start: entry.startTime, duration: entry.duration });
        }
      }).observe({ type: "longtask", buffered: true });
    } catch {
      /* unsupported — the run reports zeros rather than failing */
    }
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        store.lcp = entries[entries.length - 1]?.startTime ?? store.lcp;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      /* same */
    }
  });
}

/** Total time the main thread was blocked past the 50ms responsiveness budget. */
async function collectLongTasks(page) {
  return page.evaluate(() => {
    const tasks = window.__uiProfile?.tasks ?? [];
    const durations = tasks.map((task) => task.duration);
    const nav = performance.getEntriesByType("navigation")[0];
    const htmlDone = nav ? nav.responseEnd : 0;
    // Tasks that land after the HTML is in are the browser's own work:
    // bundle evaluation, hydration, mount effects.
    const afterHtml = tasks.filter((task) => task.start >= htmlDone);
    return {
      longTaskCount: durations.length,
      longTaskMs: durations.reduce((total, value) => total + value, 0),
      blockingMs: durations.reduce((total, value) => total + Math.max(0, value - 50), 0),
      longestTaskMs: durations.length ? Math.max(...durations) : 0,
      hydrationBlockingMs: afterHtml.reduce(
        (total, task) => total + Math.max(0, task.duration - 50),
        0,
      ),
      lcpMs: window.__uiProfile?.lcp ?? null,
    };
  });
}

/**
 * Scroll the screen's real scroll container and watch frame pacing. A frame
 * budget is 16.7ms; anything well past that is jank the student can feel.
 */
async function measureScrollSmoothness(page) {
  return page.evaluate(async () => {
    const candidates = [...document.querySelectorAll("*")].filter((element) => {
      const style = getComputedStyle(element);
      return (
        /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 200
      );
    });
    const target = candidates[0] ?? document.scrollingElement ?? document.documentElement;
    if (!target) return null;

    const frames = [];
    let last = performance.now();
    let running = true;
    const tick = () => {
      if (!running) return;
      const now = performance.now();
      frames.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    for (let step = 0; step < 40; step += 1) {
      target.scrollTop += 60;
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    running = false;
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (frames.length < 5) return null;
    const sorted = [...frames].sort((a, b) => a - b);
    return {
      scrolledPx: target.scrollTop,
      frames: frames.length,
      medianFrameMs: sorted[Math.floor(sorted.length / 2)],
      p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
      worstFrameMs: sorted[sorted.length - 1],
      droppedFrames: frames.filter((frame) => frame > 33).length,
    };
  });
}

async function profileRoute(browser, url, cpuThrottle) {
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 823, deviceScaleFactor: 2 });
  await installRecorder(page);
  const client = await page.createCDPSession();
  await client.send("Performance.enable");
  await client.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
  await client.send("Network.clearBrowserCache");

  const started = Date.now();
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });

  // Let hydration and any mount-time effects finish before reading counters.
  await page.waitForNetworkIdle({ idleTime: 700, timeout: 30_000 }).catch(() => null);
  await new Promise((resolve) => setTimeout(resolve, 400));

  const longTasks = await collectLongTasks(page);
  const metrics = await readRendererMetrics(client);

  const domShape = await page.evaluate(() => {
    const all = document.getElementsByTagName("*");
    let deepest = 0;
    for (const element of all) {
      let depth = 0;
      let node = element;
      while (node.parentElement) {
        depth += 1;
        node = node.parentElement;
      }
      if (depth > deepest) deepest = depth;
    }
    const nav = performance.getEntriesByType("navigation")[0];
    const paints = Object.fromEntries(
      performance.getEntriesByType("paint").map((paint) => [paint.name, paint.startTime]),
    );
    return {
      elements: all.length,
      maxDepth: deepest,
      // Everything after the HTML arrived is the browser's own work.
      clientWorkMs: nav ? nav.domComplete - nav.responseEnd : null,
      hydrationStartMs: nav ? nav.domInteractive - nav.responseEnd : null,
      fcpAfterHtmlMs: nav && paints["first-contentful-paint"]
        ? paints["first-contentful-paint"] - nav.responseEnd
        : null,
      scripts: performance.getEntriesByType("resource").filter((r) => r.initiatorType === "script").length,
      scriptBytes: performance
        .getEntriesByType("resource")
        .filter((r) => r.initiatorType === "script")
        .reduce((total, r) => total + (r.decodedBodySize || 0), 0),
    };
  });

  const scroll = await measureScrollSmoothness(page);
  await page.close();

  return {
    status: response?.status() ?? 0,
    wallMs: Date.now() - started,
    ...domShape,
    ...longTasks,
    scriptMs: round(metrics.scriptMs),
    layoutMs: round(metrics.layoutMs),
    recalcStyleMs: round(metrics.recalcStyleMs),
    domNodes: round(metrics.domNodes),
    jsHeapMb: round(metrics.jsHeapMb, 1),
    layoutCount: round(metrics.layoutCount),
    scroll,
  };
}

function printComparison(beforeLabel, afterLabel) {
  const load = (label) => {
    const file = path.join(OUT_DIR, `ui-${label}.json`);
    if (!fs.existsSync(file)) throw new Error(`missing ${path.relative(ROOT, file)}`);
    return JSON.parse(fs.readFileSync(file, "utf8"));
  };
  const before = load(beforeLabel);
  const after = load(afterLabel);

  const METRICS = [
    ["scriptMs", "JS execution", "ms"],
    ["blockingMs", "Blocking", "ms"],
    ["hydrationBlockingMs", "Hydration blocking", "ms"],
    ["lcpMs", "LCP", "ms"],
    ["longestTaskMs", "Longest task", "ms"],
    ["clientWorkMs", "Client work", "ms"],
    ["recalcStyleMs", "Style recalc", "ms"],
    ["layoutMs", "Layout", "ms"],
    ["elements", "DOM elements", ""],
    ["scriptBytes", "JS bytes", "B"],
    ["jsHeapMb", "JS heap", "MB"],
  ];

  const rows = [];
  for (const [name, afterRoute] of Object.entries(after.routes)) {
    const beforeRoute = before.routes[name];
    if (!beforeRoute || beforeRoute.error || afterRoute.error) continue;
    for (const [key, title, unit] of METRICS) {
      const from = beforeRoute[key];
      const to = afterRoute[key];
      if (from == null || to == null) continue;
      const percent = from === 0 ? 0 : Math.round(((to - from) / from) * 100);
      const arrow = to === from ? "  " : to < from ? "▼" : "▲";
      rows.push([name, title, `${from}${unit}`, `${to}${unit}`, `${arrow} ${percent > 0 ? "+" : ""}${percent}%`]);
    }
  }

  const header = ["route", "metric", beforeLabel, afterLabel, "change"];
  const widths = header.map((column, index) =>
    Math.max(column.length, ...rows.map((row) => String(row[index]).length)),
  );
  const line = (values) => values.map((value, i) => String(value).padEnd(widths[i])).join("  ");
  console.log(line(header));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  let current = null;
  for (const row of rows) {
    if (current && current !== row[0]) console.log("");
    current = row[0];
    console.log(line(row));
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.compare) {
    const [before, after] = args.compare.split(",");
    printComparison(before, after);
    return;
  }

  const label = args.label || "ui";
  const baseUrl = (args.base || "http://localhost:3001").replace(/\/$/, "");
  const cpuThrottle = Number(args.cpu || 4);
  const repeats = Number(args.runs || 3);
  const routes = selectRoutes(args.only);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  /**
   * Against `next dev` with DEV_AUTH_BYPASS on there is nothing to sign into.
   * Against a production build the bypass is compiled out, so fall back to the
   * real test account if one is configured. Cookies are shared across pages in
   * the same browser, so signing in once covers every route below.
   */
  loadEnvFiles(ROOT);
  if (process.env.PERF_TEST_EMAIL && process.env.PERF_TEST_PASSWORD && routes.some((r) => r.auth)) {
    const page = await browser.newPage();
    const landed = await signIn(page, baseUrl, process.env.PERF_TEST_EMAIL, process.env.PERF_TEST_PASSWORD);
    console.log(`signed in (${landed})`);
    await page.close();
  }

  const results = {
    label,
    baseUrl,
    cpuThrottle,
    repeats,
    startedAt: new Date().toISOString(),
    routes: {},
  };

  try {
    for (const route of routes) {
      const url = `${baseUrl}${route.path}`;
      process.stdout.write(`${route.name.padEnd(13)} `);
      const samples = [];
      let failure = null;
      for (let index = 0; index < repeats; index += 1) {
        try {
          samples.push(await profileRoute(browser, url, cpuThrottle));
        } catch (error) {
          failure = error.message.split("\n")[0];
        }
      }
      if (!samples.length) {
        console.log(`FAILED — ${failure}`);
        results.routes[route.name] = { path: route.path, error: failure };
        continue;
      }

      const pick = (key) => round(median(samples.map((s) => s[key]).filter((v) => v != null)), 1);
      const entry = {
        path: route.path,
        status: samples[0].status,
        scriptMs: pick("scriptMs"),
        blockingMs: pick("blockingMs"),
        longestTaskMs: pick("longestTaskMs"),
        longTaskCount: pick("longTaskCount"),
        hydrationBlockingMs: pick("hydrationBlockingMs"),
        lcpMs: pick("lcpMs"),
        clientWorkMs: pick("clientWorkMs"),
        recalcStyleMs: pick("recalcStyleMs"),
        layoutMs: pick("layoutMs"),
        layoutCount: pick("layoutCount"),
        elements: pick("elements"),
        maxDepth: pick("maxDepth"),
        scripts: pick("scripts"),
        scriptBytes: pick("scriptBytes"),
        jsHeapMb: pick("jsHeapMb"),
        scrollP95FrameMs: round(median(samples.map((s) => s.scroll?.p95FrameMs).filter((v) => v != null)), 1),
        scrollWorstFrameMs: round(median(samples.map((s) => s.scroll?.worstFrameMs).filter((v) => v != null)), 1),
        droppedFrames: pick("droppedFrames"),
      };
      results.routes[route.name] = entry;
      console.log(
        `js ${String(entry.scriptMs).padStart(6)}ms  block ${String(entry.blockingMs).padStart(6)}ms  ` +
          `dom ${String(entry.elements).padStart(5)}  jsKB ${String(Math.round(entry.scriptBytes / 1024)).padStart(4)}  ` +
          `scrollP95 ${String(entry.scrollP95FrameMs).padStart(5)}ms`,
      );
    }
  } finally {
    await browser.close();
  }

  results.finishedAt = new Date().toISOString();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `ui-${label}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\nwrote ${path.relative(ROOT, outFile)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
