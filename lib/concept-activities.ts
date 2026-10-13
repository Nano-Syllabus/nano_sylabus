import { z } from "zod";

const text = z.string().max(12000);
const number = z.number().finite();
const identifier = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/);
const base = { title: text.min(1), prompt: text.default(""), hint: text.default("") };
const derivationStep = z.object({ heading: text, explanation: text, formula: text.default("") });
const parameter = z
  .object({
    id: identifier,
    label: text,
    unit: text.default(""),
    min: number,
    max: number,
    step: number.positive(),
    initial: number,
  })
  .refine(
    (p) =>
      p.max > p.min &&
      p.initial >= p.min &&
      p.initial <= p.max &&
      (p.max - p.min) / p.step <= 10000,
  );
const output = z.object({ label: text, expression: text.max(500), unit: text.default("") });
const part = z
  .object({
    id: identifier,
    label: text,
    description: text,
    x: number.min(0).max(100),
    y: number.min(0).max(100),
    width: number.positive().max(100),
    height: number.positive().max(100),
    shape: z.enum(["rect", "ellipse"]).default("rect"),
  })
  .refine((p) => p.x + p.width <= 100 && p.y + p.height <= 100);

export const conceptActivitySchema = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("derivation"),
    steps: z.array(derivationStep).min(2).max(12),
  }),
  z.object({
    ...base,
    kind: z.literal("choice"),
    options: z.array(text).min(2).max(6),
    answer_index: z.number().int().nonnegative(),
    explanation: text.min(1),
  }),
  z.object({
    ...base,
    kind: z.literal("numeric"),
    answer: number,
    tolerance: number.nonnegative().default(0.01),
    unit: text.default(""),
    explanation: text.min(1),
  }),
  z.object({
    ...base,
    kind: z.literal("experiment"),
    parameters: z.array(parameter).min(1).max(6),
    outputs: z.array(output).min(1).max(4),
    explanation: text.min(1),
  }),
  z.object({
    ...base,
    kind: z.literal("diagram"),
    parts: z.array(part).min(2).max(12),
    links: z
      .array(z.object({ from_id: identifier, to_id: identifier }))
      .max(20)
      .default([]),
  }),
  z.object({
    ...base,
    kind: z.literal("exam"),
    rubric: z
      .array(z.object({ criterion: text.min(1), marks: number.positive().max(20) }))
      .min(1)
      .max(12),
    solution: text.min(1),
  }),
  z.object({
    ...base,
    kind: z.literal("bits"),
    bit_width: z.number().int().min(4).max(16),
    initial: z.number().int(),
    target_value: z.number().int(),
    interpretation: z.enum(["unsigned", "twos-complement"]),
    explanation: text.min(1),
  }),
]);
export type ConceptActivity = z.infer<typeof conceptActivitySchema>;

/** Arithmetic only. Model content is data; never JavaScript, HTML or eval. */
export function evaluateConceptExpression(
  expression: string,
  values: Record<string, number>,
): number | null {
  if (expression.length > 500) return null;
  const tokens =
    expression.match(
      /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z][A-Za-z0-9_]*|[+\-*/^(),]|\S/g,
    ) ?? [];
  let at = 0;
  let depth = 0;
  const functions: Record<string, (n: number) => number> = {
    sqrt: Math.sqrt,
    abs: Math.abs,
    sin: Math.sin,
    cos: Math.cos,
    exp: Math.exp,
    log: Math.log,
  };
  const primary = (): number => {
    if (++depth > 32) throw new Error("Expression too deep");
    const token = tokens[at++];
    let value: number;
    if (token === "(") {
      value = sum();
      if (tokens[at++] !== ")") throw new Error("Missing bracket");
    } else if (token && Object.hasOwn(functions, token) && tokens[at] === "(") {
      at++;
      value = functions[token](sum());
      if (tokens[at++] !== ")") throw new Error("Missing bracket");
    } else if (token === "pi") value = Math.PI;
    else if (token && Object.hasOwn(values, token)) value = values[token];
    else if (token && /^(?:\d|\.)/.test(token)) value = Number(token);
    else throw new Error("Unknown value");
    depth--;
    return value;
  };
  const power = (): number => {
    const left = primary();
    return tokens[at] === "^" ? (at++, left ** unary()) : left;
  };
  const unary = (): number => {
    if (++depth > 32) throw new Error("Expression too deep");
    const token = tokens[at];
    const result =
      token === "+" || token === "-" ? (at++, (token === "-" ? -1 : 1) * unary()) : power();
    depth--;
    return result;
  };
  const product = (): number => {
    let result = unary();
    while (tokens[at] === "*" || tokens[at] === "/") {
      const op = tokens[at++];
      const right = unary();
      result = op === "*" ? result * right : result / right;
    }
    return result;
  };
  const sum = (): number => {
    let result = product();
    while (tokens[at] === "+" || tokens[at] === "-") {
      const op = tokens[at++];
      const right = product();
      result = op === "+" ? result + right : result - right;
    }
    return result;
  };
  try {
    const result = sum();
    return at === tokens.length && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

export function parseConceptActivity(payload: string): ConceptActivity | null {
  if (payload.length > 60000) return null;
  try {
    const parsed = conceptActivitySchema.safeParse(JSON.parse(payload));
    if (!parsed.success) return null;
    const activity = parsed.data;
    if (activity.kind === "bits") {
      const limit = 2 ** activity.bit_width;
      if (activity.initial < 0 || activity.initial >= limit) return null;
      if (
        activity.interpretation === "unsigned"
          ? activity.target_value < 0 || activity.target_value >= limit
          : activity.target_value < -limit / 2 || activity.target_value >= limit / 2
      )
        return null;
    }
    if (activity.kind === "choice" && activity.answer_index >= activity.options.length) return null;
    if (activity.kind === "diagram") {
      const ids = new Set(activity.parts.map((p) => p.id));
      if (
        ids.size !== activity.parts.length ||
        activity.links.some((l) => !ids.has(l.from_id) || !ids.has(l.to_id))
      )
        return null;
    }
    if (activity.kind === "experiment") {
      const ids = new Set(activity.parameters.map((p) => p.id));
      if (ids.size !== activity.parameters.length || ids.has("pi")) return null;
      const values = Object.fromEntries(activity.parameters.map((p) => [p.id, p.initial]));
      if (activity.outputs.some((o) => evaluateConceptExpression(o.expression, values) === null))
        return null;
    }
    return activity;
  } catch {
    return null;
  }
}

/** Compact activity fences survive the existing paragraph storage/translation. */
export const CONCEPT_ACTIVITY_FENCE = /```concept-activity\s*\n([\s\S]*?)\n```/g;

export function conceptProgressKey(id: string, reading: string[]) {
  let hash = 2166136261;
  for (const char of reading.join("\n")) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `nano-concepts:${id}:${(hash >>> 0).toString(36)}`;
}
