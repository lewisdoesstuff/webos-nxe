export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CALM_GAP_MS = 50;
const CALM_RUN = 6;

/** Resolves once frames are arriving steadily, or after `maxMs` whatever they are doing. */
export function framesCalm(maxMs: number): Promise<void> {
  return new Promise((resolve) => {
    const until = performance.now() + maxMs;
    let last = 0;
    let steady = 0;
    const step = (now: number): void => {
      steady = last !== 0 && now - last < CALM_GAP_MS ? steady + 1 : 0;
      last = now;
      if (steady >= CALM_RUN || now > until) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
