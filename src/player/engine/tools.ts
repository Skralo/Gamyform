import * as THREE from "three";
import type { ToolId } from "../../domain";
import { Spring } from "./spring";

export type PanelFx = "splash" | "pop" | "ripple";
export type DecalKind = "wet" | "soap" | "scuff";
export type ToolSpec = { flightMs: number; lift: number; decal: DecalKind; panelFx: PanelFx };

export const TOOL_SPECS: Record<ToolId, ToolSpec> = {
  water: { flightMs: 140, lift: 0.1, decal: "wet", panelFx: "splash" },
  bubbles: { flightMs: 220, lift: 0.04, decal: "soap", panelFx: "pop" },
  throw: { flightMs: 260, lift: 0.5, decal: "scuff", panelFx: "ripple" },
};

const SHELL = "#F4F6F8",
  INK = "#26303B";
type V3 = [number, number, number];

/** The tool held in first person. Lives in the FX layer, follows the camera. */
export class Viewmodel {
  readonly group = new THREE.Group();
  private rig = new THREE.Group();
  private muzzle = new THREE.Object3D();
  private recoil = new Spring(260, 19);
  private swayX = new Spring(90, 13);
  private swayY = new Spring(90, 13);
  private pump?: THREE.Object3D;
  private held?: THREE.Object3D;
  private heldTimer = 0;
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private accentMaterials: THREE.MeshStandardMaterial[] = [];

  constructor(
    private tool: ToolId,
    accent: string,
    private reduced: boolean,
  ) {
    this.group.add(this.rig);
    if (tool === "water") this.buildWater(accent);
    else if (tool === "bubbles") this.buildBubbles(accent);
    else this.buildThrow(accent);
  }

