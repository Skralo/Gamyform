import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import type { ToolId } from "../../domain";
import type { Palette } from "../theme";
import { arcPoint } from "./math";
import { TOOL_SPECS, type DecalKind } from "./tools";
import { decalTexture } from "./textures";

export type Hit =
  | { kind: "panel"; point: THREE.Vector3; px: { x: number; y: number } }
  | { kind: "world"; point: THREE.Vector3; normal: THREE.Vector3; object: THREE.Mesh }
  | { kind: "sky"; point: THREE.Vector3 };

type Flight = {
  tool: ToolId;
  from: THREE.Vector3;
  to: THREE.Vector3;
  lift: number;
  dur: number;
  age: number;
  count: number;
  spread: number[];
  behind: boolean;
  hit: Hit;
  landed: boolean;
  done: boolean;
  onLand: () => void;
  mesh?: THREE.Mesh;
};
type Ball = { mesh: THREE.Mesh; vel: THREE.Vector3; age: number; resting: boolean; done: boolean };
type Particle = { pos: THREE.Vector3; vel: THREE.Vector3; age: number; life: number; size: number; gravity: number; color: THREE.Color };
type Decal = { mesh: THREE.Mesh; age: number; hold: number; fade: number };
type Layer = "fx" | "world";

const MAX_DECALS = 24;
const FLOOR_Y = 0.12;
const UP_Z = new THREE.Vector3(0, 0, 1);
const PANEL_NORMAL = new THREE.Vector3(0, 0, 1);
const rand = ([a, b]: [number, number]) => a + Math.random() * (b - a);

