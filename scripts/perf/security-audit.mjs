#!/usr/bin/env node
/**
 * HTTP and TLS audit for the deployed frontend.
 *
 * Three layers, cheapest first:
 *
 *   1. Local header analysis — fetches the site and grades the response
 *      headers here. No third party involved, works against localhost, and it
 *      is the one that tells you exactly what to add and where.
 *   2. securityheaders.com  (--securityheaders) — an independent grade for the
 *      same headers.
 *   3. SSL Labs             (--ssllabs) — the TLS configuration itself:
 *      protocols, ciphers, certificate chain. Takes a few minutes on a cold
 *      cache.
 *
 * The last two send the hostname to a third-party service, so they only run
 * when asked for explicitly. SSL Labs is queried with `publish=off` so the
 * result is not added to its public listings.
 *
 * Usage:
 *   node scripts/perf/security-audit.mjs --url=https://example.com
 *   node scripts/perf/security-audit.mjs --url=https://example.com --all
 */
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "perf-results");

function parseArgs(argv) {
  const args = {};
  for (const entry of argv.slice(2)) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(entry);
    if (match) args[match[1]] = match[2] ?? "true";
  }
  return args;
}

const PASS = "PASS";
const WARN = "WARN";
const FAIL = "FAIL";

/**
 * Each check reports a verdict plus the reason, so the output says what to do
 * rather than only what is missing.
 */
const CHECKS = [
  {
    name: "Strict-Transport-Security",
    short: "HSTS",
    evaluate(value) {
      if (!value) return [FAIL, "absent — a first visit over http can be intercepted"];
      const maxAge = Number(/max-age=(\d+)/i.exec(value)?.[1] ?? 0);
      if (maxAge < 15552000)
        return [WARN, `max-age=${maxAge} is under the 180-day minimum browsers expect`];
      if (!/includeSubDomains/i.test(value)) return [WARN, "no includeSubDomains"];
      return [PASS, value];
    },
  },
  {
    name: "Content-Security-Policy",
    short: "CSP",
    evaluate(value, headers) {
      const reportOnly = headers.get("content-security-policy-report-only");
      if (!value && reportOnly) return [WARN, "report-only — collecting violations, not enforcing"];
      if (!value) return [FAIL, "absent — nothing constrains where scripts may load from"];
      if (/unsafe-inline/.test(value) && !/'nonce-|'sha\d{3}-/.test(value))
        return [WARN, "allows unsafe-inline without a nonce or hash"];
      return [PASS, value.length > 90 ? `${value.slice(0, 90)}…` : value];
    },
  },
  {
    name: "X-Content-Type-Options",
    short: "nosniff",
    evaluate(value) {
      if (!value) return [FAIL, "absent — browsers may MIME-sniff a response into script"];
      return /nosniff/i.test(value) ? [PASS, value] : [FAIL, `unexpected value: ${value}`];
    },
  },
  {
    name: "X-Frame-Options",
    short: "framing",
    evaluate(value, headers) {
      const csp = headers.get("content-security-policy") ?? "";
      if (/frame-ancestors/i.test(csp)) return [PASS, "covered by CSP frame-ancestors"];
      if (!value) return [FAIL, "absent — the app can be framed for clickjacking"];
      return /DENY|SAMEORIGIN/i.test(value) ? [PASS, value] : [WARN, value];
    },
  },
  {
    name: "Referrer-Policy",
    short: "referrer",
    evaluate(value) {
      if (!value) return [FAIL, "absent — full URLs leak to third parties"];
      return /no-referrer|strict-origin/i.test(value) ? [PASS, value] : [WARN, value];
    },
  },
  {
    name: "Permissions-Policy",
    short: "permissions",
    evaluate(value) {
      if (!value) return [WARN, "absent — camera, mic and geolocation are left at defaults"];
      return [PASS, value.length > 90 ? `${value.slice(0, 90)}…` : value];
    },
  },
  {
    name: "Cross-Origin-Opener-Policy",
    short: "COOP",
    evaluate(value) {
      if (!value) return [WARN, "absent — a popup opener can keep a handle on this window"];
      return [PASS, value];
    },
  },
  {
    name: "X-Powered-By",
    short: "disclosure",
    evaluate(value) {
      return value ? [WARN, `discloses the stack: ${value}`] : [PASS, "not disclosed"];
    },
  },
];

async function auditHeaders(url) {
  const response = await fetch(url, { redirect: "follow" });
  const headers = response.headers;

  const results = CHECKS.map((check) => {
    const [verdict, detail] = check.evaluate(headers.get(check.name.toLowerCase()), headers);
    return { name: check.name, short: check.short, verdict, detail };
  });

  return { url: response.url, status: response.status, results };
}

/**
 * The six headers securityheaders.com grades on. Their scale drops roughly one
 * step per missing header, so scoring locally gives the same answer without
 * depending on anyone else being reachable — and it works against localhost and
 * in CI, which the hosted scanner cannot do.
 */
const GRADED_HEADERS = [
  "Content-Security-Policy",
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
];

