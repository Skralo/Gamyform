import { useEffect, useMemo, useRef, Component, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { ShotGate } from "../domain";
export type TargetSpec = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  action: string;
  value?: string | number | boolean;
  selected?: boolean;
  disabled?: boolean;
  small?: boolean;
};
type Props = {
  targets: TargetSpec[];
  title: string;
  subtitle: string;
  value?: string;
  generation: string;
  active: boolean;
  reduced: boolean;
  onAction: (t: TargetSpec) => void;
  onLock: (locked: boolean) => void;
  onShot: (hit: boolean) => void;
  onAim: (aim: boolean) => void;
  onError: () => void;
  recenter: number;
};
function textTexture(
  text: string,
  width: number,
  height: number,
  options: { card?: boolean; selected?: boolean; small?: boolean } = {},
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.round((1024 * height) / width);
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width,
    h = canvas.height;
  if (options.card) {
    ctx.fillStyle = options.selected ? "#dcca96" : "#143b3d";
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, Math.min(22, h * 0.12));
    ctx.fill();
    ctx.strokeStyle = options.selected ? "#f3dfb1" : "#64817c";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  let size = Math.min(options.small ? 90 : 52, h * 0.38);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const maxWidth = w - 60;
  let lines: string[] = [];
  function wrap() {
    ctx.font = `${options.card ? "500" : "400"} ${size}px ${options.card ? "Arial" : "Georgia"}`;
    lines = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      const test = (line ? line + " " : "") + word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  wrap();
  while (
    (lines.length * size * 1.2 > h - 24 ||
      lines.some((l) => ctx.measureText(l).width > maxWidth)) &&
    size > 14
  ) {
    size -= 2;
    wrap();
  }
  ctx.fillStyle = options.selected ? "#173a39" : "#f1eee5";
  lines.forEach((l, i) =>
    ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.2),
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function Label({
  text,
  position,
  width,
  height,
  card,
  selected,
  small,
  action,
}: {
  text: string;
  position: [number, number, number];
  width: number;
  height: number;
  card?: boolean;
  selected?: boolean;
  small?: boolean;
  action?: TargetSpec;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const texture = useMemo(
    () => textTexture(text, width, height, { card, selected, small }),
    [text, width, height, card, selected, small],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(() => {
    if (mesh.current) {
      const hit = (mesh.current.userData.hitUntil ?? 0) > performance.now();
      mesh.current.scale.setScalar(hit ? 0.97 : 1);
    }
  });
  return (
    <mesh ref={mesh} position={position} userData={{ action }}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}
function Box({
  pos,
  scale,
  color = "#203f3d",
  metal = 0,
}: {
  pos: [number, number, number];
  scale: [number, number, number];
  color?: string;
  metal?: number;
}) {
  return (
    <mesh position={pos} castShadow receiveShadow>
      <boxGeometry args={scale} />
      <meshStandardMaterial
        color={color}
        roughness={0.7 - metal * 0.3}
        metalness={metal}
      />
    </mesh>
  );
}
function World() {
  return (
    <>
      <color attach="background" args={["#142e30"]} />
      <fog attach="fog" args={["#142e30", 15, 55]} />
      <ambientLight intensity={1.2} />
      <hemisphereLight args={["#bfd8ce", "#2a3229", 2]} />
      <directionalLight
        position={[-4, 9, 6]}
        color="#ffe3b1"
        intensity={3}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight
        position={[0, 4, -0.3]}
        color="#ddc088"
        intensity={16}
        distance={12}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.08, 0]}
        receiveShadow
      >
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#40504a" roughness={0.95} />
      </mesh>
      {Array.from({ length: 15 }, (_, i) => (
        <Box
          key={"tile" + i}
          pos={[0, -0.025, 7 - i * 1.2]}
          scale={[3, 0.04, 1.14]}
          color={i % 2 ? "#66706a" : "#72796f"}
        />
      ))}
      <Box pos={[0, 0.08, -2.3]} scale={[9, 0.25, 3]} color="#647268" />
      <Box pos={[0, 0.26, -2.5]} scale={[8.4, 0.2, 2.4]} color="#7f8678" />
      <Box pos={[0, 2.3, -2.05]} scale={[7.9, 4.7, 0.24]} color="#102c30" />
      <Box
        pos={[0, 2.3, -2.19]}
        scale={[8.05, 4.85, 0.12]}
        color="#ae9b71"
        metal={0.5}
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          {[-2, 2.5, 7].map((z, i) => (
            <group key={z} position={[side * 6, 0, z]}>
              <Box pos={[0, 0.25, 0]} scale={[1.5, 0.5, 1.5]} color="#7a8678" />
              <mesh position={[0, 2.7, 0]} castShadow>
                <cylinderGeometry args={[0.39, 0.5, 4.4, 12]} />
                <meshStandardMaterial color="#829080" roughness={0.85} />
              </mesh>
              <Box pos={[0, 5, 0]} scale={[1.15, 0.45, 1.15]} color="#a3aa92" />
              <Box pos={[0, 5.38, 0]} scale={[1.3, 0.25, 5]} color="#56685b" />
            </group>
          ))}
          <Box pos={[side * 9, 2.5, -8]} scale={[5, 5, 1]} color="#2d4841" />
          {[0, 3, 6].map((n) => (
            <group key={n} position={[side * (4.6 + n * 0.6), 0.5, -4 - n]}>
              <mesh position={[0, 0.6, 0]}>
                <cylinderGeometry args={[0.45, 0.3, 1.3, 8]} />
                <meshStandardMaterial color="#918164" />
              </mesh>
              {[0, 1, 2, 3, 4].map((j) => (
                <mesh
                  key={j}
                  position={[
                    Math.sin(j * 2.4) * 0.45,
                    1.3 + j * 0.36,
                    Math.cos(j * 2.4) * 0.4,
                  ]}
                  rotation={[0.2, j, side * 0.4]}
                  castShadow
                >
                  <icosahedronGeometry args={[0.75, 1]} />
                  <meshStandardMaterial color={j % 2 ? "#385e42" : "#59764a"} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
      <mesh position={[-12, 12, -30]}>
        <sphereGeometry args={[3, 24, 24]} />
        <meshBasicMaterial color="#dfc595" />
      </mesh>
      <Box pos={[0, 6, -13]} scale={[22, 0.5, 1]} color="#3d574a" />
      {[-9, -6, 6, 9].map((x) => (
        <Box key={x} pos={[x, 3, -13]} scale={[0.6, 6, 0.6]} color="#486353" />
      ))}
    </>
  );
}
function Weapon({
  shot,
  reduced,
}: {
  shot: React.RefObject<number>;
  reduced: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(() => {
    if (!group.current) return;
    const kick = reduced
      ? 0
      : Math.max(0, 1 - (performance.now() - shot.current) / 180);
    group.current.position.copy(camera.position);
    group.current.quaternion.copy(camera.quaternion);
    group.current.translateX(0.43);
    group.current.translateY(-0.42);
    group.current.translateZ(-0.85 + kick * 0.08);
    group.current.rotateX(kick * 0.06);
  });
  return (
    <group ref={group}>
      <Box
        pos={[0, 0, -0.12]}
        scale={[0.22, 0.22, 0.57]}
        color="#1c3b3b"
        metal={0.7}
      />
      <Box
        pos={[0, 0.11, -0.13]}
        scale={[0.24, 0.045, 0.6]}
        color="#cdb989"
        metal={0.8}
      />
      <Box pos={[0, -0.18, 0.04]} scale={[0.13, 0.3, 0.14]} color="#2e3330" />
      <mesh position={[0, 0, -0.43]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.065, 0.065, 0.1, 12]} />
        <meshStandardMaterial
          color="#dfc58b"
          metalness={0.8}
          roughness={0.25}
        />
      </mesh>
      <Box pos={[0, 0.16, -0.13]} scale={[0.05, 0.05, 0.06]} color="#fff0c8" />
      <group position={[0, -0.19, 0.05]} rotation={[0.1, 0.1, -0.15]}>
        <Box pos={[0, 0, 0]} scale={[0.18, 0.16, 0.2]} color="#bd9676" />
        <Box
          pos={[0.06, -0.18, 0.19]}
          scale={[0.19, 0.39, 0.22]}
          color="#263e3b"
        />
      </group>
      <group position={[-0.18, -0.1, -0.17]} rotation={[0, 0, -0.9]}>
        <Box pos={[0, 0, 0]} scale={[0.16, 0.13, 0.22]} color="#bd9676" />
        <Box pos={[0, -0.23, 0.11]} scale={[0.17, 0.4, 0.2]} color="#263e3b" />
      </group>
    </group>
  );
}
function Controller(p: Props) {
  const { camera, gl, scene } = useThree(),
    shot = useRef(-1000),
    gate = useRef(new ShotGate()),
    live = useRef(p),
    controls = useRef<PointerLockControls | null>(null),
    aim = useRef(false);
  live.current = p;
  useEffect(() => {
    const c = new PointerLockControls(camera, gl.domElement);
    c.minPolarAngle = Math.PI / 12;
    c.maxPolarAngle = (11 * Math.PI) / 12;
    c.pointerSpeed = 0.65;
    controls.current = c;
    const locked = () => live.current.onLock(true),
      unlocked = () => {
        gate.current.release();
        live.current.onLock(false);
      };
    c.addEventListener("lock", locked);
    c.addEventListener("unlock", unlocked);
    const ray = new THREE.Raycaster();
    const fire = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const q = live.current;
      if (
        !c.isLocked ||
        !q.active ||
        !gate.current.fire(q.generation, performance.now(), q.generation)
      )
        return;
      shot.current = performance.now();
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      const targets: THREE.Object3D[] = [];
      scene.traverse((o) => {
        if (o.userData.action && !o.userData.action.disabled) targets.push(o);
      });
      const hit = ray.intersectObjects(targets, false)[0];
      q.onShot(!!hit);
      if (hit) {
        hit.object.userData.hitUntil = performance.now() + 140;
        q.onAction(hit.object.userData.action);
      }
    };
    const release = () => gate.current.release();
    gl.domElement.addEventListener("mousedown", fire);
    window.addEventListener("mouseup", release);
    const fail = () => live.current.onError();
    document.addEventListener("pointerlockerror", fail);
    const lost = (e: Event) => {
      e.preventDefault();
      live.current.onError();
    };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      c.dispose();
      c.removeEventListener("lock", locked);
      c.removeEventListener("unlock", unlocked);
      gl.domElement.removeEventListener("mousedown", fire);
      window.removeEventListener("mouseup", release);
      document.removeEventListener("pointerlockerror", fail);
      gl.domElement.removeEventListener("webglcontextlost", lost);
    };
  }, [camera, gl, scene]);
  useEffect(() => {
    camera.rotation.set(0, 0, 0);
  }, [p.recenter, camera]);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  useFrame(() => {
    if (!p.active) return;
    ray.setFromCamera(new THREE.Vector2(), camera);
    const targets: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.userData.action && !o.userData.action.disabled) targets.push(o);
    });
    const next = ray.intersectObjects(targets, false).length > 0;
    if (next !== aim.current) {
      aim.current = next;
      p.onAim(next);
    }
  });
  return <Weapon shot={shot} reduced={p.reduced} />;
}
class Boundary extends Component<
  { children: ReactNode; onError: () => void },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.error ? null : this.props.children;
  }
}
export default function Scene(p: Props) {
  return (
    <Boundary onError={p.onError}>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [0, 2.1, 6.4], fov: 55, near: 0.05, far: 100 }}
        gl={{ antialias: true }}
      >
        <World />
        <Label
          text={p.subtitle}
          position={[0, 4.17, -1.88]}
          width={6.7}
          height={0.3}
        />
        <Label
          text={p.title}
          position={[0, 3.56, -1.86]}
          width={6.8}
          height={0.8}
        />
        {p.value !== undefined && (
          <Label
            text={p.value || "…"}
            position={[0, 2.95, -1.84]}
            width={6.4}
            height={0.42}
            card
          />
        )}
        {p.targets.map((t) => (
          <Label
            key={p.generation + t.id}
            text={t.text}
            position={[t.x, t.y, -1.78]}
            width={t.width}
            height={t.height}
            card
            selected={t.selected}
            small={t.small}
            action={t}
          />
        ))}
        <Controller {...p} />
      </Canvas>
    </Boundary>
  );
}
