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
  /** Offset just past the heading line, where the picture belongs. */
  insertAt: number;
  /** Whatever the section says about the picture it lost, if anything. */
  prose: string;
};

/** The first figure heading whose section holds no image and no fenced block. */
export function emptyFigureSection(markdown: string): EmptyFigureSection | null {
  if (!markdown || !markdown.includes("#")) return null;
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

/** What the renderer is asked to draw. */
export function figureBrief(question: string, section: EmptyFigureSection) {
  const parts = [
    "Draw the figure this exam question asks for, as a clean, fully labelled textbook diagram.",
    `Question: ${question.trim()}`,
  ];
  if (section.prose) parts.push(`${section.heading}: ${section.prose.slice(0, 1500)}`);
  return parts.join("\n\n");
}

/** The solution with the picture under the heading that promised it. */
export function withFigure(markdown: string, section: EmptyFigureSection, url: string) {
  const image = `\n\n![${section.heading}](${url})`;
  return markdown.slice(0, section.insertAt) + image + markdown.slice(section.insertAt);
}
