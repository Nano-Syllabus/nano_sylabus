export type KnowledgeLevel = "struggling" | "developing" | "solid" | "not-started";

export type Topic = {
  id: string;
  name: string;
  level: KnowledgeLevel;
  testScore: number | null;
  questionScore: number | null;
};

export type Chapter = {
  id: string;
  name: string;
  topics: Topic[];
};

export type Material = {
  id: string;
  name: string;
  kind: "Notes" | "Past papers" | "Slides" | "Class notes" | "Textbook";
  size: string;
  status: "ready" | "processing" | "error";
  previewType?: "image" | "pdf" | "text" | "document" | "slides";
  previewText?: string;
};

export type QuestionBank = {
  id: string;
  name: string;
  size: string;
  questionsFound: number;
  status: "ready" | "processing";
};

export type Subject = {
  id: string;
  name: string;
  code: string;
  university: string;
  programme: string;
  semester: number;
  description: string;
  chapters: Chapter[];
  materials: Material[];
  questionBanks: QuestionBank[];
  testChat?: { from: "teacher" | "tutor"; text: string; sources?: string[] }[];
};

export type Student = {
  id: string;
  name: string;
  email: string;
  joined: boolean;
  average: number | null;
  topicScores?: Record<
    string,
    {
      tests: number | null;
      questions: number | null;
    }
  >;
};

export type Classroom = {
  id: string;
  subjectId: string;
  name: string;
  college: string;
  schedule: string;
  code: string;
  groupCode?: string;
  term?: "current" | "past";
  mode?: "campus" | "online";
  teachers: string[];
  studentIds: string[];
  note?: { text: string; at: string };
};

export type Question = {
  id: string;
  type: "choice" | "short" | "long";
  prompt: string;
  marks: number;
  topicId?: string;
  options?: string[];
  correctOption?: number;
  rubric?: { label: string; marks: number }[];
};

export type Exam = {
  id: string;
  subjectId: string;
  title: string;
  kind: "exam" | "class test" | "assignment" | "quiz";
  marks: number;
  minutes: number;
  attempts: number;
  code: string;
  drafting?: boolean;
  questions: Question[];
  offerings: {
    classroomId: string;
    opens: string;
    closes: string;
  }[];
};

export type ResultLine = {
  questionId: string;
  prompt: string;
  answer: string;
  score: number;
  max: number;
  feedback: string;
  teacherNote?: string;
};

export type PaperPin = {
  id: string;
  kind: "tick" | "cross" | "marks" | "note";
  x: number;
  y: number;
  text: string;
  page?: number;
};

export type Result = {
  id: string;
  examId: string;
  classroomId: string;
  studentId: string;
  score: number;
  outOf: number;
  submittedAt: string;
  counts?: boolean;
  published: boolean;
  checked: boolean;
  paperMode: boolean;
  paperImage?: string;
  paperImages?: string[];
  paperPages?: number;
  pins: PaperPin[];
  summary: string;
  strengths?: string[];
  improvements?: string[];
  lines: ResultLine[];
};

export type TeacherWorkspaceData = {
  teacher: {
    name: string;
    handle: string;
    email: string;
    answerLanguage: "English" | "नेपाली";
    answerStyle: "Simple" | "Exam focused";
  };
  subjects: Subject[];
  classrooms: Classroom[];
  students: Student[];
  exams: Exam[];
  results: Result[];
};

const physicsChapters: Chapter[] = [
  {
    id: "ch-magnetism",
    name: "Magnetism",
    topics: [
      {
        id: "t-biot",
        name: "Biot–Savart law",
        level: "solid",
        testScore: 0.81,
        questionScore: 0.76,
      },
      {
        id: "t-ampere",
        name: "Ampère's law",
        level: "developing",
        testScore: 0.58,
        questionScore: 0.64,
      },
      {
        id: "t-force",
        name: "Force on a wire",
        level: "solid",
        testScore: 0.74,
        questionScore: 0.71,
      },
      {
        id: "t-torque",
        name: "Torque on a loop",
        level: "struggling",
        testScore: 0.34,
        questionScore: 0.52,
      },
    ],
  },
  {
    id: "ch-induction",
    name: "Induction",
    topics: [
      {
        id: "t-faraday",
        name: "Faraday's law",
        level: "developing",
        testScore: 0.65,
        questionScore: 0.69,
      },
      {
        id: "t-lenz",
        name: "Lenz's law",
        level: "struggling",
        testScore: 0.29,
        questionScore: 0.47,
      },
      {
        id: "t-self",
        name: "Self inductance",
        level: "developing",
        testScore: 0.56,
        questionScore: 0.61,
      },
      {
        id: "t-mutual",
        name: "Mutual inductance",
        level: "not-started",
        testScore: null,
        questionScore: null,
      },
    ],
  },
  {
    id: "ch-light",
    name: "Light and waves",
    topics: [
      {
        id: "t-interference",
        name: "Interference",
        level: "solid",
        testScore: 0.84,
        questionScore: 0.8,
      },
      { id: "t-double", name: "Double slit", level: "solid", testScore: 0.78, questionScore: 0.75 },
      {
        id: "t-diffraction",
        name: "Diffraction grating",
        level: "developing",
        testScore: 0.55,
        questionScore: 0.6,
      },
      {
        id: "t-polarisation",
        name: "Polarisation",
        level: "not-started",
        testScore: null,
        questionScore: null,
      },
    ],
  },
];

