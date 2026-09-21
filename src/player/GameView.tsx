import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Experience } from "../domain";
import { sound } from "../audio";
import type { Copy } from "./copy";
import { Panel, type PanelActions, type PanelView } from "./Panel";
import { PauseSheet } from "./PauseSheet";
import { paletteFor, themeVars } from "./theme";
import { Engine } from "./engine/Engine";

type Props = {
  view: PanelView;
  actions: PanelActions;
  t: Copy;
  exp: Experience;
  badge: string;
  generation: string;
  volume: number;
  setVolume(v: number): void;
  onStandard(reason?: string): void;
};

const focusInput = (e: Engine) =>
  e.panelElement
    .querySelector<HTMLElement>(".gf-input, .gf-number-value")
    ?.focus({ preventScroll: true });

/** The 3D player: engine layers + the glass panel portal + minimal HUD + pause sheet. */
export default function GameView({
  view,
  actions,
  t,
  exp,
  badge,
  generation,
  volume,
  setVolume,
  onStandard,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [locked, setLocked] = useState(false);
  const [aim, setAim] = useState(false);
  const [shots, setShots] = useState(0);
  const [hintGone, setHintGone] = useState(false);
  const [lockNote, setLockNote] = useState("");
  const gen = useRef(generation);
  gen.current = generation;
  const reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    let e: Engine;
    try {
      e = new Engine(stageRef.current!, {
        tool: exp.tool,
        palette: paletteFor(exp),
        reducedMotion: reduced,
      });
    } catch {
      onStandard(t.noGraphics);
      return;
    }
    const off = [
      e.on("lock", (l) => {
        setLocked(l);
        if (l) {
          setLockNote("");
          focusInput(e);
        }
      }),
      e.on("aim", (el) => setAim(!!el)),
      e.on("fire", () => setShots((n) => n + 1)),
      e.on("land", (target, g) => {
        if (target?.isConnected && g === gen.current) target.click();
      }),
      e.on("error", () => onStandard(t.noGraphics)),
    ];
    setEngine(e);
    return () => {
      off.forEach((f) => f());
      e.dispose();
    };
  }, []);

  useEffect(() => engine?.setGeneration(generation), [engine, generation]);
  useEffect(() => {
    engine?.setActive(
      locked && (view.stage === "question" || view.stage === "review") && !view.busy,
    );
  }, [engine, locked, view.stage, view.busy]);
  useEffect(() => {
    if (!locked || hintGone) return;
    const id = setTimeout(() => setHintGone(true), 6000);
    return () => clearTimeout(id);
  }, [locked, hintGone]);
  useEffect(() => {
    if (view.stage !== "success") return;
    const id = setTimeout(() => document.exitPointerLock?.(), 900);
    return () => clearTimeout(id);
  }, [view.stage]);

  async function lock(first: boolean) {
    if (!engine) return false;
    if (import.meta.env.DEV && new URLSearchParams(location.search).has("nolock")) {
      (window as unknown as { __gf?: { fakeLock(): void } }).__gf?.fakeLock();
      void sound.unlock();
      return true;
    }
    const pending = engine.lock();
    void sound.unlock();
    const ok = await pending;
    if (!ok) {
      if (first) onStandard(t.noPointer);
      else setLockNote(t.lockAgain);
    }
    return ok;
  }

  const gameActions: PanelActions = {
    ...actions,
    start: () => {
      void lock(true).then(() => actions.start());
    },
  };
  const started = view.stage !== "start";
  const paused = started && view.stage !== "success" && !locked;
  const showHint = locked && !hintGone && shots === 0 && view.stage === "question";

  return (
    <div className="gf-root gf-game" style={themeVars(exp)}>
      <div ref={stageRef} className="gf-stage" />
      {engine && createPortal(<Panel view={view} actions={gameActions} t={t} />, engine.panelElement)}
      {locked && (
        <div className={"gf-crosshair" + (aim ? " on-target" : "")}>
          {shots > 0 && <i key={shots} className="gf-pulse" />}
        </div>
      )}
      {showHint && <div className="gf-hint">{t.hint}</div>}
      {badge && <div className="gf-chip">{badge}</div>}
      {paused && (
        <PauseSheet
          t={t}
          muted={view.muted}
          volume={volume}
          note={lockNote}
          onResume={() => void lock(false)}
          onToggleMute={actions.toggleMute}
          onVolume={setVolume}
          onStandard={() => onStandard()}
        />
      )}
    </div>
  );
}
