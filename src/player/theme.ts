import type { CSSProperties } from "react";
import type { Experience } from "../domain";

export type Palette = {
  skyTop: string;
  skyBottom: string;
  ground: string;
  foliageA: string;
  foliageB: string;
  trunk: string;
  stone: string;
  water: string;
  accent: string;
};

/** Default low-poly "Terrace" colours. Brand palettes replace these in slice 4. */
export const TERRACE: Omit<Palette, "accent"> = {
  skyTop: "#6EC1F2",
  skyBottom: "#D6F1FF",
  ground: "#97D37E",
  foliageA: "#5CB86A",
  foliageB: "#3F9B5B",
  trunk: "#9C6B4E",
  stone: "#EDE6D8",
  water: "#6FD3F2",
};

export function paletteFor(exp: Experience): Palette {
  return { ...TERRACE, accent: exp.accent };
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

export const DARK_INK = "#04121A";

/** Text colour for content placed on the accent (primary buttons, selected answer). */
export function onAccent(hex: string): string {
  const l = luminance(hex);
  return contrast(l, luminance(DARK_INK)) >= contrast(l, 1) ? DARK_INK : "#FFFFFF";
}

export function themeVars(exp: Experience): CSSProperties {
  return {
    "--gf-accent": exp.accent,
    "--gf-on-accent": onAccent(exp.accent),
  } as CSSProperties;
}
