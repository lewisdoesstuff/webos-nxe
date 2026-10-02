/**
 * The hub's card motion, sampled at 60fps from the launch dashboard's own
 * engine (docs/research/HUB-ENGINE.md). Pure: frames are computed here and
 * handed to the Web Animations API by the shell, so a move runs on the
 * compositor along retail's 3D path rather than straight between two slots.
 */
import {
  GONE_OFFSET,
  HIDDEN,
  KEEP_ON_FRAME,
  LAST_OFFSET,
  PAST_OFFSET,
  projectCard,
  type PaneSlot,
} from "./hub";

const FRAME_S = 1 / 60;
const FRAME_MS = 1000 / 60;

/** A pane's place on one frame, in 1080p pixels, unrounded. */
export interface MotionFrame {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly opacity: number;
}

/**
 * How fast a card fades in as it unfolds. Retail's is 4, opaque a quarter of the
 * way out; 2 takes it half the way, which reads less abruptly at 60fps on a TV.
 */
const DEAL_FADE = 2;

/** How far a step along the line moves right, over the spacing: 371.8 of 505. */
const LEFT_FADE = 0.736;

/**
 * Where a card stands at a fractional `position` along the line, and how far
 * it has unfolded. A card fades in as it unfolds (`DEAL_FADE`), and one left
 * of the front fades over a spacing. Past the front it
 * would also grow and sink; it is held at full size on the front card's
 * line, so no layer rasters larger.
 */
