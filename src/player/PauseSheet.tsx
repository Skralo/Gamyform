import { Volume2, VolumeX } from "lucide-react";
import type { Copy } from "./copy";

export function PauseSheet({
  t,
  muted,
  volume,
  note,
  onResume,
  onToggleMute,
  onVolume,
  onStandard,
}: {
  t: Copy;
  muted: boolean;
  volume: number;
  note: string;
  onResume(): void;
  onToggleMute(): void;
  onVolume(v: number): void;
  onStandard(): void;
}) {
  return (
    <div className="gf-sheet-backdrop">
      <div className="gf-sheet" role="dialog" aria-modal="true" aria-label={t.paused}>
        <button
          type="button"
          className="gf-pill gf-primary"
          onClick={onResume}
          autoFocus
        >
          {t.resume}
        </button>
        {note && <p className="gf-sheet-note">{note}</p>}
        <div className="gf-sheet-row">
          <button
            type="button"
            className="gf-icon"
            onClick={onToggleMute}
            aria-label={muted ? t.soundOff : t.soundOn}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            disabled={muted}
            aria-label={t.volume}
            onChange={(e) => onVolume(Number(e.target.value))}
          />
        </div>
        <button type="button" className="gf-pill gf-quiet" onClick={onStandard}>
          {t.standardForm}
        </button>
      </div>
    </div>
  );
}
