import { AnimationClip, KeyframeTrack, QuaternionKeyframeTrack } from "three";

/** The export keys its clips at 20Hz, so motion reads as steps; a spline through the same keys at a higher rate rounds the corners. */
export const SMOOTH_HZ = 60;

function catmull(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  return (
    0.5 *
    (2 * p1 +
      (p2 - p0) * u +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 +
      (3 * p1 - p0 - 3 * p2 + p3) * u2 * u)
  );
}

/** Sample a uniformly keyed track on a Catmull-Rom spline at `hz`, keeping its first and last keys. */
export function smoothValues(
  times: ArrayLike<number>,
  values: ArrayLike<number>,
  stride: number,
  hz: number,
): { times: Float32Array; values: Float32Array } {
  const n = times.length;
  const last = times[n - 1]!;
  const count = Math.max(2, Math.round((last - times[0]!) * hz) + 1);
  const outTimes = new Float32Array(count);
  const out = new Float32Array(count * stride);
  const src = Float64Array.from(values);
  if (stride === 4) {
    for (let key = 1; key < n; key++) {
      let dot = 0;
      for (let c = 0; c < 4; c++) dot += src[key * 4 + c]! * src[(key - 1) * 4 + c]!;
      if (dot < 0) for (let c = 0; c < 4; c++) src[key * 4 + c] = -src[key * 4 + c]!;
    }
  }
  const at = (key: number, c: number) => src[Math.min(n - 1, Math.max(0, key)) * stride + c]!;
  for (let index = 0; index < count; index++) {
    const time = index === count - 1 ? last : times[0]! + index / hz;
    outTimes[index] = time;
    let key = 0;
    while (key < n - 2 && times[key + 1]! <= time) key++;
    const span = times[key + 1]! - times[key]!;
    const u = span > 0 ? (time - times[key]!) / span : 0;
    let norm = 0;
    for (let c = 0; c < stride; c++) {
      const v = catmull(at(key - 1, c), at(key, c), at(key + 1, c), at(key + 2, c), u);
      out[index * stride + c] = v;
      norm += v * v;
    }
    if (stride === 4) {
      const scale = 1 / Math.sqrt(norm || 1);
      for (let c = 0; c < 4; c++) out[index * stride + c]! *= scale;
    }
  }
  return { times: outTimes, values: out };
}

export function smoothClip(clip: AnimationClip, hz = SMOOTH_HZ): AnimationClip {
  const tracks = clip.tracks.map((track): KeyframeTrack => {
    if (track.times.length < 3) return track;
    const stride = track.getValueSize();
    const { times, values } = smoothValues(track.times, track.values, stride, hz);
    const Ctor = track instanceof QuaternionKeyframeTrack ? QuaternionKeyframeTrack : KeyframeTrack;
    return new Ctor(track.name, Array.from(times), Array.from(values));
  });
  return new AnimationClip(clip.name, clip.duration, tracks);
}
