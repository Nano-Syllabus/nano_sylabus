import { z } from "zod";
import type { TeacherPublicProfile } from "@/lib/teacher-public-profile";

export const teacherCourseCategories = [
  "Loksewa",
  "Entrance",
  "Banking",
  "Language",
  "School",
  "License",
] as const;

export const teacherCourseLevels = ["Beginner", "Intermediate", "Advanced"] as const;

export const teacherCourseInputSchema = z
  .object({
    name: z.string().trim().min(3, "Course name is required.").max(120),
    shortName: z.string().trim().max(60).default(""),
    category: z.enum(teacherCourseCategories),
    authority: z.string().trim().min(2, "Conducting authority is required.").max(120),
    tagline: z.string().trim().min(10, "Add a short course promise.").max(180),
    description: z
      .string()
      .trim()
      .min(30, "Describe what this course prepares students for.")
      .max(1200),
    durationWeeks: z.number().int().min(1).max(104),
    level: z.enum(teacherCourseLevels),
    languageModes: z.array(z.enum(["English", "Nepali"])).min(1),
    accessModel: z.enum(["free", "paid"]),
    priceNpr: z.number().int().min(0).max(1_000_000),
    visibility: z.enum(["public", "unlisted", "private"]),
    diagnosticQuestionCount: z.number().int().min(5).max(100),
    dailyMinutes: z.number().int().min(5).max(240),
    passPercentage: z.number().min(0).max(100),
    negativeMarking: z.number().min(0).max(100),
    examDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid exam date.")
      .nullable()
      .default(null),
    outcomes: z.array(z.string().trim().min(2).max(180)).max(8).default([]),
    subjectSlugs: z
      .array(z.string().trim().min(1).max(200))
      .min(1, "Choose at least one indexed subject.")
      .refine((slugs) => new Set(slugs).size === slugs.length, "Choose each subject once."),
    status: z.enum(["draft", "published"]).default("draft"),
  })
  .superRefine((value, context) => {
    if (value.accessModel === "paid" && value.priceNpr < 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["priceNpr"],
        message: "Add a price for a paid course.",
      });
    }
    if (value.status === "published" && value.visibility === "private") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visibility"],
        message: "A published course cannot be private.",
      });
    }
  });

export type TeacherCourseInput = z.infer<typeof teacherCourseInputSchema>;

export type TeacherCourse = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  category: (typeof teacherCourseCategories)[number];
  authority: string;
  tagline: string;
  description: string;
  durationWeeks: number;
  level: (typeof teacherCourseLevels)[number];
  languageModes: ("English" | "Nepali")[];
  accessModel: "free" | "paid";
  priceNpr: number;
  visibility: "public" | "unlisted" | "private";
  status: "draft" | "published";
  diagnosticQuestionCount: number;
  dailyMinutes: number;
  passPercentage: number;
  negativeMarking: number;
  examDate: string | null;
  outcomes: string[];
  subjects: { slug: string; name: string; folderPath: string; position: number }[];
  sourceStats: {
    subjectCount: number;
    sourceFileCount: number;
    syllabusFileCount: number;
    notesFileCount: number;
    questionBankFileCount: number;
    totalBytes: number;
  };
  enrollmentCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  author: Omit<TeacherPublicProfile, "avatarPath"> & { handle: string };
};

export function teacherCourseSlug(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "course"
  );
}

export function teacherCourseRow(input: TeacherCourseInput) {
  return {
    name: input.name,
    short_name: input.shortName,
    category: input.category,
    authority: input.authority,
    tagline: input.tagline,
    description: input.description,
    duration_weeks: input.durationWeeks,
    level: input.level,
    language_modes: input.languageModes,
    access_model: input.accessModel,
    price_paisa: input.priceNpr * 100,
    visibility: input.visibility,
    status: input.status,
    diagnostic_question_count: input.diagnosticQuestionCount,
    daily_minutes: input.dailyMinutes,
    pass_percentage: input.passPercentage,
    negative_marking: input.negativeMarking,
    exam_date: input.examDate || null,
    outcomes: input.outcomes,
    updated_at: new Date().toISOString(),
    published_at: input.status === "published" ? new Date().toISOString() : null,
  };
}

export function mapTeacherCourse(
  row: Record<string, unknown>,
  subjects: Record<string, unknown>[],
  enrollmentCount: number,
  author: TeacherCourse["author"] = {
    handle: "teacher",
    displayName: "Course teacher",
    headline: "",
    bio: "",
    institution: "",
    location: "",
    expertise: [],
    yearsExperience: 0,
    website: "",
    avatarUrl: "",
    complete: false,
  },
  sourceStats?: TeacherCourse["sourceStats"],
): TeacherCourse {
  const mappedSubjects = subjects
    .map((subject) => ({
      slug: String(subject.subject_slug || ""),
      name: String(subject.subject_name || ""),
      folderPath: String(subject.folder_path || ""),
      position: Number(subject.position) || 0,
    }))
    .sort((a, b) => a.position - b.position);

  return {
    id: String(row.id || ""),
    slug: String(row.slug || ""),
    name: String(row.name || ""),
    shortName: String(row.short_name || ""),
    category: row.category as TeacherCourse["category"],
    authority: String(row.authority || ""),
    tagline: String(row.tagline || ""),
    description: String(row.description || ""),
    durationWeeks: Number(row.duration_weeks) || 12,
    level: row.level as TeacherCourse["level"],
    languageModes: Array.isArray(row.language_modes)
      ? (row.language_modes as TeacherCourse["languageModes"])
      : ["English"],
    accessModel: row.access_model === "paid" ? "paid" : "free",
    priceNpr: Math.round((Number(row.price_paisa) || 0) / 100),
    visibility: row.visibility as TeacherCourse["visibility"],
    status: row.status === "published" ? "published" : "draft",
    diagnosticQuestionCount: Number(row.diagnostic_question_count) || 10,
    dailyMinutes: Number(row.daily_minutes) || 20,
    passPercentage: Number(row.pass_percentage) || 0,
    negativeMarking: Number(row.negative_marking) || 0,
    examDate: typeof row.exam_date === "string" ? row.exam_date : null,
    outcomes: Array.isArray(row.outcomes) ? row.outcomes.map(String) : [],
    subjects: mappedSubjects,
    sourceStats: sourceStats || {
      subjectCount: mappedSubjects.length,
      sourceFileCount: 0,
      syllabusFileCount: 0,
      notesFileCount: 0,
      questionBankFileCount: 0,
      totalBytes: 0,
    },
    enrollmentCount,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    publishedAt: typeof row.published_at === "string" ? row.published_at : null,
    author,
  };
}