const digitalChapters: Chapter[] = [
  {
    id: "ch-number",
    name: "Number systems",
    topics: [
      {
        id: "t-binary",
        name: "Binary arithmetic",
        level: "solid",
        testScore: 0.79,
        questionScore: 0.74,
      },
      { id: "t-bcd", name: "BCD codes", level: "developing", testScore: 0.61, questionScore: 0.58 },
      {
        id: "t-gray",
        name: "Gray code",
        level: "not-started",
        testScore: null,
        questionScore: null,
      },
    ],
  },
  {
    id: "ch-comb",
    name: "Combinational logic",
    topics: [
      {
        id: "t-boolean",
        name: "Boolean algebra",
        level: "developing",
        testScore: 0.62,
        questionScore: 0.67,
      },
      { id: "t-kmap", name: "K-maps", level: "developing", testScore: 0.48, questionScore: 0.54 },
      {
        id: "t-dontcare",
        name: "Don't-care terms",
        level: "struggling",
        testScore: 0.24,
        questionScore: 0.36,
      },
      {
        id: "t-mux",
        name: "Multiplexers",
        level: "not-started",
        testScore: null,
        questionScore: null,
      },
    ],
  },
];

const seedTopics = [...physicsChapters, ...digitalChapters].flatMap((chapter) => chapter.topics);

function topicScoresForStudent(studentId: string, joined: boolean, average: number | null) {
  return Object.fromEntries(
    seedTopics.map((topic) => {
      if (!joined || average === null) return [topic.id, { tests: null, questions: null }];
      const hash = `${studentId}:${topic.id}`
        .split("")
        .reduce((value, character) => value + character.charCodeAt(0), 0);
      const offset = ((hash % 17) - 8) / 100;
      const blend = (topicScore: number | null, adjustment = 0) =>
        topicScore === null
          ? null
          : Math.max(
              0.08,
              Math.min(0.96, average * 0.58 + topicScore * 0.42 + offset + adjustment),
            );
      return [
        topic.id,
        { tests: blend(topic.testScore), questions: blend(topic.questionScore, 0.03) },
      ];
    }),
  );
}

const students: Student[] = [
  ["st-1", "Prashant Adhikari", "prashant@student.ioe.edu.np", true, 0.64],
  ["st-2", "Anisha Shrestha", "anisha@student.ioe.edu.np", true, 0.83],
  ["st-3", "Bibek Gurung", "bibek@student.ioe.edu.np", true, 0.41],
  ["st-4", "Sneha Thapa", "sneha@student.ioe.edu.np", true, 0.76],
  ["st-5", "Manisha Rai", "manisha@student.ioe.edu.np", false, null],
  ["st-6", "Rojan Karki", "rojan@student.ioe.edu.np", true, 0.36],
  ["st-7", "Prakriti Poudel", "prakriti@student.ioe.edu.np", true, 0.71],
  ["st-8", "Suman Bhattarai", "suman@student.ioe.edu.np", true, 0.58],
  ["st-9", "Nabin Magar", "nabin@student.ioe.edu.np", true, 0.87],
  ["st-10", "Puja Tamang", "puja@student.ioe.edu.np", true, 0.44],
  ["st-11", "Kiran Limbu", "kiran@student.ioe.edu.np", true, 0.69],
  ["st-12", "Sabina Basnet", "sabina@student.ioe.edu.np", false, null],
].map(([id, name, email, joined, average]) => ({
  id: String(id),
  name: String(name),
  email: String(email),
  joined: Boolean(joined),
  average: average === null ? null : Number(average),
  topicScores: topicScoresForStudent(
    String(id),
    Boolean(joined),
    average === null ? null : Number(average),
  ),
}));