export function cardFrame(position: number, fold = 1): MotionFrame {
  const card = projectCard(position);
  const scale = Math.min(card.scale, 1);
  const bottom = position < 0 ? projectCard(0).bottom : card.bottom;
  let opacity = Math.min(1, fold * DEAL_FADE);
  if (position < 0) opacity *= 1 + Math.max(-1, position * LEFT_FADE);
  if (position <= GONE_OFFSET || position >= PAST_OFFSET) opacity = HIDDEN;
  return {
    x: Math.max(card.left * 1.5, KEEP_ON_FRAME),
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
 * Retail's input spring for the row (`MobyPanelInput*`: acceleration 40,
 * deceleration 30, max velocity 20, in cards and seconds), run 1.75 times fast
 * while moving. It brakes once the distance left is no more than the time to
 * stop, and snaps on arrival. A new target takes over from wherever the row
 * stands and however fast it is going, so a held stick runs the row smoothly
 * up to speed instead of restarting a step each press.
 */
const ACCELERATION = 40;
const DECELERATION = 30;
const MAX_VELOCITY = 20;
const BOOST = 1.75;

/** The row's position and velocity on each frame of a run to `to`, from `from` at `velocity`. */
export interface RowTrack {
  readonly positions: readonly number[];
  readonly velocities: readonly number[];
}

export function rowTrack(from: number, velocity: number, to: number): RowTrack {
  const step = FRAME_S * BOOST;
  const positions = [from];
  const velocities = [velocity];
  let position = from;
  let speed = velocity;
  for (let frame = 0; frame < 600 && position !== to; frame++) {
    const direction = Math.sign(to - position);
    const left = Math.abs(to - position);
    let toward = speed * direction;
    if (toward > 0 && left / toward <= toward / DECELERATION) {
      toward = Math.max(0, toward - DECELERATION * step);
    } else {
      toward = Math.min(MAX_VELOCITY * BOOST, toward + ACCELERATION * step);
    }
    const next = position + toward * direction * step;
    if (toward === 0 || Math.sign(to - next) !== direction) {
      position = to;
      speed = 0;
    } else {
      position = next;
      speed = toward * direction;
    }
    positions.push(position);
    velocities.push(speed);
  }
  return { positions, velocities };
}

export function trackMs(track: RowTrack): number {
  return (track.positions.length - 1) * FRAME_MS;
}

/** Where a track stands `elapsed` ms in. */
export function trackAt(track: RowTrack, elapsed: number): { position: number; velocity: number } {
  const last = track.positions.length - 1;
  const index = Math.min(last, Math.max(0, Math.floor(elapsed / FRAME_MS)));
  return { position: track.positions[index] ?? 0, velocity: track.velocities[index] ?? 0 };
}

/** Whether the card for `item` stays out of sight for the whole of `track`, so it need not move. */
export function hiddenThroughout(track: RowTrack, item: number): boolean {
  return track.positions.every((position) => {
    const offset = item - position;
    return offset <= GONE_OFFSET || offset >= PAST_OFFSET;
  });
}

/** The frames of the card for `item` while the row runs `track`, ending on `rest`. */
export function trackFrames(track: RowTrack, item: number, rest: PaneSlot): MotionFrame[] {
  const frames = track.positions.slice(0, -1).map((position) => cardFrame(item - position));
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

/** The deal for a row laid out by `slotOf` rather than the hub's line, as a page's is. */
export function dealSlotFrames(
  offset: number,
  slotOf: (offset: number) => PaneSlot,
): MotionFrame[] {
  const length = DEAL_TRACKS[0]?.length ?? 1;
  const frames: MotionFrame[] = [];
  for (let frame = 0; frame < length - 1; frame++) {
    let position = 0;
    for (let index = 1; index <= offset; index++) position += DEAL_TRACKS[index]?.[frame] ?? 1;
    frames.push(slotBetween(slotOf, position, DEAL_TRACKS[offset]?.[frame] ?? 1));
  }
  frames.push(slotFrame(slotOf(offset)));
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

/** A card's own box, in 1080p pixels, which its swing hinges on. */
export interface CardBox {
  readonly width: number;
  readonly height: number;
}

const HUB_CARD: CardBox = { width: 630, height: 480 };

/** A card turned `angle` degrees about its left or right edge, fading as it turns edge-on. */
export function swungKeyframe(
  frame: MotionFrame,
  angle: number,
  box: CardBox = HUB_CARD,
  hinge: "left" | "right" = "left",
): Keyframe {
  const opacity = Math.max(HIDDEN, frame.opacity * (1 - Math.abs(angle) / 90));
  const pivotX = hinge === "left" ? 0 : box.width;
  const pivotY = box.height / 2;
  return {
    transform:
      `translate3d(${frame.x}px, ${frame.y}px, 0) scale(${frame.scale}) ` +
      `translate(${pivotX}px, ${pivotY}px) perspective(${SWING_PERSPECTIVE}px) rotateY(${angle}deg) ` +
      `translate(${-pivotX}px, ${-pivotY}px)`,
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
  box: CardBox = HUB_CARD,
  hinge: "left" | "right" = "left",
): Keyframe[] {
  const frames: Keyframe[] = [];
  const count = Math.max(1, Math.round(total / FRAME_MS));
  for (let index = 0; index <= count; index++) {
    const at = (index / count) * total;
    const t = Math.min(1, Math.max(0, (at - window[0]) / (window[1] - window[0])));
    const angle = from + (to - from) * (eased ? easeOut(t) : t);
    frames.push({ ...swungKeyframe(frame, angle, box, hinge), offset: index / count });
  }
  return frames;
}

/** A row's slot at a fractional `position`, between its two neighbouring rest slots. */
function slotBetween(
  slotOf: (offset: number) => PaneSlot,
  position: number,
  fold: number,
): MotionFrame {
  const low = Math.floor(position);
  const a = slotOf(low);
  const b = slotOf(low + 1);
  const t = position - low;
  const opacity = Math.min(1, fold * DEAL_FADE);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    scale: a.scale + (b.scale - a.scale) * t,
    opacity: Math.max(HIDDEN, opacity),
  };
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

/** The fold for a row laid out by `slotOf`, as a page's is. */
export function foldSlotFrames(
  offset: number,
  slotOf: (offset: number) => PaneSlot,
): MotionFrame[] {
  const length = FOLD_TRACKS[0]?.length ?? 1;
  const frames: MotionFrame[] = [];
  for (let frame = 0; frame < length; frame++) {
    let position = 0;
    for (let index = 1; index <= offset; index++) position += FOLD_TRACKS[index]?.[frame] ?? 0;
    frames.push(slotBetween(slotOf, position, FOLD_TRACKS[offset]?.[frame] ?? 0));
  }
  return frames;
}

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
