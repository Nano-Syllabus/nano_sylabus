import type { ChallengePastQuestion, ChallengeSolvedExample } from "@/lib/data/student-challenges";

/**
 * One question as step one lists it: the paper's words, every session it was set
 * in, and its worked answer when there is one.
 */
export type LearnQuestion = {
  /** The normalized question text, used as the React key and the open/closed id. */
  key: string;
  question: string;
  /** Sessions this question was printed in, in the order they came back. */
  years: string[];
  /** Distinct mark values the bank printed for it. */
  marks: number[];
  /** How many rows of the bank this one question accounts for. */
  appearances: number;
  /** "" when this question has not been worked. */
  solution: string;
};

/**
 * Question text reduced to what two sources would agree on.
 *
 * Case, whitespace and trailing punctuation all vary between the question bank
 * row and the worked copy of the same question, and none of that variation makes
 * it a different question.
 */
export function normalizeQuestionText(question: string) {
  return (
    question
      .toLowerCase()
      .replace(/\s+/g, " ")
      // Trimmed BEFORE the punctuation is stripped. Stripping first left the
      // mark in place on any row that ended in whitespace — a bank row reading
      // "what is lc oscillation?  " kept its "?" while the worked copy of the
      // same question lost it, so the two never joined and the question was
      // printed twice, once bare and once worked.
      .trim()
      .replace(/[.?!,;:]+$/g, "")
      .trim()
  );
}

/** A word a question cannot end on: the line was cut, not finished. */
const DANGLING = new Set(
  ("and or the a an of to in on for with by from into using use at as is are was were be been " +
    "that this these those which who whom whose if then than but so such between among through " +
    "during before after above below over under within without draw write derive explain define " +
    "show find state list give obtain calculate compare")
    .split(" "),
);

/**
 * Whether a stored question is one a student can actually be shown.
 *
 * The same test the indexer applies, applied again here — because a challenge
 * row keeps the questions it was built with. A challenge started before the
 * index pass existed carries what the old request-time scraper pulled off the
 * scan, and that content is on the row until the challenge is restarted: "yri
 * the oscillator is lost ineach full oscillation?", "period of the oscillation?
 * '", and half-questions that stop at "and compare". Filtering here is what
 * keeps those off the screen without the student having to know any of it.
 */
export function looksWhole(question: string): boolean {
  const text = question.replace(/\s+/g, " ").trim();
  if (text.length < 20) return false;
  const words = text.replace(/[.?:;,'"\s]+$/g, "").split(" ").filter(Boolean);
  if (words.length < 5) return false;
  // Starts mid-sentence: the front of it was on the previous line. A question
  // mark does not excuse it — "yri the oscillator is lost ineach full
  // oscillation?" has one, and is the back half of a question whose front the
  // scraper left behind.
  if (/^[a-z]/.test(text)) return false;
  const last = words[words.length - 1].replace(/[()[\]]/g, "").toLowerCase();
  if (!last) return false;
  if (last.length <= 2 && !["is", "in", "of", "to", "on", "or", "if", "ac", "dc"].includes(last)) {
    return false;
  }
  if (DANGLING.has(last)) return false;
  // A scan that dropped a letter out of the middle of a word ("differentiat",
  // "alitrerential") cannot be detected here, and is not tried: what CAN be
  // detected is the tail that proves the line was cut.
  return true;
}

/**
 * The single list step one renders.
 *
 * It exists because the two inputs are the SAME rows seen twice.
 * `solvedExamples` are past questions carrying a solution — they come from a
 * different route and share no id with `pastQuestions`, so the question text is
 * the only join available. Rendered untouched, a worked question and its bare
 * twin both appeared on one screen, which is what made the old step one read as
 * three stacked sections instead of one list.
 *
 * Repeat appearances collapse for the same reason: a question three sessions set
 * is one question that has been asked three times, and a student scanning this
 * list wants it said once with its years beside it.
 */
export function mergeLearnQuestions(input: {
  pastQuestions?: ChallengePastQuestion[] | null;
  solvedExamples?: ChallengeSolvedExample[] | null;
}): LearnQuestion[] {
  const merged = new Map<string, LearnQuestion>();

  const add = (question: string, year: string, marks: number | null, solution: string) => {
    const key = normalizeQuestionText(question || "");
    if (!key || !looksWhole(question)) return;
    const entry = merged.get(key) ?? {
      key,
      question,
      years: [],
      marks: [],
      appearances: 0,
      solution: "",
    };
    entry.appearances += 1;
    if (year && !entry.years.includes(year)) entry.years.push(year);
    if (typeof marks === "number" && marks > 0 && !entry.marks.includes(marks)) {
      entry.marks.push(marks);
    }
    // A worked version of a row already listed upgrades it rather than adding a
    // second copy of the same question.
    if (solution && !entry.solution) entry.solution = solution;
    merged.set(key, entry);
  };

  // Worked first, so the copy that carries a solution is the one whose wording
  // is kept when the two sources punctuate the same question differently.
  for (const example of input.solvedExamples ?? []) {
    add(example.question, example.year || "", example.marks, example.solution);
  }
  for (const pastQuestion of input.pastQuestions ?? []) {
    add(pastQuestion.question, pastQuestion.year || "", pastQuestion.marks, "");
  }

  return [...merged.values()].sort(
    (left, right) =>
      // Worked first — those are the ones a student can learn from today — then
      // the most repeated, which is the best proxy this data has for "likely to
      // be asked again".
      Number(Boolean(right.solution)) - Number(Boolean(left.solution)) ||
      right.appearances - left.appearances,
  );
}
