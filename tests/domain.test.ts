import { describe, it, expect } from "vitest";
import {
  validateDefinition,
  validateAnswers,
  csvCell,
  stepNumber,
  ShotGate,
  experienceOf,
} from "../src/domain";
const def = {
  schemaVersion: 1,
  title: "Test",
  description: "",
  locale: "en",
  privacyUrl: "",
  questions: [{ id: "q", type: "boolean", label: "Yes?", required: true }],
  completion: { title: "Saved", message: "Thanks" },
};
describe("form contracts", () => {
  it("accepts required false but rejects missing", () => {
    expect(validateAnswers(validateDefinition(def), { q: false })).toEqual({
      q: false,
    });
    expect(() => validateAnswers(validateDefinition(def), {})).toThrow();
  });
  it("does not coerce empty text to numeric zero", () => {
    const d = validateDefinition({
      ...def,
      questions: [
        {
          id: "q",
          type: "number",
          label: "Count",
          required: true,
          min: 0,
          max: 10,
          step: 2,
          displayStart: 0,
        },
      ],
    });
    expect(validateAnswers(d, { q: 0 })).toEqual({ q: 0 });
    expect(() => validateAnswers(d, { q: "" })).toThrow();
    expect(() => validateAnswers(d, { q: 3 })).toThrow();
  });
  it("rejects unknown choices and hidden question IDs", () => {
    const d = validateDefinition({
      ...def,
      questions: [
        {
          id: "q",
          type: "single_choice",
          label: "Pick",
          required: true,
          options: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ],
        },
      ],
    });
    expect(() => validateAnswers(d, { q: "c" })).toThrow();
    expect(() => validateAnswers(d, { q: "a", evil: "x" })).toThrow();
  });
  it("rejects duplicate question IDs and unsafe privacy urls", () => {
    expect(() =>
      validateDefinition({
        ...def,
        questions: [def.questions[0], def.questions[0]],
      }),
    ).toThrow();
    expect(() =>
      validateDefinition({ ...def, privacyUrl: "javascript:alert(1)" }),
    ).toThrow();
  });
  it("keeps number increments on their grid", () => {
    const q = { min: 0, max: 9, step: 2, displayStart: 0 };
    expect(stepNumber(q, 8, 1)).toBe(8);
    expect(stepNumber(q, 0, -1)).toBe(0);
  });
  it("escapes CSV formulas, quotes and newlines", () => {
    expect(csvCell("=SUM(1)")).toBe('"\'=SUM(1)"');
    expect(csvCell('a"b\nc')).toBe('"a""b\nc"');
  });
  it("defaults the experience when a form has none", () => {
    expect(experienceOf(validateDefinition(def))).toEqual({
      tool: "water",
      accent: "#4FD1FF",
      world: "terrace",
    });
  });
  it("accepts supported tools and hex accents", () => {
    const d = validateDefinition({
      ...def,
      experience: { tool: "bubbles", accent: "#112233", world: "terrace" },
    });
    expect(experienceOf(d)).toEqual({
      tool: "bubbles",
      accent: "#112233",
      world: "terrace",
    });
    expect(experienceOf(validateDefinition({ ...def, experience: {} })).tool).toBe(
      "water",
    );
  });
  it("rejects unknown tools, non-hex accents and extra experience keys", () => {
    expect(() =>
      validateDefinition({ ...def, experience: { tool: "rifle" } }),
    ).toThrow();
    expect(() =>
      validateDefinition({ ...def, experience: { accent: "red" } }),
    ).toThrow();
    expect(() =>
      validateDefinition({ ...def, experience: { tool: "water", sound: "x" } }),
    ).toThrow();
  });
  it("ignores stale and repeated shot events", () => {
    const g = new ShotGate();
    expect(g.fire("q", 0, "q")).toBe(true);
    expect(g.fire("q", 50, "q")).toBe(false);
    g.release();
    expect(g.fire("old", 500, "q")).toBe(false);
    expect(g.fire("q", 501, "q")).toBe(true);
  });
});
