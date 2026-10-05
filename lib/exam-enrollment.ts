import { z } from "zod";

const questionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  prompt: z.string().trim().min(1).max(180),
  options: z
    .array(z.string().trim().min(1).max(100))
    .min(2)
    .max(8)
    .refine((values) => new Set(values).size === values.length, "Answer options must be unique."),
});

export const DEFAULT_EXAM_COPY = {
  onboardingTitle: "Let’s find your starting point.",
  onboardingDescription: "A few quick questions before you explore {exam}. No account needed yet.",
  facultiesTitle: "Find your faculty here.",
  facultiesDescription:
    "Explore the faculties supported by {exam}. After sign-in, you’ll choose the faculty for your study space.",
  paymentTitle: "One plan for {exam}.",
  paymentDescription: "Choose a plan, sign in, then pay securely with the official payment QR.",
  facultyTitle: "Choose your faculty.",
  facultyDescription:
    "We’ll tailor your subjects, challenges, notes and exam practice to this faculty.",
  checkoutTitle: "Your exam, ready to go.",
  exploreButton: "Explore supported faculties",
  signInButton: "Choose plan & sign in",
  qrButton: "Open payment QR",
};
const copySchema = z
  .object(
    Object.fromEntries(
      Object.entries(DEFAULT_EXAM_COPY).map(([key, value]) => [
        key,
        z.string().trim().min(1).max(400).default(value),
      ]),
    ) as Record<keyof typeof DEFAULT_EXAM_COPY, z.ZodDefault<z.ZodString>>,
  )
  .default(DEFAULT_EXAM_COPY);
export function examText(value: string, examName: string) {
  return value.replaceAll("{exam}", examName);
}
export function examBillingMonths(config: { billingMonths?: Array<1 | 3> }) {
  return config.billingMonths ?? ([1, 3] as Array<1 | 3>);
}

export const DEFAULT_EXAM_QUESTIONS = [
  {
    id: "exam_date",
    prompt: "When are you planning to take your exam?",
    options: ["Within a month", "In 1–3 months", "More than 3 months away"],
  },
  {
    id: "daily_minutes",
    prompt: "How much time can you study each day?",
    options: ["15 minutes", "30 minutes", "An hour or more"],
  },
  {
    id: "preparation",
    prompt: "Where are you in your preparation?",
    options: ["Just getting started", "Working through the syllabus", "Ready for exam practice"],
  },
];

export const examConfigSchema = z
  .object({
    enabled: z.boolean(),
    facultySlugs: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/)).max(50),
    planIds: z.array(z.string().uuid()).max(12),
    questions: z.array(questionSchema).min(1).max(8),
    billingMonths: z
      .array(z.union([z.literal(1), z.literal(3)]))
      .min(1)
      .max(2)
      .refine((values) => new Set(values).size === values.length, "Select each duration only once.")
      .default([1, 3]),
    copy: copySchema,
  })
  .superRefine((config, ctx) => {
    if (config.enabled && !config.facultySlugs.length)
      ctx.addIssue({
        code: "custom",
        path: ["facultySlugs"],
        message: "Choose at least one supported faculty.",
      });
    if (new Set(config.facultySlugs).size !== config.facultySlugs.length)
      ctx.addIssue({
        code: "custom",
        path: ["facultySlugs"],
        message: "Select each faculty only once.",
      });
    if (new Set(config.questions.map((q) => q.id)).size !== config.questions.length)
      ctx.addIssue({
        code: "custom",
        path: ["questions"],
        message: "Question IDs must be unique.",
      });
  });

export type ExamConfig = z.infer<typeof examConfigSchema>;
export const DEFAULT_EXAM_CONFIG: ExamConfig = {
  enabled: false,
  facultySlugs: [],
  planIds: [],
  questions: DEFAULT_EXAM_QUESTIONS,
  billingMonths: [1, 3],
  copy: DEFAULT_EXAM_COPY,
};

export function readExamConfig(raw: unknown): ExamConfig {
  const parsed = examConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_EXAM_CONFIG;
}

export function validateExamAnswers(config: ExamConfig, raw: unknown) {
  const parsed = z.record(z.string().max(100)).safeParse(raw);
  if (!parsed.success) throw new Error("Answer the preparation questions before continuing.");
  const answers: Record<string, string> = {};
  for (const question of config.questions) {
    const value = parsed.data[question.id];
    if (!question.options.includes(value))
      throw new Error(`Choose an answer for “${question.prompt}”.`);
    answers[question.id] = value;
  }
  return answers;
}

export const EXAM_INTENT_COOKIE = "nano_exam_intent";
export const examIntentSchema = z.object({
  examSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
  planId: z.string().uuid(),
  billingMonths: z.union([z.literal(1), z.literal(3)]),
  answers: z.record(z.string().max(100)),
});
export type ExamIntent = z.infer<typeof examIntentSchema>;

export function readExamIntent(value: string | undefined): ExamIntent | null {
  try {
    return examIntentSchema.parse(JSON.parse(value || "null"));
  } catch {
    return null;
  }
}
