import type { ToolId } from "./domain";

export type SoundKind =
  | `fire-${ToolId}`
  | `impact-${ToolId}`
  | "select"
  | "tick"
  | "error"
  | "success";

type ToneOpts = { type?: OscillatorType; gain?: number; delay?: number };
type NoiseOpts = {
  filter: BiquadFilterType;
  from: number;
  to: number;
  q?: number;
  gain?: number;
  delay?: number;
};

/** Original synthesized feedback: no sample files, ±6% pitch variation, capped voices. */
class Sound {
  private ctx?: AudioContext;
  private out?: GainNode;
  private noise?: AudioBuffer;
  private voices = 0;
  volume = 0.45;
  muted = false;
  async unlock() {
    this.ctx ??= new AudioContext();
    if (!this.out) {
      this.out = this.ctx.createGain();
      this.out.connect(this.ctx.destination);
    }
    if (!this.noise) {
      const length = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    this.out.gain.value = this.muted ? 0 : this.volume;
    await this.ctx.resume();
  }
  settings(volume: number, muted: boolean) {
    this.volume = volume;
    this.muted = muted;
    if (this.out) this.out.gain.value = muted ? 0 : volume;
  }
  pause() {
    void this.ctx?.suspend();
  }
  play(kind: SoundKind) {
    const c = this.ctx;
    if (!c || c.state !== "running" || !this.out || this.muted || this.voices > 14)
      return;
    const p = 1 + (Math.random() * 2 - 1) * 0.06;
    switch (kind) {
      case "fire-water":
        this.noise_(0.09, { filter: "bandpass", from: 2600 * p, to: 1400 * p, q: 1.2, gain: 0.22 });
        this.tone(190 * p, 110 * p, 0.07, { type: "triangle", gain: 0.12 });
        break;
      case "impact-water":
        this.noise_(0.22, { filter: "lowpass", from: 5200 * p, to: 700, gain: 0.26 });
        this.tone(1800 * p, 2600 * p, 0.05, { gain: 0.05, delay: 0.03 });
        this.tone(2300 * p, 3100 * p, 0.04, { gain: 0.04, delay: 0.07 });
        break;
      case "fire-bubbles":
        this.tone(420 * p, 700 * p, 0.1, { gain: 0.14 });
        this.tone(620 * p, 980 * p, 0.08, { gain: 0.08, delay: 0.035 });
        break;
      case "impact-bubbles":
        this.tone(1500 * p, 520 * p, 0.035, { gain: 0.16 });
        this.noise_(0.03, { filter: "highpass", from: 3000, to: 3000, gain: 0.08 });
        break;
      case "fire-throw":
        this.noise_(0.24, { filter: "bandpass", from: 500 * p, to: 1700 * p, q: 0.9, gain: 0.2 });
        break;
      case "impact-throw":
        this.tone(150 * p, 58 * p, 0.17, { gain: 0.3 });
        this.noise_(0.05, { filter: "lowpass", from: 1400, to: 300, gain: 0.14 });
        break;
      case "select":
        this.tone(760, 1140, 0.16, { gain: 0.14 });
        this.tone(1140, 1520, 0.14, { gain: 0.08, delay: 0.05 });
        break;
      case "tick":
        this.tone(650 * p, 700 * p, 0.05, { gain: 0.1 });
        break;
      case "error":
        this.tone(200, 150, 0.16, { type: "triangle", gain: 0.16 });
        break;
      case "success":
        [523, 659, 784].forEach((f, i) =>
          this.tone(f, f * 1.01, 0.42, { gain: 0.14, delay: i * 0.065 }),
        );
        break;
    }
  }
  private voice(source: AudioScheduledSourceNode, start: number, stop: number, nodes: AudioNode[]) {
    this.voices++;
    source.onended = () => {
      this.voices--;
      source.disconnect();
      nodes.forEach((n) => n.disconnect());
    };
    if (source instanceof AudioBufferSourceNode) source.start(start, Math.random() * 0.5);
    else source.start(start);
    source.stop(stop);
  }
  private envelope(env: GainNode, t: number, peak: number, dur: number) {
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  private tone(from: number, to: number, dur: number, o: ToneOpts = {}) {
    const c = this.ctx!,
      t = c.currentTime + (o.delay ?? 0);
    const osc = c.createOscillator(),
      env = c.createGain();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    this.envelope(env, t, o.gain ?? 0.2, dur);
    osc.connect(env).connect(this.out!);
    this.voice(osc, t, t + dur + 0.03, [env]);
  }
  private noise_(dur: number, o: NoiseOpts) {
    const c = this.ctx!,
      t = c.currentTime + (o.delay ?? 0);
    const src = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      env = c.createGain();
    src.buffer = this.noise!;
    filter.type = o.filter;
    filter.Q.value = o.q ?? 0.8;
    filter.frequency.setValueAtTime(o.from, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    this.envelope(env, t, o.gain ?? 0.2, dur);
    src.connect(filter).connect(env).connect(this.out!);
    this.voice(src, t, t + dur + 0.03, [filter, env]);
  }
}

export const sound = new Sound();
