import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TITLE_STOP_WORDS = new Set([
  "a",
  "about",
  "according",
  "again",
  "all",
  "also",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "bro",
  "by",
  "can",
  "chapter",
  "could",
  "do",
  "does",
  "for",
  "from",
  "give",
  "gonna",
  "have",
  "help",
  "hey",
  "how",
  "i",
  "in",
  "is",
  "it",
  "list",
  "me",
  "my",
  "of",
  "on",
  "our",
  "please",
  "qsn",
  "question",
  "questions",
  "should",
  "show",
  "summarize",
  "summary",
  "tell",
  "the",
  "this",
  "to",
  "what",
  "which",
  "who",
  "why",
  "will",
  "with",
  "you",
  "your",
]);

const CHAPTER_WORDS: Record<string, string> = {
  one: "1",
  two: "2",
  second: "2",
  three: "3",
  third: "3",
  four: "4",
  fourth: "4",
  five: "5",
  fifth: "5",
  six: "6",
  sixth: "6",
  seven: "7",
  seventh: "7",
  eight: "8",
  eighth: "8",
  nine: "9",
  ninth: "9",
  ten: "10",
  tenth: "10",
};

const MIN_SESSION_TITLE_WORDS = 4;
const MAX_SESSION_TITLE_WORDS = 5;
const MAX_SESSION_TITLE_LENGTH = 44;

function titleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (/^[A-Z]{2,}$/.test(word)) return word;
      if (/^\d+$/.test(word)) return word;
      return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

function compactTitle(value: string) {
  const normalized = titleCase(value).replace(/\s+/g, " ").trim();
  if (!normalized) return "New Chat";

  const compact = normalized.split(" ").slice(0, MAX_SESSION_TITLE_WORDS).join(" ");
  if (compact.length <= MAX_SESSION_TITLE_LENGTH) return compact;
  return compact.slice(0, MAX_SESSION_TITLE_LENGTH - 1).trim();
}

function cleanTitleSubject(subjectContext?: string | null) {
  const subject = (subjectContext || "").trim().replace(/\s+/g, " ");
  if (!subject || subject.toLowerCase() === "general") return "";
  return titleCase(subject);
}

function stripTitleSubjectPrefix(value: string) {
  return value
    .replace(/^(Engineering Physics|Physics|Chemistry|English|Mathematics|Maths)\s*:\s*/i, "")
    .replace(/^(Engineering Physics|Physics|Chemistry|English|Mathematics|Maths)\s+(Chapter\s+\d+)/i, "$2")
    .trim();
}

function expandShortTitle(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length >= MIN_SESSION_TITLE_WORDS) return value;

  const chapter = value.match(/^Chapter\s+(\d+)$/i);
  if (chapter) return `Chapter ${chapter[1]} Study Overview`;

  const chapterOverview = value.match(/^Chapter\s+(\d+)\s+Overview$/i);
  if (chapterOverview) return `Chapter ${chapterOverview[1]} Topic Overview`;

  if (/^Formula Summary$/i.test(value)) return "Important Formula Summary Notes";
  if (/^Exam Questions$/i.test(value)) return "Likely Exam Question Ideas";
  if (/^New Chat$/i.test(value)) return "New Study Chat Session";
  return value;
}

function extractKeywordsTitle(text: string, subjectContext?: string | null) {
  const subject = cleanTitleSubject(subjectContext);
  const keywords = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !TITLE_STOP_WORDS.has(word))
    .slice(0, MAX_SESSION_TITLE_WORDS);

  if (keywords.length === 0) return subject || "New Chat";
  if (keywords.length < MIN_SESSION_TITLE_WORDS && subject) {
    return compactTitle(`${subject} ${keywords.join(" ")}`);
  }
  return compactTitle(keywords.join(" "));
}

export function deriveSessionTitle(text: string, subjectContext?: string | null) {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return "New Chat";

  const lower = clean.toLowerCase();
  const subject = cleanTitleSubject(subjectContext);
  const chapterMatch = lower.match(/\bchapter\s+(one|two|second|three|third|four|fourth|five|fifth|six|sixth|seven|seventh|eight|eighth|nine|ninth|ten|tenth|\d{1,2})\b/);
  const worldCupMatch = lower.match(/\bworld\s*cup\s*(20\d{2})?\b|\bworldcup\s*(20\d{2})?\b/);

  if (worldCupMatch) {
    const year = worldCupMatch[1] || worldCupMatch[2] || "";
    return compactTitle(`World Cup${year ? ` ${year}` : ""} Prediction`);
  }

  if (chapterMatch) {
    const rawChapter = chapterMatch[1];
    const chapter = CHAPTER_WORDS[rawChapter] || rawChapter;
    const suffix = /\b(topic|topics|talk|talks|about|overview|explain)\b/.test(lower)
      ? "Overview"
      : "";
    return compactTitle(expandShortTitle([`Chapter ${chapter}`, suffix].filter(Boolean).join(" ")));
  }

  if (/\b(formula|formulas|equation|equations)\b/.test(lower)) {
    return compactTitle("Important Formula Summary Notes");
  }

  if (/\b(exam|likely|question bank|questions?)\b/.test(lower) && /\b(exam|likely|questions?)\b/.test(lower)) {
    return compactTitle("Likely Exam Question Ideas");
  }

  if (/\b(summarize|summarise|summary|recap)\b/.test(lower)) {
    return compactTitle([extractKeywordsTitle(clean), "Summary"].filter(Boolean).join(" "));
  }

  if (/\b(explain|simple terms|what is|what are|overview|intro|introduction)\b/.test(lower)) {
    return compactTitle([subject || extractKeywordsTitle(clean), "Overview"].filter(Boolean).join(" "));
  }

  const derived = extractKeywordsTitle(clean, subject);
  return compactTitle(derived);
}

export function compactSessionTitle(title: string) {
  const clean = stripTitleSubjectPrefix(title.trim().replace(/\s+/g, " "));
  return compactTitle(expandShortTitle(clean || "New Chat"));
}

export function groupDateLabel(input: string | number | Date) {
  const date = new Date(input);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfTarget.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Last 7 Days";
  return "Older";
}

export function formatTimestamp(input: string | number | Date) {
  return new Date(input).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(input: string | number | Date) {
  return new Date(input).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
