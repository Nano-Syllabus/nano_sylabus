export type KnowledgeLevel = "green" | "yellow" | "red" | "grey";

export type NanoTopic = {
  name: string;
  chapter: string;
  level: KnowledgeLevel;
};

export type NanoMaterial = {
  name: string;
  kind: string;
  size: string;
  state?: "ready" | "preparing" | "unreadable";
};

export type NanoExam = {
  title: string;
  kind: string;
  marks: number;
  minutes: number;
  state: string;
};

export type NanoStudentSubject = {
  slug: string;
  title: string;
  code: string;
  teacher: string | null;
  when: string;
  mode: "course" | "open" | "personal";
  blurb: string;
  topics: NanoTopic[];
  examLabel: string | null;
  exams: NanoExam[];
  material: NanoMaterial[];
};

const topic = (chapter: string, name: string, level: KnowledgeLevel): NanoTopic => ({ chapter, name, level });

export const NANO_STUDENT_SUBJECTS: NanoStudentSubject[] = [
  {
    slug: "engineering-physics-i",
    title: "Engineering Physics I",
    code: "PUL BEI 081 A",
    teacher: "Anima Shrestha",
    when: "Sun & Wed, 10:00",
    mode: "course",
    blurb: "BE Electronics (BEI) · semester 1 · Tribhuvan University",
    topics: [
      topic("Magnetism", "Biot–Savart law", "green"),
      topic("Magnetism", "Ampère's law", "yellow"),
      topic("Magnetism", "Force on a wire", "green"),
      topic("Magnetism", "Torque on a loop", "red"),
      topic("Induction", "Faraday's law", "yellow"),
      topic("Induction", "Lenz's law", "red"),
      topic("Induction", "Self inductance", "yellow"),
      topic("Induction", "Mutual inductance", "grey"),
      topic("Light and waves", "Interference", "green"),
      topic("Light and waves", "Double slit", "green"),
      topic("Light and waves", "Diffraction grating", "grey"),
      topic("Light and waves", "Polarisation", "grey"),
      topic("Modern physics", "Photoelectric effect", "yellow"),
      topic("Modern physics", "de Broglie waves", "red"),
    ],
    examLabel: "Quick quiz: induction · closes today",
    exams: [
      { title: "Midterm exam", kind: "exam", marks: 50, minutes: 90, state: "Opens 10 Aug, 09:45" },
      { title: "Quick quiz: induction", kind: "quiz", marks: 10, minutes: 20, state: "Closes today" },
      { title: "Assignment 1: magnetic fields", kind: "assignment", marks: 20, minutes: 0, state: "Result published" },
    ],
    material: [
      { name: "Physics notes, unit 1", kind: "Notes", size: "4.2 MB", state: "ready" },
      { name: "Past papers 2019–2025", kind: "Past papers", size: "11.8 MB", state: "ready" },
      { name: "Lecture slides, light and waves", kind: "Slides", size: "2.1 MB", state: "preparing" },
      { name: "Photo of the board, 29 July", kind: "Class notes", size: "860 KB", state: "unreadable" },
    ],
  },
  {
    slug: "digital-logic-design",
    title: "Digital Logic Design",
    code: "PUL BEI 081 A",
    teacher: "Anima Shrestha",
    when: "Mon & Fri, 14:00",
    mode: "course",
    blurb: "BE Electronics (BEI) · semester 2 · Tribhuvan University",
    topics: [
      topic("Number systems", "Binary arithmetic", "green"),
      topic("Number systems", "BCD codes", "yellow"),
      topic("Number systems", "Gray code", "grey"),
      topic("Combinational logic", "Boolean algebra", "yellow"),
      topic("Combinational logic", "K-maps", "yellow"),
      topic("Combinational logic", "Don't-care terms", "red"),
      topic("Combinational logic", "Multiplexers", "grey"),
      topic("Combinational logic", "Adders", "green"),
      topic("Sequential logic", "Flip-flops", "grey"),
      topic("Sequential logic", "Counters", "grey"),
    ],
    examLabel: null,
    exams: [{ title: "Class test: combinational logic", kind: "class test", marks: 30, minutes: 45, state: "Not open yet" }],
    material: [{ name: "Logic design workbook", kind: "Notes", size: "3.0 MB", state: "ready" }],
  },
  {
    slug: "applied-mathematics-ii",
    title: "Applied Mathematics II",
    code: "PUL BEI 081 A",
    teacher: "Sarita Poudel",
    when: "Tue & Thu, 11:00",
    mode: "course",
    blurb: "BE Electronics (BEI) · semester 2 · Tribhuvan University",
    topics: [
      topic("Differential equations", "First order equations", "yellow"),
      topic("Differential equations", "Linear equations", "yellow"),
      topic("Transforms", "Laplace transform", "grey"),
      topic("Transforms", "Inverse transform", "grey"),
    ],
    examLabel: null,
    exams: [],
    material: [{ name: "Formula sheet", kind: "Notes", size: "420 KB", state: "ready" }],
  },
  {
    slug: "electromagnetic-field-theory",
    title: "Electromagnetic Field Theory",
    code: "Open course",
    teacher: "Anima Shrestha",
    when: "Whenever you like",
    mode: "open",
    blurb: "BE Electronics (BEI) · semester 4 · Tribhuvan University",
    topics: [
      topic("Maxwell", "Gauss's law", "yellow"),
      topic("Maxwell", "Maxwell's equations", "yellow"),
    ],
    examLabel: null,
    exams: [],
    material: [],
  },
];

export const NANO_OWN_STUDY: NanoStudentSubject = {
  slug: "my-physics-revision",
  title: "My physics revision",
  code: "Your own",
  teacher: null,
  when: "Whenever you like",
  mode: "personal",
  blurb: "Everything I keep getting wrong.",
  topics: [
    topic("Things I keep failing", "The angle in the formula", "red"),
    topic("Things I keep failing", "The minus sign in Lenz's law", "red"),
    topic("Things I keep failing", "Units and constants", "green"),
  ],
  examLabel: null,
  exams: [],
  material: [],
};

export const NANO_CATALOGUE = [
  ["Engineering Mathematics III", "SH 501", "BE Computer (BCT)", "Tribhuvan University", 3, 486],
  ["Data Structures and Algorithms", "CT 552", "BE Computer (BCT)", "Tribhuvan University", 4, 913],
  ["Object Oriented Programming", "CT 501", "BE Computer (BCT)", "Pokhara University", 3, 622],
  ["Thermodynamics", "ME 502", "BE Mechanical", "Tribhuvan University", 3, 214],
  ["Electric Circuits", "EE 401", "BE Electrical", "Purbanchal University", 2, 187],
  ["Numerical Methods", "SH 553", "BE Electronics (BEI)", "Tribhuvan University", 4, 341],
  ["Engineering Economics", "CE 655", "BE Civil", "Kathmandu University", 6, 158],
  ["Communication English", "SH 151", "BSc CSIT", "Tribhuvan University", 1, 704],
] as const;

export function findNanoSubject(value: string) {
  const normal = decodeURIComponent(value).trim().toLowerCase();
  return [...NANO_STUDENT_SUBJECTS, NANO_OWN_STUDY].find(
    (subject) => subject.slug === normal || subject.title.toLowerCase() === normal,
  );
}
