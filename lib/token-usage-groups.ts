/**
 * Names for the backend's usage labels. Every model call is recorded with the
 * route that made it (`challenge-mcq`, `chat-stream`, …); the admin Overview
 * groups those two ways: by FEATURE (where in the product) and by FORMAT (what
 * kind of question work it was), so "is it MCQ or written answers?" and "is it
 * challenges or chat?" each get a direct answer.
 *
 * Unknown labels are never dropped — they land in "Other" with their raw name.
 */

export type UsageFeature = "challenges" | "practice" | "chat" | "creator" | "other";
export type UsageFormat = "mcq" | "written" | "lessons" | "chat" | "creator" | "other";

export const FEATURE_LABELS: Record<UsageFeature, string> = {
  challenges: "Daily challenges",
  practice: "Practice",
  chat: "Chat & NanoAI",
  creator: "Creator workspace",
  other: "Other",
};

export const FORMAT_LABELS: Record<UsageFormat, string> = {
  mcq: "MCQ questions",
  written: "Written answers (QnA)",
  lessons: "Lessons & worked examples",
  chat: "Chat answers",
  creator: "Creator tools",
  other: "Other",
};

export const FORMAT_HINTS: Record<UsageFormat, string> = {
  mcq: "Writing and checking multiple-choice questions.",
  written: "Written exam questions and marking students’ handwritten answers.",
  lessons: "Concept lessons, solved examples, translations and challenges prepared ahead.",
  chat: "Student chat and NanoAI replies.",
  creator: "What teachers spend in their own workspace.",
  other: "Indexing and anything without a route label.",
};

type Known = { label: string; feature: UsageFeature; format: UsageFormat };

const KNOWN: Record<string, Known> = {
  "challenge-learn": { label: "Concepts lesson", feature: "challenges", format: "lessons" },
  "challenge-solved": { label: "Solved examples", feature: "challenges", format: "lessons" },
  "challenge-exam": { label: "Written exam questions", feature: "challenges", format: "written" },
  "challenge-mcq": { label: "MCQ questions", feature: "challenges", format: "mcq" },
  "challenge-analyse": {
    label: "Marking written answers",
    feature: "challenges",
    format: "written",
  },
  "challenge-translate": {
    label: "Roman Nepali translation",
    feature: "challenges",
    format: "lessons",
  },
  "challenge-stock": {
    label: "Challenges prepared ahead",
    feature: "challenges",
    format: "lessons",
  },
  "practice-generate": { label: "Practice questions", feature: "practice", format: "written" },
  "practice-grade": { label: "Marking practice answers", feature: "practice", format: "written" },
  "mcq-generate": { label: "Practice MCQ sets", feature: "practice", format: "mcq" },
  chat: { label: "Chat reply", feature: "chat", format: "chat" },
  "chat-stream": { label: "Chat reply (streamed)", feature: "chat", format: "chat" },
  "collection-ask": {
    label: "Teacher asks their materials",
    feature: "creator",
    format: "creator",
  },
  "collection-ask-stream": {
    label: "Teacher asks their materials",
    feature: "creator",
    format: "creator",
  },
  "collection-generate": {
    label: "Teacher generates a paper",
    feature: "creator",
    format: "creator",
  },
};

export function describeUsageEndpoint(endpoint: string): Known {
  const known = KNOWN[endpoint];
  if (known) return known;
  return {
    label:
      endpoint === "unattributed" || !endpoint
        ? "No route label (indexing, older usage)"
        : endpoint,
    feature: "other",
    format: "other",
  };
}
