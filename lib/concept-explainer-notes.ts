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
  // First, so the 2,000-character cap can only ever trim the chapter, never this.
  lines.unshift(
    "Make it a 90-second explainer of the whole topic for a first-year student. EASY: " +
      "plain words, short sentences, one idea per scene, nothing read off the screen. " +
      "ANIMATED: objects that move, grow and change to show the idea (a force sliding, a " +
      "couple turning, a value rising), never a static slide of text. PARTICIPATION: two " +
      "'pause and predict' moments: the narrator asks the viewer a quick question about " +
      "what happens next, leaves a short beat, then shows the answer. End with a " +
      "one-line recap and the worked example's result.",
  );
  let notes = lines.join("\n");
  if (notes.length > 1990) notes = notes.slice(0, 1990);
  return notes;
}
