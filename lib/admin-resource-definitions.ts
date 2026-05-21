import type {
  AdminAnswerState,
  KnowledgeDocumentType,
  KnowledgeResourceKind,
} from "@/lib/types";

export interface AdminCollectionDefinition<TFilter extends string = string> {
  key: string;
  label: string;
  singularLabel: string;
  subtitle: string;
  searchPlaceholder: string;
  emptyMessage: string;
  filters?: Array<{ value: TFilter; label: string }>;
}

export const NOTEBOOK_COLLECTION = {
  key: "notebooks",
  label: "Notebooks",
  singularLabel: "Notebook",
  subtitle: "Board, level, faculty, and subject containers.",
  searchPlaceholder: "Search board, level, subject...",
  emptyMessage: "No notebooks found.",
} satisfies AdminCollectionDefinition;

export const RESOURCE_COLLECTION = {
  key: "resources",
  label: "Resources",
  singularLabel: "Resource",
  subtitle: "Resources linked under the selected notebook.",
  searchPlaceholder: "",
  emptyMessage: "No resources yet.",
} satisfies AdminCollectionDefinition;

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

export const PROMPT_COLLECTION = {
  key: "prompts",
  label: "AI templates",
  singularLabel: "Template",
  subtitle: "Live behavior controls.",
  searchPlaceholder: "Search name, slug, purpose...",
  emptyMessage: "No prompt templates found.",
} satisfies AdminCollectionDefinition;

export const PLAN_COLLECTION = {
  key: "plans",
  label: "Plans",
  singularLabel: "Plan",
  subtitle: "Create and edit sellable packs.",
  searchPlaceholder: "",
  emptyMessage: "No plans yet.",
} satisfies AdminCollectionDefinition;

export const RESOURCE_KIND_OPTIONS: Array<{ value: KnowledgeResourceKind; label: string }> = [
  { value: "syllabus", label: "Syllabus" },
  { value: "study_material", label: "Study material" },
  { value: "question_bank", label: "Question bank" },
];

export const RESOURCE_SUBTYPE_OPTIONS: Record<
  KnowledgeResourceKind,
  Array<{ value: KnowledgeDocumentType; label: string }>
> = {
  syllabus: [
    { value: "curriculum", label: "Curriculum" },
    { value: "syllabus", label: "Syllabus" },
    { value: "micro_syllabus", label: "Micro-syllabus" },
    { value: "learning_outcomes", label: "Learning outcomes" },
  ],
  study_material: [
    { value: "textbook", label: "Textbook" },
    { value: "notes", label: "Notes" },
    { value: "solutions", label: "Solutions" },
    { value: "guides", label: "Guides" },
    { value: "other", label: "Other" },
  ],
  question_bank: [
    { value: "question_bank", label: "Question bank" },
    { value: "past_questions", label: "Past questions" },
    { value: "example_questions", label: "Example questions" },
    { value: "other", label: "Other" },
  ],
};
