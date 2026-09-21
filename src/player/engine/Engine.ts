import * as THREE from "three";
import { CSS3DObject, CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { ShotGate, type ToolId } from "../../domain";
import { sound } from "../../audio";
import type { Palette } from "../theme";
import { closestTarget, insideRect, panelFit, panelLocalToPx } from "./math";
import { buildTerrace, type WorldHandle } from "./world";
import { Viewmodel } from "./tools";
import { Effects, type Hit } from "./effects";

export const CAMERA_POS = new THREE.Vector3(0, 1.6, 5);
export const PANEL_POS = new THREE.Vector3(0, 1.72, 0.6);
const FOV = 55;
const MAX_DPR = 1.5;
const HITSTOP_MS = 60;
const HITSTOP_SCALE = 0.05;

type Events = {
  lock: [locked: boolean];
  aim: [target: HTMLElement | null];
  fire: [];
  land: [target: HTMLElement | null, generation: string];
  error: [reason: "webgl"];
};
export type EngineOptions = { tool: ToolId; palette: Palette; reducedMotion: boolean };

function makeRenderer(alpha: boolean) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha, powerPreference: "high-performance" });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping;
  if (alpha) r.setClearColor(0x000000, 0);
  return r;
}

/**
 * Three stacked layers sharing one camera and one frame loop:
 * world (WebGL) → glass panel (CSS3D, real HTML) → tool + effects (WebGL, transparent).
 */
