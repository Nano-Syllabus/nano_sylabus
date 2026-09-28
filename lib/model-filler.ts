/**
 * The padding a model writes about the request instead of the subject, dropped
 * sentence by sentence.
 *
 * A MIRROR of `shared.text.trim_model_filler` on the course server, which cleans
 * readings as it serves them. This copy cleans what is already cached in the
 * browser and in the database before that trim reaches production — the Concepts
 * sheet showed an OSI worked example ending in a 100-word sentence about "the
 * provided course evidence and pedagogical guidelines" (2026-09-28). Keep the two
 * patterns in step.
 *
 * Narrow on purpose: "the user program", "the shell prompt", "for this task" and
 * "the instruction set" are subject matter in an operating-systems or
 * microprocessor course.
 */
const META_TALK = new RegExp(
  [
    String.raw`\b(?:as\s+(?:requested|instructed|asked)|requested\s+by|(?:the\s+)?user(?:'s)?\s+(?:prompt|request|query)`,
    String.raw`|this\s+prompt|(?:in|within|for)\s+this\s+(?:session|interaction|conversation|response|format)`,
    String.raw`|(?:constraints|requirements?)\s+of\s+this\s+(?:format|task|prompt)`,
    String.raw`|per\s+the\s+(?:instructions?|brief|requirements?\s+of)`,
    String.raw`|(?:provided|supplied|background)\s+(?:course\s+)?(?:evidence|context|sources?|material)`,
    String.raw`|pedagogical\s+guidelines?|instructional\s+goal`,
    String.raw`|final\s+result\s+is:?\s*no\s+(?:value|result|number|numerical))\b`,
  ].join(""),
  "i",
);
const FILLER_WORD =
  /\b(?:today|effectively|clearly|precisely|specifically|definitively|session|requested|here|now)\b/gi;
const PEDAGOGY_WORD =
  /\b(?:mastery|pedagogical|curriculum|instructional|evidence|assessments?|examination|successfully|demonstrate|effectively|learning\s+process)\b/gi;
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[A-Z$*(\[])/;
const PROSE_WORDS = /[A-Za-z]{2,}/g;
/** No sentence a student needs is this long; a runaway one is, and has no end. */
const RUNAWAY_WORDS = 150;

function count(pattern: RegExp, text: string) {
  return text.match(pattern)?.length ?? 0;
}

function isFillerSentence(sentence: string) {
  if (META_TALK.test(sentence)) return true;
  const words = count(PROSE_WORDS, sentence);
  if (words > RUNAWAY_WORDS) return true;
  return words > 50 && (count(FILLER_WORD, sentence) >= 4 || count(PEDAGOGY_WORD, sentence) >= 3);
}

/** Lines with no trigger come back untouched, so tables, code and maths never re-flow. */
export function trimModelFiller(text: string) {
  if (!text) return text;
  const lines = text.split("\n").map((line) => {
    if (!(META_TALK.test(line) || count(PROSE_WORDS, line) > 50)) return line;
    return line
      .split(SENTENCE_BREAK)
      .filter((sentence) => !isFillerSentence(sentence))
      .join(" ");
  });
  const trimmed = lines.join("\n");
  return trimmed === text ? text : trimmed.replace(/\n{3,}/g, "\n\n");
}
