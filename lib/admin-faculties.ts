import { z } from "zod";
import {
  communityLevels,
  communityNameSchema,
  communityVisibility,
  canonicalUniversity,
  communitySubjectInputSchema,
} from "@/lib/communities";
import { validSubjectName } from "@/lib/teacher-subject-name";

export const facultyUpdateSchema = z.object({
  name: communityNameSchema,
  university: z.string().trim().min(2).max(160).transform(canonicalUniversity),
  faculty: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1200),
  level: z.enum(communityLevels),
  visibility: z.enum(communityVisibility),
  status: z.enum(["active", "archived"]),
});
export const subjectCreateSchema = z
  .object({
    termId: z.string().uuid(),
    subjectSlug: communitySubjectInputSchema.shape.subjectSlug.optional(),
    name: z
      .string()
      .transform(validSubjectName)
      .refine((value) => value.length >= 2, "Enter a valid subject name without slashes.")
      .optional(),
    code: z.string().trim().max(40).default(""),
  })
  .refine(
    (value) => Boolean(value.subjectSlug || value.name),
    "Choose an existing subject or enter a name.",
  );
export const subjectUpdateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish") }),
  z.object({
    action: z.literal("save"),
    name: z.string().trim().min(2).max(120),
    code: z.string().trim().max(40),
    description: z.string().trim().max(800),
    termId: z.string().uuid(),
    position: z.number().int().min(0).max(10000),
    status: z.enum(["active", "archived"]),
    publicationStatus: z.enum(["draft", "published"]),
  }),
]);

export type AdminFacultySummary = {
  id: string;
  slug: string;
  name: string;
  faculty: string;
  university: string;
  level: string;
  visibility: "public" | "unlisted" | "private";
  status: "active" | "archived";
};
export type AdminFacultyDetail = AdminFacultySummary & {
  description: string;
  totalYears: number;
  totalSemesters: number;
  terms: Array<{ id: string; yearNumber: number; semesterNumber: number }>;
  subjects: Array<{
    id: string;
    name: string;
    code: string;
    description: string;
    termId: string;
    position: number;
    status: "active" | "archived";
    publicationStatus: "draft" | "published";
    externalSubjectSlug: string | null;
  }>;
  availableSubjects: Array<{ slug: string; name: string }>;
};
