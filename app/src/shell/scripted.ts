/**
 * The shell's scripted animations, one per element at a time.
 *
 * Each is kept here so stopping it is a direct `cancel()`: asking an element
 * for `getAnimations()` flushes style first, and on the TV that cost more than
 * building the move itself.
 */
const running = new Map<Element, Animation>();

/**
 * Every `step`th frame, with explicit offsets. The compositor interpolates
 * between keyframes at 60fps, so sampling a path this gentle at 30Hz, or 20Hz
 * for the long deal and swings, draws the same curve for a half or a third of
 * what the Web Animations parser has to read.
 */
export function thin(frames: readonly Keyframe[], step = 2): Keyframe[] {
  const last = frames.length - 1;
  if (last < step) return [...frames];
  const kept: Keyframe[] = [];
  for (let index = 0; index <= last; index += step) {
    kept.push(withOffset(frames[index]!, index / last));
  }
  if (last % step !== 0) kept.push(withOffset(frames[last]!, 1));
  return kept;
}

function withOffset(frame: Keyframe, offset: number): Keyframe {
  return frame.offset === undefined || frame.offset === null ? { ...frame, offset } : frame;
}

export function play(
  element: Element,
  frames: readonly Keyframe[],
  options: KeyframeAnimationOptions,
): Animation {
  stop(element);
  const step = (Number(options.duration) || 0) > 400 ? 3 : 2;
  const animation = element.animate(thin(frames, step), options);
  running.set(element, animation);
  animation.addEventListener("finish", () => {
    if (running.get(element) === animation) running.delete(element);
  });
  return animation;
}

export function stop(element: Element): void {
  running.get(element)?.cancel();
  running.delete(element);
}

export function stopAll(elements: Iterable<Element>): void {
  for (const element of elements) stop(element);
}
