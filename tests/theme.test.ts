import { describe, it, expect } from "vitest";
import { onAccent, paletteFor, themeVars } from "../src/player/theme";
import { copyFor } from "../src/player/copy";

describe("player theme and copy", () => {
  it("picks readable ink on the accent", () => {
    expect(onAccent("#4FD1FF")).toBe("#04121A");
    expect(onAccent("#1A3A8F")).toBe("#FFFFFF");
  });
  it("carries the brand accent into the world palette and CSS variables", () => {
    const exp = { tool: "water", accent: "#FF0066", world: "terrace" } as const;
    expect(paletteFor(exp).accent).toBe("#FF0066");
    expect(themeVars(exp)).toMatchObject({ "--gf-accent": "#FF0066" });
  });
  it("has the same keys in every language", () => {
    expect(Object.keys(copyFor("sl")).sort()).toEqual(
      Object.keys(copyFor("en")).sort(),
    );
    expect(copyFor("sl").start).toBe("Začni");
    expect(copyFor("xx").start).toBe("Start");
  });
});
