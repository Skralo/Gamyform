import { useEffect } from "react";
import type { Experience } from "../domain";
import type { Copy } from "./copy";
import type { PanelActions, PanelView } from "./Panel";

/** Replaced by the three-layer game view in Task 6. Until then: standard form. */
export default function GameView({
  t,
  onStandard,
}: {
  view: PanelView;
  actions: PanelActions;
  t: Copy;
  exp: Experience;
  badge: string;
  generation: string;
  volume: number;
  setVolume(v: number): void;
  onStandard(reason?: string): void;
}) {
  useEffect(() => onStandard(t.noGraphics), []);
  return null;
}
