/**
 * A friend's figure: the owner's model with its skin, hair and clothes tinted
 * from a hash of the account id, so the same person always stands the same way.
 * Pure, so the choice is tested without three.js.
 */

export interface Look {
  /** Multipliers over the model's own textures, as 0xRRGGBB. */
  readonly skin: number;
  readonly hair: number;
  readonly shirt: number;
  readonly trousers: number;
  readonly shoes: number;
  readonly glasses: boolean;
}

/** FNV-1a over the id's characters. */
export function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** A small generator seeded from a hash, so each choice takes its own draw. */
function stream(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

function byte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

function rgb(r: number, g: number, b: number): number {
  return (byte(r) << 16) | (byte(g) << 8) | byte(b);
}

/** HSL to 0xRRGGBB, h in turns. */
function hsl(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return rgb(f(0), f(8), f(4));
}

/** Shirts run bright, and trousers and shoes stay darker so a figure reads. */
export function lookFor(id: string): Look {
  const next = stream(hashId(id));
  const tone = 0.52 + next() * 0.48;
  return {
    skin: rgb(tone, tone * (0.9 + next() * 0.08), tone * (0.82 + next() * 0.12)),
    hair: hsl(next(), 0.25 + next() * 0.35, 0.12 + next() * 0.5),
    shirt: hsl(next(), 0.55 + next() * 0.3, 0.45 + next() * 0.2),
    trousers: hsl(next(), 0.2 + next() * 0.35, 0.3 + next() * 0.25),
    shoes: hsl(next(), 0.1 + next() * 0.3, 0.25 + next() * 0.3),
    glasses: next() < 0.4,
  };
}
