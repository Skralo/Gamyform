import { newId } from "./id";
import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const TOOLS = ["water", "bubbles", "throw"] as const;
export type ToolId = (typeof TOOLS)[number];
export const DEFAULT_EXPERIENCE = {
  tool: "water",
  accent: "#4FD1FF",
  world: "terrace",
} as const;
const experienceSchema = z
  .object({
    tool: z.enum(TOOLS).default(DEFAULT_EXPERIENCE.tool),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #4FD1FF.")
      .default(DEFAULT_EXPERIENCE.accent),
    world: z.enum(["terrace"]).default(DEFAULT_EXPERIENCE.world),
  })
  .strict();
export type Experience = z.infer<typeof experienceSchema>;
const questionSchema = z
  .object({
    id,
    type: z.enum(["single_choice", "number", "short_text", "email", "boolean"]),
    label: z.string().trim().min(1).max(180),
    help: z.string().max(180).default(""),
    required: z.boolean(),
    options: z
      .array(z.object({ id, label: z.string().trim().min(1).max(80) }).strict())
      .max(6)
      .optional(),
    min: z.number().int().min(-1000000).max(1000000).optional(),
    max: z.number().int().min(-1000000).max(1000000).optional(),
    step: z.number().int().positive().max(1000000).optional(),
    displayStart: z.number().int().optional(),
    maxLength: z.number().int().positive().max(500).optional(),
    contactRole: z.enum(["name", "email"]).optional(),
  })
  .strict()
  .superRefine((q, c) => {
    const fail = (message: string) => c.addIssue({ code: "custom", message });
    if (
      q.type === "single_choice" &&
      (!q.options ||
        q.options.length < 2 ||
        new Set(q.options.map((o) => o.id)).size !== q.options.length)
    )
      fail("Choices need 2–6 unique options.");
    if (q.type === "number") {
      if (
        q.min === undefined ||
        q.max === undefined ||
        !q.step ||
        q.min > q.max
      )
        fail("Set valid number limits and step.");
      else if (
        q.displayStart !== undefined &&
        (q.displayStart < q.min ||
          q.displayStart > q.max ||
          (q.displayStart - q.min) % q.step !== 0)
      )
        fail("Starting value must match the limits and step.");
    }
    if (q.contactRole === "email" && q.type !== "email")
      fail("Email contact mapping needs an email field.");
    if (q.contactRole === "name" && q.type !== "short_text")
      fail("Name mapping needs a text field.");
  });
export const definitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().trim().min(1).max(80),
    description: z.string().max(600).default(""),
    locale: z.enum(["en", "sl"]).default("en"),
    privacyUrl: z
      .string()
      .max(500)
      .refine(
        (s) => !s || /^https?:\/\//i.test(s),
        "Use an http or https privacy URL.",
      )
      .default(""),
    questions: z.array(questionSchema).min(1).max(10),
    completion: z
      .object({
        title: z.string().min(1).max(80),
        message: z.string().max(500),
      })
      .strict(),
    experience: experienceSchema.optional(),
  })
  .strict()
  .superRefine((d, c) => {
    if (new Set(d.questions.map((q) => q.id)).size !== d.questions.length)
      c.addIssue({ code: "custom", message: "Question IDs must be unique." });
    for (const role of ["name", "email"])
      if (d.questions.filter((q) => q.contactRole === role).length > 1)
        c.addIssue({
          code: "custom",
          message: `Only one ${role} mapping is allowed.`,
        });
  });
export type Definition = z.infer<typeof definitionSchema>;
export type Question = z.infer<typeof questionSchema>;
export type Answer = string | number | boolean | null;
export type Answers = Record<string, Answer>;
export function validateDefinition(input: unknown): Definition {
  return definitionSchema.parse(input);
}
export function experienceOf(d: Pick<Definition, "experience">): Experience {
  return { ...DEFAULT_EXPERIENCE, ...d.experience };
}
export function answerSchema(q: Question): z.ZodTypeAny {
  let s: z.ZodTypeAny;
  if (q.type === "number")
    s = z
      .number()
      .int()
      .min(q.min!)
      .max(q.max!)
      .refine(
        (v) => (v - q.min!) % q.step! === 0,
        "Use a value matching the step.",
      );
  else if (q.type === "boolean") s = z.boolean();
  else if (q.type === "single_choice")
    s = z
      .string()
      .refine(
        (v) => q.options!.some((o) => o.id === v),
        "Choose one of the available answers.",
      );
  else if (q.type === "email")
    s = z.string().trim().max(254).email("Enter a valid email address.");
  else
    s = z
      .string()
      .trim()
      .min(1, "This answer is required.")
      .max(q.maxLength ?? 120);
  return q.required
    ? s
    : z.preprocess(
        (v) => (v === "" || v === null ? undefined : v),
        s.optional(),
      );
}
export function answersSchema(d: Definition) {
  return z
    .object(Object.fromEntries(d.questions.map((q) => [q.id, answerSchema(q)])))
    .strict();
}
export function validateAnswers(d: Definition, input: unknown): Answers {
  return answersSchema(d).parse(input) as Answers;
}
export function fieldError(q: Question, v: unknown): string | null {
  const r = answerSchema(q).safeParse(v);
  return r.success
    ? null
    : (r.error.issues[0]?.message ?? "Check this answer.");
}
export function stepNumber(
  q: { min?: number; max?: number; step?: number; displayStart?: number },
  value: unknown,
  delta: number,
) {
  const min = q.min ?? 0,
    step = q.step ?? 1,
    max = min + Math.floor(((q.max ?? 100) - min) / step) * step;
  return Math.max(
    min,
    Math.min(
      max,
      (typeof value === "number" ? value : (q.displayStart ?? min)) +
        delta * step,
    ),
  );
}
export function answerLabel(q: Question, v: unknown) {
  if (v === null || v === undefined || v === "") return "Not answered";
  if (q.type === "single_choice")
    return q.options?.find((o) => o.id === v)?.label ?? String(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}
export function csvCell(v: unknown) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export class ShotGate {
  private down = false;
  private last = -Infinity;
  release() {
    this.down = false;
  }
  fire(generation: string, now: number, current: string) {
    if (this.down || now - this.last < 150 || generation !== current)
      return false;
    this.down = true;
    this.last = now;
    return true;
  }
}
export function newQuestion(
  type: Question["type"] = "single_choice",
): Question {
  const base = {
    id: newId(),
    type,
    label: "Your question",
    help: "",
    required: true,
  };
  if (type === "single_choice")
    return {
      ...base,
      options: [
        { id: newId(), label: "Option one" },
        { id: newId(), label: "Option two" },
      ],
    };
  if (type === "number")
    return { ...base, min: 0, max: 100, step: 1, displayStart: 0 };
  return { ...base, maxLength: type === "email" ? 254 : 120 };
}
