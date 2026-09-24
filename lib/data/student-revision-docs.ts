import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeQuestionText } from "@/lib/challenge-learn-questions";
import {
  courseLearningTopicsKey,
  readCourseLearningTopicsBatch,
  type CommunityLearningTopic,
} from "@/lib/data/community-learning-topics";
import { unitsStartAtOne } from "@/lib/unit-numbering";
import { choiceQuestionsOf, openExplanation, unsealAnswer } from "@/lib/data/challenge-exam-format";
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
  /** Why the reading could not be written, the last time it was asked for. */
  readingError: string;
  /** The one sentence the topic reduces to. "" on a challenge passed before the
   *  concept-led reading existed. */
  bigIdea: string;
  /** The reading itself, paragraph by paragraph, exactly as it was studied. */
  reading: string[];
  focus: string;
  connections: string[];
  pastQuestions: ChallengePastQuestion[];
  solvedExamples: ChallengeSolvedExample[];
  /** An MCQ community's paper, answers open. */
  mcqs: RevisionDocMcq[];
};

/** One MCQ off the topic's paper, with its answer opened for revision. */
export type RevisionDocMcq = {
  id: string;
  question: string;
  options: { key: string; text: string }[];
  /** "" while the paper is still being sat and this one is unanswered: its key
   *  is not opened until the student has answered it or finished the paper. */
  correct: string;
  /** What the student chose, or null when they left it. */
  picked: string | null;
  explanation: string;
};

