#!/usr/bin/env node
/**
 * Authenticated performance harness.
 *
 * Runs three measurements per screen against a running server:
 *
 *   1. `nav`  — real cold-cache navigation timings (TTFB, DCL, load, bytes).
 *               This is the number that moves when server work gets cheaper.
 *   2. `rsc`  — the React Server Component fetch a client-side navigation
 *               actually makes. Clicking a sidebar link costs exactly this,
 *               so it is the truest measure of "how fast does the UI feel".
 *   3. `lh`   — a full Lighthouse run for FCP/LCP/TBT/CLS/SI and the score.
 *
 * Every /app route is behind the middleware auth gate, so the harness signs in
 * once through the real login form and reuses that browser session. Lighthouse
 * runs with `disableStorageReset` (its default storage wipe would delete the
 * session cookie and silently measure the login page instead); the HTTP cache
 * is cleared explicitly per run so the numbers stay cold-cache honest.
 *
 * Usage:
 *   node scripts/perf/audit.mjs --label=baseline
 *   node scripts/perf/audit.mjs --label=after --only=today,chat --runs=7
 */
import fs from "node:fs";
import path from "node:path";
import lighthouse from "lighthouse";
import puppeteer from "puppeteer";
import { selectRoutes } from "./routes.mjs";

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

/** Minimal .env reader — the harness runs outside Next, so nothing loads these for us. */
function loadEnvFiles() {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split("\n")) {
      const match = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/.exec(line);
      if (!match) continue;
      const key = match[1];
      if (process.env[key] !== undefined) continue;
      let value = (match[2] ?? "").trim();
      if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
      process.env[key] = value;
    }
  }
}

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const round = (value) => (value === null || value === undefined ? null : Math.round(value));

async function login(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle0", timeout: 60_000 });
  await page.waitForSelector('input[type="email"]', { timeout: 30_000 });
  await page.type('input[type="email"]', email, { delay: 8 });
  await page.type('input[type="password"]', password, { delay: 8 });
  await Promise.all([
    page.click('button[type="submit"]'),
    page
      .waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 60_000 })
      .catch(() => null),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (new URL(page.url()).pathname.startsWith("/login")) {
    const message = await page
      .$eval("form", (form) => form.innerText)
      .catch(() => "");
    throw new Error(`Login failed — still on /login. Form said: ${message.slice(0, 300)}`);
  }
  return page.url();
}

/** Cold-cache navigation timings, repeated so a single slow outlier cannot set the number. */
async function measureNavigation(page, url, runs) {
  const samples = [];
  for (let index = 0; index < runs; index += 1) {
    const client = await page.createCDPSession();
    await client.send("Network.clearBrowserCache");
    await client.detach();

    await page.goto("about:blank");
    const response = await page.goto(url, { waitUntil: "load", timeout: 90_000 });
    const finalUrl = page.url();

    const timing = await page.evaluate(() => {
      const entry = performance.getEntriesByType("navigation")[0];
      if (!entry) return null;
      const paints = Object.fromEntries(
        performance.getEntriesByType("paint").map((paint) => [paint.name, paint.startTime]),
      );
      const resources = performance.getEntriesByType("resource");
      return {
        ttfb: entry.responseStart - entry.requestStart,
        serverThink: entry.responseStart - entry.requestStart,
        download: entry.responseEnd - entry.responseStart,
        domContentLoaded: entry.domContentLoadedEventEnd - entry.startTime,
        load: entry.loadEventEnd - entry.startTime,
        firstPaint: paints["first-paint"] ?? null,
        firstContentfulPaint: paints["first-contentful-paint"] ?? null,
        documentBytes: entry.transferSize ?? 0,
        resourceCount: resources.length,
        resourceBytes: resources.reduce((total, item) => total + (item.transferSize || 0), 0),
      };
    });

    if (timing) samples.push({ ...timing, status: response?.status() ?? 0, finalUrl });
  }

  if (!samples.length) return null;
  const pick = (key) => round(median(samples.map((sample) => sample[key]).filter((value) => value != null)));
  return {
    ttfb: pick("ttfb"),
    download: pick("download"),
    domContentLoaded: pick("domContentLoaded"),
    load: pick("load"),
    firstContentfulPaint: pick("firstContentfulPaint"),
    documentBytes: pick("documentBytes"),
    resourceCount: pick("resourceCount"),
    resourceBytes: pick("resourceBytes"),
    status: samples[0].status,
    finalUrl: samples[0].finalUrl,
    redirected: new URL(samples[0].finalUrl).pathname !== new URL(samples[0].finalUrl).pathname,
  };
}

/**
 * Times the RSC payload fetch — what a client-side navigation between screens
 * actually waits on. Measured from an already-loaded page so it isolates
 * server render time from browser startup.
 */
