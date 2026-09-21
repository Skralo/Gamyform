// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  arcPoint,
  closestTarget,
  insideRect,
  panelFit,
  panelLocalToPx,
} from "../src/player/engine/math";
import { Spring } from "../src/player/engine/spring";

describe("player engine math", () => {
  it("arcs start and end exactly at the given points and lift the middle", () => {
    const a = { x: 0, y: 1, z: 5 },
      b = { x: 2, y: 1, z: 0 };
    expect(arcPoint(a, b, 0, 0.5)).toEqual(a);
    expect(arcPoint(a, b, 1, 0.5)).toEqual(b);
    expect(arcPoint(a, b, 0.5, 0.5).y).toBeCloseTo(1.5);
  });
  it("maps panel-plane points to CSS pixels from the top-left", () => {
    const size = { w: 800, h: 500 };
    expect(panelLocalToPx({ x: 0, y: 0 }, 0.01, size)).toEqual({ x: 400, y: 250 });
    expect(panelLocalToPx({ x: -4, y: 2.5 }, 0.01, size)).toEqual({ x: 0, y: 0 });
    expect(insideRect({ x: 400, y: 250 }, size)).toBe(true);
    expect(insideRect({ x: 801, y: 10 }, size)).toBe(false);
  });
  it("fits the panel so CSS pixels land 1:1 on screen", () => {
    const f = panelFit({ w: 1440, h: 900 }, 55, 4.4);
    expect(f.k).toBeCloseTo(0.8928, 4);
    expect(f.scale).toBeCloseTo(0.00509, 5);
  });
  it("finds the enabled shootable ancestor only", () => {
    document.body.innerHTML = `<button data-target id="a"><span id="s">A</span></button><button data-target disabled id="b"><span id="t">B</span></button><p id="p">x</p>`;
    expect(closestTarget(document.getElementById("s"))?.id).toBe("a");
    expect(closestTarget(document.getElementById("t"))).toBeNull();
    expect(closestTarget(document.getElementById("p"))).toBeNull();
    expect(closestTarget(null)).toBeNull();
  });
  it("springs kick away and settle back to rest", () => {
    const s = new Spring(240, 18);
    s.kick(10);
    let peak = 0;
    for (let i = 0; i < 90; i++) peak = Math.max(peak, s.update(1 / 60));
    expect(peak).toBeGreaterThan(0.2);
    expect(Math.abs(s.value)).toBeLessThan(0.01);
  });
});
