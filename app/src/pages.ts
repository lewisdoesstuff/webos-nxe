/**
 * Second-level pages: the screen drilled into from a hub panel, its groups, its
 * list, and the stack of them.
 *
 * Pure and framework-free, like `ribbon.ts`, `focus/row.ts` and `prompts.ts`.
 * The navigation rules are the part worth testing and they must not touch the
 * DOM, Vapor or the TV. The geometry is in 720p pixels, because NXE drew on a
 * 1280x720 canvas, and the page is a bounding box rather than a frame, which is
 * the whole reason a drill can be allocation-free. See `docs/PERF.md`.
 *
 * The input model is NXE-BOOT-INPUT.md section 3: up and down move within the
 * page's own list, left and right page between the page's groups, `A` selects
 * and `B` goes back one level.
 */

import { rehome, stepFocus } from "./focus/row";
import { promptsFor, SELECT, BACK, HIDE, type Button, type Prompt } from "./prompts";
import {
  PANEL_H as HUB_PANEL_H,
  PANEL_W as HUB_PANEL_W,
  PANEL_X as HUB_PANEL_X,
  type Box,
} from "./ribbon";

/**
 * The page's own panel, 544x315 at x 368, y 200.
 *
 * NXE-BOOT-INPUT.md section 3.7, measured off a 1280x720 frame of the Guide's
 * own panel in retail 9199. VERIFIED. 368 is 640 - 544/2, so it is horizontally
 * centred, which is what the measurement says it is.
 *
 * This is the number the drill turns on. A page drawn to the frame is a
 * 1920x1080 layer, 7.91MiB at the canvas and 31.64MiB on a dpr 2 panel, and two
 * of them cross-fading is the transition `docs/PERF.md` records as the open
 * risk. A page drawn to its own box is 0.65MiB and 2.61MiB, and it is the only
 * difference.
 */
export const PAGE_W = 544;
export const PAGE_H = 315;
export const PAGE_X = 368;
export const PAGE_Y = 200;

/** The title strip. A height `GuideMain.xui` contains. VERIFIED as a height. */
export const HEADER_H = 65;

/**
 * The list window. Also a height `GuideMain.xui` contains. VERIFIED as a
 * height.
 *
 * 211 is not a multiple of `ROW_H`, and that is the point: NXE-BOOT-INPUT.md
 * section 3.5 records that a list scrolls inside a fixed-height panel and
 * "the window ends on a half-clipped item rather than snapping to a whole one".
 * A window whose height is not a whole number of rows clips its last row by
 * construction, so the detail is free.
 */
export const LIST_H = 211;

/** 315 - 65 - 211, so the counter strip is whatever the two measured bands leave. DERIVED. */
export const FOOT_H = PAGE_H - HEADER_H - LIST_H;

/** One row of the list. 40 is a height `GuideMain.xui` contains. VERIFIED as a height. */
export const ROW_H = 40;

/** Rows standing whole in the window, and the height left over, which clips the next. DERIVED. */
export const WHOLE_ROWS = Math.floor(LIST_H / ROW_H);
export const CLIPPED_ROW = LIST_H % ROW_H;

/**
 * How many row elements a list draws, which is a property of the window and
 * never of the list.
 *
 * DERIVED, and it is the one number that keeps paging from allocating. A list
 * that rendered an element per item would change its element count when the
 * focus paged from a three-item group to a forty-item one, and the compositor
 * would allocate inside the move. That is how the ribbon lost a blade
 * mid-transition and `tools/gate.mjs` caught it. Six rows fit in 211 and a
 * seventh can be cut by the top of the window when the scroll stops between
 * rows, so there are seven slots and the surplus is drawn empty.
 */
export const ROW_SLOTS = Math.ceil(LIST_H / ROW_H) + 1;

/**
 * The track the rows sit in, which is fixed for the same reason the slot count
 * is: it is `ROW_SLOTS` rows tall whatever the list holds, so a list that
 * scrolls does not resize a promoted layer. 280. DERIVED.
 */
export const TRACK_H = ROW_SLOTS * ROW_H;

/**
 * How long the drill takes, and how long a list takes to step.
 *
 * DERIVED, and not from the scene data, for the same reason `MOVE_MS` in
 * `ribbon.ts` is: NXE-EXISTING.md section 3.1.3 measures 300 ms on an OutCubic
 * curve in `pegasus-theme-npe`, which is a recreation. NXE-XUI.md section 2.2
 * puts a blade slide at 359 time units, the most common value in the file, and
 * cannot say whether a unit is a millisecond, so nothing here contradicts it.
 */
export const DRILL_MS = 300;
export const LIST_MS = 300;

