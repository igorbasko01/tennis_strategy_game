interface Job {
  elapsed: number;
  duration: number;
  step: (t: number) => void;
  resolve: () => void;
}

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Frame-driven tweens that resolve promises, so sequences read as async code. */
export class Animator {
  private jobs = new Set<Job>();
  /** Multiplies how fast time passes for all running tweens. */
  speed = 1;

  tween(duration: number, step: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      step(0);
      this.jobs.add({ elapsed: 0, duration: Math.max(duration, 1e-6), step, resolve });
    });
  }

  wait(duration: number): Promise<void> {
    return this.tween(duration, () => {});
  }

  update(dt: number): void {
    for (const job of [...this.jobs]) {
      job.elapsed += dt * this.speed;
      const t = Math.min(1, job.elapsed / job.duration);
      job.step(t);
      if (t >= 1) {
        this.jobs.delete(job);
        job.resolve();
      }
    }
  }
}
