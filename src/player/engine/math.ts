export type V3 = { x: number; y: number; z: number };
export type Size = { w: number; h: number };

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Point on a parabolic arc from a to b; `lift` is the extra height at the midpoint. */
export function arcPoint(a: V3, b: V3, t: number, lift: number): V3 {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t) + 4 * lift * t * (1 - t),
    z: lerp(a.z, b.z, t),
  };
}

/** A point on the panel plane (world units from the panel centre) → CSS px from the panel's top-left. */
export function panelLocalToPx(
  local: { x: number; y: number },
  scale: number,
  size: Size,
) {
  return { x: local.x / scale + size.w / 2, y: size.h / 2 - local.y / scale };
}

export function insideRect(p: { x: number; y: number }, size: Size) {
  return p.x >= 0 && p.y >= 0 && p.x <= size.w && p.y <= size.h;
}

/**
 * Sizes the panel so its CSS pixels land ~1:1 on screen at the start heading (crisp text).
 * `k` multiplies the 16 px design base; `scale` converts CSS px to world units at `distance`.
 */
export function panelFit(
  viewport: Size,
  fovDeg: number,
  distance: number,
  designWidth = 1000,
) {
  const visibleH = 2 * distance * Math.tan((fovDeg * Math.PI) / 360);
  const displayW = Math.min(viewport.w * 0.62, viewport.h * 1.05);
  return { k: displayW / designWidth, scale: visibleH / viewport.h };
}

/** The enabled shootable element at or above `el`, if any. */
export function closestTarget(el: Element | null): HTMLElement | null {
  const target = el?.closest<HTMLElement>("[data-target]") ?? null;
  if (
    !target ||
    (target as HTMLButtonElement).disabled ||
    target.getAttribute("aria-disabled") === "true"
  )
    return null;
  return target;
}
