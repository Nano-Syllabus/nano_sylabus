"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type ExamTab = "take" | "history" | "map";
type ExamStage = "configure" | "started" | "submission" | "submitted" | "result";
type AnswerMode = "upload" | "type";
type TopicLevel = "uncovered" | "weak" | "mid" | "strong";
type QuestionType = "Short Answer" | "Long Answer" | "Numerical" | "Diagram";

export type ExamSubjectOption = {
  name: string;
  namespace: string;
  chunkCount: number;
};

type MockQuestion = {
  id: string;
  subject: string;
  topic: string;
  type: QuestionType;
  marks: number;
  prompt: string;
};

type GeneratedQuestion = MockQuestion & {
  number: number;
};

type EvaluationRow = {
  questionId: string;
  obtained: number;
  feedback: string;
  correction: string;
};

type ExamAttempt = {
  id: string;
  title: string;
  subject: string;
  marks: number;
  obtained: number;
  date: string;
  questions: GeneratedQuestion[];
  evaluation: EvaluationRow[];
};

type BlueprintBand = {
  label: string;
  count: number;
  marksEach: number;
};

const QUESTION_BANK: MockQuestion[] = [
  {
    id: "dl-1",
    subject: "Digital Logic",
    topic: "Number Systems",
    type: "Short Answer",
    marks: 5,
    prompt:
      "Explain the decimal, binary, octal, and hexadecimal number systems with suitable examples.",
  },
  {
    id: "dl-2",
    subject: "Digital Logic",
    topic: "Combinational Circuits",
    type: "Diagram",
    marks: 10,
    prompt:
      "Design a full adder using two half adders. Draw the block diagram and derive the output equations.",
  },
  {
    id: "dl-3",
    subject: "Digital Logic",
    topic: "Sequential Circuits",
    type: "Long Answer",
    marks: 10,
    prompt: "Explain an SR latch using NOR gates with a circuit diagram and truth table.",
  },
  {
    id: "dl-4",
    subject: "Digital Logic",
    topic: "Boolean Algebra",
    type: "Short Answer",
    marks: 5,
    prompt: "State De Morgan's theorems and verify each theorem using a truth table.",
  },
  {
    id: "dl-5",
    subject: "Digital Logic",
    topic: "Counters",
    type: "Diagram",
    marks: 10,
    prompt: "Draw and explain a 3-bit asynchronous ripple counter with its timing diagram.",
  },
  {
    id: "dl-6",
    subject: "Digital Logic",
    topic: "K-Map",
    type: "Numerical",
    marks: 5,
    prompt: "Minimize F(A,B,C,D) = Σm(0,2,5,7,8,10,13,15) using a Karnaugh map.",
  },
  {
    id: "dl-7",
    subject: "Digital Logic",
    topic: "Registers",
    type: "Long Answer",
    marks: 10,
    prompt: "Explain the operation of a universal shift register with a neat logic diagram.",
  },
  {
    id: "dl-8",
    subject: "Digital Logic",
    topic: "Logic Gates",
    type: "Short Answer",
    marks: 5,
    prompt: "Why are NAND and NOR gates called universal gates? Demonstrate one realization.",
  },
  {
    id: "ep-1",
    subject: "Engineering Physics",
    topic: "SHM",
    type: "Long Answer",
    marks: 10,
    prompt:
      "Derive the differential equation of simple harmonic motion and obtain its general solution.",
  },
  {
    id: "ep-2",
    subject: "Engineering Physics",
    topic: "Electromagnetism",
    type: "Numerical",
    marks: 5,
    prompt:
      "Use the Biot-Savart law to obtain the magnetic field due to a long straight conductor.",
  },
  {
    id: "ep-3",
    subject: "Engineering Physics",
    topic: "Oscillation",
    type: "Diagram",
    marks: 10,
    prompt:
      "Explain electrical oscillation in a series LCR circuit with the circuit diagram and governing equation.",
  },
  {
    id: "ep-4",
    subject: "Engineering Physics",
    topic: "Wave Motion",
    type: "Short Answer",
    marks: 5,
    prompt: "Differentiate between progressive and stationary waves using four suitable points.",
  },
  {
    id: "ep-5",
    subject: "Engineering Physics",
    topic: "Interference",
    type: "Long Answer",
    marks: 10,
    prompt: "Explain Young's double-slit experiment and derive the expression for fringe width.",
  },
  {
    id: "ep-6",
    subject: "Engineering Physics",
    topic: "Quantum Physics",
    type: "Numerical",
    marks: 5,
    prompt:
      "Calculate the de Broglie wavelength of an electron accelerated through a given potential difference.",
  },
  {
    id: "ep-7",
    subject: "Engineering Physics",
    topic: "Diffraction",
    type: "Long Answer",
    marks: 10,
    prompt: "Discuss Fraunhofer diffraction at a single slit and derive the condition for minima.",
  },
  {
    id: "ep-8",
    subject: "Engineering Physics",
    topic: "Polarization",
    type: "Short Answer",
    marks: 5,
    prompt: "Define polarization and explain how it establishes the transverse nature of light.",
  },
];

