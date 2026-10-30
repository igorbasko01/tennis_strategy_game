/** Tiny synthesised sound effects; no audio files needed. */
export class Sound {
  private ctx: AudioContext | null = null;
  muted = false;

  /** Must be called from a user gesture on mobile browsers. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) this.ctx = new Ctor();
  }

  private blip(freq: number, duration: number, gain: number, type: OscillatorType = 'triangle'): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t + duration);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }

  hit(power: number): void {
    this.blip(520 + power * 260, 0.09, 0.35 * (0.5 + power / 2));
  }

  bounce(): void {
    this.blip(260, 0.06, 0.15, 'sine');
  }

  point(won: boolean): void {
    if (won) {
      this.blip(660, 0.15, 0.12, 'sine');
      setTimeout(() => this.blip(990, 0.22, 0.12, 'sine'), 120);
    } else {
      this.blip(330, 0.25, 0.1, 'sine');
    }
  }
}