  private mat(color: string, extra: THREE.MeshStandardMaterialParameters = {}) {
    const m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.42, metalness: 0.04, ...extra });
    this.materials.push(m);
    return m;
  }
  private accent(color: string, extra: THREE.MeshStandardMaterialParameters = {}) {
    const m = this.mat(color, extra);
    this.accentMaterials.push(m);
    return m;
  }
  private part(geo: THREE.BufferGeometry, mat: THREE.Material, pos: V3, rot: V3 = [0, 0, 0], parent: THREE.Object3D = this.rig) {
    this.geometries.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    parent.add(m);
    return m;
  }

  private buildWater(accent: string) {
    const shell = this.mat(SHELL),
      ink = this.mat(INK);
    const tank = this.accent(accent, { roughness: 0.18, transparent: true, opacity: 0.9 });
    this.part(new THREE.BoxGeometry(0.1, 0.085, 0.3), shell, [0, 0, 0]);
    this.part(new THREE.BoxGeometry(0.086, 0.02, 0.28), this.mat("#DDE3EA"), [0, 0.052, -0.005]);
    this.part(new THREE.CylinderGeometry(0.017, 0.021, 0.13, 8), shell, [0, 0.012, -0.205], [Math.PI / 2, 0, 0]);
    this.part(new THREE.CylinderGeometry(0.025, 0.025, 0.022, 8), this.accent(accent), [0, 0.012, -0.27], [Math.PI / 2, 0, 0]);
    this.part(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 10), tank, [0, 0.092, 0.02], [Math.PI / 2, 0, 0]);
    this.part(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 8), ink, [0, 0.092, 0.11], [Math.PI / 2, 0, 0]);
    this.part(new THREE.BoxGeometry(0.058, 0.13, 0.068), ink, [0, -0.09, 0.085], [-0.3, 0, 0]);
    this.part(new THREE.BoxGeometry(0.016, 0.036, 0.018), ink, [0, -0.058, 0.02]);
    this.pump = this.part(new THREE.BoxGeometry(0.072, 0.048, 0.1), this.accent(accent), [0, -0.052, -0.11]);
    this.muzzle.position.set(0, 0.012, -0.285);
    this.rig.add(this.muzzle);
  }

  private buildBubbles(accent: string) {
    const shell = this.mat("#FBF7FF"),
      ink = this.mat(INK);
    this.part(new THREE.SphereGeometry(0.072, 10, 8), shell, [0, 0, -0.02]).scale.set(1, 0.92, 1.75);
    this.part(new THREE.CylinderGeometry(0.026, 0.034, 0.07, 10), shell, [0, 0.008, -0.14], [Math.PI / 2, 0, 0]);
    this.part(new THREE.TorusGeometry(0.052, 0.011, 8, 20), this.accent(accent), [0, 0.008, -0.19]);
    this.part(
      new THREE.CylinderGeometry(0.036, 0.04, 0.09, 10),
      this.mat("#BFE9FF", { transparent: true, opacity: 0.72, roughness: 0.08 }),
      [0, -0.08, -0.05],
    );
    this.part(new THREE.BoxGeometry(0.05, 0.12, 0.06), ink, [0, -0.09, 0.075], [-0.25, 0, 0]);
    this.part(new THREE.SphereGeometry(0.018, 8, 6), this.accent(accent), [0, 0.07, 0.02]);
    this.muzzle.position.set(0, 0.008, -0.2);
    this.rig.add(this.muzzle);
  }

  private buildThrow(accent: string) {
    const glove = this.mat("#F7F4EE"),
      cuff = this.accent(accent);
    const hand = new THREE.Group();
    hand.rotation.set(0.35, -0.3, 0.12);
    this.rig.add(hand);
    this.part(new THREE.BoxGeometry(0.09, 0.036, 0.1), glove, [0, 0, 0], [0, 0, 0], hand);
    for (let i = 0; i < 4; i++)
      this.part(new THREE.BoxGeometry(0.019, 0.023, 0.062), glove, [-0.032 + i * 0.021, 0.012, -0.072], [0.55, 0, 0], hand);
    this.part(new THREE.BoxGeometry(0.024, 0.024, 0.052), glove, [0.054, 0.008, -0.02], [0, -0.7, 0], hand);
    this.part(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 10), cuff, [0, 0, 0.072], [Math.PI / 2, 0, 0], hand);
    this.held = this.part(new THREE.IcosahedronGeometry(0.055, 1), this.accent(accent, { roughness: 0.35 }), [0, 0.055, -0.05], [0, 0, 0], hand);
    this.muzzle.position.set(0, 0.06, -0.07);
    hand.add(this.muzzle);
  }

  fire() {
    this.recoil.kick(this.tool === "throw" ? -16 : 14);
    if (this.held) {
      this.held.visible = false;
      this.heldTimer = 0.4;
    }
  }

  look(dx: number, dy: number) {
    if (this.reduced) return;
    this.swayX.kick(-dx * 0.01);
    this.swayY.kick(dy * 0.01);
  }

  update(dt: number, t: number, camera: THREE.Camera) {
    const step = Math.min(dt, 1 / 30);
    const r = this.recoil.update(step),
      sx = THREE.MathUtils.clamp(this.swayX.update(step), -0.05, 0.05),
      sy = THREE.MathUtils.clamp(this.swayY.update(step), -0.04, 0.04);
    const bob = this.reduced ? 0 : Math.sin(t * 1.7) * 0.004;
    this.group.position.copy(camera.position);
    this.group.quaternion.copy(camera.quaternion);
    this.group.translateX(0.25 + sx);
    this.group.translateY(-0.24 + bob + sy);
    this.group.translateZ(-0.5);
    this.rig.position.z = r * 0.03;
    this.rig.rotation.x = r * (this.tool === "throw" ? -0.09 : 0.07);
    if (this.pump) this.pump.position.z = -0.11 + Math.max(0, r) * 0.02;
    if (this.held && this.heldTimer > 0) {
      this.heldTimer -= dt;
      if (this.heldTimer <= 0) {
        this.held.visible = true;
        this.held.scale.setScalar(0.2);
      }
    }
    if (this.held?.visible && this.held.scale.x < 1)
      this.held.scale.setScalar(Math.min(1, this.held.scale.x + dt * 6));
  }

  muzzleWorld(out: THREE.Vector3) {
    this.group.updateMatrixWorld(true);
    return this.muzzle.getWorldPosition(out);
  }

  setAccent(hex: string) {
    this.accentMaterials.forEach((m) => m.color.set(hex));
  }

  dispose() {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