/**
 * The two easing families in `GuideMain.xui`, section 2.1.
 *
 * 275 eased keyframes in two: a decelerating curve (EaseIn -100, EaseOut 100,
 * EaseScale 50) 251 times, and its mirror (EaseIn 100, EaseOut -100) 24 times.
 * The document reads the 24 as "almost certainly the outgoing direction of a
 * move, against 251 for the incoming", so the open is the first and the close
 * is the mirror of it. VERIFIED that two families exist and their counts;
 * DERIVED that the minority is the outgoing direction. The cubic points are our
 * transcription of an S-curve with its inflection at the midpoint.
 */
export const DRILL_EASE_IN = "cubic-bezier(0.215, 0.61, 0.355, 1)";
export const DRILL_EASE_OUT = "cubic-bezier(0, 0.645, 0.39, 0.785)";

/** `Blade_Center`'s own y, NXE-XUI.md section 1. VERIFIED, and the only hub number not in `ribbon.ts`. */
export const HUB_PANEL_Y = 122;

export const HUB_PANEL_BOX: Box = {
  x: HUB_PANEL_X,
  y: HUB_PANEL_Y,
  width: HUB_PANEL_W,
  height: HUB_PANEL_H,
};

/**
 * Where a closed page surface sits, given the box it rests on.
 *
 * DERIVED, and it is arithmetic rather than measurement. The surface is
 * authored at its open size and place and is *transformed* onto the hub panel
 * when it is closed, so the drill changes a transform on a texture that already
 * exists. A surface that resized or repositioned itself into place would give
 * the compositor new layer bounds mid-transition, which is the allocation the
 * gate fails on, and `docs/PERF.md` is explicit that layer bounds are unaffected
 * by a transform and are what a layer's texture is measured from.
 *
 * The pivot is the resting box's own centre in the surface's coordinates, so
 * the surface grows out of the panel, which is what NXE's drill did. `restBox`
 * is the surface's box while closed, and it is the resting box by construction
 * rather than by a pair of hand-tuned numbers.
 */
export interface Rest {
  readonly scaleX: number;
  readonly scaleY: number;
  /** The `translate3d` in 720p px, applied before the scale. */
  readonly dx: number;
  readonly dy: number;
  /** The scale's pivot, in the surface's own coordinates. */
  readonly originX: number;
  readonly originY: number;
}

/** Rounded to six places, so the CSS string and a test can both read it. */
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function pageRest(hub: Box = HUB_PANEL_BOX, open: Box = pageBox()): Rest {
  const scaleX = hub.width / open.width;
  const scaleY = hub.height / open.height;
  const originX = hub.x + hub.width / 2 - open.x;
  const originY = hub.y + hub.height / 2 - open.y;
  return {
    scaleX: round(scaleX),
    scaleY: round(scaleY),
    dx: round(hub.x - open.x - originX * (1 - scaleX)),
    dy: round(hub.y - open.y - originY * (1 - scaleY)),
    originX: round(originX),
    originY: round(originY),
  };
}

/** The page surface's box while it is open, which is its authored box. */
export function pageBox(): Box {
  return { x: PAGE_X, y: PAGE_Y, width: PAGE_W, height: PAGE_H };
}

/** The page surface's box while it is closed, which is the box it was given. */
export function restBox(hub: Box = HUB_PANEL_BOX): Box {
  const rest = pageRest(hub);
  return {
    x: hub.x,
    y: hub.y,
    width: round(PAGE_W * rest.scaleX),
    height: round(PAGE_H * rest.scaleY),
  };
}

/**
 * A layer's texture in MiB, which is the unit the scoreboard in `docs/PERF.md`
 * is in: 7.91 + 3.60 + five times 0.118 is the 12.14MB it reports.
 *
 * `dpr` is what the TV reports, 2, because a layer's bounds are in device
 * pixels. `docs/PERF.md` is explicit that the inherited `tools/layers.mjs`
 * multiplied by the dpr a second time and reported every layer four times its
 * real size, and that the 262MB drill and the 39.9MB chrome plate came out of
 * that arithmetic, so it is not repeated here.
 */
export function textureMb(box: Box, dpr = 1): number {
  return (box.width * dpr * box.height * dpr * 4) / 1024 / 1024;
}

export interface PageItem {
  readonly id: string;
  readonly label: string;
  /** The second line. Absent rather than empty, since `exactOptionalPropertyTypes` is on. */
  readonly note?: string;
  /** A picture drawn before the label, for the lists that carry one per row. */
  readonly icon?: string;
}

export interface PageGroup {
  readonly id: string;
  readonly title: string;
  readonly items: readonly PageItem[];
}

