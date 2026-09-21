import * as THREE from "three";
import type { DecalKind } from "./tools";

const cache = new Map<DecalKind, THREE.CanvasTexture>();

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/** Procedural decal textures: a wet stain, a soap ring and a scuff. No image files. */
export function decalTexture(kind: DecalKind): THREE.CanvasTexture {
  const cached = cache.get(kind);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = seeded(kind.length * 977 + 13);
  if (kind === "wet") {
    for (let i = 0; i < 9; i++) {
      const x = 64 + (r() - 0.5) * 40,
        y = 64 + (r() - 0.5) * 40,
        rad = 14 + r() * 24;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, "rgba(8,44,66,0.42)");
      grad.addColorStop(0.72, "rgba(8,44,66,0.3)");
      grad.addColorStop(1, "rgba(8,44,66,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "rgba(8,44,66,0.34)";
    for (let i = 0; i < 11; i++) {
      const a = r() * Math.PI * 2,
        d = 40 + r() * 18;
      g.beginPath();
      g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + r() * 4, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === "soap") {
    const grad = g.createConicGradient(0, 64, 64);
    ["#ff9ad5", "#9ad0ff", "#a6ffcf", "#fff59a", "#ff9ad5"].forEach((col, i, all) =>
      grad.addColorStop(i / (all.length - 1), col),
    );
    g.globalAlpha = 0.8;
    g.lineWidth = 6;
    g.strokeStyle = grad;
    g.beginPath();
    g.arc(64, 64, 44, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 0.16;
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(64, 64, 42, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.55;
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2;
      g.beginPath();
      g.arc(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54, 3 + r() * 3, 0, Math.PI * 2);
      g.stroke();
    }
  } else {
    g.strokeStyle = "rgba(70,60,50,0.55)";
    g.lineCap = "round";
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2,
        r0 = 6 + r() * 8,
        r1 = 26 + r() * 28;
      g.lineWidth = 2 + r() * 4;
      g.beginPath();
      g.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0);
      g.lineTo(64 + Math.cos(a) * r1, 64 + Math.sin(a) * r1);
      g.stroke();
    }
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 22);
    grad.addColorStop(0, "rgba(70,60,50,0.5)");
    grad.addColorStop(1, "rgba(70,60,50,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(kind, tex);
  return tex;
}
