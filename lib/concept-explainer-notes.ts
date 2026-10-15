/**
 * The brief a topic's animated explainer is planned from (see
 * lib/data/concept-explainer.ts). Pure, so it can be tested without a server.
 */

/** What the planner reads beside the topic: the chapter's spine, not its prose. */
export function explainerNotes(reading: string[]): string {
  const lines: string[] = [];
  for (const raw of reading) {
    const text = raw.trim();
    if (/^```/.test(text)) continue; // activities are for the page, not the video
    const label = /^\*\*(Why it matters|The idea):\*\*\s*([\s\S]+)$/.exec(text);
    if (label) lines.push(`${label[1]}: ${label[2]}`);
    const heading = /^###\s+(\d+)\.\s+(.+)$/.exec(text);
    if (heading) lines.push(`Part ${heading[1]}: ${heading[2]}`);
    if (/^\$\$[\s\S]+\$\$$/.test(text)) lines.push(`Formula: ${text.replace(/\$\$/g, "").trim()}`);
    const worked = /^\*\*Worked:\*\*\s*([\s\S]+)$/.exec(text);
    if (worked && !lines.some((l) => l.startsWith("Worked example:")))
      lines.push(`Worked example: ${worked[1].slice(0, 400)}`);
  }
  lines.push(
    "Make it a 90-second explainer of the whole topic: the idea first, then each part " +
      "built up visually, the key formula, one worked example with numbers, and a closing recap.",
  );
  let notes = lines.join("\n");
  if (notes.length > 1990) notes = notes.slice(0, 1990);
  return notes;
}
