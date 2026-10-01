/**
 * The hub's card motion, sampled at 60fps from the launch dashboard's own
 * engine (docs/research/HUB-ENGINE.md). Pure: frames are computed here and
 * handed to the Web Animations API by the shell, so a move runs on the
 * compositor along retail's 3D path rather than straight between two slots.
 */
import { FIRST_OFFSET, HIDDEN, LAST_OFFSET, projectCard, type PaneSlot } from "./hub";

const FRAME_S = 1 / 60;
const FRAME_MS = 1000 / 60;

/** A pane's place on one frame, in 1080p pixels, unrounded. */
export interface MotionFrame {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly opacity: number;
}

/** How far a step along the line moves right, over the spacing: 371.8 of 505. */
const LEFT_FADE = 0.736;

/**
 * Where a card stands at a fractional `position` along the line, and how far
 * it has unfolded. Retail fades a card in over the first quarter of its
 * unfold, and fades one left of the front over a spacing. Past the front it
 * would also grow and sink; it is held at full size on the front card's
 * line, so no layer rasters larger.
 */
export function cardFrame(position: number, fold = 1): MotionFrame {
  const card = projectCard(position);
  const scale = Math.min(card.scale, 1);
  const bottom = position < 0 ? projectCard(0).bottom : card.bottom;
  let opacity = fold < 0.25 ? fold * 4 : 1;
  if (position < 0) opacity *= 1 + Math.max(-1, position * LEFT_FADE);
  if (position <= FIRST_OFFSET || position >= LAST_OFFSET) opacity = HIDDEN;
  return {
    x: card.left * 1.5,
    y: (bottom - 320 * scale) * 1.5,
    scale,
    opacity: Math.max(opacity, HIDDEN),
  };
}

/** A rest slot as a frame, so a move's last frame is exactly where the pane rests. */
export function slotFrame(slot: PaneSlot): MotionFrame {
  return { x: slot.x, y: slot.y, scale: slot.scale, opacity: slot.opacity };
}

/**
 * Retail's input spring for one step: acceleration 40, deceleration 30, max
 * velocity 20, all run 1.75 times fast while moving. Brakes once the distance
 * left is no more than the time to stop; snaps on arrival. Progress per frame,
 * from 0 to 1.
 */
function springTrack(acceleration: number, deceleration: number, maxVelocity: number): number[] {
  const boost = 1.75;
  const step = FRAME_S * boost;
  const track = [0];
  let position = 0;
  let velocity = 0;
  for (let frame = 0; frame < 120; frame++) {
    const left = 1 - position;
    if (velocity !== 0 && left / velocity <= velocity / deceleration) {
      velocity = Math.max(0, velocity - deceleration * step);
    } else {
      velocity = Math.min(maxVelocity * boost, velocity + acceleration * step);
    }
    const next = position + velocity * step;
    if (next >= 1 || velocity === 0) break;
    position = next;
    track.push(position);
  }
  track.push(1);
  return track;
}

export const MOVE_TRACK = springTrack(40, 30, 20);
export const MOVE_FRAMES_MS = (MOVE_TRACK.length - 1) * FRAME_MS;

/** Where a move from `from` to `to` stands `elapsed` ms in, as a fractional position. */
export function moveAt(from: number, to: number, elapsed: number): number {
  const index = Math.min(MOVE_TRACK.length - 1, Math.max(0, elapsed / FRAME_MS));
  const low = Math.floor(index);
  const high = Math.min(MOVE_TRACK.length - 1, low + 1);
  const progress =
    (MOVE_TRACK[low] ?? 1) + ((MOVE_TRACK[high] ?? 1) - (MOVE_TRACK[low] ?? 1)) * (index - low);
  return from + (to - from) * progress;
}

/** The frames of a move from `from` to `to`, ending on `rest`. */
export function moveFrames(from: number, to: number, rest: PaneSlot): MotionFrame[] {
  const frames = MOVE_TRACK.slice(0, -1).map((progress) =>
    cardFrame(from + (to - from) * progress),
  );
  frames.push(slotFrame(rest));
  return frames;
}

/**
 * The deal: each spill card's unfold, frame by frame. A card starts once the
 * one before it is past `MobyUnfoldNextRange` (0.7) and unfolds at
 * `MobyUnfoldSpeed` (10 a second), easing to `MobyUnfoldMinSpeed` (0.1) as it
 * opens, because `MobyUnfoldEaseRange` is left at 0. Its place along the line is
 * the sum of its own unfold and every one before it.
 */
function dealTracks(cards: number): number[][] {
  const speed = 10;
  const slowest = 0.1;
  const next = 0.7;
  const folds: number[] = Array.from({ length: cards + 1 }, (_, index) => (index === 0 ? 1 : 0));
  const tracks: number[][] = Array.from({ length: cards + 1 }, () => []);
  for (let frame = 0; frame < 240; frame++) {
    folds.forEach((fold, index) => tracks[index]!.push(fold));
    if (folds.every((fold) => fold >= 1)) break;
    for (let index = 1; index <= cards; index++) {
      const fold = folds[index]!;
      if (folds[index - 1]! > next && fold < 1) {
        folds[index] = Math.min(1, fold + (speed - fold * (speed - slowest)) * FRAME_S);
      }
    }
  }
  return tracks;
}

