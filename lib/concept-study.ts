import { z } from "zod";

export const studyWorkSchema = z.object({
  answer: z.string().max(12000).default(""),
  selected: z.number().int().min(-1).max(100).default(-1),
  correct: z.boolean().nullable().default(null),
  attempts: z.number().int().min(0).max(100000).default(0),
  visible: z.number().int().min(1).max(12).default(1),
  seen: z.array(z.string().max(40)).max(20).default([]),
  checked: z.array(z.number().int().min(0).max(20)).max(20).default([]),
  values: z.record(z.number().finite()).default({}),
  baseline: z.record(z.number().finite()).default({}),
  parameter: z.string().max(40).default(""),
  prediction: z.enum(["increase", "decrease", "same"]).nullable().default(null),
  committed: z.boolean().default(false),
  revealed: z.boolean().default(false),
  confidence: z.enum(["unrated", "review", "ready"]).default("unrated"),
});
export type StudyWork = z.infer<typeof studyWorkSchema>;
export const emptyStudyWork = (): StudyWork => studyWorkSchema.parse({});

export function readStudyWork(value: string | null): StudyWork {
  try {
    const parsed = studyWorkSchema.safeParse(JSON.parse(value || "{}"));
    return parsed.success ? parsed.data : emptyStudyWork();
  } catch {
    return emptyStudyWork();
  }
}

export function observedTrend(
  before: number,
  after: number,
  inputBefore: number,
  inputAfter: number,
): "increase" | "decrease" | "same" | null {
  if (
    ![before, after, inputBefore, inputAfter].every(Number.isFinite) ||
    inputBefore === inputAfter
  )
    return null;
  if (Math.abs(after - before) <= Math.max(1, Math.abs(before), Math.abs(after)) * 1e-9)
    return "same";
  return (after - before) / (inputAfter - inputBefore) > 0 ? "increase" : "decrease";
}
