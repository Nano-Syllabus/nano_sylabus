import { z } from "zod";

export const communityVisibility = ["public", "unlisted", "private"] as const;

export const communityInputSchema = z
  .object({
    name: z.string().trim().min(3, "Community name is required.").max(120),
    university: z.string().trim().min(2, "University is required.").max(160),
    faculty: z.string().trim().min(2, "Faculty or programme is required.").max(160),
    description: z.string().trim().max(1200).default(""),
    totalYears: z.number().int().min(1, "Add at least one year.").max(10),
    totalSemesters: z.number().int().min(1, "Add at least one semester.").max(40),
    visibility: z.enum(communityVisibility).default("public"),
  })
  .superRefine((value, context) => {
    if (value.totalSemesters < value.totalYears) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalSemesters"],
        message: "Semester count cannot be lower than the year count.",
      });
    }
    if (value.totalSemesters > value.totalYears * 4) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalSemesters"],
        message: "Use at most four semesters per year.",
      });
    }
  });

export const communitySubjectInputSchema = z.object({
  termId: z.string().uuid("Choose a valid semester."),
  subjectSlug: z
    .string()
    .trim()
    .min(1, "Choose a subject from Creator Workspace.")
    .max(160)
    .refine((value) => !/[\\/\u0000-\u001f]/.test(value), "Choose a valid subject."),
});

export type CommunityInput = z.infer<typeof communityInputSchema>;
export type CommunitySubjectInput = z.infer<typeof communitySubjectInputSchema>;

export type CreatorSubjectOption = {
  slug: string;
  name: string;
  folderPath: string;
  code: string;
  university: string;
  programme: string;
  attachedTermId: string | null;
};

export type CommunityMembership = {
  role: "creator" | "member";
  status: "active" | "left";
  joinedAt: string;
  currentTermId?: string | null;
};

export type CommunitySubject = {
  id: string;
  termId: string;
  slug: string;
  name: string;
  code: string;
  description: string;
  position: number;
  teacherId: string | null;
  externalSubjectSlug: string | null;
  folderPath: string;
  publicationStatus: "draft" | "published";
  publishedAt: string | null;
  topicSyncStatus: "pending" | "ready" | "empty" | "error";
  topicSyncedAt: string | null;
};

export type CommunityTerm = {
  id: string;
  yearNumber: number;
  semesterNumber: number;
  semesterInYear: number;
  position: number;
  subjects: CommunitySubject[];
};

export type CommunitySummary = {
  id: string;
  creatorId: string;
  slug: string;
  name: string;
  university: string;
  faculty: string;
  description: string;
  totalYears: number;
  totalSemesters: number;
  visibility: (typeof communityVisibility)[number];
  status: "active" | "archived";
  contributionThreshold: number;
  studyCourseId: string | null;
  learningStatus: "pending" | "ready" | "error";
  learningError: string | null;
  memberCount: number;
  subjectCount: number;
  membership: CommunityMembership | null;
  createdAt: string;
  updatedAt: string;
};

export type CommunityDetail = CommunitySummary & {
  terms: CommunityTerm[];
  canManage: boolean;
};

/**
 * Resolve the active learner workspace. A creator is already an active member
 * of every community they own, so creator memberships are valid learner
 * scopes too. The one externally joined community remains the default when it
 * exists; an explicit slug lets the creator open one of their own communities.
 */
export function selectStudentCommunity<
  T extends {
    slug?: string;
    membership: Pick<CommunityMembership, "role" | "status"> | null;
  },
>(communities: T[], preferredSlug?: string | null): T | null {
  const active = communities.filter(
    (community) => community.membership?.status === "active",
  );
  const normalizedPreferred = preferredSlug?.trim().toLowerCase();
  if (normalizedPreferred) {
    const preferred = active.find(
      (community) => community.slug?.trim().toLowerCase() === normalizedPreferred,
    );
    if (preferred) return preferred;
  }
  return (
    active.find((community) => community.membership?.role === "member") || active[0] || null
  );
}

export function communitySlug(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "community"
  );
}

export function generateCommunityTerms(totalYears: number, totalSemesters: number) {
  return Array.from({ length: totalSemesters }, (_, index) => {
    const semesterNumber = index + 1;
    const yearNumber = Math.floor((index * totalYears) / totalSemesters) + 1;
    const precedingInYear = Array.from(
      { length: index },
      (__, precedingIndex) => Math.floor((precedingIndex * totalYears) / totalSemesters) + 1,
    ).filter((year) => year === yearNumber).length;
    return {
      yearNumber,
      semesterNumber,
      semesterInYear: precedingInYear + 1,
      position: index,
    };
  });
}

export function mapCommunitySummary(
  row: Record<string, unknown>,
  memberCount = 0,
  subjectCount = 0,
  membership: Record<string, unknown> | null = null,
): CommunitySummary {
  return {
    id: String(row.id || ""),
    creatorId: String(row.creator_id || ""),
    slug: String(row.slug || ""),
    name: String(row.name || ""),
    university: String(row.university || ""),
    faculty: String(row.faculty || ""),
    description: String(row.description || ""),
    totalYears: Number(row.total_years) || 1,
    totalSemesters: Number(row.total_semesters) || 1,
    visibility: communityVisibility.includes(row.visibility as (typeof communityVisibility)[number])
      ? (row.visibility as CommunitySummary["visibility"])
      : "public",
    status: row.status === "archived" ? "archived" : "active",
    contributionThreshold: Number(row.contribution_threshold) || 10,
    studyCourseId: row.study_course_id ? String(row.study_course_id) : null,
    learningStatus:
      row.learning_status === "ready" || row.learning_status === "error"
        ? row.learning_status
        : "pending",
    learningError: row.learning_error ? String(row.learning_error) : null,
    memberCount,
    subjectCount,
    membership: membership
      ? {
          role: membership.role === "creator" ? "creator" : "member",
          status: membership.status === "left" ? "left" : "active",
          joinedAt: String(membership.joined_at || ""),
          currentTermId: membership.current_term_id ? String(membership.current_term_id) : null,
        }
      : null,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}
