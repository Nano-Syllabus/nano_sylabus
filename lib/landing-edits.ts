/**
 * Field-level edits to a site's landing text, by dotted path
 * (`hero.titleLead`, `faq.items.2.answer`, `prize.hidden`).
 *
 * The visual editor uses these to jump from a click in the preview to the
 * field that holds that text, and the AI assistant uses them to apply what
 * the model asked for and to report exactly which fields changed. Client-safe.
 */
import {
  DEFAULT_LANDING_CONTENT,
  LANDING_SECTIONS,
  sanitizeLandingContent,
  type LandingContent,
  type LandingField,
} from "@/lib/landing-content";

export type LandingPath = Array<string | number>;

/** One editable value on the page: its path and its current text. */
export type LandingLeaf = { path: string; value: string | boolean };

export function pathKey(path: LandingPath) {
  return path.join(".");
}

export function parsePath(path: string): LandingPath {
  return path
    .split(".")
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

/** A copy of `value` with `path` set to `next`; untouched branches are shared. */
export function setIn<T>(value: T, path: LandingPath, next: unknown): T {
  if (path.length === 0) return next as T;
  const [head, ...rest] = path;
  if (Array.isArray(value)) {
    const copy = [...value];
    copy[head as number] = setIn(copy[head as number], rest, next);
    return copy as T;
  }
  const record = (value ?? {}) as Record<string, unknown>;
  return { ...record, [head]: setIn(record[head as string], rest, next) } as T;
}

export function getIn(value: unknown, path: LandingPath): unknown {
  let node = value;
  for (const part of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string | number, unknown>)[part];
  }
  return node;
}

/** Every string/boolean in `content`, in page order. */
export function flattenLanding(content: unknown, prefix: LandingPath = []): LandingLeaf[] {
  if (typeof content === "string" || typeof content === "boolean") {
    return [{ path: pathKey(prefix), value: content }];
  }
  if (Array.isArray(content)) {
    return content.flatMap((item, index) => flattenLanding(item, [...prefix, index]));
  }
  if (content && typeof content === "object") {
    return Object.entries(content).flatMap(([key, item]) => flattenLanding(item, [...prefix, key]));
  }
  return [];
}

/** The default-content node a path points at; list entries use the list's first item. */
function templateAt(path: LandingPath): unknown {
  let node: unknown = DEFAULT_LANDING_CONTENT;
  for (const part of path) {
    if (Array.isArray(node)) node = node[typeof part === "number" && part < node.length ? part : 0];
    else if (node && typeof node === "object") node = (node as Record<string, unknown>)[part as string];
    else return undefined;
  }
  return node;
}

export type LandingChangeRequest = { path: string; value: string };

/**
 * Applies the assistant's requested changes. A value is plain text for a text
 * field, "true"/"false" for a `hidden` switch, and JSON for a whole list. Paths
 * the page doesn't have are skipped, and the result goes through
 * `sanitizeLandingContent`, so list lengths and colours stay valid whatever
 * was asked for.
 */
export function applyLandingChanges(content: LandingContent, changes: LandingChangeRequest[]): LandingContent {
  let next: unknown = content;
  for (const change of changes) {
    const path = parsePath(String(change.path ?? ""));
    if (!path.length) continue;
    const template = templateAt(path);
    if (template === undefined) continue;
    const raw = String(change.value ?? "");
    let value: unknown;
    if (typeof template === "string") value = raw;
    else if (typeof template === "boolean") value = raw.trim().toLowerCase() === "true";
    else {
      try {
        value = JSON.parse(raw);
      } catch {
        continue;
      }
    }
    // A new list entry needs its other fields present before one is set.
    const parent = path.slice(0, -1);
    const parentTemplate = templateAt(parent);
    if (
      typeof path[path.length - 1] === "string" &&
      parentTemplate &&
      typeof parentTemplate === "object" &&
      getIn(next, parent) === undefined
    ) {
      next = setIn(next, parent, Object.fromEntries(Object.keys(parentTemplate).map((key) => [key, ""])));
    }
    next = setIn(next, path, value);
  }
  return sanitizeLandingContent(next);
}

/** The fields that differ between two copies, with both values. */
export function diffLanding(before: LandingContent, after: LandingContent) {
  const old = new Map(flattenLanding(before).map((leaf) => [leaf.path, leaf.value]));
  const now = new Map(flattenLanding(after).map((leaf) => [leaf.path, leaf.value]));
  const paths = [...new Set([...now.keys(), ...old.keys()])];
  return paths
    .filter((path) => old.get(path) !== now.get(path))
    .map((path) => ({
      path,
      label: describeLandingPath(path),
      before: old.get(path) ?? null,
      after: now.get(path) ?? null,
    }));
}

/** "Hero · Headline", "FAQ · Question 3 · Answer". */
export function describeLandingPath(path: string) {
  const [sectionKey, ...rest] = parsePath(path);
  const section = LANDING_SECTIONS.find((candidate) => candidate.key === sectionKey);
  if (!section) return path;
  const parts: string[] = [section.title];
  const [key, index, field] = rest;
  if (key === "hidden") return `${section.title} · Visibility`;
  const plain = section.fields.find((candidate) => candidate.key === key);
  if (plain) return `${section.title} · ${plain.label}`;
  const list = section.lists?.find((candidate) => candidate.key === key);
  if (list) {
    parts.push(typeof index === "number" ? `${list.itemLabel} ${index + 1}` : list.label);
    if (list.kind === "items" && typeof field === "string") {
      const label = list.fields.find((candidate: LandingField) => candidate.key === field)?.label;
      if (label) parts.push(label);
    }
  }
  return parts.join(" · ");
}

function normalize(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Which field holds the text of a clicked element. `texts` runs from the
 * clicked element outwards (its own text, then each parent's). An exact match
 * wins; otherwise the longest field text the element contains. The clicked
 * section is searched first, then the whole page (a header button shows the
 * hero's button text, for one).
 */
export function matchLandingField(content: LandingContent, section: string | null, texts: string[]) {
  const leaves = flattenLanding(content).filter(
    (leaf): leaf is { path: string; value: string } =>
      typeof leaf.value === "string" && normalize(leaf.value).length > 0 && !leaf.path.startsWith("seo."),
  );
  const pools = [
    section ? leaves.filter((leaf) => leaf.path.startsWith(`${section}.`)) : [],
    leaves,
  ];
  for (const pool of pools) {
    if (!pool.length) continue;
    for (const raw of texts) {
      const text = normalize(raw);
      if (!text || text.length > 600) continue;
      const exact = pool.find((leaf) => normalize(leaf.value) === text);
      if (exact) return exact.path;
      const contained = pool
        .filter((leaf) => normalize(leaf.value).length >= 3 && text.includes(normalize(leaf.value)))
        .sort((a, b) => b.value.length - a.value.length)[0];
      if (contained) return contained.path;
    }
  }
  return null;
}
