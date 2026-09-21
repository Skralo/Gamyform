import * as THREE from "three";
import type { Palette } from "../theme";

export type WorldHandle = {
  group: THREE.Group;
  /** Meshes that can be hit and receive decals. */
  surfaces: THREE.Mesh[];
  fog: THREE.Fog;
  setPalette(p: Palette): void;
  update(t: number): void;
  dispose(): void;
};

type V3 = [number, number, number];

/** Deterministic RNG so the Terrace looks the same on every load. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAGMENT = /* glsl */ `
uniform vec3 top;
uniform vec3 bottom;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y * 1.7 + 0.1, 0.0, 1.0);
  gl_FragColor = vec4(mix(bottom, top, h * h * (3.0 - 2.0 * h)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Soft dark disc used as a cheap contact shadow under props. */
function blobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(20,40,30,0.42)");
  grad.addColorStop(1, "rgba(20,40,30,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildTerrace(p: Palette): WorldHandle {
  const group = new THREE.Group();
  const surfaces: THREE.Mesh[] = [];
  const disposables: { dispose(): void }[] = [];
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.92,
      metalness: 0,
      ...extra,
    });
    disposables.push(m);
    return m;
  };
  const shade = (hex: string, l: number) =>
    "#" + new THREE.Color(hex).offsetHSL(0, 0, l).getHexString();
  const mats = {
    ground: std(p.ground),
    stone: std(p.stone),
    stoneDark: std(shade(p.stone, -0.1)),
    foliageA: std(p.foliageA),
    foliageB: std(p.foliageB),
    trunk: std(p.trunk),
    water: std(p.water, { roughness: 0.1, transparent: true, opacity: 0.86, flatShading: false }),
    cloud: std("#ffffff", { roughness: 1, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.25 }),
    hill: std(shade(p.foliageB, 0.08)),
  };
  const add = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: V3,
    o: { rot?: V3; scale?: V3; shadow?: boolean; surface?: boolean; parent?: THREE.Object3D } = {},
  ) => {
    disposables.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (o.rot) m.rotation.set(...o.rot);
    if (o.scale) m.scale.set(...o.scale);
    m.castShadow = o.shadow ?? true;
    m.receiveShadow = true;
    (o.parent ?? group).add(m);
    if (o.surface ?? true) surfaces.push(m);
    return m;
  };

  // Sky dome around the fixed camera
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(p.skyTop) }, bottom: { value: new THREE.Color(p.skyBottom) } },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  disposables.push(skyMat);
  add(new THREE.SphereGeometry(150, 32, 16), skyMat, [0, 1.6, 5], { shadow: false, surface: false });

  // Light stack: fill (hemisphere), key (sun with one shadow map), rim (from behind)
  const hemi = new THREE.HemisphereLight(p.skyTop, p.ground, 1.35);
  const sun = new THREE.DirectionalLight("#fff3dc", 2.6);
  sun.position.set(-9, 14, 10);
  sun.target.position.set(0, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 60 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  const rim = new THREE.DirectionalLight("#dff4ff", 0.9);
  rim.position.set(6, 8, -14);
  group.add(hemi, sun, sun.target, rim);
  const fog = new THREE.Fog(p.skyBottom, 32, 110);

  // Ground: flat around the terrace, rolling low-poly hills further out
  const groundGeo = new THREE.PlaneGeometry(240, 240, 64, 64);
  groundGeo.rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i),
      z = gp.getZ(i);
    const k = THREE.MathUtils.smoothstep(Math.hypot(x, z + 2), 11, 30);
    gp.setY(i, k * (Math.sin(x * 0.16) * Math.cos(z * 0.13) * 1.4 + Math.sin(x * 0.05 + z * 0.07) * 2.6 + 1.4) - 0.02);
  }
  groundGeo.computeVertexNormals();
  add(groundGeo, mats.ground, [0, 0, 0], { shadow: false });

  // Terrace slab, inset tiles and a low front edge
  add(new THREE.BoxGeometry(12, 0.24, 13), mats.stone, [0, 0, 1.2], { shadow: false });
  for (let i = 0; i < 5; i++)
    add(new THREE.BoxGeometry(1.7, 0.02, 1.7), mats.stoneDark, [-3.6 + i * 1.8, 0.125, -1.2], { shadow: false });

  // Arch that frames the panel and catches shots behind it
  for (const x of [-4.6, 4.6]) {
    add(new THREE.BoxGeometry(1.1, 0.3, 1.1), mats.stoneDark, [x, 0.27, -2.6]);
    add(new THREE.BoxGeometry(0.85, 4.4, 0.85), mats.stone, [x, 2.5, -2.6]);
    add(new THREE.BoxGeometry(1.05, 0.28, 1.05), mats.stoneDark, [x, 4.76, -2.6]);
  }
  add(new THREE.BoxGeometry(10.6, 0.7, 1.0), mats.stone, [0, 5.25, -2.6]);
  add(new THREE.BoxGeometry(10.9, 0.14, 1.12), mats.stoneDark, [0, 4.86, -2.6]);

  // Hedge wall behind the arch, broken into blocks for a hand-made silhouette
  const r = rng(11);
  for (let i = 0; i < 9; i++) {
    const h = 2.2 + r() * 0.8;
    add(new THREE.BoxGeometry(1.95, h, 1.4), i % 2 ? mats.foliageA : mats.foliageB, [-8 + i * 2, h / 2, -6.4 - r() * 0.3]);
  }

  // Pool (left) and planter with shrubs (right) at the terrace sides
  const rim_ = (x: number, z: number, w: number, d: number) =>
    add(new THREE.BoxGeometry(w, 0.32, d), mats.stoneDark, [x, 0.28, z]);
  rim_(-4.3, 1.35, 3.2, 0.26);
  rim_(-4.3, 3.45, 3.2, 0.26);
  rim_(-5.77, 2.4, 0.26, 1.84);
  rim_(-2.83, 2.4, 0.26, 1.84);
  add(new THREE.PlaneGeometry(2.66, 1.84), mats.water, [-4.3, 0.3, 2.4], { rot: [-Math.PI / 2, 0, 0], shadow: false });
  add(new THREE.BoxGeometry(2.4, 0.62, 1.3), mats.stoneDark, [4.3, 0.43, 2.4]);
  for (let i = 0; i < 3; i++)
    add(new THREE.IcosahedronGeometry(0.46 + i * 0.05, 0), i % 2 ? mats.foliageA : mats.foliageB, [3.55 + i * 0.75, 1.02, 2.4], { rot: [r(), r(), r()] });

  // Contact shadows
  const blob = blobTexture();
  disposables.push(blob);
  const blobMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false });
  disposables.push(blobMat);
  const blobGeo = new THREE.PlaneGeometry(1, 1);
  disposables.push(blobGeo);
  const contact = (x: number, z: number, s: number, y = 0.02) => {
    const m = new THREE.Mesh(blobGeo, blobMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    group.add(m);
  };

  // Trees: trunk + one or two faceted canopies, placed outside the terrace
  const tree = (x: number, z: number, s: number, lean: number) => {
    const y = 0;
    add(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 1.5 * s, 6), mats.trunk, [x, y + 0.75 * s, z], { rot: [0, 0, lean] });
    add(new THREE.IcosahedronGeometry(1.05 * s, 0), r() > 0.5 ? mats.foliageA : mats.foliageB, [x + lean * -1.2 * s, y + 2.1 * s, z], {
      rot: [r() * 3, r() * 3, r() * 3],
      scale: [1, 1.1 + r() * 0.3, 1],
    });
    if (r() > 0.45)
      add(new THREE.IcosahedronGeometry(0.7 * s, 0), mats.foliageA, [x + 0.45 * s, y + 2.9 * s, z + 0.2 * s], { rot: [r() * 3, r() * 3, r() * 3] });
    contact(x, z, 2.6 * s);
  };
  for (let i = 0; i < 20; i++) {
    const side = i % 2 ? 1 : -1;
    tree(side * (6.8 + r() * 11), -20 + r() * 24, 0.8 + r() * 0.7, (r() - 0.5) * 0.16);
  }
  // Rocks
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1,
      s = 0.3 + r() * 0.55,
      x = side * (6.4 + r() * 8),
      z = -14 + r() * 18;
    add(new THREE.DodecahedronGeometry(s, 0), mats.stone, [x, s * 0.45, z], { rot: [r() * 3, r() * 3, r() * 3], scale: [1.2, 0.8, 1] });
    contact(x, z, s * 3);
  }
  for (const x of [-4.6, 4.6]) contact(x, -2.6, 2.4, 0.13);

  // Layered background silhouettes for depth
  for (let i = 0; i < 9; i++) {
    const x = -80 + i * 20 + r() * 8,
      s = 10 + r() * 12;
    add(new THREE.ConeGeometry(s, s * (0.55 + r() * 0.3), 7), i % 2 ? mats.hill : mats.foliageB, [x, s * 0.2 - 1, -58 - r() * 22], {
      shadow: false,
      surface: false,
    });
  }

  // Drifting low-poly clouds
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Group();
    c.position.set(-60 + i * 19 + r() * 10, 17 + r() * 8, -32 - r() * 30);
    for (let j = 0; j < 3 + Math.floor(r() * 2); j++)
      add(new THREE.IcosahedronGeometry(1.4 + r() * 1.3, 0), mats.cloud, [j * 1.7 - 2, r() * 0.8, r() * 0.8], {
        shadow: false,
        surface: false,
        parent: c,
      });
    group.add(c);
    clouds.push(c);
  }

  return {
    group,
    surfaces,
    fog,
    setPalette(q) {
      mats.ground.color.set(q.ground);
      mats.stone.color.set(q.stone);
      mats.stoneDark.color.set(shade(q.stone, -0.1));
      mats.foliageA.color.set(q.foliageA);
      mats.foliageB.color.set(q.foliageB);
      mats.trunk.color.set(q.trunk);
      mats.water.color.set(q.water);
      mats.hill.color.set(shade(q.foliageB, 0.08));
      skyMat.uniforms.top.value.set(q.skyTop);
      skyMat.uniforms.bottom.value.set(q.skyBottom);
      hemi.color.set(q.skyTop);
      hemi.groundColor.set(q.ground);
      fog.color.set(q.skyBottom);
    },
    update(t) {
      clouds.forEach((c, i) => {
        c.position.x += 0.004 * (1 + (i % 3) * 0.4);
        if (c.position.x > 75) c.position.x = -75;
      });
      mats.water.emissive.setRGB(0.02, 0.05, 0.07).multiplyScalar(1 + Math.sin(t * 1.6) * 0.5);
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}
