class Sound {
  private ctx?: AudioContext;
  private gain?: GainNode;
  volume = 0.35;
  muted = false;
  async unlock() {
    this.ctx ??= new AudioContext();
    if (!this.gain) {
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    this.gain.gain.value = this.muted ? 0 : this.volume;
    await this.ctx.resume();
  }
  settings(volume: number, muted: boolean) {
    this.volume = volume;
    this.muted = muted;
    if (this.gain) this.gain.gain.value = muted ? 0 : volume;
  }
  pause() {
    void this.ctx?.suspend();
  }
  play(kind: "shot" | "hit" | "key" | "error" | "success") {
    if (!this.ctx || this.ctx.state !== "running" || !this.gain || this.muted)
      return;
    const now = this.ctx.currentTime;
    const notes =
      kind === "success"
        ? [523, 659, 784]
        : kind === "error"
          ? [180]
          : kind === "hit"
            ? [760, 1140]
            : kind === "key"
              ? [650]
              : [190];
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator(),
        env = this.ctx!.createGain();
      osc.type = kind === "shot" ? "triangle" : "sine";
      const start = now + i * 0.065,
        duration = kind === "success" ? 0.42 : kind === "hit" ? 0.19 : 0.085;
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(
        freq * (kind === "shot" ? 0.35 : 1.03),
        start + duration,
      );
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(
        kind === "key" ? 0.12 : 0.24,
        start + 0.006,
      );
      env.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(env);
      env.connect(this.gain!);
      osc.start(start);
      osc.stop(start + duration + 0.02);
      osc.onended = () => {
        osc.disconnect();
        env.disconnect();
      };
    });
  }
}
export const sound = new Sound();
