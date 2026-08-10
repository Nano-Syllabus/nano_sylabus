export type PublicExamCategory =
  | "Loksewa"
  | "Entrance"
  | "Banking"
  | "Language"
  | "School"
  | "License";

export type PublicExam = {
  slug: string;
  name: string;
  short: string;
  category: PublicExamCategory;
  authority: string;
  tagline: string;
  learners: string;
  questions: string;
  durationWeeks: number;
  level: "Beginner" | "Intermediate" | "Advanced";
  about: string;
  syllabus: { unit: string; topics: string }[];
  outcomes: string[];
};

export const PUBLIC_APP_URL = "/login";

export const publicExamCategories = [
  "All",
  "Loksewa",
  "Entrance",
  "Banking",
  "Language",
  "School",
  "License",
] as const;

export const publicExams: PublicExam[] = [
  {
    slug: "loksewa-nayab-subba",
    name: "Loksewa Nayab Subba (Na.Su.)",
    short: "Nayab Subba",
    category: "Loksewa",
    authority: "Public Service Commission",
    tagline: "Adaptive drills for Paper I & II with Nepali-language explanations.",
    learners: "48,200",
    questions: "12,400",
    durationWeeks: 16,
    level: "Intermediate",
    about:
      "A complete Na.Su. preparation track that mirrors the PSC pattern. The AI tutor tracks every attempt, finds the units where you lose marks, and rebuilds your daily plan each morning.",
    syllabus: [
      {
        unit: "Paper I - General Awareness",
        topics: "Constitution, governance, geography, current affairs of Nepal",
      },
      {
        unit: "Paper I - Reasoning & IQ",
        topics: "Series, coding-decoding, data sufficiency, arithmetic",
      },
      {
        unit: "Paper II - Service Related",
        topics: "Office management, accounting basics, correspondence",
      },
      {
        unit: "Writing Practice",
        topics: "Nepali essays, letters, precis with AI feedback",
      },
    ],
    outcomes: [
      "Full-length PSC-pattern mock tests with rank prediction",
      "Daily 20-minute revision built from your weak units",
      "Bilingual explanations in Nepali and English",
    ],
  },
  {
    slug: "loksewa-kharidar",
    name: "Loksewa Kharidar",
    short: "Kharidar",
    category: "Loksewa",
    authority: "Public Service Commission",
    tagline: "Objective + subjective coverage with timed sectional tests.",
    learners: "39,750",
    questions: "10,100",
    durationWeeks: 14,
    level: "Beginner",
    about:
      "Built for first-time Loksewa aspirants. Start from fundamentals, then progress into full mocks as your accuracy climbs above the cutoff band.",
    syllabus: [
      { unit: "General Knowledge", topics: "History, geography, civics, current affairs" },
      { unit: "Nepali Language", topics: "Grammar, vocabulary, comprehension" },
      { unit: "English Language", topics: "Grammar, comprehension, translation" },
      { unit: "Arithmetic & Reasoning", topics: "Percentage, ratio, time-work, logical puzzles" },
    ],
    outcomes: [
      "Cutoff-aware progress tracker",
      "Sectional timers that mimic exam pressure",
      "Printable revision notes",
    ],
  },
  {
    slug: "loksewa-section-officer",
    name: "Loksewa Section Officer (Adhikrit)",
    short: "Section Officer",
    category: "Loksewa",
    authority: "Public Service Commission",
    tagline: "Deep governance, public administration and answer-writing coaching.",
    learners: "27,300",
    questions: "9,600",
    durationWeeks: 20,
    level: "Advanced",
    about:
      "The most demanding Loksewa track. Long-form answer evaluation, policy case studies, and a structured current-affairs digest updated every week.",
    syllabus: [
      {
        unit: "Governance & Public Administration",
        topics: "Federalism, bureaucracy, public policy",
      },
      { unit: "Constitution & Law", topics: "Constitution of Nepal 2072, acts and regulations" },
      { unit: "Economy & Development", topics: "Budget, periodic plans, SDGs" },
      {
        unit: "Answer Writing",
        topics: "Structured 10 & 20 mark answers with AI scoring",
      },
    ],
    outcomes: [
      "AI-scored long answers with rubric feedback",
      "Weekly current-affairs digest",
      "Case-study practice sets",
    ],
  },
  {
    slug: "ioe-engineering-entrance",
    name: "IOE Engineering Entrance",
    short: "IOE Entrance",
    category: "Entrance",
    authority: "Institute of Engineering, TU",
    tagline: "Physics, Chemistry, Maths and English at Pulchowk difficulty.",
    learners: "31,900",
    questions: "8,700",
    durationWeeks: 12,
    level: "Advanced",
    about:
      "Question banks calibrated to past IOE papers. Every wrong answer generates a targeted micro-lesson so concepts stick before the next mock.",
    syllabus: [
      { unit: "Mathematics", topics: "Algebra, calculus, coordinate geometry, vectors" },
      { unit: "Physics", topics: "Mechanics, optics, electricity, modern physics" },
      { unit: "Chemistry", topics: "Physical, organic, inorganic fundamentals" },
      { unit: "English", topics: "Grammar, vocabulary, comprehension" },
    ],
    outcomes: [
      "Speed-accuracy dashboard per subject",
      "Past-paper mocks from 2070 onward",
      "Formula flash decks",
    ],
  },
  {
    slug: "cee-mbbs",
    name: "MBBS / BDS Entrance (CEE)",
    short: "CEE MBBS",
    category: "Entrance",
    authority: "Medical Education Commission",
    tagline: "200-question mocks with negative-marking strategy training.",
    learners: "22,400",
    questions: "14,900",
    durationWeeks: 18,
    level: "Advanced",
    about:
      "MEC-pattern preparation across Botany, Zoology, Physics and Chemistry, with guess-risk analytics so you learn when to skip.",
    syllabus: [
      { unit: "Zoology", topics: "Human physiology, genetics, animal diversity" },
      { unit: "Botany", topics: "Plant physiology, ecology, cell biology" },
      { unit: "Physics", topics: "Mechanics, thermodynamics, electromagnetism" },
      { unit: "Chemistry", topics: "Organic reactions, equilibrium, periodicity" },
    ],
    outcomes: [
      "Negative-marking risk report",
      "High-yield topic prioritiser",
      "Spaced-repetition biology decks",
    ],
  },
  {
    slug: "cmat-tu",
    name: "CMAT (BBA/BBS Entrance)",
    short: "CMAT",
    category: "Entrance",
    authority: "Tribhuvan University",
    tagline: "Verbal, quantitative, logical and general awareness practice.",
    learners: "18,600",
    questions: "6,200",
    durationWeeks: 8,
    level: "Intermediate",
    about:
      "A short, intense CMAT sprint. Ideal if you have two months and want maximum score movement per study hour.",
    syllabus: [
      { unit: "Verbal Ability", topics: "Grammar, sentence correction, comprehension" },
      { unit: "Quantitative Ability", topics: "Arithmetic, algebra, data interpretation" },
      { unit: "Logical Reasoning", topics: "Puzzles, arrangements, syllogisms" },
      { unit: "General Awareness", topics: "Business, economy, Nepal affairs" },
    ],
    outcomes: [
      "Two-month sprint calendar",
      "Daily 30-question set",
      "Section-wise percentile estimate",
    ],
  },
  {
    slug: "kuumat",
    name: "KUUMAT (Kathmandu University)",
    short: "KUUMAT",
    category: "Entrance",
    authority: "Kathmandu University",
    tagline: "KU-style aptitude and subject testing with timed sets.",
    learners: "9,800",
    questions: "4,300",
    durationWeeks: 10,
    level: "Intermediate",
    about:
      "Aptitude-heavy preparation tuned to KU's undergraduate admission tests, with adaptive difficulty as your accuracy improves.",
    syllabus: [
      { unit: "Quantitative Aptitude", topics: "Arithmetic, algebra, geometry" },
      { unit: "Analytical Reasoning", topics: "Patterns, logic, data sufficiency" },
      { unit: "English Proficiency", topics: "Usage, comprehension, vocabulary" },
      { unit: "Science Basics", topics: "Applied physics and chemistry concepts" },
    ],
    outcomes: ["Adaptive difficulty engine", "Weekly full mock", "Concept gap map"],
  },
  {
    slug: "nrb-banking",
    name: "Nepal Rastra Bank & Commercial Bank",
    short: "NRB / Banking",
    category: "Banking",
    authority: "NRB & member banks",
    tagline: "Banking awareness, economics and aptitude in one track.",
    learners: "16,100",
    questions: "7,400",
    durationWeeks: 12,
    level: "Intermediate",
    about:
      "Covers assistant to officer level bank recruitment: monetary policy, banking acts, accounting and quantitative aptitude.",
    syllabus: [
      { unit: "Banking Awareness", topics: "NRB acts, monetary policy, BFI regulation" },
      { unit: "Economics", topics: "Micro, macro, Nepalese economy" },
      { unit: "Accounting & Finance", topics: "Financial statements, ratios, audit basics" },
      { unit: "Aptitude & English", topics: "Quant, reasoning, business English" },
    ],
    outcomes: [
      "Monetary-policy update briefs",
      "Numerical speed drills",
      "Interview question bank",
    ],
  },
  {
    slug: "nepal-police-army",
    name: "Nepal Police & Nepal Army",
    short: "Police / Army",
    category: "Loksewa",
    authority: "Nepal Police / Nepal Army",
    tagline: "Written-exam mastery plus physical-test planning.",
    learners: "20,700",
    questions: "5,900",
    durationWeeks: 10,
    level: "Beginner",
    about:
      "Written paper coverage with a companion physical readiness planner so you clear both stages of selection.",
    syllabus: [
      { unit: "General Knowledge", topics: "Nepal, world, security affairs" },
      { unit: "Nepali & English", topics: "Grammar, comprehension, writing" },
      { unit: "Mathematics & IQ", topics: "Arithmetic, reasoning, mensuration" },
      { unit: "Service Rules", topics: "Police/Army acts and code of conduct" },
    ],
    outcomes: [
      "Written mock series",
      "Physical test preparation plan",
      "Rules and acts summary cards",
    ],
  },
  {
    slug: "ielts-academic",
    name: "IELTS Academic",
    short: "IELTS",
    category: "Language",
    authority: "British Council / IDP",
    tagline: "AI band scoring for Writing and Speaking with instant feedback.",
    learners: "34,500",
    questions: "3,800",
    durationWeeks: 8,
    level: "Intermediate",
    about:
      "Speak to the AI examiner, submit Task 1 and Task 2 essays, and get band-wise feedback on fluency, lexical resource and coherence.",
    syllabus: [
      { unit: "Listening", topics: "Section 1-4 practice with transcripts" },
      { unit: "Reading", topics: "Skimming, matching headings, true/false/NG" },
      { unit: "Writing", topics: "Task 1 graphs, Task 2 essays with AI band score" },
      { unit: "Speaking", topics: "Cue cards and mock interviews with the AI examiner" },
    ],
    outcomes: [
      "Band score estimate per skill",
      "AI speaking partner",
      "Essay rewriting suggestions",
    ],
  },
  {
    slug: "neb-class-12",
    name: "NEB Class 12 Board",
    short: "NEB 12",
    category: "School",
    authority: "National Examinations Board",
    tagline: "Chapter-wise practice aligned with the NEB grid.",
    learners: "42,900",
    questions: "11,300",
    durationWeeks: 24,
    level: "Beginner",
    about:
      "Follow the NEB curriculum chapter by chapter for Science, Management and Humanities, with model questions and marking-scheme guidance.",
    syllabus: [
      { unit: "Science Stream", topics: "Physics, Chemistry, Biology, Maths" },
      { unit: "Management Stream", topics: "Accountancy, Economics, Business Studies" },
      { unit: "Compulsory Subjects", topics: "English, Nepali, Social Studies" },
      { unit: "Model Papers", topics: "NEB grid-based sets with marking schemes" },
    ],
    outcomes: ["Chapter-wise readiness score", "Model paper library", "Exam-week revision sprint"],
  },
  {
    slug: "professional-license",
    name: "Professional License (Engineering & Nursing)",
    short: "License Exam",
    category: "License",
    authority: "NEC / Nursing Council",
    tagline: "Council-pattern question banks and rapid revision.",
    learners: "11,400",
    questions: "6,800",
    durationWeeks: 6,
    level: "Intermediate",
    about:
      "Short, focused license preparation with council-pattern MCQs, high-frequency topics and last-week revision sheets.",
    syllabus: [
      { unit: "Core Discipline", topics: "Discipline-specific fundamentals and standards" },
      { unit: "Professional Ethics", topics: "Council code of conduct and practice rules" },
      { unit: "Applied Practice", topics: "Case-based and scenario questions" },
      { unit: "Rapid Revision", topics: "High-frequency topics and formula sheets" },
    ],
    outcomes: ["Six-week license sprint", "Council-pattern MCQ bank", "Last-week revision sheet"],
  },
];

export function getPublicExam(slug: string) {
  return publicExams.find((exam) => exam.slug === slug);
}