const GRADE_SCALE = ["A+", "A", "B", "C", "D", "E", "F"];

function localGrade(results) {
  const missing = GRADED_HEADERS.filter((name) => {
    const result = results.find((entry) => entry.name === name);
    return !result || result.verdict === FAIL;
  });
  // Information disclosure is not a missing header, but it does cost the "+".
  const discloses = results.some((r) => r.name === "X-Powered-By" && r.verdict === WARN);
  let index = Math.min(missing.length, GRADE_SCALE.length - 1);
  if (index === 0 && discloses) index = 1;
  return { grade: GRADE_SCALE[index], missing };
}

/**
 * securityheaders.com sits behind bot protection and answers a plain fetch with
 * HTTP 403, so the check drives a real browser instead — the same way a person
 * would use it. One page load, no retries.
 */
async function auditSecurityHeadersDotCom(url) {
  const endpoint = `https://securityheaders.com/?q=${encodeURIComponent(url)}&followRedirects=on&hide=on`;
  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    const response = await page.goto(endpoint, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const headerGrade = response?.headers()["x-grade"];
    const grade =
      headerGrade ??
      (await page
        .$eval('[class*="score_"]', (node) => node.textContent?.trim() ?? "")
        .catch(() => ""));
    return { grade: grade || "unavailable", reportUrl: endpoint };
  } finally {
    await browser.close();
  }
}

/**
 * SSL Labs runs the scan asynchronously: the first call starts it and every
 * later call reports progress until the status reaches READY.
 */
async function auditSslLabs(host, { onProgress }) {
  const base = "https://api.ssllabs.com/api/v3/analyze";
  const query = new URLSearchParams({
    host,
    publish: "off",
    fromCache: "on",
    maxAge: "24",
    all: "done",
  });

  const deadline = Date.now() + 10 * 60_000;
  let started = false;

  while (Date.now() < deadline) {
    if (started) query.delete("startNew");
    const response = await fetch(`${base}?${query}`);
    if (!response.ok) {
      return { error: `SSL Labs returned HTTP ${response.status}. The v3 API may be retired for this host.` };
    }
    const payload = await response.json();
    started = true;

    if (payload.status === "READY") return payload;
    if (payload.status === "ERROR") return { error: payload.statusMessage ?? "scan failed" };

    onProgress(payload.status, payload.endpoints?.[0]?.statusDetailsMessage ?? "");
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  return { error: "timed out after 10 minutes" };
}

const ICON = { [PASS]: "✓", [WARN]: "!", [FAIL]: "✗" };

async function main() {
  const args = parseArgs(process.argv);
  const url = args.url || process.env.PERF_PUBLIC_URL;
  if (!url) throw new Error("pass --url=https://your-domain");

  const runSecurityHeaders = args.securityheaders === "true" || args.all === "true";
  const runSslLabs = args.ssllabs === "true" || args.all === "true";
  const report = { url, checkedAt: new Date().toISOString() };

  console.log(`\nHTTP response headers — ${url}\n`);
  const headerAudit = await auditHeaders(url);
  report.headers = headerAudit;

  const width = Math.max(...CHECKS.map((c) => c.name.length));
  for (const result of headerAudit.results) {
    console.log(`  ${ICON[result.verdict]} ${result.name.padEnd(width)}  ${result.detail}`);
  }
  const failed = headerAudit.results.filter((r) => r.verdict === FAIL).length;
  const warned = headerAudit.results.filter((r) => r.verdict === WARN).length;
  console.log(`\n  ${headerAudit.results.length - failed - warned} pass · ${warned} warn · ${failed} fail`);

  const local = localGrade(headerAudit.results);
  report.grade = local;
  console.log(`  grade ${local.grade}${local.missing.length ? ` — missing ${local.missing.join(", ")}` : ""}`);

  if (runSecurityHeaders) {
    console.log("\nsecurityheaders.com");
    try {
      const grade = await auditSecurityHeadersDotCom(url);
      report.securityHeaders = grade;
      console.log(`  grade ${grade.grade}\n  ${grade.reportUrl}`);
    } catch (error) {
      console.log(`  unavailable: ${error.message}`);
    }
  }

  if (runSslLabs) {
    const host = new URL(url).hostname;
    console.log(`\nSSL Labs — ${host} (publish=off; this takes a few minutes)`);
    try {
      const result = await auditSslLabs(host, {
        onProgress: (status, detail) => console.log(`  ${status.toLowerCase()}${detail ? ` — ${detail}` : ""}`),
      });
      report.sslLabs = result;
      if (result.error) {
        console.log(`  unavailable: ${result.error}`);
      } else {
        for (const endpoint of result.endpoints ?? []) {
          console.log(`  ${endpoint.ipAddress.padEnd(30)} grade ${endpoint.grade}`);
        }
        console.log(`  https://www.ssllabs.com/ssltest/analyze.html?d=${encodeURIComponent(host)}`);
      }
    } catch (error) {
      console.log(`  unavailable: ${error.message}`);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, "security-audit.json");
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${path.relative(process.cwd(), outFile)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
