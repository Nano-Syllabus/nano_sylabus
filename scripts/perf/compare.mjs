#!/usr/bin/env node
/**
 * Diffs two audit runs and prints a before/after table.
 *
 *   node scripts/perf/compare.mjs baseline after
 *   node scripts/perf/compare.mjs baseline after --mode=desktop --markdown
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "perf-results");

const positional = process.argv.slice(2).filter((value) => !value.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((value) => value.startsWith("--")));
const modeFlag = process.argv.slice(2).find((value) => value.startsWith("--mode="));
const mode = modeFlag ? modeFlag.split("=")[1] : "mobile";
const [beforeLabel = "baseline", afterLabel = "after"] = positional;

function load(label) {
  const file = path.join(OUT_DIR, `${label}-${mode}.json`);
  if (!fs.existsSync(file)) throw new Error(`missing ${path.relative(ROOT, file)}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const before = load(beforeLabel);
const after = load(afterLabel);

// Lower is better for every metric here except the Lighthouse score.
const METRICS = [
  { key: "nav.ttfb", title: "TTFB", unit: "ms" },
  { key: "rsc.fetchMs", title: "Route fetch", unit: "ms" },
  { key: "nav.load", title: "Load", unit: "ms" },
  { key: "lighthouse.fcp", title: "FCP", unit: "ms" },
  { key: "lighthouse.lcp", title: "LCP", unit: "ms" },
  { key: "lighthouse.tbt", title: "TBT", unit: "ms" },
  { key: "lighthouse.speedIndex", title: "Speed Index", unit: "ms" },
  { key: "lighthouse.score", title: "Score", unit: "", higherIsBetter: true },
];

const read = (route, key) => key.split(".").reduce((node, part) => (node ? node[part] : null), route);

function delta(from, to, higherIsBetter) {
  if (from == null || to == null) return "—";
  const change = to - from;
  if (from === 0) return change === 0 ? "0" : `${change > 0 ? "+" : ""}${change}`;
  const percent = Math.round((change / from) * 100);
  // The arrow states which way the number moved, nothing more. Whether that is
  // good depends on the metric — down is better for every timing here, up is
  // better for the Lighthouse score — and mapping both onto one "improved"
  // arrow made a rising score render as a downward triangle.
  const arrow = change === 0 ? "  " : change < 0 ? "▼" : "▲";
  const better = higherIsBetter ? change > 0 : change < 0;
  const marker = change === 0 ? " " : better ? "" : "  (worse)";
  return `${arrow} ${change > 0 ? "+" : ""}${percent}%${marker}`;
}

const rows = [];
for (const [name, afterRoute] of Object.entries(after.routes)) {
  const beforeRoute = before.routes[name];
  if (!beforeRoute || beforeRoute.error || afterRoute.error) continue;
  for (const metric of METRICS) {
    const from = read(beforeRoute, metric.key);
    const to = read(afterRoute, metric.key);
    if (from == null && to == null) continue;
    rows.push({
      route: name,
      metric: metric.title,
      before: from == null ? "—" : `${from}${metric.unit}`,
      after: to == null ? "—" : `${to}${metric.unit}`,
      change: delta(from, to, metric.higherIsBetter),
    });
  }
}

if (flags.has("--markdown")) {
  console.log(`| Screen | Metric | ${beforeLabel} | ${afterLabel} | Change |`);
  console.log("| --- | --- | ---: | ---: | ---: |");
  for (const row of rows) {
    console.log(`| ${row.route} | ${row.metric} | ${row.before} | ${row.after} | ${row.change} |`);
  }
} else {
  const widths = ["route", "metric", "before", "after", "change"].map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column]).length)),
  );
  const line = (values) => values.map((value, index) => String(value).padEnd(widths[index])).join("  ");
  console.log(line(["route", "metric", beforeLabel, afterLabel, "change"]));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  let current = null;
  for (const row of rows) {
    if (current && current !== row.route) console.log("");
    current = row.route;
    console.log(line([row.route, row.metric, row.before, row.after, row.change]));
  }
}