/** Instanced pool: one draw call for many droplets, bubbles or sparks. */
class Pool {
  readonly mesh: THREE.InstancedMesh;
  private used = 0;
  private m = new THREE.Matrix4();
  private s = new THREE.Vector3();
  private identity = new THREE.Quaternion();
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, private max: number, colored = false) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    if (colored) this.mesh.setColorAt(0, new THREE.Color());
  }
  begin() {
    this.used = 0;
  }
  push(pos: THREE.Vector3, scale: number | THREE.Vector3, quat?: THREE.Quaternion, color?: THREE.Color) {
    if (this.used >= this.max) return;
    if (typeof scale === "number") this.s.setScalar(scale);
    else this.s.copy(scale);
    this.m.compose(pos, quat ?? this.identity, this.s);
    this.mesh.setMatrixAt(this.used, this.m);
    if (color) this.mesh.setColorAt(this.used, color);
    this.used++;
  }
  end() {
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class Effects {
  private flights: Flight[] = [];
  private balls: Ball[] = [];
  private particles: Record<Layer, Particle[]> = { fx: [], world: [] };
  private decals: Decal[] = [];
  private drops: Record<Layer, Pool>;
  private bubbles: Record<Layer, Pool>;
  private sparks: Record<Layer, Pool>;
  private disposables: { dispose(): void }[] = [];
  private decalMaterials = new Map<DecalKind, THREE.MeshStandardMaterial>();
  private ballGeo = new THREE.IcosahedronGeometry(0.055, 1);
  private ballMat: THREE.MeshStandardMaterial;
  private waterTint: THREE.Color;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private stretch = new THREE.Vector3();

  constructor(
    private fxScene: THREE.Scene,
    private worldScene: THREE.Scene,
    private panelZ: number,
    palette: Palette,
    private reduced: boolean,
  ) {
    this.waterTint = new THREE.Color(palette.water).lerp(new THREE.Color("#ffffff"), 0.35);
    const dropMat = new THREE.MeshStandardMaterial({
      color: this.waterTint,
      roughness: 0.06,
      transparent: true,
      opacity: 0.92,
      emissive: new THREE.Color(palette.water),
      emissiveIntensity: 0.18,
    });
    const bubbleMat = new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      roughness: 0.02,
      transparent: true,
      opacity: 0.34,
      iridescence: 1,
      iridescenceIOR: 1.33,
      iridescenceThicknessRange: [120, 480],
      clearcoat: 1,
      depthWrite: false,
    });
    const sparkMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3, flatShading: true });
    this.ballMat = new THREE.MeshStandardMaterial({ color: palette.accent, flatShading: true, roughness: 0.35 });
    const dropGeo = new THREE.IcosahedronGeometry(1, 1),
      bubbleGeo = new THREE.SphereGeometry(1, 18, 12),
      sparkGeo = new THREE.IcosahedronGeometry(1, 0);
    this.disposables.push(dropMat, bubbleMat, sparkMat, this.ballMat, dropGeo, bubbleGeo, sparkGeo, this.ballGeo);
    const pools = (geo: THREE.BufferGeometry, mat: THREE.Material, max: number, colored = false) => {
      const fx = new Pool(geo, mat, max, colored),
        world = new Pool(geo, mat, max, colored);
      fxScene.add(fx.mesh);
      worldScene.add(world.mesh);
      return { fx, world };
    };
    this.drops = pools(dropGeo, dropMat, 160);
    this.bubbles = pools(bubbleGeo, bubbleMat, 64);
    this.sparks = pools(sparkGeo, sparkMat, 220, true);
  }

  /** Cosmetic projectile from the muzzle to the already-resolved hit point. */
  launch(tool: ToolId, from: THREE.Vector3, hit: Hit, onLand: () => void) {
    const spec = TOOL_SPECS[tool];
    const count = tool === "water" ? (this.reduced ? 6 : 12) : tool === "bubbles" ? (this.reduced ? 3 : 6) : 1;
    const flight: Flight = {
      tool,
      from: from.clone(),
      to: hit.point.clone(),
      lift: spec.lift,
      dur: spec.flightMs / 1000,
      age: 0,
      count,
      spread: Array.from({ length: count }, () => Math.random()),
      behind: hit.kind !== "panel" && hit.point.z < this.panelZ,
      hit,
      landed: false,
      done: false,
      onLand,
    };
    if (tool === "throw") {
      flight.mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
      flight.mesh.position.copy(from);
      this.fxScene.add(flight.mesh);
    }
    this.flights.push(flight);
  }

  /** DOM splash on the glass at the hit point (CSS px from the panel's top-left). */
  panelImpact(tool: ToolId, px: { x: number; y: number }, host: HTMLElement) {
    const layer = host.querySelector<HTMLElement>(".gf-impacts");
    if (!layer) return;
    const kind = TOOL_SPECS[tool].panelFx;
    const el = document.createElement("div");
    el.className = `gf-hitfx gf-hitfx-${kind}`;
    el.style.left = `${px.x}px`;
    el.style.top = `${px.y}px`;
    const ring = (delay = 0) => {
      const i = document.createElement("i");
      i.className = "gf-ring";
      i.style.animationDelay = `${delay}ms`;
      el.append(i);
    };
    if (kind === "splash") {
      const wet = document.createElement("i");
      wet.className = "gf-wet";
      el.append(wet);
    } else if (kind === "pop") ring();
    else {
      ring();
      ring(90);
    }
    const drops = kind === "ripple" ? 0 : this.reduced ? 3 : kind === "splash" ? 8 : 6;
    for (let n = 0; n < drops; n++) {
      const d = document.createElement("i"),
        a = Math.random() * Math.PI * 2,
        dist = 2 + Math.random() * 3.5;
      d.className = "gf-drop";
      d.style.setProperty("--dx", `${Math.cos(a) * dist}em`);
      d.style.setProperty("--dy", `${Math.sin(a) * dist}em`);
      el.append(d);
    }
    layer.append(el);
    setTimeout(() => el.remove(), 1400);
  }

  /** `fxDt` slows during hit-stop; `dt` is real time (decals keep fading). */
  update(fxDt: number, dt: number) {
    for (const p of [this.drops, this.bubbles, this.sparks]) {
      p.fx.begin();
      p.world.begin();
    }
    for (const f of this.flights) this.stepFlight(f, fxDt);
    this.flights = this.flights.filter((f) => !f.done);
    for (const b of this.balls) this.stepBall(b, fxDt);
    this.balls = this.balls.filter((b) => !b.done);
    this.stepParticles(this.particles.fx, this.sparks.fx, fxDt);
    this.stepParticles(this.particles.world, this.sparks.world, fxDt);
    this.stepDecals(dt);
    for (const p of [this.drops, this.bubbles, this.sparks]) {
      p.fx.end();
      p.world.end();
    }
  }

  private stepFlight(f: Flight, dt: number) {
    f.age += dt;
    const delay = f.tool === "water" ? 0.008 : f.tool === "bubbles" ? 0.016 : 0;
    let alive = false;
    for (let i = 0; i < f.count; i++) {
      const t = (f.age - i * delay) / f.dur;
      if (t < 0) {
        alive = true;
        continue;
      }
      if (t > 1) continue;
      alive = true;
      const p = arcPoint(f.from, f.to, t, f.lift);
      this.tmp.set(p.x, p.y, p.z);
      const inFront = !f.behind || this.tmp.z >= this.panelZ;
      if (f.tool === "water") {
        const q = arcPoint(f.from, f.to, Math.min(1, t + 0.04), f.lift);
        this.tmp2.set(q.x, q.y, q.z).sub(this.tmp).normalize();
        this.quat.setFromUnitVectors(UP_Z, this.tmp2);
        const r = 0.011 + f.spread[i] * 0.008;
        this.stretch.set(r, r, r * 2.8);
        this.drops[inFront ? "fx" : "world"].push(this.tmp, this.stretch, this.quat);
      } else if (f.tool === "bubbles") {
        const fade = 1 - t;
        this.tmp.x += Math.sin(f.age * 18 + i * 2.1) * 0.035 * fade * (f.spread[i] - 0.5) * 2;
        this.tmp.y += Math.cos(f.age * 15 + i) * 0.025 * fade;
        this.bubbles[inFront ? "fx" : "world"].push(this.tmp, 0.024 + f.spread[i] * 0.03);
      } else if (f.mesh) {
        f.mesh.position.copy(this.tmp);
        f.mesh.rotation.x += dt * 14;
        f.mesh.rotation.y += dt * 9;
        if (!inFront && f.mesh.parent === this.fxScene) this.worldScene.add(f.mesh);
      }
    }
    if (!f.landed && f.age >= f.dur) {
      f.landed = true;
      this.impact(f);
      f.onLand();
    }
    if (f.landed && !alive) f.done = true;
  }

  private impact(f: Flight) {
    const hit = f.hit;
    if (hit.kind === "sky") {
      f.mesh?.removeFromParent();
      return;
    }
    const layer: Layer = hit.kind === "panel" ? "fx" : "world";
    const normal = hit.kind === "world" ? hit.normal : PANEL_NORMAL;
    if (f.tool === "water")
      this.burst(layer, hit.point, normal, 16, { speed: [1.4, 2.8], size: [0.01, 0.022], life: [0.35, 0.6], gravity: -9, color: this.waterTint });
    else if (f.tool === "bubbles")
      this.burst(layer, hit.point, normal, 10, { speed: [0.6, 1.4], size: [0.006, 0.013], life: [0.2, 0.36], gravity: -3, color: new THREE.Color("#ffffff") });
    else
      this.burst(layer, hit.point, normal, 8, { speed: [0.4, 0.9], size: [0.015, 0.03], life: [0.35, 0.6], gravity: -2, color: new THREE.Color("#d8d1c4") });
    if (hit.kind === "world") this.addDecal(TOOL_SPECS[f.tool].decal, hit.object, hit.point, hit.normal);
    if (f.mesh) {
      const dir = this.tmp.copy(f.to).sub(f.from).normalize();
      const vel = dir.reflect(normal).multiplyScalar(2.2).add(new THREE.Vector3(0, 1.4, 0));
      this.balls.push({ mesh: f.mesh, vel: vel.clone(), age: 0, resting: false, done: false });
      f.mesh = undefined;
    }
  }

  private burst(
    layer: Layer,
    at: THREE.Vector3,
    normal: THREE.Vector3,
    count: number,
    o: { speed: [number, number]; size: [number, number]; life: [number, number]; gravity: number; color: THREE.Color },
  ) {
    const list = this.particles[layer];
    const n = Math.round(count * (this.reduced ? 0.5 : 1));
    for (let i = 0; i < n && list.length < 200; i++) {
      const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      if (dir.dot(normal) < 0) dir.negate();
      dir.addScaledVector(normal, 0.6).normalize();
      list.push({
        pos: at.clone().addScaledVector(normal, 0.012),
        vel: dir.multiplyScalar(rand(o.speed)),
        age: 0,
        life: rand(o.life),
        size: rand(o.size),
        gravity: o.gravity,
        color: o.color,
      });
    }
  }

  private stepParticles(list: Particle[], pool: Pool, dt: number) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) {
        list.splice(i, 1);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.vel.multiplyScalar(1 - dt * 1.5);
      p.pos.addScaledVector(p.vel, dt);
      pool.push(p.pos, p.size * (0.4 + 0.6 * (1 - p.age / p.life)), undefined, p.color);
    }
  }

  private stepBall(b: Ball, dt: number) {
    b.age += dt;
    if (!b.resting) {
      b.vel.y -= 9.8 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.x += dt * 8;
      const floor = FLOOR_Y + 0.055;
      if (b.mesh.position.y < floor) {
        b.mesh.position.y = floor;
        b.vel.set(b.vel.x * 0.7, -b.vel.y * 0.42, b.vel.z * 0.7);
        if (Math.abs(b.vel.y) < 0.4) b.resting = true;
      }
    }
    if (b.age > 2.2) {
      const k = Math.max(0, 1 - (b.age - 2.2) / 0.4);
      b.mesh.scale.setScalar(k);
      if (k <= 0) {
        b.mesh.removeFromParent();
        b.done = true;
      }
    }
  }

  private decalMaterial(kind: DecalKind) {
    let m = this.decalMaterials.get(kind);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        map: decalTexture(kind),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        roughness: kind === "wet" ? 0.15 : 0.8,
      });
      this.decalMaterials.set(kind, m);
    }
    return m;
  }

  private addDecal(kind: DecalKind, mesh: THREE.Mesh, point: THREE.Vector3, normal: THREE.Vector3) {
    const size = kind === "wet" ? 0.62 : kind === "soap" ? 0.42 : 0.34;
    const aim = new THREE.Object3D();
    aim.position.copy(point);
    aim.lookAt(point.clone().add(normal));
    aim.rotateZ(Math.random() * Math.PI * 2);
    let geo: THREE.BufferGeometry;
    try {
      geo = new DecalGeometry(mesh, point, aim.rotation, new THREE.Vector3(size, size, size));
    } catch {
      return;
    }
    const decal = new THREE.Mesh(geo, this.decalMaterial(kind).clone());
    decal.renderOrder = 1;
    this.worldScene.add(decal);
    this.decals.push({ mesh: decal, age: 0, hold: kind === "wet" ? 4 : 6, fade: kind === "wet" ? 4 : 3 });
    while (this.decals.length > MAX_DECALS) this.removeDecal(this.decals.shift()!);
  }

  private stepDecals(dt: number) {
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.age += dt;
      if (d.age <= d.hold) continue;
      const k = 1 - (d.age - d.hold) / d.fade;
      (d.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, k);
      if (k <= 0) {
        this.removeDecal(d);
        this.decals.splice(i, 1);
      }
    }
  }

  private removeDecal(d: Decal) {
    d.mesh.removeFromParent();
    d.mesh.geometry.dispose();
    (d.mesh.material as THREE.Material).dispose();
  }

  dispose() {
    this.decals.forEach((d) => this.removeDecal(d));
    this.flights.forEach((f) => f.mesh?.removeFromParent());
    this.balls.forEach((b) => b.mesh.removeFromParent());
    this.decalMaterials.forEach((m) => m.dispose());
    this.disposables.forEach((d) => d.dispose());
  }
}