const SYLLABUS_TOPICS: Record<string, string[]> = {
  "Digital Logic": [
    "Number Systems",
    "Boolean Algebra",
    "Logic Gates",
    "Combinational Circuits",
    "K-Map",
    "Sequential Circuits",
    "Flip-Flops",
    "Counters",
    "Registers",
    "Memory",
  ],
  "Engineering Physics": [
    "SHM",
    "Oscillation",
    "Wave Motion",
    "Interference",
    "Diffraction",
    "Polarization",
    "Electromagnetism",
    "Quantum Physics",
  ],
};

function buildBlueprint(marks: number): BlueprintBand[] {
  const tenMarkQuestions = Math.floor(marks / 20);
  const remainingMarks = marks - tenMarkQuestions * 10;
  const fiveMarkQuestions = Math.max(1, Math.floor(remainingMarks / 5));

  const bands: BlueprintBand[] = [];
  if (fiveMarkQuestions > 0) {
    bands.push({
      label: "Short answer / numerical",
      count: fiveMarkQuestions,
      marksEach: 5,
    });
  }
  if (tenMarkQuestions > 0) {
    bands.push({
      label: "Long answer / diagram",
      count: tenMarkQuestions,
      marksEach: 10,
    });
  }

  const plannedMarks = bands.reduce((sum, band) => sum + band.count * band.marksEach, 0);
  if (plannedMarks < marks) {
    bands.push({
      label: "Applied question",
      count: 1,
      marksEach: marks - plannedMarks,
    });
  }
  return bands;
}

function generateQuestions(
  subject: string,
  marks: number,
  round: number,
  preferredTopics: string[] = [],
) {
  const source = QUESTION_BANK.filter((question) => question.subject === subject);
  const baseSource = source.length
    ? source
    : QUESTION_BANK.map((question) => ({ ...question, subject }));
  const preferredTopicSet = new Set(preferredTopics);
  const usableSource = [...baseSource].sort(
    (left, right) =>
      Number(preferredTopicSet.has(right.topic)) - Number(preferredTopicSet.has(left.topic)),
  );
  const fiveMarkPool = usableSource.filter((question) => question.marks === 5);
  const tenMarkPool = usableSource.filter((question) => question.marks === 10);
  const blueprint = buildBlueprint(marks);
  const picked: GeneratedQuestion[] = [];

  blueprint.forEach((band, bandIndex) => {
    const pool = band.marksEach <= 5 ? fiveMarkPool : tenMarkPool;
    for (let index = 0; index < band.count; index += 1) {
      const fallback = usableSource[(round + bandIndex + index) % usableSource.length];
      const next = pool.length
        ? pool[(round + bandIndex * 2 + index) % pool.length]
        : { ...fallback, marks: band.marksEach };
      picked.push({
        ...next,
        id: `${next.id}-${round}-${bandIndex}-${index}`,
        number: picked.length + 1,
      });
    }
  });

  return picked;
}

function mockEvaluate(questions: GeneratedQuestion[]) {
  return questions.map((question, index) => {
    const ratio = [0.8, 0.58, 0.92, 0.36][index % 4];
    const obtained = Math.max(1, Math.round(question.marks * ratio));
    return {
      questionId: question.id,
      obtained,
      feedback:
        ratio >= 0.75
          ? "Strong answer. The main concept and exam-worthy points are covered."
          : ratio >= 0.45
            ? "Partially correct. The core idea is present, but the explanation needs more structure."
            : "The answer misses essential steps and needs another focused revision.",
      correction:
        question.type === "Diagram"
          ? "Label every input and output, then explain the signal flow below the diagram."
          : question.type === "Numerical"
            ? "Write the formula first, substitute units clearly, and box the final result."
            : "Begin with a precise definition, use ordered key points, and finish with a short conclusion.",
    };
  });
}

function seedQuestions(subject: string, marks: number, round: number) {
  return generateQuestions(subject, marks, round);
}

const SEEDED_DIGITAL_LOGIC = seedQuestions("Digital Logic", 20, 1);
const SEEDED_ENGINEERING_PHYSICS = seedQuestions("Engineering Physics", 10, 2);
const SEEDED_HISTORY: ExamAttempt[] = [
  {
    id: "attempt-1",
    title: "Digital Logic practice set",
    subject: "Digital Logic",
    marks: 20,
    obtained: 15,
    date: "Jul 20",
    questions: SEEDED_DIGITAL_LOGIC,
    evaluation: mockEvaluate(SEEDED_DIGITAL_LOGIC),
  },
  {
    id: "attempt-2",
    title: "Engineering Physics quick test",
    subject: "Engineering Physics",
    marks: 10,
    obtained: 4,
    date: "Jul 18",
    questions: SEEDED_ENGINEERING_PHYSICS,
    evaluation: mockEvaluate(SEEDED_ENGINEERING_PHYSICS),
  },
];

