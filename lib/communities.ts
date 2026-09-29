import { z } from "zod";
import { challengeQuestionFormats } from "@/lib/challenge-format";

export const communityVisibility = ["public", "unlisted", "private"] as const;

/** What a faculty prepares students for; chosen by the creator, filtered on in Browse. */
export const communityLevels = ["+2", "Bachelor", "Master", "Entrance", "License"] as const;
export type CommunityLevel = (typeof communityLevels)[number];

export function isCommunityLevel(value: unknown): value is CommunityLevel {
  return typeof value === "string" && (communityLevels as readonly string[]).includes(value);
}

/**
 * How a level is laid out. +2 is always Class 11 and Class 12; Bachelor and
 * Master run year-wise or semester-wise; Entrance and License are one MCQ
 * track with no years at all.
 */
export type CommunityLevelStructure = "classes" | "years-or-semesters" | "single-track";

export function communityLevelStructure(level: string): CommunityLevelStructure | null {
  if (level === "+2") return "classes";
  if (level === "Bachelor" || level === "Master") return "years-or-semesters";
  if (level === "Entrance" || level === "License") return "single-track";
  return null;
}

/** The only question format a single-track (Entrance, License) faculty can use. */
export function communityLevelLockedFormat(level: string) {
  return communityLevelStructure(level) === "single-track" ? ("mcq" as const) : null;
}

/** Where a level's structure starts when the creator picks it. */
export function communityLevelDefaults(level: string) {
  if (level === "+2") return { totalYears: 2, totalSemesters: 2 };
  if (level === "Master") return { totalYears: 2, totalSemesters: 4 };
  if (level === "Entrance" || level === "License") return { totalYears: 1, totalSemesters: 1 };
  return { totalYears: 4, totalSemesters: 8 };
}

type TermLayoutCommunity = {
  level?: string | null;
  name?: string;
  faculty?: string;
  totalYears: number;
  totalSemesters: number;
};

/**
 * How a faculty's terms read. +2 is "Class 11/12", Entrance and License are one
 * track with no terms at all, and a Bachelor or Master is year-wise when it has
 * one term per year. A faculty from before `level` was stored falls back to the
 * same guess Browse uses, so an old "Loksewa licence" faculty is still one track.
 */
export function communityTermLayout(
  community: TermLayoutCommunity,
): "single-track" | "classes" | "years" | "semesters" {
  const level = isCommunityLevel(community.level)
    ? community.level
    : community.name !== undefined && community.faculty !== undefined
      ? communityLevel({ level: null, name: community.name, faculty: community.faculty })
      : null;
  const structure = communityLevelStructure(level ?? "");
  if (structure === "single-track") return "single-track";
  if (structure === "classes") return "classes";
  if (community.totalSemesters <= community.totalYears) return "years";
  return "semesters";
}

/** False when there is nothing to pick: one track, or a single term. */
export function communityHasTermChoice(community: TermLayoutCommunity & { terms?: unknown[] }) {
  if (communityTermLayout(community) === "single-track") return false;
  const count = community.terms ? community.terms.length : community.totalSemesters;
  return count > 1;
}

/** "Class", "Year" or "Semester" — for "Running Semester", "Choose Class"… Null for one track. */
export function communityTermNoun(community: TermLayoutCommunity) {
  const layout = communityTermLayout(community);
  if (layout === "single-track") return null;
  if (layout === "classes") return "Class";
  if (layout === "years") return "Year";
  return "Semester";
}

function ordinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

/**
 * What one term is called for this faculty: "Class 11", "Year 2", "Semester 3",
 * or "All subjects" for a single-track faculty. Year-wise faculties have one
 * term per year, so the year is the name. `short` gives "2nd Year" / "3rd
 * Semester", the form the pickers show; `full` gives "Year 2 · Semester 3" for
 * a semester-wise faculty, where the year adds something.
 */
