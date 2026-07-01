import { z } from "zod";
import type { AdminAnswerFilter } from "@/lib/types";

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

export function parseAnswerFilter(value: string | null): AdminAnswerFilter {
  if (value === "flagged" || value === "reviewed" || value === "liked" || value === "neutral" || value === "all") {
    return value;
  }
  return "flagged";
}
