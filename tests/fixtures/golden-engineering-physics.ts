export type GoldenEngineeringPhysicsScenario = {
  id: string;
  question: string;
  subjectContext: string;
  retrievalMode?: "default" | "chapter";
  expectedRoutePath: string;
  expectedAnswerMode: string;
  expectedContains: string[];
  expectedPromptContains?: string[];
};

export const goldenEngineeringPhysicsScenarios: GoldenEngineeringPhysicsScenario[] = [
  {
    id: "chapter-list",
    question: "What are the chapters in Engineering Physics?",
    subjectContext: "Engineering Physics",
    expectedRoutePath: "deterministic_catalog",
    expectedAnswerMode: "deterministic_catalog_lookup",
    expectedContains: ["Unit 2 Wave Motion", "Unit 3 Acoustics"],
  },
  {
    id: "chapter-topics",
    question: "What are the topics in chapter 2?",
    subjectContext: "Engineering Physics",
    expectedRoutePath: "deterministic_catalog",
    expectedAnswerMode: "deterministic_catalog_lookup",
    expectedContains: ["Energy transfer in a progressive wave", "Stationary waves"],
  },
  {
    id: "ordinal-chapter-lookup",
    question: "What is our second chapter about?",
    subjectContext: "Engineering Physics",
    expectedRoutePath: "deterministic_structure",
    expectedAnswerMode: "deterministic_structure_lookup",
    expectedContains: ["Chapter 2 is Unit 2 Wave Motion", "Based on the grounded syllabus"],
  },
  {
    id: "third-chapter-lookup",
    question: "What is our 3rd chapter?",
    subjectContext: "Engineering Physics",
    expectedRoutePath: "deterministic_structure",
    expectedAnswerMode: "deterministic_structure_lookup",
    expectedContains: ["Chapter 3 is Unit 3 Acoustics", "Based on the grounded syllabus"],
  },
  {
    id: "exam-question-bank",
    question: "Give me likely exam questions from Engineering Physics unit 2.",
    subjectContext: "Engineering Physics",
    expectedRoutePath: "deterministic_question_bank",
    expectedAnswerMode: "deterministic_exam_lookup",
    expectedContains: ["Derive the equation of a progressive wave", "Explain wave intensity"],
  },
  {
    id: "persisted-topic-card-concept",
    question: "Explain wave intensity in simple terms.",
    subjectContext: "Engineering Physics",
    expectedRoutePath: "persisted_topic_card_hybrid",
    expectedAnswerMode: "quick",
    expectedContains: ["wave intensity", "power transferred per unit area"],
  },
  {
    id: "chapter-mode-deep-answer",
    question: "Give me the full unit in detail about wave motion.",
    subjectContext: "Engineering Physics",
    retrievalMode: "chapter",
    expectedRoutePath: "chapter_persisted_topic_card_hybrid",
    expectedAnswerMode: "deep",
    expectedContains: ["Wave motion", "progressive waves"],
  },
  {
    id: "numerical-style-answer",
    question: "Calculate wave intensity if power is 20 W and area is 5 m^2.",
    subjectContext: "Engineering Physics",
    expectedRoutePath: "rag_answer",
    expectedAnswerMode: "deep",
    expectedContains: [],
    expectedPromptContains: [
      "For numerical or derivation questions, use this structure when useful:",
      "Substitution / derivation",
    ],
  },
  {
    id: "derivation-style-answer",
    question: "Derive the equation of a progressive wave.",
    subjectContext: "Engineering Physics",
    expectedRoutePath: "rag_answer",
    expectedAnswerMode: "deep",
    expectedContains: [],
    expectedPromptContains: [
      "For derivation questions, use this structure when useful:",
      "Show the derivation step by step without skipping the final expression",
    ],
  },
  {
    id: "comparison-style-answer",
    question: "Compare progressive waves and stationary waves.",
    subjectContext: "Engineering Physics",
    expectedRoutePath: "rag_answer",
    expectedAnswerMode: "deep",
    expectedContains: [],
    expectedPromptContains: [
      "For comparison questions, use this structure when useful:",
      "Practical or exam-oriented takeaway",
    ],
  },
];
