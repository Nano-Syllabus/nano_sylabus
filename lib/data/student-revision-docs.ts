import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  courseLearningTopicsKey,
  readCourseLearningTopicsBatch,
  type CommunityLearningTopic,
} from "@/lib/data/community-learning-topics";
import {
  isMissingChallengeTable,
  isMissingColumn,
  type ChallengePastQuestion,
  type ChallengeSolvedExample,
  type StudentChallengeContent,
} from "@/lib/data/student-challenges";
import {
  listCreatorPrivateSubjectAccess,
  listStudentCommunitySubjectAccess,
  type StudentCourseSubjectAccess,
} from "@/lib/student-courses";

/**
 * THE REVISION DOCS: what the student has already proved, laid out to be re-read.
 *
 * A challenge is a one-way door while it is being sat — past questions, reading,
 * worked examples, exam — and once it is passed all of that material is thrown
 * away by the UI that produced it. It is the best explanation of that topic the
 * student will ever have been given, written from their own course's notes, and
 * they had no way back to it.
 *
 * So passing a challenge files its reading here, under the course's own shape:
 *
 *     Semester  →  Subject  →  Unit  →  Topic
 *
 * which is the shape of documentation, and is navigated like documentation. It is
 * NOT a syllabus browser: a topic appears once its challenge has been OPENED, and
 * never before, because the claim this page makes about every page in it is "you
 * have worked on this, here is what it said". An empty unit is a unit nothing has
 * been started in yet.
 *
 * Started counts, and is marked. The reading is written and stored by `/start`, so
 * a challenge in progress already has everything this page shows; withholding it
 * would hide precisely the topic the student is working on right now. `inProgress`
 * carries that distinction to the UI so a topic still open is never presented as
 * one already proved.
 *
 * NOTHING IS GENERATED HERE
 * -------------------------
 * Every field is read back off the stored challenge row. Opening the revision
 * docs costs no model call and no tenant API call for its content — only the unit
 * numbering is fetched, from the course's own published topic catalogue, and a
 * subject whose catalogue cannot be read still lists its topics (under
 * `UNPLACED_UNIT`) rather than losing them.
 *
 * ACCESS IS RE-CHECKED, NOT ASSUMED
 * ---------------------------------
 * A completed row is durable, but a student can leave the community that set it.
 * Challenges are therefore intersected with live subject access, the same rule
 * `requireChallengeAccess` applies when one is opened.
 */

/** Where a topic files when its course catalogue does not place it in a unit. */
const UNPLACED_UNIT = "";

/** Two topics in one subject share this title, so it identifies neither. */
const AMBIGUOUS_TITLE = { unitNumber: UNPLACED_UNIT, position: Number.MAX_SAFE_INTEGER };

export type RevisionDocTopic = {
  /** The challenge this was proved by. Shown, because it is the id a student
   *  quotes when a specific topic's material is wrong. */
  challengeId: string;
  topicKey: string;
  title: string;
  subjectName: string;
  completedAt: string;
  /** True while the challenge is still open. The material is real and worth
   *  re-reading either way, but the page must not claim a topic was proved when
   *  it was only started — that is the one thing these docs assert. */
  inProgress: boolean;
  /** Percentage of the paper, or null when the row predates score capture. */
  scorePercent: number | null;
  attempts: number;
  /** True when the reading for this topic is still being written — the challenge
   *  was opened, its lesson shell is on the row, and the background pass that
   *  fills it in has not landed yet. Distinct from an OLD challenge that simply
   *  never had a reading: one is "come back in a moment", the other is "restart
   *  it", and telling a student the wrong one of those wastes their time. */
  readingPending: boolean;
  /** The one sentence the topic reduces to. "" on a challenge passed before the
   *  concept-led reading existed. */
  bigIdea: string;
  /** The reading itself, paragraph by paragraph, exactly as it was studied. */
  reading: string[];
  focus: string;
  connections: string[];
  pastQuestions: ChallengePastQuestion[];
  solvedExamples: ChallengeSolvedExample[];
};

export type RevisionDocUnit = {
  /** The syllabus's own numbering, or "" for topics it does not place. */
  unitNumber: string;
  label: string;
  topics: RevisionDocTopic[];
};

export type RevisionDocSubject = {
  courseId: string;
  subjectSlug: string;
  name: string;
  topicCount: number;
  units: RevisionDocUnit[];
};

export type RevisionDocSemester = {
  /** Stable across renders so the client can key its open/closed state on it. */
  id: string;
  label: string;
  yearNumber: number;
  semesterNumber: number;
  position: number;
  topicCount: number;
  subjects: RevisionDocSubject[];
};