function levelForScore(score: number, total: number): TopicLevel {
  if (total === 0) return "uncovered";
  const ratio = score / total;
  if (ratio >= 0.75) return "strong";
  if (ratio >= 0.45) return "mid";
  return "weak";
}

function levelClasses(level: TopicLevel) {
  if (level === "strong") return "border-success/40 bg-note-green text-success";
  if (level === "mid") return "border-warning/50 bg-note-yellow text-warning";
  if (level === "weak") return "border-destructive/40 bg-note-red text-destructive";
  return "border-border bg-bg-secondary text-text-muted";
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function Icon({
  name,
  className,
}: {
  name:
    | "exam"
    | "history"
    | "map"
    | "upload"
    | "check"
    | "spark"
    | "clock"
    | "arrow"
    | "print"
    | "refresh"
    | "file"
    | "edit";
  className?: string;
}) {
  const paths = {
    exam: (
      <>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M15 3v4h4" />
        <path d="M9 11h6" />
        <path d="M9 15h6" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    map: (
      <>
        <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
        <path d="M9 3v15" />
        <path d="M15 6v15" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4" />
        <path d="M7 9l5-5 5 5" />
        <path d="M5 20h14" />
      </>
    ),
    check: <path d="M20 6 9 17l-5-5" />,
    spark: (
      <>
        <path d="M12 3l1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8z" />
        <path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m14 7 5 5-5 5" />
      </>
    ),
    print: (
      <>
        <path d="M6 9V3h12v6" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M6 14h12v7H6z" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M4 17v-5h5" />
        <path d="M6.1 9a7 7 0 0 1 11.2-2L20 12" />
        <path d="M4 12l2.7 5a7 7 0 0 0 11.2-2" />
      </>
    ),
    file: (
      <>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M15 3v4h4" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
      </>
    ),
  } as const;

  return (
    <svg
      aria-hidden="true"
      className={cn("h-4 w-4 shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

const STAGE_STEPS = [
  { id: "configure", label: "Set paper" },
  { id: "started", label: "Write" },
  { id: "submission", label: "Submit" },
  { id: "result", label: "Result" },
] as const;

function stageIndex(stage: ExamStage) {
  if (stage === "submitted") return 2;
  return STAGE_STEPS.findIndex((step) => step.id === stage);
}

export function ExamPracticeClient({
  subjects,
  subjectLoadError,
}: {
  subjects: ExamSubjectOption[];
  subjectLoadError?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<ExamTab>("take");
  const [stage, setStage] = useState<ExamStage>("configure");
  const [subject, setSubject] = useState(subjects[0]?.name ?? "");
  const [marks, setMarks] = useState("20");
  const [duration, setDuration] = useState("60");
  const [title, setTitle] = useState("");
  const [coverage, setCoverage] = useState<"full" | "weak">("full");
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [generationRound, setGenerationRound] = useState(0);
  const [answerMode, setAnswerMode] = useState<AnswerMode>("upload");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [typedAnswers, setTypedAnswers] = useState<Record<string, string>>({});
  const [evaluation, setEvaluation] = useState<EvaluationRow[]>([]);
  const [history, setHistory] = useState<ExamAttempt[]>(SEEDED_HISTORY);
  const [secondsLeft, setSecondsLeft] = useState(Number(duration) * 60);
  const [submissionWasLate, setSubmissionWasLate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalMarks = Number(marks);
  const generatedMarks = questions.reduce((total, question) => total + question.marks, 0);
  const obtainedMarks = evaluation.reduce((total, row) => total + row.obtained, 0);
  const currentSubject = subjects.find((item) => item.name === subject);
  const blueprint = useMemo(() => buildBlueprint(totalMarks), [totalMarks]);
  const currentStep = stageIndex(stage);
  const navigableSteps = useMemo(() => {
    if (stage === "configure") return [0];
    if (stage === "started") return [0, 1];
    if (stage === "submission" || stage === "submitted") return [0, 1, 2];
    return [0, 1, 2, 3];
  }, [stage]);

  useEffect(() => {
    if (stage !== "started") return;
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setSubmissionWasLate(true);
          setStage("submission");
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  const topicScores = useMemo(() => {
    const result = new Map<string, { obtained: number; total: number }>();
    history.forEach((attempt) => {
      attempt.questions.forEach((question) => {
        const row = attempt.evaluation.find((item) => item.questionId === question.id);
        const current = result.get(question.topic) ?? { obtained: 0, total: 0 };
        current.obtained += row?.obtained ?? 0;
        current.total += question.marks;
        result.set(question.topic, current);
      });
    });
    return result;
  }, [history]);

  const subjectTopics =
    SYLLABUS_TOPICS[subject] ??
    Array.from(
      new Set(
        QUESTION_BANK.filter((question) => question.subject === subject).map(
          (question) => question.topic,
        ),
      ),
    );
  const coveredTopics = subjectTopics.filter(
    (topic) => (topicScores.get(topic)?.total ?? 0) > 0,
  ).length;
  const strongTopics = subjectTopics.filter((topic) => {
    const score = topicScores.get(topic);
    return score ? levelForScore(score.obtained, score.total) === "strong" : false;
  }).length;

  function handleGenerate() {
    if (!subject) return;
    const nextRound = generationRound + 1;
    const weakTopics =
      coverage === "weak"
        ? subjectTopics.filter((topic) => {
            const score = topicScores.get(topic);
            return score && levelForScore(score.obtained, score.total) !== "strong";
          })
        : [];
    const nextQuestions = generateQuestions(subject, totalMarks, nextRound, weakTopics);
    setGenerationRound(nextRound);
    setQuestions(nextQuestions);
    setEvaluation([]);
    setUploadedFile(null);
    setTypedAnswers({});
    setSecondsLeft(Number(duration) * 60);
    setSubmissionWasLate(false);
    setStage("started");
  }

  function handleSubmitAnswer() {
    if (secondsLeft === 0) {
      setSubmissionWasLate(true);
    }
    setStage("submitted");
  }

  function handleCheckAnswers() {
    const nextEvaluation = mockEvaluate(questions);
    const nextObtained = nextEvaluation.reduce((total, row) => total + row.obtained, 0);
    const nextAttempt: ExamAttempt = {
      id: `attempt-${Date.now()}`,
      title: title.trim() || `${subject} practice set`,
      subject,
      marks: generatedMarks,
      obtained: nextObtained,
      date: "Today",
      questions,
      evaluation: nextEvaluation,
    };
    setEvaluation(nextEvaluation);
    setHistory((current) => [nextAttempt, ...current]);
    setStage("result");
  }

  function resetExam() {
    setStage("configure");
    setQuestions([]);
    setUploadedFile(null);
    setTypedAnswers({});
    setEvaluation([]);
    setSubmissionWasLate(false);
  }

  function viewAttempt(attempt: ExamAttempt) {
    setSubject(attempt.subject);
    setQuestions(attempt.questions);
    setEvaluation(attempt.evaluation);
    setMarks(String(attempt.marks));
    setTitle(attempt.title);
    setStage("result");
    setTab("take");
  }

  const hasTypedAnswer = Object.values(typedAnswers).some((answer) => answer.trim().length > 0);
  const canSubmit = answerMode === "upload" ? Boolean(uploadedFile) : hasTypedAnswer;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pb-16 pt-3 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Exam practice
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-text-primary">
            Practice under real exam conditions
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
            Generate from indexed subjects, write on paper, upload your answer sheet, and turn weak
            topics green.
          </p>
        </div>
        <nav
          aria-label="Exam views"
          className="grid grid-cols-3 rounded-lg border border-border bg-bg-secondary p-1"
        >
          {[
            { id: "take", label: "Take exam", icon: "exam" },
            { id: "history", label: "History", icon: "history" },
            { id: "map", label: "Syllabus", icon: "map" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as ExamTab)}
              className={cn(
                "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
                tab === item.id
                  ? "bg-bg-primary text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              <Icon name={item.icon as "exam" | "history" | "map"} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </header>

      {tab === "take" ? (
        <main className="mt-5">
          <ExamProgress
            currentStep={currentStep}
            onStepSelect={(step) => {
              if (step === 0) {
                setStage("configure");
              } else if (step === 1 && questions.length) {
                setStage("started");
              } else if (step === 2 && questions.length) {
                setStage("submission");
              } else if (step === 3 && evaluation.length) {
                setStage("result");
              }
            }}
            navigableSteps={navigableSteps}
          />

          {stage === "configure" ? (
            <section className="mx-auto mt-6 max-w-4xl">
              <div className="border-b border-border pb-4">
                <h2 className="text-lg font-semibold">Build your question paper</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Choose an indexed subject and a realistic paper structure.
                </p>
              </div>

              {subjectLoadError ? (
                <div className="mt-5 flex flex-col gap-3 rounded-lg border border-destructive/40 bg-note-red p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-destructive">
                      Could not load tenant subjects
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">{subjectLoadError}</p>
                  </div>
                  <Button type="button" variant="outline" onClick={() => router.refresh()}>
                    <Icon name="refresh" />
                    Try again
                  </Button>
                </div>
              ) : null}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleGenerate();
                }}
                className="mt-5 space-y-6"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Paper title"
                    hint="Optional. We will use the subject name if left empty."
                  >
                    <Input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Digital Logic mock exam"
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Subject">
                    <Select
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      disabled={!subjects.length}
                    >
                      {subjects.length ? (
                        subjects.map((item) => (
                          <option key={item.name} value={item.name}>
                            {item.name}
                          </option>
                        ))
                      ) : (
                        <option value="">No subjects available</option>
                      )}
                    </Select>
                  </Field>
                  <Field label="Full marks">
                    <Select value={marks} onChange={(event) => setMarks(event.target.value)}>
                      {["10", "20", "25", "40", "80"].map((item) => (
                        <option key={item} value={item}>
                          {item} marks
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Exam duration">
                    <Select value={duration} onChange={(event) => setDuration(event.target.value)}>
                      {["30", "60", "90", "180"].map((item) => (
                        <option key={item} value={item}>
                          {item} minutes
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <fieldset>
                  <legend className="text-xs font-medium uppercase tracking-wider text-text-secondary">
                    Coverage
                  </legend>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <ChoiceButton
                      active={coverage === "full"}
                      title="Full syllabus"
                      description="Balanced questions across the indexed subject."
                      onClick={() => setCoverage("full")}
                    />
                    <ChoiceButton
                      active={coverage === "weak"}
                      title="Weak topics"
                      description="More questions from red and yellow topics."
                      onClick={() => setCoverage("weak")}
                    />
                  </div>
                </fieldset>

                <section
                  aria-labelledby="paper-blueprint-title"
                  className="rounded-lg border border-border"
                >
                  <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
                    <div>
                      <h3 id="paper-blueprint-title" className="text-sm font-semibold">
                        Paper blueprint
                      </h3>
                      <p className="mt-0.5 text-xs text-text-muted">
                        A clear marks distribution for this mock exam.
                      </p>
                    </div>
                    <span className="text-sm font-semibold">{totalMarks} marks</span>
                  </div>
                  <div className="divide-y divide-border">
                    {blueprint.map((band) => (
                      <div
                        key={`${band.label}-${band.marksEach}`}
                        className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3 text-sm"
                      >
                        <span className="font-medium">{band.label}</span>
                        <span className="text-text-secondary">{band.count} questions</span>
                        <span className="w-16 text-right text-text-secondary">
                          {band.marksEach} each
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-text-muted">
                    {currentSubject
                      ? `${currentSubject.namespace} · ${currentSubject.chunkCount} indexed chunks`
                      : "Subjects are loaded from the tenant API."}
                  </p>
                  <Button type="submit" size="lg" disabled={!subject}>
                    <Icon name="spark" />
                    Generate question set
                  </Button>
                </div>
              </form>
            </section>
          ) : null}

          {stage === "started" ? (
            <ExamInProgress
              title={title.trim() || `${subject} practice set`}
              subject={subject}
              questions={questions}
              marks={generatedMarks}
              secondsLeft={secondsLeft}
              onFinish={() => {
                setAnswerMode("upload");
                if (secondsLeft === 0) {
                  setSubmissionWasLate(true);
                }
                setStage("submission");
              }}
              onPrintQuestions={() => window.print()}
            />
          ) : null}

          {stage === "submission" ? (
            <SubmissionPanel
              questions={questions}
              answerMode={answerMode}
              onAnswerModeChange={setAnswerMode}
              uploadedFile={uploadedFile}
              onFileChange={setUploadedFile}
              fileInputRef={fileInputRef}
              typedAnswers={typedAnswers}
              onTypedAnswerChange={(questionId, value) =>
                setTypedAnswers((current) => ({ ...current, [questionId]: value }))
              }
              canSubmit={canSubmit}
              isLate={submissionWasLate}
              onBack={() => setStage("started")}
              onSubmit={handleSubmitAnswer}
            />
          ) : null}

          {stage === "submitted" ? (
            <section className="mx-auto mt-8 max-w-xl rounded-lg border border-border bg-bg-primary p-6 text-center sm:p-8">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-success/40 bg-note-green text-success">
                <Icon name="check" className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-lg font-semibold">
                {submissionWasLate ? "Late submission received" : "Answer sheet submitted"}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">
                Your{" "}
                {answerMode === "upload" ? (uploadedFile?.name ?? "answer sheet") : "typed answers"}{" "}
                is ready for instant mock evaluation.
                {submissionWasLate ? " This attempt is marked as late." : ""}
              </p>
              <Button type="button" size="lg" className="mt-6" onClick={handleCheckAnswers}>
                <Icon name="spark" />
                Check my answers
              </Button>
            </section>
          ) : null}

          {stage === "result" ? (
            <ResultPanel
              subject={subject}
              questions={questions}
              evaluation={evaluation}
              obtained={obtainedMarks}
              marks={generatedMarks}
              onViewMap={() => setTab("map")}
              onNewExam={resetExam}
            />
          ) : null}
        </main>
      ) : null}

      {tab === "history" ? <HistoryPanel history={history} onViewAttempt={viewAttempt} /> : null}

      {tab === "map" ? (
        <SyllabusPanel
          subjects={subjects}
          selectedSubject={subject}
          onSubjectChange={setSubject}
          topics={subjectTopics}
          topicScores={topicScores}
          coveredTopics={coveredTopics}
          strongTopics={strongTopics}
          onPracticeWeak={() => {
            setCoverage("weak");
            setStage("configure");
            setTab("take");
          }}
        />
      ) : null}
    </div>
  );
}

function ExamProgress({
  currentStep,
  navigableSteps,
  onStepSelect,
}: {
  currentStep: number;
  navigableSteps: number[];
  onStepSelect: (step: number) => void;
}) {
  return (
    <ol aria-label="Exam progress" className="grid grid-cols-4 border-b border-border">
      {STAGE_STEPS.map((step, index) => {
        const complete = index < currentStep;
        const current = index === currentStep;
        const navigable = navigableSteps.includes(index);
        return (
          <li
            key={step.id}
            className="relative min-w-0"
          >
            <button
              type="button"
              disabled={!navigable}
              onClick={() => onStepSelect(index)}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex min-h-14 w-full items-center justify-center gap-2 px-2 text-center text-xs font-medium transition-colors sm:text-sm",
                current ? "text-text-primary" : complete ? "text-success" : "text-text-muted",
                navigable
                  ? "cursor-pointer hover:bg-bg-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-strong"
                  : "cursor-default opacity-55",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
                  complete
                    ? "border-success bg-note-green"
                    : current
                      ? "border-border-strong bg-bg-primary"
                      : "border-border bg-bg-secondary",
                )}
              >
                {complete ? "✓" : index + 1}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            {current ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-text-primary" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function ChoiceButton({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "min-h-20 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
        active ? "border-border-strong bg-bg-secondary" : "border-border hover:bg-bg-secondary",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <span
          className={cn(
            "h-3 w-3 rounded-full border",
            active ? "border-text-primary bg-text-primary" : "border-border-strong",
          )}
        />
        {title}
      </span>
      <span className="mt-1.5 block text-xs leading-5 text-text-secondary">{description}</span>
    </button>
  );
}

function ExamInProgress({
  title,
  subject,
  questions,
  marks,
  secondsLeft,
  onFinish,
  onPrintQuestions,
}: {
  title: string;
  subject: string;
  questions: GeneratedQuestion[];
  marks: number;
  secondsLeft: number;
  onFinish: () => void;
  onPrintQuestions: () => void;
}) {
  return (
    <section className="mx-auto mt-6 max-w-4xl">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-y border-border bg-bg-primary/95 py-3 backdrop-blur">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="text-xs text-text-muted">
            {subject} · {marks} marks
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-2 font-mono-ui text-sm",
              secondsLeft < 300 ? "text-destructive" : "text-text-primary",
            )}
          >
            <Icon name="clock" />
            {formatTime(secondsLeft)}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={onPrintQuestions}>
            <Icon name="print" />
            Print
          </Button>
          <Button type="button" size="sm" onClick={onFinish}>
            Finish writing
          </Button>
        </div>
      </div>
      <div className="py-6">
        <div className="border-b border-border pb-5 text-center">
          <p className="text-xs uppercase tracking-wider text-text-muted">Instructions</p>
          <p className="mt-2 text-sm text-text-secondary">
            Write every answer clearly on your answer sheet. Attempt all questions.
          </p>
        </div>
        <ol className="divide-y divide-border">
          {questions.map((question) => (
            <li
              key={question.id}
              className="grid gap-3 py-6 sm:grid-cols-[36px_minmax(0,1fr)_72px]"
            >
              <span className="font-mono-ui text-sm text-text-muted">
                {String(question.number).padStart(2, "0")}
              </span>
              <div>
                <p className="text-base leading-7">{question.prompt}</p>
                <p className="mt-2 text-xs text-text-muted">
                  {question.type} · {question.topic}
                </p>
              </div>
              <span className="text-right text-sm font-medium">{question.marks} marks</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex justify-end border-t border-border pt-5">
        <Button type="button" size="lg" onClick={onFinish}>
          Finish and submit
          <Icon name="arrow" />
        </Button>
      </div>
    </section>
  );
}

function SubmissionPanel({
  questions,
  answerMode,
  onAnswerModeChange,
  uploadedFile,
  onFileChange,
  fileInputRef,
  typedAnswers,
  onTypedAnswerChange,
  canSubmit,
  isLate,
  onBack,
  onSubmit,
}: {
  questions: GeneratedQuestion[];
  answerMode: AnswerMode;
  onAnswerModeChange: (mode: AnswerMode) => void;
  uploadedFile: File | null;
  onFileChange: (file: File | null) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  typedAnswers: Record<string, string>;
  onTypedAnswerChange: (questionId: string, value: string) => void;
  canSubmit: boolean;
  isLate: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <section className="mx-auto mt-6 max-w-4xl">
      <div className="border-b border-border pb-4">
        <h2 className="text-lg font-semibold">Submit your answers</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Upload a scanned answer sheet or type answers directly.
        </p>
      </div>

      {isLate ? (
        <div className="mt-5 rounded-lg border border-warning/50 bg-note-yellow p-4 text-sm text-warning">
          <p className="font-semibold">Late submission</p>
          <p className="mt-1 text-text-secondary">
            Time is over, but the submit portal remains open. This attempt will be marked late.
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-2 rounded-lg border border-border bg-bg-secondary p-1">
        <button
          type="button"
          onClick={() => onAnswerModeChange("upload")}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-2 rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
            answerMode === "upload" ? "bg-bg-primary shadow-sm" : "text-text-secondary",
          )}
        >
          <Icon name="upload" />
          Upload answer sheet
        </button>
        <button
          type="button"
          onClick={() => onAnswerModeChange("type")}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-2 rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
            answerMode === "type" ? "bg-bg-primary shadow-sm" : "text-text-secondary",
          )}
        >
          <Icon name="edit" />
          Type answers
        </button>
      </div>

      {answerMode === "upload" ? (
        <div className="mt-5">
          <input
            ref={fileInputRef}
            id="answer-sheet-upload"
            type="file"
            accept="application/pdf,image/*"
            className="sr-only"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
          <label
            htmlFor="answer-sheet-upload"
            className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-bg-secondary p-6 text-center transition-colors hover:bg-bg-tertiary focus-within:ring-2 focus-within:ring-border-strong"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg-primary">
              <Icon name={uploadedFile ? "file" : "upload"} className="h-5 w-5" />
            </span>
            <span className="mt-4 text-sm font-semibold">
              {uploadedFile ? uploadedFile.name : "Choose PDF or scanned images"}
            </span>
            <span className="mt-1 text-xs text-text-muted">
              {uploadedFile
                ? "Ready to submit"
                : "PDF, JPG, or PNG · keep all pages clear and upright"}
            </span>
          </label>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {questions.map((question) => (
            <Field
              key={question.id}
              label={`Question ${question.number} · ${question.marks} marks`}
            >
              <Textarea
                value={typedAnswers[question.id] ?? ""}
                onChange={(event) => onTypedAnswerChange(question.id, event.target.value)}
                rows={5}
                placeholder={question.prompt}
              />
            </Field>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back to paper
        </Button>
        <Button type="button" size="lg" disabled={!canSubmit} onClick={onSubmit}>
          Submit answer
          <Icon name="arrow" />
        </Button>
      </div>
    </section>
  );
}

function ResultPanel({
  subject,
  questions,
  evaluation,
  obtained,
  marks,
  onViewMap,
  onNewExam,
}: {
  subject: string;
  questions: GeneratedQuestion[];
  evaluation: EvaluationRow[];
  obtained: number;
  marks: number;
  onViewMap: () => void;
  onNewExam: () => void;
}) {
  const percentage = marks ? Math.round((obtained / marks) * 100) : 0;
  const level = levelForScore(obtained, marks);
  return (
    <section className="mx-auto mt-6 max-w-4xl">
      <div className="grid gap-5 border-b border-border pb-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className={cn("rounded-lg border p-5", levelClasses(level))}>
          <p className="text-xs font-medium uppercase tracking-wider">Your result</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-5xl font-semibold">{obtained}</span>
            <span className="text-sm">/ {marks}</span>
          </div>
          <p className="mt-3 text-sm font-medium">{percentage}% overall</p>
        </div>
        <div className="self-center">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{subject}</p>
          <h2 className="mt-1 text-xl font-semibold">
            {level === "strong"
              ? "Exam ready on this set"
              : level === "mid"
                ? "Good base, focused revision needed"
                : "Revise before the next attempt"}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
            Your marks are mapped back to syllabus topics. Use the corrections below, then retake
            weak areas until the map turns green.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={onViewMap}>
              <Icon name="map" />
              View syllabus map
            </Button>
            <Button type="button" variant="outline" onClick={onNewExam}>
              <Icon name="refresh" />
              New exam
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-base font-semibold">Question-by-question feedback</h3>
        <div className="mt-3 divide-y divide-border rounded-lg border border-border">
          {questions.map((question) => {
            const row = evaluation.find((item) => item.questionId === question.id);
            const rowLevel = levelForScore(row?.obtained ?? 0, question.marks);
            return (
              <article key={question.id} className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                      Question {question.number} · {question.topic}
                    </p>
                    <p className="mt-2 text-sm leading-6">{question.prompt}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-md border px-2.5 py-1 text-sm font-semibold",
                      levelClasses(rowLevel),
                    )}
                  >
                    {row?.obtained ?? 0}/{question.marks}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <FeedbackBlock
                    label="Assessment"
                    text={row?.feedback ?? "No feedback available."}
                  />
                  <FeedbackBlock
                    label="Improve next"
                    text={row?.correction ?? "Review this topic once more."}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeedbackBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md bg-bg-secondary p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="mt-1.5 text-sm leading-6 text-text-secondary">{text}</p>
    </div>
  );
}

function HistoryPanel({
  history,
  onViewAttempt,
}: {
  history: ExamAttempt[];
  onViewAttempt: (attempt: ExamAttempt) => void;
}) {
  const average = history.length
    ? Math.round(
        history.reduce((sum, attempt) => sum + (attempt.obtained / attempt.marks) * 100, 0) /
          history.length,
      )
    : 0;
  return (
    <main className="mt-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Completed exams" value={history.length} />
        <Metric label="Average score" value={`${average}%`} />
        <Metric
          label="Latest score"
          value={history[0] ? `${history[0].obtained}/${history[0].marks}` : "None"}
        />
      </div>
      <section className="mt-6">
        <div className="border-b border-border pb-4">
          <h2 className="text-lg font-semibold">Exam history</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Open any attempt to review marks and feedback.
          </p>
        </div>
        {history.length ? (
          <div className="divide-y divide-border">
            {history.map((attempt) => (
              <button
                key={attempt.id}
                type="button"
                onClick={() => onViewAttempt(attempt)}
                className="grid w-full gap-3 py-5 text-left transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong sm:grid-cols-[minmax(0,1fr)_120px_100px_20px] sm:items-center sm:px-3"
              >
                <div>
                  <p className="font-medium">{attempt.title}</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {attempt.subject} · {attempt.questions.length} questions
                  </p>
                </div>
                <span className="text-sm text-text-muted">{attempt.date}</span>
                <span
                  className={cn(
                    "w-fit rounded-md border px-2.5 py-1 text-sm font-semibold",
                    levelClasses(levelForScore(attempt.obtained, attempt.marks)),
                  )}
                >
                  {attempt.obtained}/{attempt.marks}
                </span>
                <Icon name="arrow" className="hidden sm:block" />
              </button>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center">
            <p className="font-medium">No completed exams</p>
            <p className="mt-1 text-sm text-text-secondary">
              Your checked attempts will appear here.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function SyllabusPanel({
  subjects,
  selectedSubject,
  onSubjectChange,
  topics,
  topicScores,
  coveredTopics,
  strongTopics,
  onPracticeWeak,
}: {
  subjects: ExamSubjectOption[];
  selectedSubject: string;
  onSubjectChange: (subject: string) => void;
  topics: string[];
  topicScores: Map<string, { obtained: number; total: number }>;
  coveredTopics: number;
  strongTopics: number;
  onPracticeWeak: () => void;
}) {
  const coveragePercent = topics.length ? Math.round((coveredTopics / topics.length) * 100) : 0;
  return (
    <main className="mt-6">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Syllabus readiness</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Make every topic green before the final exam.
          </p>
        </div>
        <div className="w-full sm:w-64">
          <Field label="Subject">
            <Select
              value={selectedSubject}
              onChange={(event) => onSubjectChange(event.target.value)}
            >
              {subjects.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Coverage</p>
            <p className="mt-2 text-3xl font-semibold">{coveragePercent}%</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-tertiary">
              <div className="h-full bg-text-primary" style={{ width: `${coveragePercent}%` }} />
            </div>
            <p className="mt-3 text-sm text-text-secondary">
              {coveredTopics} of {topics.length} topics attempted
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Exam-ready topics
            </p>
            <p className="mt-2 text-3xl font-semibold text-success">{strongTopics}</p>
            <p className="mt-1 text-sm text-text-secondary">Green topics scoring 75% or above</p>
          </div>
          <Button type="button" className="w-full" onClick={onPracticeWeak}>
            Practice weak topics
          </Button>
          <div className="flex flex-wrap gap-2 text-xs">
            <Legend label="Uncovered" level="uncovered" />
            <Legend label="Weak" level="weak" />
            <Legend label="Mid" level="mid" />
            <Legend label="Strong" level="strong" />
          </div>
        </aside>

        <section
          aria-label={`${selectedSubject} topic performance`}
          className="grid content-start gap-3 sm:grid-cols-2"
        >
          {topics.length ? (
            topics.map((topic) => {
              const score = topicScores.get(topic);
              const level = levelForScore(score?.obtained ?? 0, score?.total ?? 0);
              const percent = score?.total ? Math.round((score.obtained / score.total) * 100) : 0;
              return (
                <article
                  key={topic}
                  className={cn("min-h-28 rounded-lg border p-4", levelClasses(level))}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold">{topic}</p>
                    <span className="text-xs font-semibold">
                      {score?.total ? `${percent}%` : "—"}
                    </span>
                  </div>
                  <p className="mt-5 text-xs">
                    {score?.total
                      ? `${score.obtained}/${score.total} marks across attempts`
                      : "Not covered in an exam yet"}
                  </p>
                </article>
              );
            })
          ) : (
            <div className="col-span-full rounded-lg border border-border p-8 text-center">
              <p className="font-medium">No syllabus topics mapped yet</p>
              <p className="mt-1 text-sm text-text-secondary">
                Complete an exam to begin building this map.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Legend({ label, level }: { label: string; level: TopicLevel }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-md border px-2 py-1", levelClasses(level))}
    >
      {label}
    </span>
  );
}