export interface DialogOption {
  readonly id: string;
  readonly label: string;
  readonly note?: string;
}

interface PageBase {
  readonly id: string;
  readonly title: string;
  /**
   * The `X` and `Y` prompts, which are context and have no fixed caption
   * (NXE-BOOT-INPUT.md section 2). Absent means the dashboard drew none.
   */
  readonly x?: string;
  readonly y?: string;
}

export interface ListPage extends PageBase {
  readonly kind: "list";
  readonly groups: readonly [PageGroup, ...PageGroup[]];
}

export interface DialogPage extends PageBase {
  readonly kind: "dialog";
  readonly options: readonly [DialogOption, ...DialogOption[]];
  /**
   * The id of the option `B` picks.
   *
   * NXE-BOOT-INPUT.md section 3.4: `B` is "the back action", which on a modal
   * is whichever option closes it, and its caption is the option's own text
   * rather than "Back". The no-network dialog's `B` is labelled "Back" and is
   * not the negative answer, so this is an id and not a flag.
   */
  readonly back: string;
}

export type Page = ListPage | DialogPage;

/** Where the focus is on a page: a group and a row within it, or an option on a dialog. */
export interface PageFocus {
  readonly group: number;
  readonly item: number;
}

export const ROOT_FOCUS: PageFocus = { group: 0, item: 0 };

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/** A group read out of range falls back to the first, so a focus can never escape the page. */
function groupAt(page: ListPage, index: number): PageGroup {
  return page.groups[clamp(index, 0, page.groups.length - 1)] ?? page.groups[0];
}

/**
 * A dialog option read out of range, the same way. Used where a caption is
 * wanted and something has to be drawn, and not by `rows`, which leaves the
 * surplus slots blank rather than repeating the last option.
 */
function optionAt(page: DialogPage, index: number): DialogOption {
  return page.options[clamp(index, 0, page.options.length - 1)] ?? page.options[0];
}

/** The option `B` picks, falling back to the last, which is where a close sits. */
function backOption(page: DialogPage): DialogOption {
  return (
    page.options.find((option) => option.id === page.back) ??
    page.options[page.options.length - 1] ??
    page.options[0]
  );
}

/**
 * How many rows the focused group has, or how many options a dialog has.
 *
 * A dialog is a list of options with the paging and the scrolling taken away,
 * so one count serves both and nothing has to branch on the kind here.
 */
export function rowCount(page: Page, focus: PageFocus): number {
  return page.kind === "dialog" ? page.options.length : groupAt(page, focus.group).items.length;
}

/**
 * The furthest the list can scroll, which is where its last row's bottom edge
 * meets the window's.
 *
 * Zero for a dialog, because a dialog has no list: NXE-BOOT-INPUT.md section
 * 3.4 gives a dialog up and down between its options and nothing else.
 */
export function maxScroll(page: Page, focus: PageFocus): number {
  if (page.kind === "dialog") return 0;
  return Math.max(0, rowCount(page, focus) * ROW_H - LIST_H);
}

/** Where the list is scrolled to for this focus, in whole rows until it runs out. */
export function scrollTop(page: Page, focus: PageFocus): number {
  return clamp(Math.max(focus.item, 0) * ROW_H, 0, maxScroll(page, focus));
}

/**
 * How far the row track is nudged, which is the sub-row part of the scroll.
 *
 * Whole rows move by swapping which item each slot holds, so the track itself
 * only has to carry the remainder. It is bounded by one row, which is what lets
 * the track be a fixed `TRACK_H` tall and never resize.
 */
export function trackOffset(page: Page, focus: PageFocus): number {
  const scroll = scrollTop(page, focus);
  return scroll - Math.floor(scroll / ROW_H) * ROW_H;
}

/** The index of the item in the first slot, which is the topmost row the window shows. */
export function firstRow(page: Page, focus: PageFocus): number {
  return Math.floor(scrollTop(page, focus) / ROW_H);
}

/**
 * Whether there is more of the list below the window, which is the chevron's
 * only condition.
 *
 * NXE-BOOT-INPUT.md section 3.5: the chevron "appears only when there is more
 * below". A dialog has nothing below, and `maxScroll` of 0 makes that true
 * without a second rule.
 */
export function hasMoreBelow(page: Page, focus: PageFocus): boolean {
  return scrollTop(page, focus) < maxScroll(page, focus);
}