async function measureRscFetch(page, url, runs, anchorUrl) {
  // Run from a page that is known to be settled. Measuring from the page we
  // just navigated to is fragile: a route that redirects on arrival destroys
  // the execution context underneath the evaluate. Fetching from an anchor is
  // also the more faithful simulation — a real route change starts from
  // whatever screen the student was already on.
  if (anchorUrl && page.url() !== anchorUrl) {
    await page.goto(anchorUrl, { waitUntil: "load", timeout: 60_000 });
  }

  const result = await page.evaluate(
    async (target, iterations) => {
      const timings = [];
      let bytes = 0;
      let status = 0;
      for (let index = 0; index < iterations; index += 1) {
        const started = performance.now();
        const response = await fetch(`${target}${target.includes("?") ? "&" : "?"}_rsc=perf${index}`, {
          headers: { RSC: "1", "Next-Router-Prefetch": "0" },
          credentials: "include",
        });
        const body = await response.text();
        timings.push(performance.now() - started);
        bytes = body.length;
        status = response.status;
      }
      return { timings, bytes, status };
    },
    url,
    runs,
  );

  return {
    fetchMs: round(median(result.timings)),
    fastestMs: round(Math.min(...result.timings)),
    slowestMs: round(Math.max(...result.timings)),
    payloadBytes: result.bytes,
    status: result.status,
  };
}

async function runLighthouse(page, url, mode) {
  const client = await page.createCDPSession();
  await client.send("Network.clearBrowserCache");
  await client.detach();

  const desktop = mode === "desktop";
  const flags = {
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance"],
    // Lighthouse's storage reset deletes the Supabase session cookie, which
    // would bounce every gated route to /login mid-audit.
    disableStorageReset: true,
    formFactor: desktop ? "desktop" : "mobile",
    screenEmulation: desktop
      ? { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false }
      : { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
    throttling: desktop
      ? { rttMs: 40, throughputKbps: 10 * 1024, cpuSlowdownMultiplier: 1 }
      : { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 },
    throttlingMethod: "simulate",
  };

  const runnerResult = await lighthouse(url, flags, undefined, page);
  if (!runnerResult) return null;
  const { lhr } = runnerResult;
  const audit = (id) => lhr.audits[id]?.numericValue ?? null;

  return {
    score: lhr.categories.performance?.score == null ? null : Math.round(lhr.categories.performance.score * 100),
    fcp: round(audit("first-contentful-paint")),
    lcp: round(audit("largest-contentful-paint")),
    tbt: round(audit("total-blocking-time")),
    cls: lhr.audits["cumulative-layout-shift"]?.numericValue ?? null,
    speedIndex: round(audit("speed-index")),
    tti: round(audit("interactive")),
    serverResponseTime: round(audit("server-response-time")),
    mainThreadWork: round(audit("mainthread-work-breakdown")),
    bootupTime: round(audit("bootup-time")),
    totalByteWeight: round(audit("total-byte-weight")),
    unusedJavascriptBytes: round(lhr.audits["unused-javascript"]?.details?.overallSavingsBytes ?? null),
    finalUrl: lhr.finalDisplayedUrl,
  };
}

async function main() {
  loadEnvFiles();
  const args = parseArgs(process.argv);
  const label = args.label || "run";
  const baseUrl = (args.base || process.env.PERF_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const mode = args.mode === "desktop" ? "desktop" : "mobile";
  const runs = Number(args.runs || 5);
  const skipLighthouse = args.lighthouse === "false";
  const routes = selectRoutes(args.only);

  const email = process.env.PERF_TEST_EMAIL;
  const password = process.env.PERF_TEST_PASSWORD;
  const needsAuth = routes.some((route) => route.auth);
  if (needsAuth && (!email || !password)) {
    throw new Error(
      "Gated routes were requested but PERF_TEST_EMAIL / PERF_TEST_PASSWORD are not set in .env.local",
    );
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const page = await browser.newPage();

  const results = { label, mode, baseUrl, runs, startedAt: new Date().toISOString(), routes: {} };
  let anchorUrl = `${baseUrl}/login`;

  try {
    if (needsAuth) {
      process.stdout.write("signing in ... ");
      const landed = await login(page, baseUrl, email, password);
      anchorUrl = landed;
      process.stdout.write(`ok (${landed})\n`);
    }

    for (const route of routes) {
      const url = `${baseUrl}${route.path}`;
      process.stdout.write(`${route.name.padEnd(14)} `);

      const nav = await measureNavigation(page, url, runs);
      const landedPath = nav ? new URL(nav.finalUrl).pathname : route.path;
      const bounced = route.auth && landedPath.startsWith("/login");
      if (bounced) {
        console.log("SKIPPED — session bounced to /login");
        results.routes[route.name] = { path: route.path, error: "auth-bounce" };
        continue;
      }

      let rsc = null;
      let lh = null;
      try {
        rsc = await measureRscFetch(page, url, runs, anchorUrl);
        lh = skipLighthouse ? null : await runLighthouse(page, url, mode);
      } catch (error) {
        console.log(`partial — ${error.message.split("\n")[0]}`);
        results.routes[route.name] = { path: route.path, nav, rsc, lighthouse: lh };
        continue;
      }

      results.routes[route.name] = { path: route.path, nav, rsc, lighthouse: lh };
      console.log(
        `ttfb ${String(nav?.ttfb ?? "?").padStart(5)}ms  rsc ${String(rsc?.fetchMs ?? "?").padStart(5)}ms  ` +
          (lh ? `lcp ${String(lh.lcp).padStart(5)}ms  tbt ${String(lh.tbt).padStart(4)}ms  score ${lh.score}` : ""),
      );
    }
  } finally {
    await browser.close();
  }

  results.finishedAt = new Date().toISOString();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${label}-${mode}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\nwrote ${path.relative(ROOT, outFile)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
