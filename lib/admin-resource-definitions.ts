import type { AdminAnswerState } from "@/lib/types";

export interface AdminCollectionDefinition<TFilter extends string = string> {
  key: string;
  label: string;
  singularLabel: string;
  subtitle: string;
  searchPlaceholder: string;
  emptyMessage: string;
  filters?: Array<{ value: TFilter; label: string }>;
}

export const USER_COLLECTION = {
  key: "users",
  label: "Students",
  singularLabel: "Student",
  subtitle: "Student and admin directory.",
  searchPlaceholder: "Search by email, name, college...",
  emptyMessage: "No users found.",
} satisfies AdminCollectionDefinition;

export const ANSWER_FILTERS: Array<{ value: "all" | AdminAnswerState; label: string }> = [
  { value: "flagged", label: "Flagged" },
  { value: "all", label: "All" },
  { value: "reviewed", label: "Reviewed" },
  { value: "liked", label: "Liked" },
  { value: "neutral", label: "Neutral" },
];

export const ANSWER_COLLECTION = {
  key: "answers",
  label: "Answer queue",
  singularLabel: "Answer",
  subtitle: "Flagged answers, liked replies, and neutral outputs across the whole app.",
  searchPlaceholder: "Search student, board, subject...",
  emptyMessage: "No answers match this filter.",
  filters: ANSWER_FILTERS,
} satisfies AdminCollectionDefinition<"all" | AdminAnswerState>;

export const PLAN_COLLECTION = {
  key: "plans",
  label: "Plans",
  singularLabel: "Plan",
  subtitle: "Create and edit sellable packs.",
  searchPlaceholder: "",
  emptyMessage: "No plans yet.",
} satisfies AdminCollectionDefinition;