const DEAL_TRACKS = dealTracks(LAST_OFFSET);

export const DEAL_FRAMES_MS = ((DEAL_TRACKS[0]?.length ?? 1) - 1) * FRAME_MS;

/** The frames of the spill card `offset` places right of the focus dealing out, ending on `rest`. */
export function dealFrames(offset: number, rest: PaneSlot): MotionFrame[] {
  const length = DEAL_TRACKS[0]?.length ?? 1;
  const frames: MotionFrame[] = [];
  for (let frame = 0; frame < length - 1; frame++) {
    let position = 0;
    for (let index = 1; index <= offset; index++) position += DEAL_TRACKS[index]?.[frame] ?? 1;
    frames.push(cardFrame(position, DEAL_TRACKS[offset]?.[frame] ?? 1));
  }
  frames.push(slotFrame(rest));
  return frames;
}

/** A frame as the keyframe the shell animates. */
export function keyframe(frame: MotionFrame): Keyframe {
  return {
    transform: `translate3d(${frame.x}px, ${frame.y}px, 0) scale(${frame.scale})`,
    opacity: `${frame.opacity}`,
  };
}

/**
 * Leaving the hub for a page, and coming back, from `SceneTransitions` in
 * `Variables.xur` (HUB-ENGINE.md), in ms from the button press. Going in, the
 * channel list goes over `channel`, then the focused card swings away about its
 * left edge over `panel`; the page's panel swings in over `arrive`. Coming back
 * the page's panel swings out over `depart`, the focused card swings back over
 * `panel` and the list returns over `channel`.
 */
export const LEAVE = {
  channel: [150, 650],
  panel: [483, 817],
  arrive: [817, 1150],
  title: [400, 567],
} as const;
export const RETURN = {
  depart: [317, 567],
  panel: [483, 817],
  channel: [650, 1150],
  title: [733, 900],
} as const;

/** The swing's camera, retail's 982 at 720p. */
const SWING_PERSPECTIVE = 1473;
const SWING_PIVOT_Y = 240;

/** A card turned `angle` degrees about its left edge, fading as it turns edge-on. */
export function swungKeyframe(frame: MotionFrame, angle: number): Keyframe {
  const opacity = Math.max(HIDDEN, frame.opacity * (1 - Math.abs(angle) / 90));
  return {
    transform:
      `translate3d(${frame.x}px, ${frame.y}px, 0) scale(${frame.scale}) ` +
      `translateY(${SWING_PIVOT_Y}px) perspective(${SWING_PERSPECTIVE}px) rotateY(${angle}deg) ` +
      `translateY(${-SWING_PIVOT_Y}px)`,
    opacity: `${opacity}`,
  };
}

/** Retail's ease(0, 100): a decelerating curve. */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * A swing from `from` to `to` degrees over `window` ms, on a timeline of
 * `total` ms, held at either end, sampled every frame.
 */
export function swingFrames(
  frame: MotionFrame,
  from: number,
  to: number,
  window: readonly [number, number],
  total: number,
  eased: boolean,
): Keyframe[] {
  const frames: Keyframe[] = [];
  const count = Math.max(1, Math.round(total / FRAME_MS));
  for (let index = 0; index <= count; index++) {
    const at = (index / count) * total;
    const t = Math.min(1, Math.max(0, (at - window[0]) / (window[1] - window[0])));
    frames.push({
      ...swungKeyframe(frame, from + (to - from) * (eased ? easeOut(t) : t)),
      offset: index / count,
    });
  }
  return frames;
}

/**
 * The spill folding away behind the focused card as the hub is left: the far
 * card first, each next one once the card beyond it is under
 * `MobyFoldNextRange` (0.3), at `MobyFoldSpeed` (30 a second) scaled by the
 * cards in view over its integer, 7.
 */
function foldTracks(cards: number): number[][] {
  const speed = (30 * (cards + 2)) / 7;
  const folds: number[] = Array.from({ length: cards + 1 }, () => 1);
  const tracks: number[][] = Array.from({ length: cards + 1 }, () => []);
  for (let frame = 0; frame < 240; frame++) {
    folds.forEach((fold, index) => tracks[index]!.push(fold));
    if (folds.slice(1).every((fold) => fold <= 0)) break;
    for (let index = cards; index >= 1; index--) {
      const beyond = index === cards ? 0 : folds[index + 1]!;
      if (beyond < 0.3 && folds[index]! > 0) {
        folds[index] = Math.max(0, folds[index]! - speed * FRAME_S);
      }
    }
  }
  return tracks;
}

const FOLD_TRACKS = foldTracks(LAST_OFFSET - 1);

export const FOLD_FRAMES_MS = ((FOLD_TRACKS[0]?.length ?? 1) - 1) * FRAME_MS;

/** The frames of the spill card `offset` places right of the focus folding away. */
export function foldFrames(offset: number): MotionFrame[] {
  const length = FOLD_TRACKS[0]?.length ?? 1;
  const frames: MotionFrame[] = [];
  for (let frame = 0; frame < length; frame++) {
    let position = 0;
    for (let index = 1; index <= offset; index++) position += FOLD_TRACKS[index]?.[frame] ?? 0;
    frames.push(cardFrame(position, FOLD_TRACKS[offset]?.[frame] ?? 0));
  }
  return frames;
}
