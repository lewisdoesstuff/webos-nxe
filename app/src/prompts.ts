/**
 * Button prompts: the `A` / `B` / `X` / `Y` captions and the glyph discs.
 *
 * Pure and framework-free, like `ribbon.ts` and `focus/row.ts`.
 *
 * The captions are the dashboard's, not ours. Read off the running retail build
 * 9199 and from 2008-10-31 captures, and recorded in NXE-BOOT-INPUT.md section 3:
 *
 * - `A` is captioned **"Select"** on a panel, never "OK".
 * - `B` shows **nothing at the hub root**, in any capture. It appears on a
 *   drilled-in page, where it reads "Back", and on a dialog, where the caption is
 *   the negative option's own text and is not always "Back".
 * - `A` on a dialog is captioned with the **option's own text**, not "Select".
 * - `X` and `Y` are context, and there is no fixed caption for either. `Y` was
 *   "Marketplace" from almost anywhere in the shipped build.
 *
 * So a prompt is `{ button, label }` and `label` may be null, which draws the disc
 * with no word beside it rather than inventing one.
 */

export type Button = "a" | "b" | "x" | "y";

export interface Prompt {
  readonly button: Button;
  /** The caption as the dashboard wrote it, or null when it wrote none. */
  readonly label: string | null;
}

/** The face-button colours, measured off retail 9199 (t062, t066, t144). */
export const BUTTON_FILL: Readonly<Record<Button, string>> = {
  a: "#5DBB0C",
  b: "#D41010",
  x: "#1468E0",
  y: "#FFE000",
};

export const BUTTON_RING: Readonly<Record<Button, string>> = {
  a: "#2A6A06",
  b: "#8A0C10",
  x: "#0F428F",
  y: "#A08000",
};

/** The embossed letter, a deep shade of the badge's own hue. */
export const BUTTON_GLYPH: Readonly<Record<Button, string>> = {
  a: "#0F3000",
  b: "#3A0004",
  x: "#04204F",
  y: "#4A3800",
};

/** Glyph disc diameter, 720p. The Guide's `B` disc measured about 22px. */
export const BUTTON_SIZE = 22;

/** The button that means "do the thing", and the word the dashboard gave it. */
export const SELECT: Prompt = { button: "a", label: "Select" };

/**
 * `B` at a screen with nothing to go back from.
 *
 * The hub root is the dashboard, so there is nowhere to return to and the
 * dashboard shows no `B` prompt at all. Rendering an unlabelled disc would be
 * inventing a button that was not there.
 */
export const NO_BACK: Prompt = { button: "b", label: null };

export const BACK: Prompt = { button: "b", label: "Back" };

export const HIDE: Prompt = { button: "x", label: "Hide" };

export const MOVE: Prompt = { button: "y", label: "Move" };

/** A moved pane is dropped with `A` and put back with `B`. */
export const PLACE: Prompt = { button: "a", label: "Place" };
export const CANCEL: Prompt = { button: "b", label: "Cancel" };

/**
 * The prompt row for a screen, left to right.
 *
 * Order is `A`, `B`, `X`, `Y` throughout, which is the order the Guide's prompt
 * bar uses: `A` Select, `B` Back, `X` Sign Out, `Y` Xbox Dashboard.
 */
export function promptRow(...prompts: readonly (Prompt | null)[]): Prompt[] {
  return prompts.filter((p): p is Prompt => p !== null);
}

/** Prompts ordered by button, dropping the unlabelled ones. */
export function promptsFor(spec: Partial<Record<Button, string | null>>): Prompt[] {
  return (["a", "b", "x", "y"] as const)
    .filter((button) => button in spec)
    .map((button) => ({ button, label: spec[button] ?? null }));
}

export interface Face {
  readonly fill: string;
  readonly ring: string;
  readonly glyph: string;
  /** The letter on the disc; empty for a colour key, which is a plain coloured disc. */
  readonly letter: string;
}

const REMOTE_GREEN: Face = { fill: "#3FA60C", ring: "#1F6A06", glyph: "#0F3000", letter: "" };
const REMOTE_OK: Face = { fill: "#E8E8EC", ring: "#8A8A94", glyph: "#2A2A30", letter: "OK" };

/**
 * The disc for a prompt: the Xbox face button, or the Magic Remote key the
 * action actually answers to. `A` is OK, `B` is red (Back), `X` is blue, and `Y`
 * is yellow except where it means Move, which the remote does with green.
 */
export function faceFor(prompt: Prompt, remote: boolean): Face {
  const { button } = prompt;
  if (!remote) {
    return {
      fill: BUTTON_FILL[button],
      ring: BUTTON_RING[button],
      glyph: BUTTON_GLYPH[button],
      letter: button.toUpperCase(),
    };
  }
  if (button === "a") return REMOTE_OK;
  if (button === "y" && prompt.label === MOVE.label) return REMOTE_GREEN;
  return {
    fill: BUTTON_FILL[button],
    ring: BUTTON_RING[button],
    glyph: BUTTON_GLYPH[button],
    letter: "",
  };
}