/**
 * The `n of m` counter, counting the rows of the focused group, empty on a
 * dialog.
 *
 * The position is the focused row, so the counter advances as the list scrolls
 * and reads the same as the hub's own counter under the focused panel. Retail
 * drew an `n of m` on every row and every list, and §3.6 reads it tracking
 * position across a rightward run, so a counter of the rows is the thing that
 * was measured. A counter of the groups would hold at `1 of 1` on a channel
 * page, because a channel page is one group whatever it holds.
 *
 * A dialog has none, though its options are a list and `rowCount` counts them.
 * §3.4 gives a dialog's screen as `A` and `B` and nothing else, and a counter
 * beside a pair of options is reading a position the user cannot move.
 */
export function counterText(page: Page, focus: PageFocus): string {
  if (page.kind === "dialog") return "";
  const count = rowCount(page, focus);
  if (count === 0) return "";
  return `${clamp(focus.item, 0, count - 1) + 1} of ${count}`;
}

/** The focused group's own title, empty on a dialog, which has no groups. */
export function groupTitle(page: Page, focus: PageFocus): string {
  return page.kind === "dialog" ? "" : groupAt(page, focus.group).title;
}

export interface Row {
  /** The item or option this slot is showing, past the end of the list when it is none. */
  readonly index: number;
  readonly label: string;
  readonly note: string;
  /** Only ever true of a slot holding a real item, so a stale focus lights nothing. */
  readonly focused: boolean;
  /** The slot's own top inside the track, which is fixed and never depends on the list. */
  readonly y: number;
}

/**
 * Every row slot, and always `ROW_SLOTS` of them.
 *
 * Slots past the end of the list come back blank rather than absent, because a
 * `v-for` over the list would change the element count and a changed element
 * count is an allocation inside a move. The length of this array is the layer
 * set of a page list, so the count is checked in `pages.test.ts` rather than
 * trusted here.
 */
export function rows(page: Page, focus: PageFocus): Row[] {
  const first = firstRow(page, focus);
  return Array.from({ length: ROW_SLOTS }, (_, slot) => {
    const index = first + slot;
    const item =
      page.kind === "dialog" ? page.options[index] : groupAt(page, focus.group).items[index];
    return {
      index,
      label: item?.label ?? "",
      note: item?.note ?? "",
      focused: index === focus.item && item !== undefined,
      y: slot * ROW_H,
    };
  });
}

export interface PageFrame {
  readonly page: Page;
  readonly focus: PageFocus;
}

/**
 * The open pages, hub first, so `B` pops one level.
 *
 * A plain readonly array, so a step that changes nothing returns the same
 * reference and the parent's ref never moves.
 */
export type PageStack = readonly PageFrame[];

export function push(stack: PageStack, page: Page): PageStack {
  return [...stack, { page, focus: ROOT_FOCUS }];
}

/**
 * Pop one level, which is what `B` does.
 *
 * NXE-BOOT-INPUT.md section 3.3: one reviewer, one build, reported that
 * backing out of the Marketplace "takes me back to the root Dashboard and not
 * the original menu I was browsing", and the same section says the navigation
 * is not a stack for that reason. It is marked UNVERIFIED there and one review
 * contradicts the strong impression that NXE is a proper drill-down, and the
 * instruction is explicit: do not implement `B` as jump to root, implement it as
 * pop one level, and note it as the specific thing to re-test on real hardware.
 *
 * So the return transition is the drill run backwards, from the box it grew out
 * of, and there is no second path to draw.
 */
export function pop(stack: PageStack): PageStack {
  return stack.length === 0 ? stack : stack.slice(0, -1);
}

export function top(stack: PageStack): PageFrame | undefined {
  return stack[stack.length - 1];
}

export function currentPage(stack: PageStack): Page | null {
  return top(stack)?.page ?? null;
}

export function currentFocus(stack: PageStack): PageFocus {
  return top(stack)?.focus ?? ROOT_FOCUS;
}

/**
 * Replace the focused frame, or return the same stack when nothing moved.
 *
 * NXE-BOOT-INPUT.md section 3.6 leaves open whether a press at the end of a row
 * produces any bump at all, and the model to build is clamp. A clamped step
 * returning the identical stack reference is what makes "nothing happened" a
 * fact the component can act on rather than a value it has to compare.
 */
function refocus(stack: PageStack, move: (frame: PageFrame) => PageFrame): PageStack {
  if (stack.length === 0) return stack;
  const frame = stack[stack.length - 1];
  if (frame === undefined) return stack;
  const next = move(frame);
  if (next.focus.group === frame.focus.group && next.focus.item === frame.focus.item) return stack;
  return [...stack.slice(0, -1), next];
}

/**
 * Up and down, within the page's own list (NXE-BOOT-INPUT.md section 3.3).
 *
 * `stepFocus` clamps, which is the measured behaviour: section 3.6 reads a
 * rightward run off retail 9199 going 3 of 8, 5 of 8, 8 of 8 and then holding at
 * 8 of 8, never stepping back to 1.
 */
