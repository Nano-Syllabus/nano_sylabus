/**
 * Worked solutions that promise a picture and do not carry one.
 *
 * The backend draws a solution's figure while writing it (`_render_solution`
 * in api-service/routers/challenge.py) and, when nothing can draw it, drops the
 * figure and keeps the heading. Until 2026-09-21 production had no renderer at
 * all, so every stored solution that was asked to "sketch" or "draw" reads
 * "### Diagram" over nothing — and the description the answer model wrote for
 * the picture was thrown away with it.
 *
 * So the question is the brief. It names what to draw, and a worked example's
 * question is an exam question: "Sketch the voltage signal range diagram for
 * this system, identifying the allowed regions for logic-0, logic-1 …".
 */

/** A heading that promises a picture: short, and says so. Mirrors the backend's
 *  `_FIGURE_HEADING_RE` but leaves out bare "circuit", which heads plenty of
 *  worked answers ("Circuit Analysis") that never meant to carry a drawing. */
const HEADING = /^(#{1,6})[ \t]*(?:\d+[.)][ \t]*)?([^\n]{1,60}?)[ \t]*$/gm;
const FIGURE_WORD = /\b(?:diagram|figure|sketch|schematic|waveforms?)\b/i;

export type EmptyFigureSection = {
  /** The heading's own text, e.g. "Diagram". */
  heading: string;
  /** Offset where the picture belongs: just past the heading line, or — for a
   *  diagram only mentioned in the prose — the start of that paragraph. */
  insertAt: number;
  /** Whatever the section says about the picture it lost, if anything. */
  prose: string;
  /** `before` when the picture goes above the paragraph at `insertAt`. */
  placement?: "after-heading" | "before";
};

/**
 * Prose that points at a picture on the page: "The diagram shows: …", "as the
 * sketch below illustrates". A solution written that way with no image in it
 * lost its figure just as surely as one with a bare "### Diagram" heading.
 */
const PROSE_FIGURE =
  /\b(?:the|this|above|below|following|my|our)\s+(?:labelled\s+|labeled\s+|voltage[- ]range\s+|timing\s+|circuit\s+|block\s+|state\s+)?(?:diagram|figure|sketch|schematic|waveforms?|graph|plot)\b/i;

/** A question that asks for a picture: "(a) Sketch the voltage range diagram…". */
const ASKS_FOR_FIGURE =
  /\b(?:sketch|draw|plot)\b(?:\W+\w+){0,6}?\W+(?:diagram|figure|graph|waveforms?|circuit|schematic|curve|characteristics?|plot|sketch)\b|\bsketch\b/i;

function hasPicture(markdown: string) {
  return markdown.includes("![") || markdown.includes("```");
}

/**
 * The first figure heading whose section holds no image and no fenced block —
 * or, failing that, a solution with no picture anywhere that talks about one
 * (or answers a question that asked for one). `question` enables the second
 * test; without it only the prose is read.
 */
export function emptyFigureSection(markdown: string, question = ""): EmptyFigureSection | null {
  if (!markdown) return null;
  return emptyFigureHeading(markdown) ?? unheadedMissingFigure(markdown, question);
}

function unheadedMissingFigure(markdown: string, question: string): EmptyFigureSection | null {
  if (hasPicture(markdown)) return null;
  const paragraphs = [...markdown.matchAll(/[^\n](?:[^\n]|\n(?!\s*\n))*/g)];
  const mentioning = paragraphs.find((paragraph) => PROSE_FIGURE.test(paragraph[0]));
  if (mentioning) {
    return {
      heading: "Diagram",
      insertAt: mentioning.index ?? 0,
      prose: mentioning[0].trim(),
      placement: "before",
    };
  }
  if (question && ASKS_FOR_FIGURE.test(question)) {
    return { heading: "Diagram", insertAt: 0, prose: "", placement: "before" };
  }
  return null;
}

function emptyFigureHeading(markdown: string): EmptyFigureSection | null {
  if (!markdown.includes("#")) return null;
  const headings = [...markdown.matchAll(HEADING)];
  for (const [index, match] of headings.entries()) {
    const level = match[1].length;
    const text = match[2].trim();
    if (!FIGURE_WORD.test(text)) continue;
    const insertAt = (match.index ?? 0) + match[0].length;
    // The section runs to the next heading at this level or above.
    const next = headings.slice(index + 1).find((candidate) => candidate[1].length <= level);
    const body = markdown.slice(insertAt, next?.index ?? markdown.length);
    if (body.includes("![") || body.includes("```")) continue;
    return { heading: text, insertAt, prose: body.trim() };
  }
  return null;
}

/** What the renderer is asked to draw.
 *
 * `redrawOf` is the id of an earlier figure for this section that the renderer
 * gave up on. The renderer names a figure by the hash of its brief and refuses a
 * failed one for a cooldown, so asking again with the same words would only
 * hand back the same dead name. A redraw therefore asks for a simpler scene —
 * the usual failure is the model writing a scene too long to finish — and
 * carries the dead id, so every retry is a new name while two tabs retrying the
 * same dead figure still share one render. */
export function figureBrief(question: string, section: EmptyFigureSection, redrawOf?: string) {
  const parts = [
    "Draw the figure this exam question asks for, as a clean, fully labelled textbook diagram.",
    `Question: ${question.trim()}`,
  ];
  if (section.prose) parts.push(`${section.heading}: ${section.prose.slice(0, 1500)}`);
  if (redrawOf) {
    parts.push(
      `Keep the scene simple and the code short: only the components and labels the question needs, static, no animation. (Redraw of ${redrawOf.slice(0, 12)}.)`,
    );
  }
  return parts.join("\n\n");
}

/** `/api/figure/<sha>.png` — the only figure URL a redraw may replace. */
const DRAWN_FIGURE = /^\/api\/figure\/([0-9a-f]{1,64})\.png$/;

/** The digest of a server-drawn figure URL, or null for anything else. */
export function drawnFigureDigest(url: string): string | null {
  return url.match(DRAWN_FIGURE)?.[1] ?? null;
}

/** The solution without the image at `url`, and the blank lines around it. */
export function withoutFigure(markdown: string, url: string) {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markdown
    .replace(new RegExp(`\\n*!\\[[^\\]]*\\]\\(${escaped}\\)\\n*`, "g"), "\n\n")
    .replace(/^\n+/, "");
}

/** The solution with the picture under the heading that promised it. */
export function withFigure(markdown: string, section: EmptyFigureSection, url: string) {
  if (section.placement === "before") {
    const before = markdown.slice(0, section.insertAt).trimEnd();
    return `${before}${before ? "\n\n" : ""}![${section.heading}](${url})\n\n${markdown.slice(section.insertAt)}`;
  }
  const image = `\n\n![${section.heading}](${url})`;
  return markdown.slice(0, section.insertAt) + image + markdown.slice(section.insertAt);
}