export type StudentRevisionDocs = {
  semesters: RevisionDocSemester[];
  topicCount: number;
  /** True when the challenge table itself is absent — a deployment that has not
   *  run the migration, which is a different thing from having revised nothing. */
  unavailable: boolean;
};

type ChallengeRow = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function scopeKey(courseId: string, subjectSlug: string) {
  return `${courseId}:${subjectSlug.trim().toLowerCase()}`;
}

/** Case-folded identity for a subject or topic name, matched the way
 *  `getStudentCourseSubjectAccess` matches one. Named for what it produces
 *  rather than `subjectKey`, which the walk below already uses for a local. */
function matchKey(value: string) {
  return value.trim().toLowerCase();
}

function semesterLabel(term: NonNullable<StudentCourseSubjectAccess["term"]>) {
  return `Year ${term.yearNumber} · Semester ${term.semesterNumber}`;
}

function scorePercent(row: ChallengeRow) {
  const score = Number(row.last_score);
  const total = Number(row.last_total_marks);
  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(100, (score / total) * 100));
}

function docTopic(row: ChallengeRow, subjectName: string): RevisionDocTopic {
  const content = (row.content ?? null) as StudentChallengeContent | null;
  const reading = content?.lesson?.content ?? [];
  return {
    challengeId: text(row.id),
    topicKey: text(row.topic_key),
    title: text(row.topic_title) || text(row.title) || "Untitled topic",
    subjectName,
    completedAt: text(row.completed_at) || text(row.updated_at),
    inProgress: text(row.status) !== "completed",
    // `pending` is the challenge's own word for "the tail of this is still
    // building", set by `/start` and cleared by the background pass. Read it
    // rather than inferred from the empty reading, so a build that FAILED —
    // which also leaves the reading empty, but is not going to fill itself in —
    // is not presented as one still in flight.
    readingPending: !reading.length && content?.contentStatus === "pending",
    scorePercent: scorePercent(row),
    attempts: Number(row.attempt_count) || 0,
    bigIdea: content?.lesson?.bigIdea || "",
    reading,
    focus: content?.lesson?.focus || "",
    connections: content?.lesson?.connections ?? [],
    pastQuestions: content?.pastQuestions ?? [],
    solvedExamples: content?.solvedExamples ?? [],
  };
}

/**
 * Unit numbering for the subjects that actually have something filed.
 *
 * Fetched per subject, in parallel, and never allowed to fail the page: a course
 * whose catalogue is unreadable still shows its passed topics, unplaced. Losing
 * the reading because a unit label could not be looked up would be the wrong
 * trade by a wide margin.
 */
async function unitsByTopicKey(
  subjects: StudentCourseSubjectAccess[],
  admin: ReturnType<typeof createSupabaseAdminClient>,
) {
  const placements = new Map<string, { unitNumber: string; position: number }>();
  // One batch instead of a lookup per subject. Read individually this was a
  // `community_subjects` query and a topics read EACH, and Revision asks about
  // every subject a student has — the same round-trip pile-up the Challenge Hub
  // had, against the same two tables.
  //
  // The old per-subject `.catch(() => null)` degraded one subject to "no unit
  // placements"; a batch can only fail as a whole, so the catch does the same for
  // all of them. That is the pre-existing fallback either way: placements are a
  // refinement, and the caller already handles a topic having none.
  const batch = await readCourseLearningTopicsBatch(
    subjects.map((subject) => ({
      courseId: subject.courseId,
      teacherId: subject.teacherId,
      subjectSlug: subject.subjectSlug,
    })),
    admin,
  ).catch(() => new Map<string, CommunityLearningTopic[] | null>());
  await Promise.all(
    subjects.map(async (subject) => {
      const topics = batch.get(
        courseLearningTopicsKey({
          courseId: subject.courseId,
          teacherId: subject.teacherId,
          subjectSlug: subject.subjectSlug,
        }),
      ) ?? null;
      const scope = scopeKey(subject.courseId, subject.subjectSlug);
      for (const topic of topics ?? []) {
        const placement = {
          unitNumber: topic.unit_number ?? UNPLACED_UNIT,
          position: topic.position,
        };
        placements.set(`${scope}:${topic.topic_key}`, placement);
        // AND by title, because the key is not stable and the title is.
        //
        // `/start` overwrites a challenge's `topic_key` with whatever key the
        // provider resolved the topic to, and re-extracting a subject renumbers
        // those keys again — so the key a filed challenge carries frequently is
        // not the key the catalogue now lists it under, and the topic lands in
        // "Other topics" beside real syllabus units. A re-extraction that
        // renumbers keys almost never renames "Oscillation", which is the same
        // reasoning `startStudentChallenge` already retries a lost subtopic on.
        //
        // Set only if the title is not already taken: a title that appears twice
        // in one subject cannot identify a unit, and guessing between them would
        // file a topic under the wrong one, which is worse than "Other topics".
        const titleKey = `${scope}:title:${matchKey(topic.title)}`;
        placements.set(titleKey, placements.has(titleKey) ? AMBIGUOUS_TITLE : placement);
      }
    }),
  );
  return placements;
}