export function communityTermName(
  community: TermLayoutCommunity,
  term: { yearNumber: number; semesterNumber: number },
  form: "plain" | "short" | "full" = "plain",
) {
  const layout = communityTermLayout(community);
  if (layout === "single-track") return "All subjects";
  if (layout === "classes") return `Class ${10 + term.yearNumber}`;
  if (layout === "years") return form === "short" ? `${ordinal(term.yearNumber)} Year` : `Year ${term.yearNumber}`;
  if (form === "short") return `${ordinal(term.semesterNumber)} Semester`;
  if (form === "full") return `Year ${term.yearNumber} · Semester ${term.semesterNumber}`;
  return `Semester ${term.semesterNumber}`;
}

/**
 * The stored level, or — for a faculty created before levels were stored, or a
 * database without the column yet — a guess from its name and programme.
 */
export function communityLevel(community: { level?: string | null; name: string; faculty: string }): CommunityLevel {
  if (isCommunityLevel(community.level)) return community.level;
  const text = `${community.name} ${community.faculty}`.toLowerCase();
  if (/licen[cs]e|liscen[cs]e|\blicen/.test(text)) return "License";
  if (text.includes("entrance")) return "Entrance";
  if (/\+2|plus two|\bneb\b|\b1[12]\b/.test(text)) return "+2";
  if (/master|\bmsc\b|\bmba\b|\bm\./.test(text)) return "Master";
  return "Bachelor";
}

/**
 * One spelling per university. Faculties were created as "TU", "Tribhuwan
 * University" and "Tribhuvan" — the same body three ways — which split the
 * browse filter; every alias now resolves to the official name.
 */
const universityAliases: [RegExp, string][] = [
  [/^(t\.?\s*u\.?|tribhu[vw]an(\s+university)?)$/i, "Tribhuvan University"],
  [/^(k\.?\s*u\.?|kathmandu(\s+university)?)$/i, "Kathmandu University"],
  [/^(p\.?\s*u\.?|pokhara(\s+university)?)$/i, "Pokhara University"],
  [/^(purbanchal(\s+university)?)$/i, "Purbanchal University"],
  [/^(n\.?\s*e\.?\s*b\.?|national\s+examinations?\s+board)$/i, "National Examination Board"],
];

export function canonicalUniversity(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return universityAliases.find(([pattern]) => pattern.test(trimmed))?.[1] ?? trimmed;
}

export const communityNameSchema = z
  .string()
  .trim()
  .min(3, "Community name is required.")
  .max(120, "Community name must be 120 characters or fewer.");

export const communityInputSchema = z
  .object({
    name: communityNameSchema,
    university: z
      .string()
      .trim()
      .min(2, "University is required.")
      .max(160)
      .transform(canonicalUniversity),
    faculty: z.string().trim().min(2, "Faculty or programme is required.").max(160),
    level: z.enum(communityLevels, {
      errorMap: () => ({ message: "Choose the level this faculty is for." }),
    }),
    description: z.string().trim().max(1200).default(""),
    totalYears: z.number().int().min(1, "Add at least one year.").max(10),
    totalSemesters: z.number().int().min(1, "Add at least one semester.").max(40),
    visibility: z.enum(communityVisibility).default("public"),
    /** Required on purpose: which questions every student's challenges ask is
     *  the creator's decision, so the form never picks it for them. */
    challengeQuestionFormat: z.enum(challengeQuestionFormats, {
      errorMap: () => ({ message: "Choose the type of challenge questions students get." }),
    }),
  })
  .superRefine((value, context) => {
    const structure = communityLevelStructure(value.level);
    if (structure === "classes" && (value.totalYears !== 2 || value.totalSemesters !== 2)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalYears"],
        message: "+2 runs as Class 11 and Class 12.",
      });
    }
    if (structure === "single-track") {
      if (value.totalYears !== 1 || value.totalSemesters !== 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["totalYears"],
          message: `${value.level} faculties have no years or semesters.`,
        });
      }
      if (value.challengeQuestionFormat !== "mcq") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["challengeQuestionFormat"],
          message: `${value.level} challenges are MCQ.`,
        });
      }
    }
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
  /** Null until the `level` column exists and has been set; use `communityLevel()`. */
  level: CommunityLevel | null;
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
    university: canonicalUniversity(String(row.university || "")),
    faculty: String(row.faculty || ""),
    level: isCommunityLevel(row.level) ? row.level : null,
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
