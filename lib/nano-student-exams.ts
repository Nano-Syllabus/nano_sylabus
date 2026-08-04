export type StudentExamQuestion = {
  id: string;
  type: "choice" | "short" | "long";
  marks: number;
  topic: string;
  prompt: string;
  options?: string[];
  answer?: number;
  marking?: Array<{ label: string; marks: number }>;
};

export type StudentExam = {
  id: string;
  subject: string;
  title: string;
  kind: string;
  counts: boolean;
  marks: number;
  minutes: number;
  attempts: number | null;
  window: "before" | "open" | "done" | "practice";
  windowLabel: string;
  questions: StudentExamQuestion[];
};

export const STUDENT_EXAMS: StudentExam[] = [
  {
    id: "x_mid",
    subject: "Engineering Physics I",
    title: "Midterm exam",
    kind: "exam",
    counts: true,
    marks: 50,
    minutes: 90,
    attempts: 1,
    window: "before",
    windowLabel: "Opens 10 Aug, 09:45",
    questions: [
      {
        id: "q1",
        type: "choice",
        marks: 1,
        topic: "Torque on a loop",
        prompt: "The turning effect on a current loop is zero when the normal to the loop is:",
        options: ["Across the field", "Along the field", "At 45° to the field", "At 30° to the field"],
        answer: 1,
      },
      {
        id: "q2",
        type: "choice",
        marks: 1,
        topic: "Lenz's law",
        prompt: "Lenz's law is a statement of:",
        options: ["Conservation of charge", "Conservation of energy", "Conservation of momentum", "Gauss's law"],
        answer: 1,
      },
      {
        id: "q3",
        type: "short",
        marks: 3,
        topic: "Ampère's law",
        prompt: "State Ampère's law, and give one case where it is easier to use than Biot–Savart.",
      },
      {
        id: "q4",
        type: "long",
        marks: 5,
        topic: "Torque on a loop",
        prompt: "Derive the expression for the turning effect on a current loop in a uniform field.",
        marking: [
          { label: "Correct derivation", marks: 3 },
          { label: "Final expression", marks: 1 },
          { label: "Direction explained", marks: 1 },
        ],
      },
      {
        id: "q5",
        type: "long",
        marks: 5,
        topic: "Faraday's law",
        prompt: "A coil of 200 turns and area 4×10⁻³ m² sits in a field falling from 0.5 T to zero in 0.2 s. Find the induced voltage.",
        marking: [
          { label: "Correct substitution", marks: 2 },
          { label: "Answer with unit", marks: 2 },
          { label: "Sign explained", marks: 1 },
        ],
      },
    ],
  },
  {
    id: "x_quiz",
    subject: "Engineering Physics I",
    title: "Quick quiz: induction",
    kind: "quiz",
    counts: true,
    marks: 10,
    minutes: 20,
    attempts: 2,
    window: "open",
    windowLabel: "Closes today",
    questions: [
      {
        id: "q6",
        type: "choice",
        marks: 5,
        topic: "Lenz's law",
        prompt: "A magnet is pushed north-pole-first into a coil. Seen from the magnet, the induced current flows:",
        options: ["Clockwise", "Anticlockwise", "Not at all", "Clockwise then anticlockwise"],
        answer: 1,
      },
      {
        id: "q7",
        type: "short",
        marks: 5,
        topic: "Self inductance",
        prompt: "Write down the self inductance of a long solenoid and say what each symbol means.",
      },
    ],
  },
  {
    id: "x_mock",
    subject: "Engineering Physics I",
    title: "My practice test 1",
    kind: "practice test",
    counts: false,
    marks: 20,
    minutes: 60,
    attempts: null,
    window: "practice",
    windowLabel: "Whenever you like",
    questions: [
      {
        id: "q8",
        type: "choice",
        marks: 2,
        topic: "Torque on a loop",
        prompt: "In the formula for the turning effect, the angle is measured between the field and:",
        options: ["The plane of the loop", "The normal to the loop", "The current", "The longest side"],
        answer: 1,
      },
      {
        id: "q9",
        type: "long",
        marks: 10,
        topic: "Torque on a loop",
        prompt: "Derive the turning effect from first principles, and say carefully what the angle is measured from.",
        marking: [
          { label: "Force on each side", marks: 4 },
          { label: "The couple", marks: 3 },
          { label: "Angle identified", marks: 3 },
        ],
      },
      {
        id: "q10",
        type: "short",
        marks: 8,
        topic: "Lenz's law",
        prompt: "Explain in your own words why the induced current opposes the change that made it.",
      },
    ],
  },
];

export const PUBLISHED_EXAM = {
  id: "x_asg",
  subject: "Engineering Physics I",
  title: "Assignment 1: magnetic fields",
  kind: "assignment",
  counts: true,
  marks: 20,
  minutes: 0,
  score: 14,
  handedIn: "25 Jun, 17:42",
};

export const EXAM_TOPIC_LEVELS: Record<string, "red" | "yellow" | "green" | "grey"> = {
  "Torque on a loop": "red",
  "Lenz's law": "red",
  "Ampère's law": "yellow",
  "Faraday's law": "yellow",
  "Self inductance": "yellow",
};

export function findStudentExam(id: string | null) {
  return STUDENT_EXAMS.find((exam) => exam.id === id);
}