/** Everything the docs read off a challenge row, minus the unit. */
const DOC_COLUMNS =
  "id,course_id,subject_slug,subject_name,topic_key,topic_title,title,content,status," +
  "completed_at,updated_at,attempt_count,last_score,last_total_marks";

/**
 * The filed challenges, asked for WITH the stored unit and again without it.
 *
 * `unit_number` arrived with a migration, and code reaches a deployment before
 * its migration does. For that window the column does not exist and Postgres
 * answers 42703 — which took the entire Revision section down over a field whose
 * only job is to group topics that the live catalogue can usually place anyway.
 * One retry is the whole fix; the second query is the one this page ran for its
 * entire life before the column existed.
 */
async function readFiledChallenges(
  userId: string,
  admin: ReturnType<typeof createSupabaseAdminClient>,
) {
  const query = (columns: string) =>
    admin
      .from("student_challenges")
      .select(columns)
      .eq("user_id", userId)
      // Started, not just passed. The reading is written and stored the moment a
      // challenge is opened, so a student who is midway through one already HAS
      // the material this page exists to give back — refusing to show it until
      // they pass means the topic they are actively studying is the one topic
      // they cannot look up. A started row with no content yet is dropped below.
      .in("status", ["completed", "started"])
      // `completed_at` is null on a started row, and Postgres sorts nulls first on
      // DESC — which would file everything in progress above everything passed.
      // `updated_at` is set on both and means "last touched", which is the order
      // this page actually wants.
      .order("updated_at", { ascending: false });

  const withUnit = await query(`${DOC_COLUMNS},unit_number`);
  if (!isMissingColumn(withUnit.error)) return withUnit;
  console.warn(
    "[revision] student_challenges.unit_number is missing — placing topics from the " +
      "catalogue only. Run supabase/migrations/20260915120000_challenge_syllabus_unit.sql.",
  );
  return query(DOC_COLUMNS);
}