const physicsQuestions: Question[] = [
  {
    id: "q-1",
    type: "choice",
    prompt: "The turning effect on a current loop is zero when the normal to the loop is:",
    marks: 2,
    topicId: "t-torque",
    rubric: [
      { label: "Clear force diagram", marks: 2 },
      { label: "Correct derivation", marks: 4 },
      { label: "Final expression and direction", marks: 2 },
    ],
    options: ["Across the field", "Along the field", "At 45° to the field", "At 30° to the field"],
    correctOption: 1,
  },
  {
    id: "q-2",
    type: "short",
    prompt: "State Ampère's law and give one case where it is easier to use than Biot–Savart.",
    marks: 4,
    topicId: "t-ampere",
  },
  {
    id: "q-3",
    type: "long",
    prompt: "Derive the expression for torque on a current loop in a uniform magnetic field.",
    marks: 8,
    topicId: "t-torque",
  },
  {
    id: "q-4",
    type: "long",
    prompt: "Use Faraday's law to calculate the induced voltage in a 200-turn coil.",
    marks: 6,
    topicId: "t-faraday",
    rubric: [
      { label: "Correct substitution", marks: 2 },
      { label: "Answer with unit", marks: 2 },
      { label: "Sign explained", marks: 2 },
    ],
  },
];

function resultFor(
  id: string,
  studentId: string,
  score: number,
  published: boolean,
  paperMode: boolean,
): Result {
  const scores = [
    Math.min(2, Math.round(score * 2)),
    Math.min(4, Math.round(score * 4)),
    Math.min(8, Math.round(score * 8)),
    Math.min(6, Math.round(score * 6)),
  ];
  const lines = physicsQuestions.map((question, index) => ({
    questionId: question.id,
    prompt: question.prompt,
    answer:
      question.type === "choice"
        ? "Along the field"
        : "The student states the governing law, substitutes the known values and explains the final direction.",
    score: scores[index],
    max: question.marks,
    feedback:
      scores[index] === question.marks
        ? "Correct and complete."
        : "The method is sound, but one marking point is missing.",
  }));
  const strengths = lines
    .filter((line) => line.max > 0 && line.score / line.max >= 0.75)
    .slice(0, 3)
    .map((line, index) => `Question ${index + 1}: ${line.feedback}`);
  const improvements = lines
    .filter((line) => line.max > 0 && line.score < line.max)
    .sort((a, b) => a.score / a.max - b.score / b.max)
    .slice(0, 3)
    .map(
      (line) =>
        `${line.prompt.slice(0, 52)}${line.prompt.length > 52 ? "…" : ""}: ${line.feedback}`,
    );
  return {
    id,
    examId: "exam-mid",
    classroomId: "class-phy-a",
    studentId,
    score: lines.reduce((sum, line) => sum + line.score, 0),
    outOf: 20,
    submittedAt: "2026-08-02T10:30:00.000Z",
    counts: true,
    published,
    checked: published,
    paperMode,
    paperPages: paperMode ? 2 : undefined,
    pins: paperMode
      ? [
          { id: `${id}-pin-1`, kind: "tick", x: 79, y: 22, text: "✓", page: 1 },
          {
            id: `${id}-pin-2`,
            kind: "note",
            x: 72,
            y: 50,
            text: "Show the direction clearly",
            page: 1,
          },
        ]
      : [],
    summary:
      score >= 0.75
        ? "A strong paper. The method holds up under exam conditions."
        : score >= 0.5
          ? "The ideas are clear; precision is costing marks."
          : "Start each answer with the law before the working.",
    strengths: strengths.length ? strengths : ["The student attempted each part of the paper."],
    improvements: improvements.length
      ? improvements
      : ["No recurring issue was identified in this paper."],
    lines,
  };
}