export function stepVertical(stack: PageStack, delta: number): PageStack {
  return refocus(stack, (frame) => ({
    ...frame,
    focus: {
      ...frame.focus,
      item: stepFocus(frame.focus.item, delta, rowCount(frame.page, frame.focus)),
    },
  }));
}

/**
 * Channel +/- paging the list by a window, rather than a row.
 *
 * `stepFocus` deliberately reads its delta as a direction, so a held key cannot
 * skip rows. That rule is about repeated single steps; Channel +/- is a
 * discrete paging button whose whole purpose is the jump, so it moves by the
 * full delta and clamps the same way. A clamped press returns the identical
 * stack reference, so the caller can tell "nothing happened" apart the same
 * way it does for a single step.
 */
export function stepVerticalBy(stack: PageStack, delta: number): PageStack {
  return refocus(stack, (frame) => {
    const count = rowCount(frame.page, frame.focus);
    const item = count === 0 ? frame.focus.item : clamp(frame.focus.item + delta, 0, count - 1);
    return { ...frame, focus: { ...frame.focus, item } };
  });
}

/**
 * Left and right along a page drawn as a row of panes: one item at a time in
 * the focused group, clamped, exactly the hub row's rule. The same step as
 * `stepVertical`, named for the axis a row page moves on.
 */
export const stepAlong = stepVertical;

/** The bumpers along a row page, by `delta` items, clamped. */
export const stepAlongBy = stepVerticalBy;

/**
 * Left and right, paging between the page's groups (section 3.3, the on-screen
 * "1 of 5" and "Page 1 of 4" counters).
 *
 * A group change re-homes the row to its first item, which is DERIVED from the
 * same mechanism section 3.6 describes at the hub: changing channel always
 * returns the row to item 1. The previous index also cannot survive the move,
 * since a three-item group followed by a forty-item one leaves it in range by
 * luck rather than by meaning. A dialog has no groups and does nothing.
 */
export function stepHorizontal(stack: PageStack, delta: number): PageStack {
  return refocus(stack, (frame) => {
    if (frame.page.kind === "dialog") return frame;
    const group = stepFocus(frame.focus.group, delta, frame.page.groups.length);
    if (group === frame.focus.group) return frame;
    return { ...frame, focus: { group, item: rehome() } };
  });
}

/**
 * The `A` / `B` / `X` / `Y` row for whatever is on top of the stack.
 *
 * A list page is captioned "Select" and "Back", which is what the dashboard
 * wrote (section 2: the `A` label is "Select" and never "OK", and `B` shows
 * nothing at the hub root but reads "Back" on a drilled-in page), with whatever
 * context prompts the page carries.
 *
 * A dialog draws its own two and nothing else. Section 3.4 gives a dialog's
 * prompts as `A` and `B` and "Saving…" as none at all, and a `Y` Marketplace
 * prompt on a modal that cannot be left from would be a button the press does
 * nothing with. The context prompts belong to the screen behind the modal, so
 * the page data keeps them and the prompt row leaves them off.
 */
export function pagePrompts(stack: PageStack): Prompt[] {
  const frame = top(stack);
  if (frame === undefined) return [];
  const { page, focus } = frame;

  if (page.kind === "dialog") {
    return promptsFor({ a: optionAt(page, focus.item).label, b: backOption(page).label });
  }

  const context: Partial<Record<Button, string>> = {};
  if (page.x !== undefined) context.x = page.x;
  if (page.y !== undefined) context.y = page.y;
  return promptsFor({ a: SELECT.label, b: BACK.label, ...context });
}

/**
 * The shell's own prompt row for whatever the hub is showing.
 *
 * The hub root draws `A` Select and no `B`, because there is nowhere to go
 * back to (section 2). A drilled-in page draws that page's own row, which for
 * a channel page is `A` Select and `B` Back. With the Guide open the shell
 * draws nothing: the Guide carries its own prompt row inside its chrome, and
 * the hub behind it is dimmed almost to black.
 *
 * `canHide` adds the `X` Hide prompt at the root, where X toggles the focused
 * pane's item out of the row. Nowhere else: a page's rows are not panes, and
 * the Guide owns its row.
 */
export function shellPrompts(guideOpen: boolean, stack: PageStack, canHide = false): Prompt[] {
  if (guideOpen) return [];
  if (stack.length === 0) {
    return canHide
      ? promptsFor({ a: SELECT.label, x: HIDE.label })
      : promptsFor({ a: SELECT.label });
  }
  return pagePrompts(stack);
}