export type RevisionDocUnit = {
  /** The syllabus's own numbering, or "" for topics it does not place. */
  unitNumber: string;
  label: string;
  /** The unit's name from the syllabus ("Basic Circuit Concepts"), or "" when the
   *  catalogue does not carry one — a subject synced before names were. */
  title: string;
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

/**
 * The past questions a page lists, minus the ones it also shows WORKED.
 *
 * The same question comes back from two sources — the bank row, and the worked
 * copy with its solution — so a page listed "What is Mechanics? Define Rigid
 * body and Deform body" as Question 1 and again as Example 1. The worked copy is
 * the same question with more on it, so it is the one kept. Matched the way the
 * challenge screen matches the two (`normalizeQuestionText`), so both screens
 * agree on what counts as the same question.
 */
function unworkedPastQuestions(content: StudentChallengeContent | null) {
  const worked = new Set(
    (content?.solvedExamples ?? []).map((example) => normalizeQuestionText(example.question || "")),
  );
  return (content?.pastQuestions ?? []).filter(
    (question) => !worked.has(normalizeQuestionText(question.question || "")),
  );
}

/**
 * The paper's MCQs, every one of them. A finished challenge opens all the keys;
 * an open one only those of questions already answered — the screen showed
 * those keys the moment they were picked, and the rest are still being sat, so
 * they are listed without an answer.
 */
function revisionMcqs(row: ChallengeRow, content: StudentChallengeContent | null): RevisionDocMcq[] {
  const challengeId = text(row.id);
  const picks = content?.examPicks ?? {};
  const finished = text(row.status) === "completed";
  return choiceQuestionsOf(content?.examQuestions ?? []).map((question) => {
    const open = finished || Boolean(picks[question.id]);
    return {
      id: question.id,
      question: question.question,
      options: question.options.map((option) => ({ key: option.key, text: option.text })),
      correct: open ? unsealAnswer(challengeId, question) : "",
      picked: picks[question.id] ?? null,
      explanation: open ? openExplanation(question.explanationSealed) : "",
    };
  });
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
    readingError: content?.readingError || "",
    scorePercent: scorePercent(row),
    attempts: Number(row.attempt_count) || 0,
    bigIdea: content?.lesson?.bigIdea || "",
    reading,
    focus: content?.lesson?.focus || "",
    connections: content?.lesson?.connections ?? [],
    pastQuestions: unworkedPastQuestions(content),
    solvedExamples: content?.solvedExamples ?? [],
    mcqs: revisionMcqs(row, content),
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
  // Keyed by scope and unit NUMBER, not by topic: a topic the catalogue has
  // dropped is still filed under the unit stamped on its row, and that unit's
  // name is whatever its other topics say it is.
  const unitTitles = new Map<string, string>();
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
        const unitTitle = topic.unit_title?.trim();
        if (placement.unitNumber && unitTitle && !unitTitles.has(`${scope}:${placement.unitNumber}`)) {
          unitTitles.set(`${scope}:${placement.unitNumber}`, unitTitle);
        }
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
  return { placements, unitTitles };
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
      // An MCQ challenge files too — an MCQ-only community otherwise has an
      // empty Revision however much it has passed (user, 2026-09-24). It has no
      // solved questions, so its page carries the paper's MCQs, answers open.
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
  const { placements, unitTitles } = await unitsByTopicKey(usedSubjects, admin);

  // Semester → subject → unit, built by walking the rows once. Each level keeps
  // an index alongside its list so the walk stays linear rather than searching
  // the tree it is building.
  const semesters = new Map<string, RevisionDocSemester>();
  const subjectsByKey = new Map<string, RevisionDocSubject>();
  const unitsByKey = new Map<string, RevisionDocUnit>();
  const topicOrder = new Map<string, number>();
  let topicCount = 0;

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
        title: (unitNumber && unitTitles.get(`${key}:${unitNumber}`)) || "",
        topics: [],
      };
      unitsByKey.set(unitKey, unit);
      subject.units.push(unit);
    }

    // ONE ENTRY PER TOPIC, not per challenge. A topic is sat more than once —
    // passed, then assigned again on a later day or restarted — and each sitting
    // is its own row, so the tree listed "Definitions and scope of Applied
    // Mechanics" twice under one unit. Same topic means the same key, or the
    // same title in the same unit (a re-read syllabus can re-key a topic without
    // renaming it). Two "Introduction"s in DIFFERENT units stay two topics.
    const topic = docTopic(row, subject.name);
    const titleKey = matchKey(topic.title);
    const twin = unit.topics.findIndex(
      (other) => (topic.topicKey && other.topicKey === topic.topicKey) || matchKey(other.title) === titleKey,
    );
    const order = placement?.position ?? Number.MAX_SAFE_INTEGER;
    if (twin >= 0) {
      const kept = unit.topics[twin];
      // Every sitting counts toward the attempts the page reports.
      const attempts = kept.attempts + topic.attempts;
      // Rows arrive newest first, so the one kept is already the latest — unless
      // it is still in progress and this one was passed. A passed sitting is the
      // one the page vouches for, and it carries the full reading.
      if (kept.inProgress && !topic.inProgress) {
        unit.topics[twin] = { ...topic, attempts };
        topicOrder.set(`${unitKey}:${topic.topicKey}`, order);
      } else {
        kept.attempts = attempts;
      }
      continue;
    }
    unit.topics.push(topic);
    topicOrder.set(`${unitKey}:${text(row.topic_key)}`, order);
    subject.topicCount += 1;
    semester.topicCount += 1;
    topicCount += 1;
  }

  // A subject whose syllabus does not count its units from 1 (a licence
  // subject that is chapter 7 of a larger syllabus) names none of them: one
  // list, in syllabus order, as the Library shows it. Judged on the whole
  // catalogue, not the units filed so far, so passing only Unit 3 of an
  // ordinary subject does not hide its numbering.
  const catalogueUnits = new Map<string, string[]>();
  for (const [placementKey, placement] of placements) {
    // Keys are `${courseId}:${slug}:…` — the scope is their first two parts.
    const scope = placementKey.split(":").slice(0, 2).join(":");
    const units = catalogueUnits.get(scope) ?? [];
    units.push(placement.unitNumber);
    catalogueUnits.set(scope, units);
  }
  for (const [subjectKey, subject] of subjectsByKey) {
    const scope = scopeKey(subject.courseId, subject.subjectSlug);
    const numbers = catalogueUnits.get(scope) ?? subject.units.map((unit) => unit.unitNumber);
    if (unitsStartAtOne(numbers)) continue;
    const topics = subject.units.flatMap((unit) => unit.topics);
    for (const unit of subject.units) {
      for (const topic of unit.topics) {
        const order = topicOrder.get(`${subjectKey}:${unit.unitNumber}:${topic.topicKey}`);
        if (order !== undefined) topicOrder.set(`${subjectKey}:${UNPLACED_UNIT}:${topic.topicKey}`, order);
      }
    }
    subject.units = topics.length ? [{ unitNumber: UNPLACED_UNIT, label: "", title: "", topics }] : [];
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
    // Topics, not rows: a topic sat twice is one page in these docs.
    topicCount,
    unavailable: false,
  };
}