export class Engine {
  readonly panelElement: HTMLDivElement;
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 220);
  private worldRenderer = makeRenderer(false);
  private fxRenderer = makeRenderer(true);
  private cssRenderer = new CSS3DRenderer();
  private worldScene = new THREE.Scene();
  private fxScene = new THREE.Scene();
  private cssScene = new THREE.Scene();
  private panelObject: CSS3DObject;
  private panelPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -PANEL_POS.z);
  private controls: PointerLockControls;
  private world: WorldHandle;
  private viewmodel: Viewmodel;
  private effects: Effects;
  private gate = new ShotGate();
  private ray = new THREE.Raycaster();
  private listeners = new Map<keyof Events, Set<(...args: never[]) => void>>();
  private generation = "";
  private active = false;
  private pending = false;
  private fakeLock = false;
  private aimEl: HTMLElement | null = null;
  private scale = 0.005;
  private centre = { x: 0, y: 0 };
  private home = { yaw: 0, pitch: 0 };
  private recenter: { yaw: number; pitch: number; t0: number } | null = null;
  private raf = 0;
  private last = performance.now();
  private hitstopUntil = 0;
  private slowSince = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;

  constructor(
    private host: HTMLElement,
    private opts: EngineOptions,
  ) {
    this.worldRenderer.shadowMap.enabled = true;
    this.worldRenderer.shadowMap.type = THREE.PCFShadowMap;
    this.worldRenderer.domElement.className = "gf-layer gf-world";
    this.cssRenderer.domElement.className = "gf-layer gf-css3d";
    this.fxRenderer.domElement.className = "gf-layer gf-fxlayer";
    host.append(this.worldRenderer.domElement, this.cssRenderer.domElement, this.fxRenderer.domElement);

    this.camera.position.copy(CAMERA_POS);
    this.camera.rotation.order = "YXZ";
    this.camera.lookAt(PANEL_POS);
    this.home = { yaw: this.camera.rotation.y, pitch: this.camera.rotation.x };

    this.world = buildTerrace(opts.palette);
    this.worldScene.add(this.world.group);
    this.worldScene.fog = this.world.fog;

    const pmrem = new THREE.PMREMGenerator(this.fxRenderer);
    const room = new RoomEnvironment();
    this.fxScene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    const key = new THREE.DirectionalLight("#fff4e0", 1.8);
    key.position.set(-2, 4, 3);
    this.fxScene.add(new THREE.HemisphereLight("#ffffff", "#8aa3b8", 1.5), key);

    this.panelElement = document.createElement("div");
    this.panelElement.className = "gf-panel-host";
    this.panelObject = new CSS3DObject(this.panelElement);
    this.panelObject.position.copy(PANEL_POS);
    this.cssScene.add(this.panelObject);

    this.viewmodel = new Viewmodel(opts.tool, opts.palette.accent, opts.reducedMotion);
    this.fxScene.add(this.viewmodel.group);
    this.effects = new Effects(this.fxScene, this.worldScene, PANEL_POS.z, opts.palette, opts.reducedMotion);

    this.controls = new PointerLockControls(this.camera, host);
    this.controls.pointerSpeed = 0.65;
    this.controls.minPolarAngle = Math.PI / 12;
    this.controls.maxPolarAngle = (11 * Math.PI) / 12;
    this.controls.addEventListener("lock", this.onLock);
    this.controls.addEventListener("unlock", this.onUnlock);
    host.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("mousemove", this.onMouseMove);
    this.worldRenderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    this.fxRenderer.domElement.addEventListener("webglcontextlost", this.onContextLost);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
    if (import.meta.env.DEV) this.installTestHook();
  }

  on<K extends keyof Events>(name: K, cb: (...args: Events[K]) => void) {
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, (set = new Set()));
    set.add(cb as (...args: never[]) => void);
    return () => {
      set.delete(cb as (...args: never[]) => void);
    };
  }
  private emit<K extends keyof Events>(name: K, ...args: Events[K]) {
    this.listeners.get(name)?.forEach((cb) => (cb as (...a: Events[K]) => void)(...args));
  }

  get locked() {
    return this.controls.isLocked || this.fakeLock;
  }
  setGeneration(g: string) {
    if (g === this.generation) return;
    this.generation = g;
    this.pending = false;
  }
  setActive(on: boolean) {
    this.active = on;
    if (!on) this.setAim(null);
  }

  /** Request pointer lock from a user gesture. Resolves false if the browser refuses. */
  lock(): Promise<boolean> {
    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        document.removeEventListener("pointerlockchange", change);
        document.removeEventListener("pointerlockerror", fail);
        clearTimeout(timer);
        resolve(ok);
      };
      const change = () => done(document.pointerLockElement === this.host);
      const fail = () => done(false);
      const timer = setTimeout(() => done(document.pointerLockElement === this.host), 1500);
      document.addEventListener("pointerlockchange", change);
      document.addEventListener("pointerlockerror", fail);
      try {
        const r: unknown = this.host.requestPointerLock();
        if (r instanceof Promise) r.catch(() => done(false));
      } catch {
        done(false);
      }
    });
  }

  private onLock = () => {
    this.emit("lock", true);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const toPanel = PANEL_POS.clone().sub(CAMERA_POS).normalize();
    if (forward.angleTo(toPanel) > THREE.MathUtils.degToRad(35))
      this.recenter = { yaw: this.camera.rotation.y, pitch: this.camera.rotation.x, t0: performance.now() };
  };
  private onUnlock = () => {
    this.gate.release();
    this.setAim(null);
    this.emit("lock", false);
  };
  private onMouseUp = () => this.gate.release();
  private onMouseMove = (e: MouseEvent) => {
    if (this.controls.isLocked) this.viewmodel.look(e.movementX, e.movementY);
  };
  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.emit("error", "webgl");
  };
  private onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || !this.locked) return;
    e.preventDefault();
    this.shoot();
  };

  private shoot() {
    if (!this.active || this.pending) return;
    if (!this.gate.fire(this.generation, performance.now(), this.generation)) return;
    const target = closestTarget(document.elementFromPoint(this.centre.x, this.centre.y));
    const hit = this.resolveHit();
    const generation = this.generation,
      tool = this.opts.tool;
    if (target) this.pending = true;
    this.viewmodel.fire();
    sound.play(`fire-${tool}`);
    this.emit("fire");
    this.effects.launch(tool, this.viewmodel.muzzleWorld(new THREE.Vector3()), hit, () => {
      sound.play(`impact-${tool}`);
      if (hit.kind === "panel") this.effects.panelImpact(tool, hit.px, this.panelElement);
      if (target) {
        if (!this.opts.reducedMotion) this.hitstopUntil = performance.now() + HITSTOP_MS;
        target.removeAttribute("data-hit");
        void target.offsetWidth;
        target.setAttribute("data-hit", "");
      }
      this.pending = false;
      this.emit("land", target, generation);
    });
  }

  private resolveHit(): Hit {
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const p = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(this.panelPlane, p)) {
      const size = { w: this.panelElement.offsetWidth, h: this.panelElement.offsetHeight };
      const px = panelLocalToPx({ x: p.x - PANEL_POS.x, y: p.y - PANEL_POS.y }, this.scale, size);
      if (insideRect(px, size)) return { kind: "panel", point: p, px };
    }
    const h = this.ray.intersectObjects(this.world.surfaces, false)[0];
    if (h?.face)
      return {
        kind: "world",
        point: h.point,
        normal: h.face.normal.clone().transformDirection(h.object.matrixWorld),
        object: h.object as THREE.Mesh,
      };
    return { kind: "sky", point: this.ray.ray.at(60, p) };
  }

  private setAim(el: HTMLElement | null) {
    if (el === this.aimEl) return;
    this.aimEl?.removeAttribute("data-aim");
    el?.setAttribute("data-aim", "");
    this.aimEl = el;
    this.emit("aim", el);
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.watchPerformance(dt, now);
    if (this.recenter) this.stepRecenter(now);
    const fxDt = now < this.hitstopUntil ? dt * HITSTOP_SCALE : dt;
    this.world.update(now / 1000);
    this.viewmodel.update(dt, now / 1000, this.camera);
    this.effects.update(fxDt, dt);
    this.worldRenderer.render(this.worldScene, this.camera);
    this.cssRenderer.render(this.cssScene, this.camera);
    this.fxRenderer.render(this.fxScene, this.camera);
    if (this.locked && this.active)
      this.setAim(closestTarget(document.elementFromPoint(this.centre.x, this.centre.y)));
    this.raf = requestAnimationFrame(this.frame);
  };

  private stepRecenter(now: number) {
    const r = this.recenter!;
    const t = Math.min(1, (now - r.t0) / 380),
      e = 1 - Math.pow(1 - t, 3);
    const dYaw = Math.atan2(Math.sin(this.home.yaw - r.yaw), Math.cos(this.home.yaw - r.yaw));
    this.camera.rotation.set(r.pitch + (this.home.pitch - r.pitch) * e, r.yaw + dYaw * e, 0, "YXZ");
    if (t >= 1) this.recenter = null;
  }

  /** Frame time above 25 ms for 2 s → solid glass (drop the backdrop blur). */
  private watchPerformance(dt: number, now: number) {
    if (dt <= 0.025) {
      this.slowSince = 0;
      return;
    }
    if (!this.slowSince) this.slowSince = now;
    else if (now - this.slowSince > 2000) this.panelElement.classList.add("gf-solid");
  }

  private resize() {
    const r = this.host.getBoundingClientRect();
    const w = Math.max(1, r.width),
      h = Math.max(1, r.height);
    const dpr = Math.min(devicePixelRatio || 1, MAX_DPR);
    for (const renderer of [this.worldRenderer, this.fxRenderer]) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
    }
    this.cssRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const fit = panelFit({ w, h }, FOV, CAMERA_POS.z - PANEL_POS.z);
    this.scale = fit.scale;
    this.panelObject.scale.setScalar(fit.scale);
    this.panelElement.style.fontSize = `${16 * fit.k}px`;
    this.centre = { x: r.left + w / 2, y: r.top + h / 2 };
  }

  /** Dev-only hook for automated browser checks: aim at a selector, fire, fake the lock. */
  private installTestHook() {
    (window as unknown as { __gf?: object }).__gf = {
      fakeLock: () => {
        this.fakeLock = true;
        this.emit("lock", true);
      },
      aim: (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        const b = el.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((b.left + b.width / 2 - this.centre.x) / (this.centre.x * 2)) * 2,
          -((b.top + b.height / 2 - this.centre.y) / (this.centre.y * 2)) * 2,
        );
        this.ray.setFromCamera(ndc, this.camera);
        const d = this.ray.ray.direction;
        this.camera.rotation.set(Math.asin(d.y), Math.atan2(-d.x, -d.z), 0, "YXZ");
        return true;
      },
      fire: () => {
        this.gate.release();
        this.shoot();
      },
      state: () => ({
        active: this.active,
        pending: this.pending,
        locked: this.locked,
        generation: this.generation,
        lastFrame: Math.round(this.last),
        disposed: this.disposed,
        cssConnected: this.cssRenderer.domElement.isConnected,
        panelConnected: this.panelElement.isConnected,
      }),
    };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("lock", this.onLock);
    this.controls.removeEventListener("unlock", this.onUnlock);
    this.controls.dispose();
    this.host.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    this.worldRenderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    this.fxRenderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    if (document.pointerLockElement === this.host) document.exitPointerLock();
    this.effects.dispose();
    this.viewmodel.dispose();
    this.world.dispose();
    this.fxScene.environment?.dispose();
    for (const renderer of [this.worldRenderer, this.fxRenderer]) {
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
    this.cssRenderer.domElement.remove();
    if (import.meta.env.DEV) delete (window as unknown as { __gf?: object }).__gf;
  }
}