export async function getStudentRevisionDocs(userId: string): Promise<StudentRevisionDocs> {
  const admin = createSupabaseAdminClient();
  const [community, privateSubjects, completed] = await Promise.all([
    listStudentCommunitySubjectAccess(userId, admin),
    // A creator studying their own uploaded material has no community and no
    // course: their challenges carry `course_id = null` and are authorised by
    // subject alone. Leaving them out of this list is why those rows used to
    // vanish from the docs entirely while the Challenge Hub happily ran them —
    // `requireChallengeAccess` consults both, and so must this.
    listCreatorPrivateSubjectAccess(userId, admin).catch(() => []),
    readFiledChallenges(userId, admin),
  ]);

  if (isMissingChallengeTable(completed.error)) {
    return { semesters: [], topicCount: 0, unavailable: true };
  }
  if (completed.error) throw completed.error;

  const accessByScope = new Map(
    community.map((subject) => [scopeKey(subject.courseId, subject.subjectSlug), subject]),
  );
  // Community first, private second — the same precedence
  // `getStudentCourseSubjectAccess` applies when a challenge with no course is
  // opened, so a subject that is both resolves to the community copy here too.
  const accessBySlug = new Map(
    [...privateSubjects, ...community]
      .flatMap((subject) => [
        [matchKey(subject.subjectSlug), subject] as const,
        [matchKey(subject.subjectName), subject] as const,
      ])
      .filter(([key]) => Boolean(key)),
  );

  /**
   * The subject a filed challenge belongs to, or null if the student no longer
   * has it. A row that has lost its subject is dropped rather than rendered from
   * the durable copy: leaving a community must take its material with it,
   * exactly as opening the challenge itself would find.
   */
  function subjectFor(row: ChallengeRow) {
    const courseId = text(row.course_id);
    const slug = text(row.subject_slug);
    if (courseId) return accessByScope.get(scopeKey(courseId, slug)) ?? null;
    return accessBySlug.get(matchKey(slug)) ?? accessBySlug.get(matchKey(text(row.subject_name))) ?? null;
  }

  const rows = ((completed.data ?? []) as unknown as ChallengeRow[]).filter(
    (row) =>
      Boolean(subjectFor(row)) &&
      // Every field this page renders is read off `content`. A row without it —
      // a challenge assigned but never opened, or one whose `/start` has not
      // landed yet — would file an empty page under a real topic title, which
      // reads as "this topic taught you nothing" rather than "not yet".
      Boolean((row.content ?? null) as StudentChallengeContent | null),
  );
  if (!rows.length) return { semesters: [], topicCount: 0, unavailable: false };

  const usedSubjects = [
    ...new Map(
      rows.map((row) => {
        const subject = subjectFor(row) as StudentCourseSubjectAccess;
        return [scopeKey(subject.courseId, subject.subjectSlug), subject];
      }),
    ).values(),
  ];
  const placements = await unitsByTopicKey(usedSubjects, admin);

  // Semester → subject → unit, built by walking the rows once. Each level keeps
  // an index alongside its list so the walk stays linear rather than searching
  // the tree it is building.
  const semesters = new Map<string, RevisionDocSemester>();
  const subjectsByKey = new Map<string, RevisionDocSubject>();
  const unitsByKey = new Map<string, RevisionDocUnit>();
  const topicOrder = new Map<string, number>();

  for (const row of rows) {
    const subjectAccess = subjectFor(row);
    if (!subjectAccess) continue;
    const key = scopeKey(subjectAccess.courseId, subjectAccess.subjectSlug);

    const term = subjectAccess.term;
    const semesterId = term?.id || `unscheduled:${subjectAccess.courseId}`;
    let semester = semesters.get(semesterId);
    if (!semester) {
      semester = {
        id: semesterId,
        label: term ? semesterLabel(term) : "Not in a semester",
        yearNumber: term?.yearNumber ?? 0,
        semesterNumber: term?.semesterNumber ?? 0,
        // Unscheduled subjects sort last, after every real term.
        position: term?.position ?? Number.MAX_SAFE_INTEGER,
        topicCount: 0,
        subjects: [],
      };
      semesters.set(semesterId, semester);
    }

    const subjectKey = `${semesterId}:${key}`;
    let subject = subjectsByKey.get(subjectKey);
    if (!subject) {
      subject = {
        courseId: subjectAccess.courseId,
        subjectSlug: subjectAccess.subjectSlug,
        name: subjectAccess.subjectName || text(row.subject_name),
        topicCount: 0,
        units: [],
      };
      subjectsByKey.set(subjectKey, subject);
      semester.subjects.push(subject);
    }

    // Three ways to place a topic, best first. The catalogue is live and moves
    // when a teacher renumbers a unit, so it wins; its title index catches the
    // rows whose key `/start` rewrote; and the unit stamped on the row at
    // assignment is what survives when the catalogue has dropped the topic
    // altogether — a unit re-read into its own bullets, for instance.
    const placement =
      placements.get(`${key}:${text(row.topic_key)}`) ??
      placements.get(`${key}:title:${matchKey(text(row.topic_title) || text(row.title))}`);
    const unitNumber = placement?.unitNumber || text(row.unit_number) || UNPLACED_UNIT;
    const unitKey = `${subjectKey}:${unitNumber}`;
    let unit = unitsByKey.get(unitKey);
    if (!unit) {
      unit = {
        unitNumber,
        label: unitNumber ? `Unit ${unitNumber}` : "Other topics",
        topics: [],
      };
      unitsByKey.set(unitKey, unit);
      subject.units.push(unit);
    }

    unit.topics.push(docTopic(row, subject.name));
    topicOrder.set(
      `${unitKey}:${text(row.topic_key)}`,
      placement?.position ?? Number.MAX_SAFE_INTEGER,
    );
    subject.topicCount += 1;
    semester.topicCount += 1;
  }

  // Curriculum order everywhere it is known: a revision doc that lists Unit 7
  // before Unit 2 is a list of things that happened, not documentation.
  for (const [subjectKey, subject] of subjectsByKey) {
    subject.units.sort((left, right) => {
      if (!left.unitNumber) return 1;
      if (!right.unitNumber) return -1;
      return (
        Number(left.unitNumber) - Number(right.unitNumber) ||
        left.unitNumber.localeCompare(right.unitNumber)
      );
    });
    for (const unit of subject.units) {
      const unitKey = `${subjectKey}:${unit.unitNumber}`;
      unit.topics.sort(
        (left, right) =>
          (topicOrder.get(`${unitKey}:${left.topicKey}`) ?? 0) -
            (topicOrder.get(`${unitKey}:${right.topicKey}`) ?? 0) ||
          left.title.localeCompare(right.title),
      );
    }
  }

  const ordered = [...semesters.values()].sort(
    (left, right) => left.position - right.position || left.label.localeCompare(right.label),
  );
  for (const semester of ordered) {
    semester.subjects.sort((left, right) => left.name.localeCompare(right.name));
  }

  return {
    semesters: ordered,
    topicCount: rows.length,
    unavailable: false,
  };
}