export function createInitialTeacherWorkspace(handle: string): TeacherWorkspaceData {
  return {
    teacher: {
      name: "Anima Shrestha",
      handle,
      email: "anima@ioe.edu.np",
      answerLanguage: "English",
      answerStyle: "Exam focused",
    },
    subjects: [
      {
        id: "subject-physics",
        name: "Engineering Physics I",
        code: "SH 401",
        university: "Tribhuvan University",
        programme: "BE Electronics (BEI)",
        semester: 1,
        description: "Electricity, magnetism, waves and light for first-year engineering.",
        chapters: physicsChapters,
        materials: [
          {
            id: "mat-1",
            name: "Physics notes, unit 1.pdf",
            kind: "Notes",
            size: "4.2 MB",
            status: "ready",
          },
          {
            id: "mat-2",
            name: "Lecture slides — light and waves.pptx",
            kind: "Slides",
            size: "2.1 MB",
            status: "ready",
          },
          {
            id: "mat-3",
            name: "Photo of the board — 29 July.jpg",
            kind: "Class notes",
            size: "860 KB",
            status: "error",
          },
        ],
        questionBanks: [
          {
            id: "bank-1",
            name: "IOE past papers 2072–2081.pdf",
            size: "8.2 MB",
            questionsFound: 214,
            status: "ready",
          },
          {
            id: "bank-2",
            name: "Model question sets.pdf",
            size: "1.9 MB",
            questionsFound: 48,
            status: "ready",
          },
        ],
      },
      {
        id: "subject-digital",
        name: "Digital Logic Design",
        code: "EX 451",
        university: "Tribhuvan University",
        programme: "BE Electronics (BEI)",
        semester: 2,
        description: "Boolean algebra, logic gates and circuit design in exam-ready form.",
        chapters: digitalChapters,
        materials: [
          {
            id: "mat-4",
            name: "Logic design workbook.pdf",
            kind: "Notes",
            size: "3.0 MB",
            status: "ready",
          },
        ],
        questionBanks: [],
      },
      {
        id: "subject-math",
        name: "Applied Mathematics II",
        code: "SH 451",
        university: "Tribhuvan University",
        programme: "BE Electronics (BEI)",
        semester: 2,
        description: "Differential equations, Laplace transforms and vector calculus.",
        chapters: [],
        materials: [],
        questionBanks: [],
      },
    ],
    classrooms: [
      {
        id: "class-phy-a",
        subjectId: "subject-physics",
        name: "PUL BEI 081 A",
        college: "Pulchowk Campus",
        schedule: "Sun & Wed, 10:00",
        code: "BEI-A81F",
        groupCode: "BEI-81A",
        term: "current",
        mode: "campus",
        teachers: ["Anima Shrestha"],
        studentIds: students.slice(0, 12).map((student) => student.id),
        note: {
          text: "Bring a calculator for Wednesday's induction quiz.",
          at: "2026-08-03T06:00:00.000Z",
        },
      },
      {
        id: "class-phy-b",
        subjectId: "subject-physics",
        name: "PUL BEI 081 B",
        college: "Pulchowk Campus",
        schedule: "Sun & Wed, 11:00",
        code: "BEI-B9K2",
        groupCode: "BEI-81B",
        term: "current",
        mode: "campus",
        teachers: ["Anima Shrestha"],
        studentIds: students.slice(1, 10).map((student) => student.id),
      },
      {
        id: "class-digital-a",
        subjectId: "subject-digital",
        name: "PUL BEI 081 A",
        college: "Pulchowk Campus",
        schedule: "Mon & Fri, 14:00",
        code: "DLD-81G4",
        groupCode: "BEI-81A",
        term: "current",
        mode: "campus",
        teachers: ["Anima Shrestha", "Ramesh Koirala"],
        studentIds: students.slice(0, 11).map((student) => student.id),
      },
      {
        id: "class-phy-old",
        subjectId: "subject-physics",
        name: "PUL BEI 080 A",
        college: "Pulchowk Campus",
        schedule: "Finished",
        code: "PHY-80A",
        groupCode: "BEI-80A",
        term: "past",
        mode: "campus",
        teachers: ["Anima Shrestha"],
        studentIds: students.slice(2, 8).map((student) => student.id),
      },
    ],
    students,
    exams: [
      {
        id: "exam-mid",
        subjectId: "subject-physics",
        title: "Midterm exam",
        kind: "exam",
        marks: 20,
        minutes: 60,
        attempts: 1,
        code: "MID-4K2M",
        questions: physicsQuestions,
        offerings: [
          { classroomId: "class-phy-a", opens: "2026-08-04T10:00", closes: "2026-08-04T11:00" },
          { classroomId: "class-phy-b", opens: "2026-08-05T11:00", closes: "2026-08-05T12:00" },
        ],
      },
      {
        id: "exam-quiz",
        subjectId: "subject-physics",
        title: "Quick quiz: induction",
        kind: "quiz",
        marks: 10,
        minutes: 20,
        attempts: 2,
        code: "QUI-8T5P",
        questions: physicsQuestions.slice(0, 2),
        offerings: [{ classroomId: "class-phy-a", opens: "", closes: "2026-08-07T18:00" }],
      },
      {
        id: "exam-digital",
        subjectId: "subject-digital",
        title: "Class test: combinational logic",
        kind: "class test",
        marks: 30,
        minutes: 45,
        attempts: 1,
        code: "CLA-7P2D",
        questions: [],
        offerings: [],
      },
    ],
    results: [
      resultFor("result-1", "st-1", 0.66, false, true),
      resultFor("result-2", "st-2", 0.86, true, false),
      resultFor("result-3", "st-3", 0.42, false, true),
      resultFor("result-4", "st-4", 0.78, true, false),
      resultFor("result-5", "st-6", 0.37, false, false),
      resultFor("result-6", "st-7", 0.72, true, false),
      resultFor("result-7", "st-8", 0.58, false, false),
      resultFor("result-8", "st-9", 0.9, true, false),
    ],
  };
}

export function workspaceStorageKey(handle: string) {
  return `nano-teacher-workspace:${handle}`;
}
