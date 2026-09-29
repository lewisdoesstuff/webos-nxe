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

/** The Xbox face-button colours, from the 2005-2008 dashboard. */
export const BUTTON_FILL: Readonly<Record<Button, string>> = {
  a: "#5EAE4C",
  b: "#DA2229",
  x: "#1E6FBF",
  y: "#E8C22C",
};

export const BUTTON_RING: Readonly<Record<Button, string>> = {
  a: "#2C6E28",
  b: "#8C1A1E",
  x: "#12457A",
  y: "#96770E",
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
