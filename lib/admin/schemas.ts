import { z } from "zod";
import type { AdminAnswerFilter, KnowledgeDocumentType, KnowledgeResourceKind } from "@/lib/types";

export const knowledgeResourceKinds = ["syllabus", "study_material", "question_bank"] as const;
export const knowledgeDocumentTypes = [
  "micro_syllabus",
  "curriculum",
  "syllabus",
  "learning_outcomes",
  "textbook",
  "notes",
  "solutions",
  "guides",
  "question_bank",
  "past_questions",
  "example_questions",
  "other",
] as const satisfies readonly KnowledgeDocumentType[];

export const notebookInputSchema = z.object({
  title: z.string().trim().min(1),
  board: z.string().trim().min(1),
  level: z.string().trim().min(1),
  faculty: z.string().trim().default(""),
  subject: z.string().trim().min(1),
  curriculum: z.string().trim().default(""),
  description: z.string().trim().default(""),
});

export const knowledgeDocumentInputSchema = z.object({
  notebookId: z.string().trim().min(1),
  board: z.string().trim().min(1),
  grade: z.string().trim().min(1),
  faculty: z.string().trim().default(""),
  curriculum: z.string().trim().default(""),
  subject: z.string().trim().min(1),
  chapter: z.string().trim().nullable().optional(),
  resourceKind: z.enum(knowledgeResourceKinds),
  resourceSubtype: z.enum(knowledgeDocumentTypes),
  title: z.string().trim().min(1),
  sourceName: z.string().trim().min(1),
  sourceType: z.string().trim().min(1),
  rawContent: z.string().trim().min(1),
});

export const userRoleUpdateSchema = z.object({
  role: z.enum(["student", "admin"]),
});

export const userCreditAdjustmentSchema = z.object({
  amount: z.number().int().min(-5000).max(5000),
  description: z.string().trim().min(1).max(180),
});

export const bulkUserActionSchema = z.object({
  action: z.literal("set_role"),
  role: z.enum(["student", "admin"]),
  userIds: z.array(z.string().uuid()).min(1).max(200),
});

export const answerReviewUpdateSchema = z.object({
  reviewed: z.boolean().optional(),
  adminReviewNote: z.string().trim().max(4000).nullable().optional(),
});

export const bulkAnswerActionSchema = z.object({
  action: z.enum(["mark_reviewed", "mark_open"]),
  messageIds: z.array(z.string().uuid()).min(1).max(200),
  adminReviewNote: z.string().trim().max(4000).optional(),
});

export const bulkKnowledgeActionSchema = z.object({
  action: z.enum(["process"]),
  documentIds: z.array(z.string().uuid()).min(1).max(100),
});

export function parseAnswerFilter(value: string | null): AdminAnswerFilter {
  if (value === "flagged" || value === "reviewed" || value === "liked" || value === "neutral" || value === "all") {
    return value;
  }
  return "flagged";
}
