import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readCourseLearningTopics } from "@/lib/data/community-learning-topics";
import {
  isMissingChallengeTable,
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

/** Subject identity for a challenge that carries no course, matched on slug or
 *  name the way `getStudentCourseSubjectAccess` matches one. */
function subjectKey(value: string) {
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
  await Promise.all(
    subjects.map(async (subject) => {
      const topics = await readCourseLearningTopics(
        subject.courseId,
        subject.teacherId,
        subject.subjectSlug,
        admin,
      ).catch(() => null);
      for (const topic of topics ?? []) {
        placements.set(`${scopeKey(subject.courseId, subject.subjectSlug)}:${topic.topic_key}`, {
          unitNumber: topic.unit_number ?? UNPLACED_UNIT,
          position: topic.position,
        });
      }
    }),
  );
  return placements;
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
    admin
      .from("student_challenges")
      .select(
        "id,course_id,subject_slug,subject_name,topic_key,topic_title,title,content,status," +
          "unit_number,completed_at,updated_at,attempt_count,last_score,last_total_marks",
      )
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
      .order("updated_at", { ascending: false }),
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
        [subjectKey(subject.subjectSlug), subject] as const,
        [subjectKey(subject.subjectName), subject] as const,
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
    return accessBySlug.get(subjectKey(slug)) ?? accessBySlug.get(subjectKey(text(row.subject_name))) ?? null;
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

    const placement = placements.get(`${key}:${text(row.topic_key)}`);
    // The catalogue's answer first — it is live, and it is the one that moves
    // when a teacher re-numbers a unit. The unit written onto the row at
    // assignment is the fallback, and it is what keeps a topic under its real
    // unit after `/start` has rewritten `topic_key` out from under the join.
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
