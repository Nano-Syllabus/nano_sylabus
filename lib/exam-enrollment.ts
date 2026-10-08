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
    /** Off = the flow skips onboarding questions and starts at the faculty list. */
    askQuestions: z.boolean().default(true),
    questions: z.array(questionSchema).max(8),
    billingMonths: z
      .array(z.union([z.literal(1), z.literal(3)]))
      .min(1)
      .max(2)
      .refine((values) => new Set(values).size === values.length, "Select each duration only once.")
      .default([1, 3]),
    /** Monthly price overrides: faculty slug → plan id → price. A missing entry uses the plan's own price. */
    facultyPrices: z
      .record(
        z.string().max(100),
        z.record(z.string().uuid(), z.number().int().positive().max(10_000_000)),
      )
      .default({}),
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
    if (config.askQuestions && !config.questions.length)
      ctx.addIssue({
        code: "custom",
        path: ["questions"],
        message: "Add at least one onboarding question, or turn questions off.",
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
  askQuestions: true,
  questions: DEFAULT_EXAM_QUESTIONS,
  billingMonths: [1, 3],
  facultyPrices: {},
  copy: DEFAULT_EXAM_COPY,
};

export function readExamConfig(raw: unknown): ExamConfig {
  const parsed = examConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_EXAM_CONFIG;
}

export function validateExamAnswers(config: ExamConfig, raw: unknown) {
  if (config.askQuestions === false) return {};
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

/**
 * The onboarding result (user, 2026-10-08): how ready the answers say the
 * student is, as a percentage. Admins list each question's options from least
 * to most prepared, so an answer scores its position: the first option 0, the
 * last 1. The result is the average, kept between 10% and 95% — onboarding
 * answers alone never say "not at all" or "fully ready". `focus` is the answer
 * that pulled the score down most, to name what the plan starts with.
 */
export function examReadiness(
  questions: Array<{ id: string; prompt: string; options: string[] }>,
  answers: Record<string, string>,
): { percent: number; focus: { prompt: string; answer: string } | null } | null {
  const scored = questions
    .map((question) => {
      const index = question.options.indexOf(answers[question.id] ?? "");
      if (index < 0 || question.options.length < 2) return null;
      return {
        prompt: question.prompt,
        answer: question.options[index],
        score: index / (question.options.length - 1),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  if (!scored.length) return null;
  const average = scored.reduce((sum, item) => sum + item.score, 0) / scored.length;
  const weakest = scored.reduce((low, item) => (item.score < low.score ? item : low));
  return {
    percent: Math.round(10 + average * 85),
    focus: weakest.score < 1 ? { prompt: weakest.prompt, answer: weakest.answer } : null,
  };
}

export const EXAM_INTENT_COOKIE = "nano_exam_intent";
/**
 * The exam site a student came in through ("Continue learning" on its
 * subdomain). The app reads it to offer only that exam's faculties.
 */
export const EXAM_SITE_COOKIE = "nano_exam_site";
export const examIntentSchema = z.object({
  examSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
  planId: z.string().uuid(),
  billingMonths: z.union([z.literal(1), z.literal(3)]),
  answers: z.record(z.string().max(100)),
  /** The faculty the student joined at "Find your faculty"; locked once they sign in. */
  facultySlug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,99}$/)
    .optional(),
});
export type ExamIntent = z.infer<typeof examIntentSchema>;

export function readExamIntent(value: string | undefined): ExamIntent | null {
  try {
    return examIntentSchema.parse(JSON.parse(value || "null"));
  } catch {
    return null;
  }
}

/** A plan's monthly price for one faculty: the admin's override, else the plan's own price. */
export function examPlanMonthlyPrice(
  config: Pick<ExamConfig, "facultyPrices">,
  facultySlug: string | null | undefined,
  plan: { id: string; price: number },
) {
  return (facultySlug && config.facultyPrices[facultySlug]?.[plan.id]) || plan.price;
}
export function hasFacultyPrices(config: Pick<ExamConfig, "facultyPrices">) {
  return Object.values(config.facultyPrices).some((prices) => Object.keys(prices).length > 0);
}

/**
 * Where a returning student signs in from an exam site: straight into the app,
 * which opens the faculty they already joined. Onboarding is only for newcomers.
 */
export const EXISTING_STUDENT_LOGIN = `/login?next=${encodeURIComponent("/app/challenges")}`;
