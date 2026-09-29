<script setup lang="ts" vapor>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import { checkArt, prepareArt, prepareFloor } from "./artCache";
import avatarUrl from "./assets/avatar/avatar.glb?url";
import { AVATAR_CANVAS } from "./avatar/framing";
import { type BootReason, type BootSpeed, resolveBootMode } from "./boot";
import AvatarFigure from "./components/AvatarFigure.vue";
import BootScreen from "./components/BootScreen.vue";
import GuideOverlay from "./components/GuideOverlay.vue";
import HubPane from "./components/HubPane.vue";
import PageLayer from "./components/PageLayer.vue";
import PromptBar from "./components/PromptBar.vue";
import SettingsLayer from "./components/SettingsLayer.vue";
import { deviceSeed } from "./deviceSeed";
import { stepFocus } from "./focus/row";
import { BLADE_COUNT, BLADE_IDS } from "./guide";
import {
  avatarPlace,
  BULLET_SIZE,
  BULLET_X,
  BULLET_Y,
  CARD_PIC,
  CARD_PIC_X,
  CARD_PIC_Y,
  CARD_RIGHT,
  CHANNEL_IN_MS,
  CHANNEL_OUT_MS,
  COUNTER_X,
  COUNTER_Y,
  counterText,
  DEAL_MS,
  DEAL_STAGGER_MS,
  HIDDEN,
  type HubMove,
  type HubState,
  LABEL_FONT,
  LABEL_H,
  LABEL_W,
  labelSlot,
  MOVE_EASE,
  MOVE_MS,
  PAGE_STEP,
  PANE_H,
  PANE_W,
  PANE_X,
  PANE_Y,
  placePool,
  POOL_SIZE,
  type PooledPane,
  stepHub,
} from "./hub";
import {
  type HubItem,
  channelPage,
  hubRow,
  isAllPane,
  isEmptyPane,
  isHideable,
  isProfilePane,
  isSettingsPane,
  launchTarget,
  pageItems,
} from "./hubRows";
import { PAGE_COUNTER_X, PAGE_COUNTER_Y } from "./pageRow";
import {
  counterText as pageCounterText,
  type PageFocus,
  type PageStack,
  pop,
  push,
  ROOT_FOCUS,
  rowCount,
  shellPrompts,
  stepAlong,
  stepAlongBy,
  stepVertical,
  top,
} from "./pages";
import { paneArt, type PaneItem } from "./panel";
import { CANVAS_H, CANVAS_W } from "./ribbon";
import { ringImage, ripplePattern } from "./ripples";
import { CHANNEL_ORDER, SECTIONS, startChannel } from "./sections";
import type { Settings } from "./settings";
import {
  AVATAR_DOWNLOAD,
  formatGamerscore,
  parseGamerscore,
  profilePage,
  settingsAction,
  settingsDetail,
  settingsPageFor,
  settingsRoot,
  type SettingDetail,
} from "./settingsScreen";
import { playSound } from "./sound";
import { useAppsStore } from "./stores/apps";
import { useSettingsStore } from "./stores/settings";

/**
 * The hub: the channel list at the top left, the channel's row of panes below
 * it receding to the right, the gamercard at the top right and the prompts at
 * the foot. Geometry and navigation are `hub.ts`'s, measured off retail 9199.
 *
 * A transition must not allocate (docs/PERF.md). The row is a fixed pool of
 * pane elements whatever the channel holds, recycled as the focus moves, and
 * the list is one label per channel. Both are promoted, so a move is transform
 * and opacity writes on textures that already exist.
 */

const apps = useAppsStore();
const settings = useSettingsStore();

/** Where the user is. The labels follow it at once. Resumes the stored
 * channel rather than always starting on Apps. */
const start = startChannel(settings.settings.lastChannel);
const hub = ref<HubState>({ channel: start, item: 0 });
/** What the row shows. It lags `hub` through a channel change's fade. */
const shown = ref<HubState>({ channel: start, item: 0 });

/**
 * A channel change: `out` fades the row, `collapsed` swaps it in behind the
 * focused pane with no transition, `in` fades the focused pane up and deals the
 * spill out to the right.
 */
type Phase = "rest" | "out" | "collapsed" | "in";
const phase = ref<Phase>("rest");
let generation = 0;

/** The Guide is a full-screen takeover, not a side panel. VERIFIED, 9199. */
const guide = ref(false);

/**
 * The boot, mounted over a dashboard that is already there.
 *
 * The handover is the boot's own plane fading out onto the dashboard, so the
 * dashboard has to exist from the first frame. Mounting it after `done` would
 * put an allocation inside the transition, which is the one thing this project
 * treats as a defect.
 *
 * `boot` is a counter rather than a boolean so that `Y` can replay it: setting
 * the same boolean to true twice would not remount the component.
 */
const boot = ref(0);
const booting = ref(true);
const bootMode = ref<BootSpeed | "off">("full");

/**
 * `auto` resolves to full on a cold start and short on a warm one, and to off
 * under a reduced-motion preference, since the whole sequence is a large moving
 * light. `?boot=off|full|short` in the URL overrides it, for development and
 * `tools/compare.mjs`; there is no setting for it yet.
 */
function chooseBootMode(): void {
  const asked = new URLSearchParams(window.location.search).get("boot");
  const preference = asked === "off" || asked === "full" || asked === "short" ? asked : "auto";
  bootMode.value = resolveBootMode(preference, { cold: true });
}

function onBootDone(payload: { reason: BootReason }): void {
  if (payload.reason === "skipped") console.info("[xne] boot skipped");
  booting.value = false;
}

/** A boot resolved to off never mounts, so the dashboard is simply the first thing shown. */
function settleBoot(): void {
  if (bootMode.value === "off") booting.value = false;
}

const channels = CHANNEL_ORDER.map(
  (id) => SECTIONS.find((section) => section.id === id) ?? SECTIONS[0],
);

/** The settings the rows read. A write to any other setting keeps this identity, so it rebuilds no row. */
const ROW_KEYS = [
  "hiddenApps",
  "recentApps",
  "appOrder",
  "appSection",
  "sortModes",
  "gamertag",
  "gamerscore",
] as const;
const rowSettings = computed((previous?: Settings) => {
  const next = settings.settings;
  return previous && ROW_KEYS.every((key) => previous[key] === next[key]) ? previous : next;
});

const rows = computed(() =>
  channels.map((channel) => hubRow(channel.id, apps.launchPoints, rowSettings.value)),
);

/** The "All" page over the hub. Always mounted; opening it changes one transform and opacity. */
const pageOpen = ref(false);
const pageFocus = ref<PageFocus>(ROOT_FOCUS);
/** What the open page shows, latched when it opens so a channel change never repaints its panes. */
const listed = computed(() => pageItems(rows.value[hub.value.channel] ?? []));

const page = computed(() => channelPage(CHANNEL_ORDER[hub.value.channel] ?? "apps", listed.value));

/** Seeded with a real title so the title's layer has painted content, and a texture, before any page opens. */
const pageLatch = ref<{ title: string; items: readonly PaneItem[] }>({
  title: page.value.title,
  items: [],
});

/**
 * The shell's prompt row: the hub's at the root, the open page's over it, and
 * nothing under the Guide, which carries its own row inside its chrome. The
 * settings drill carries its own stack and reads the same way a channel page
 * does: `A` Select, `B` Back.
 */
const prompts = computed(() => {
  if (settingsStack.value.length > 0) return shellPrompts(guide.value, settingsStack.value);
  return shellPrompts(
    guide.value,
    pageOpen.value ? [{ page: page.value, focus: pageFocus.value }] : [],
    canHide.value,
  );
});

/** Whether X can hide the focused pane: a real item under the focus. */
const canHide = computed(() => isHideable(rows.value[hub.value.channel]?.[hub.value.item]));

/** Keep a state inside its channel's row, which hiding may have shortened. */
function clampItem(state: HubState): HubState {
  const length = rows.value[state.channel]?.length ?? 0;
  return state.item > length - 1
    ? { channel: state.channel, item: Math.max(0, length - 1) }
    : state;
}

/**
 * X hides the focused pane's item, which leaves the row. Silent on anything
 * that cannot leave it, the way A is silent on a placeholder.
 */
function toggleHide(): void {
  const item = rows.value[hub.value.channel]?.[hub.value.item];
  if (!isHideable(item)) return;
  settings.setAppHidden(item.id, !settings.isAppHidden(item.id));
  playSound("option");
  hub.value = clampItem(hub.value);
  shown.value = clampItem(shown.value);
}

/**
 * The Guide's blades, mapped onto this TV: Settings is the System channel,
 * Games and Media are those channels, Marketplace is LG's store, and the
 * gamertag blade, the scene data's `home`, is the Apps channel. It opens on
 * Settings.
 */
const guideBlade = ref(BLADE_IDS.indexOf("settings"));
const guideItem = ref(0);

function channelItems(id: string) {
  return pageItems(rows.value[CHANNEL_ORDER.indexOf(id as (typeof CHANNEL_ORDER)[number])] ?? []);
}

const guideRows = computed(() => {
  switch (BLADE_IDS[guideBlade.value]) {
    case "settings":
      return channelItems("system");
    case "games":
      return channelItems("games");
    case "media":
      return channelItems("media");
    case "marketplace":
      return channelItems("apps").filter((row) => row.id === "com.webos.app.discovery");
    default:
      return channelItems("apps");
  }
});

const guideItems = computed(() => guideRows.value.map((row) => row.title));

function onGuideKey(event: KeyboardEvent): boolean {
  const code = event.keyCode;
  if (code === 37 || code === 39) {
    guideBlade.value = (guideBlade.value + (code === 39 ? 1 : -1) + BLADE_COUNT) % BLADE_COUNT;
    guideItem.value = 0;
    playSound("cursor");
    return true;
  }
  if (code === 38 || code === 40) {
    guideItem.value = stepFocus(guideItem.value, code === 40 ? 1 : -1, guideRows.value.length);
    playSound("cursor");
    return true;
  }
  if (code === 13 || code === 404) {
    const row = guideRows.value[guideItem.value];
    if (!row) return true;
    guide.value = false;
    playSound("decide");
    if (isSettingsPane(row)) {
      openSettings();
      return true;
    }
    launchItem(row);
    return true;
  }
  return false;
}

/** Launch a pane's item. A real app goes to the top of the profile's Recent Apps. */
function launchItem(item: HubItem): void {
  const target = launchTarget(item);
  if (isHideable(item)) settings.noteLaunch(item.id);
  void apps.launch(target.id, { ...target.params });
}

function openPage(): void {
  pageLatch.value = { title: page.value.title, items: listed.value };
  pageFocus.value = ROOT_FOCUS;
  pageOpen.value = true;
}

/** The focus goes home once the panes have faded, so the jump is never seen. */
function closePage(): void {
  pageOpen.value = false;
  playSound("cancel");
  setTimeout(() => {
    if (!pageOpen.value) pageFocus.value = ROOT_FOCUS;
  }, 250);
}

function stepPage(delta: number, step: typeof stepAlong = stepAlong): void {
  const next = step([{ page: page.value, focus: pageFocus.value }], delta)[0];
  if (!next || next.focus === pageFocus.value) return;
  pageFocus.value = next.focus;
  playSound("cursor");
}

function launchListed(): void {
  const item = pageLatch.value.items[pageFocus.value.item] as HubItem | undefined;
  if (!item) return;
  playSound("decide");
  launchItem(item);
}

/**
 * The dashboard's own settings, as a real drill stack: the root names the
 * categories, `A` pushes a category or writes one change, `B` pops a level.
 * Opened from the System channel's XNE Settings pane or the Guide, never
 * beside a channel page.
 */
const settingsStack = ref<PageStack>([]);

/** Open the settings over the hub, from its System pane or the Guide. */
function openSettings(): void {
  pageOpen.value = false;
  settingsStack.value = push([], settingsRoot());
}

/** The profile's menu, opened by A on the profile pane, in the settings screen's layout. */
function openProfile(): void {
  pageOpen.value = false;
  settingsStack.value = push([], profilePage());
}

/** What is being typed in the profile menu, or null. While it is set, keys belong to the entry. */
const draft = ref<string | null>(null);
const draftKey = ref<"gamertag" | "gamerscore">("gamertag");

/** Keep a typed value. An empty gamertag or a gamerscore that is not a number is refused and kept open. */
function commitDraft(value: string): void {
  if (draftKey.value === "gamerscore") {
    const score = parseGamerscore(value);
    if (score === null) {
      playSound("cancel");
      return;
    }
    settings.applyChange({ kind: "level", key: "gamerscore", value: score });
  } else {
    if (value === "") {
      playSound("cancel");
      return;
    }
    settings.applyChange({ kind: "choice", key: "gamertag", value });
  }
  draft.value = null;
  playSound("decide");
  refreshSettingsTop();
}

function cancelDraft(): void {
  draft.value = null;
  playSound("cancel");
}

function stepSettings(delta: number): void {
  const next = stepVertical(settingsStack.value, delta);
  if (next === settingsStack.value) return;
  settingsStack.value = next;
  playSound("cursor");
}

function activateSettings(): void {
  const frame = top(settingsStack.value);
  if (!frame) return;
  const action = settingsAction(frame.page, frame.focus, settings.settings, apps.launchPoints);
  if (!action) return;
  playSound("decide");
  if (action.kind === "push") {
    settingsStack.value = push(settingsStack.value, action.page);
    return;
  }
  if (action.kind === "edit") {
    draftKey.value = action.key;
    draft.value =
      action.key === "gamerscore"
        ? String(settings.settings.gamerscore)
        : settings.settings.gamertag || "Player1";
    return;
  }
  if (action.kind === "launch") {
    void apps.launch(action.id, { ...action.params });
    return;
  }
  settings.applyChange(action.change);
  refreshSettingsTop();
}

function closeSettingsLevel(): void {
  settingsStack.value = pop(settingsStack.value);
  playSound("cancel");
}

/**
 * Rebuild the open settings page after a change, keeping the focus where it
 * was. Unhiding shrinks the Hidden Apps list under the focus, so the stored
 * page would point past its end; the rebuilt one cannot. A rebuild is paint
 * on a surface whose layer already exists.
 */
function refreshSettingsTop(): void {
  const stack = settingsStack.value;
  const frame = top(stack);
  if (!frame) return;
  const rebuilt = settingsPageFor(frame.page.id, settings.settings, apps.launchPoints);
  if (!rebuilt) return;
  const count = rowCount(rebuilt, frame.focus);
  const focus =
    count === 0 ? frame.focus : { ...frame.focus, item: Math.min(frame.focus.item, count - 1) };
  settingsStack.value = [...stack.slice(0, -1), { page: rebuilt, focus }];
}

const settingsPage = computed(() => top(settingsStack.value)?.page ?? settingsRoot());
const settingsFocus = computed(() => top(settingsStack.value)?.focus ?? ROOT_FOCUS);
const settingsDetailShown = computed((): SettingDetail => {
  const frame = top(settingsStack.value);
  if (!frame) return { values: [], description: "" };
  return settingsDetail(frame.page, frame.focus, settings.settings, apps.launchPoints);
});

const counts = computed(() => rows.value.map((row) => row.length));

const shownRow = computed(() => rows.value[shown.value.channel] ?? []);

const pool = computed(() => placePool(shown.value.item, shownRow.value.length));

/** The row rests hidden until the first load resolves, so an empty hub is never seen. */
const loaded = computed(() => apps.status === "ready" || apps.status === "error");

const counter = computed(() =>
  !loaded.value
    ? ""
    : pageOpen.value
      ? pageCounterText(page.value, pageFocus.value)
      : counterText(shown.value.item, shownRow.value.length),
);

function artOf(items: readonly HubItem[]): Set<string> {
  return new Set(items.map((item) => paneArt(item)).filter((url) => url !== null));
}

/**
 * The boot waits on black until the channel it hands over to has its art
 * scaled and its reflections baked (`artCache.ts`), so that work and the row's
 * first paint land before the run rather than in its frames. Capped, so a slow
 * Luna never holds the boot for long.
 */
const BOOT_WAIT_MS = 4000;
const bootReady = ref(false);
function readyToBoot(reason: string): void {
  if (bootReady.value) return;
  bootReady.value = true;
  console.info(`[xne] boot starts at ${Math.round(performance.now())}ms: ${reason}`);
}
setTimeout(() => readyToBoot("waited the longest it may"), BOOT_WAIT_MS);

async function prepareShown(): Promise<void> {
  const urls = [...artOf(rows.value[hub.value.channel] ?? [])];
  await Promise.all([prepareFloor(), ...urls.map((url) => prepareArt(url))]);
  await nextFrame();
  await nextFrame();
  readyToBoot("the channel is ready");
}

watch(loaded, (is) => is && void prepareShown(), { immediate: true });

/** Every other channel's art once the boot has finished, one a frame, and any stored art checked against its icon. */
let baking = 0;
/** Past the boot's last frame and the teardown of its layer. */
const BAKE_DELAY_MS = 1500;
async function bakeArt(): Promise<void> {
  const mine = ++baking;
  await prepareFloor();
  for (const url of artOf(rows.value.flat())) {
    if (mine !== baking) return;
    await prepareArt(url);
    await nextFrame();
  }
  for (const url of artOf(rows.value.flat())) {
    if (mine !== baking) return;
    await checkArt(url);
    await nextFrame();
  }
}
watch(
  [() => apps.launchPoints, booting],
  ([, busy]) => {
    if (busy) return;
    baking += 1;
    const mine = baking;
    setTimeout(() => mine === baking && void bakeArt(), BAKE_DELAY_MS);
  },
  { immediate: true },
);

/**
 * A channel change swaps every pane's content while the row is hidden, and
 * eight panes repainting in one frame held the TV's GPU for up to 300 ms. So
 * each pane keeps the item it showed until its turn: the focused pane first,
 * then one a frame in the order the deal reveals them, every one well before
 * its reveal. `held` is each element's previous item, or null at rest.
 */
const held = ref<ReadonlyMap<number, HubItem | null> | null>(null);
const released = ref(0);

function releaseRank(pane: PooledPane): number {
  return pane.offset >= 0 ? pane.offset : POOL_SIZE - pane.offset;
}

function paneItem(pane: PooledPane): HubItem | null {
  const hold = held.value;
  if (hold !== null && releaseRank(pane) >= released.value) return hold.get(pane.element) ?? null;
  return pane.item === null ? null : (shownRow.value[pane.item] ?? null);
}

const moveTransition = `transform ${MOVE_MS}ms ${MOVE_EASE}, opacity ${MOVE_MS}ms ${MOVE_EASE}`;

/** A page or the settings screen is over the hub; its promoted layers rest hidden and keep their textures. */
const hubAway = computed(() => pageOpen.value || settingsStack.value.length > 0);

interface PaneMotion {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly opacity: number;
  readonly transition: string;
}

function paneMotion(pane: PooledPane): PaneMotion {
  let { x, y, scale, opacity } = pane.slot;
  let transition = moveTransition;
  if (hubAway.value || !loaded.value) {
    opacity = HIDDEN;
    transition = `opacity ${CHANNEL_OUT_MS}ms linear`;
  } else if (phase.value === "out") {
    opacity = HIDDEN;
    transition = `opacity ${CHANNEL_OUT_MS}ms linear`;
  } else if (phase.value === "collapsed") {
    if (pane.offset > 0) x = PANE_X + PANE_W * (1 - scale);
    opacity = HIDDEN;
    transition = "none";
  } else if (phase.value === "in") {
    const dealt = pane.offset > 0;
    const delay = dealt ? CHANNEL_IN_MS + (pane.offset - 1) * DEAL_STAGGER_MS : 0;
    const fade = dealt ? DEAL_MS / 2 : CHANNEL_IN_MS;
    transition = `transform ${DEAL_MS}ms ${MOVE_EASE} ${delay}ms, opacity ${fade}ms linear ${delay}ms`;
  }
  return { x, y, scale, opacity, transition };
}

function paneStyle(pane: PooledPane): Record<string, string> {
  const { x, y, scale, opacity, transition } = paneMotion(pane);
  return {
    transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
    opacity: `${opacity}`,
    "z-index": `${pane.slot.z}`,
    transition,
  };
}

/**
 * The avatar stands beside the profile pane and moves with it, on the pane's
 * own transition, at the pane's depth so nearer panes cover it. Away from
 * Apps it rests hidden where it last stood, so its layer keeps its texture.
 */
const avatarPane = computed(() => pool.value.find((pane) => isProfilePane(paneItem(pane))));
let avatarRest = "translate3d(0px, 0px, 0) scale(1)";

const avatarStyle = computed((): Record<string, string> => {
  const pane = avatarPane.value;
  if (pane === undefined) {
    return {
      transform: avatarRest,
      opacity: `${HIDDEN}`,
      "z-index": "1",
      transition: `opacity ${CHANNEL_OUT_MS}ms linear`,
    };
  }
  const motion = paneMotion(pane);
  const place = avatarPlace(motion, pane.offset, AVATAR_CANVAS);
  avatarRest = `translate3d(${place.x}px, ${place.y}px, 0) scale(${place.scale})`;
  return {
    transform: avatarRest,
    opacity: `${motion.opacity}`,
    "z-index": `${pane.slot.z}`,
    transition: motion.transition,
  };
});

/**
 * The avatar draws only while nothing else moves: a transition holds it on
 * its last frame, and so does anything that hides it. `settling` covers a row
 * move and the hub coming back from a page, the Guide or the settings.
 */
const settling = ref(false);
let settleTimer: ReturnType<typeof setTimeout> | undefined;
function settle(): void {
  settling.value = true;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => (settling.value = false), MOVE_MS + 50);
}

const avatarPlaying = computed(() => {
  const pane = avatarPane.value;
  return (
    !booting.value &&
    loaded.value &&
    !settling.value &&
    phase.value === "rest" &&
    !hubAway.value &&
    !guide.value &&
    pane !== undefined &&
    pane.slot.opacity > HIDDEN
  );
});

/**
 * The model loads once the boot is over, so its parse and upload never land in
 * the boot's frames. A 360sona export saved to the TV's Downloads wins over the
 * one shipped with the app.
 */
const avatarSrc = computed(() => (booting.value ? "" : `hack${AVATAR_DOWNLOAD}`));

function labelStyle(index: number): Record<string, string> {
  const slot = labelSlot(hub.value.channel - index);
  return {
    width: `${LABEL_W}px`,
    height: `${LABEL_H}px`,
    "font-size": `${LABEL_FONT}px`,
    "line-height": `${LABEL_H}px`,
    transform: `translate3d(${slot.x}px, ${slot.y}px, 0) scale(${slot.scale})`,
    opacity: `${hubAway.value ? HIDDEN : slot.opacity}`,
  };
}

const bulletStyle = {
  left: `${BULLET_X}px`,
  top: `${BULLET_Y}px`,
  width: `${BULLET_SIZE}px`,
  height: `${BULLET_SIZE}px`,
};

const counterStyle = computed(() =>
  pageOpen.value
    ? { left: `${PAGE_COUNTER_X}px`, top: `${PAGE_COUNTER_Y}px` }
    : { left: `${COUNTER_X}px`, top: `${COUNTER_Y}px` },
);

const cardStyle = {
  right: `${1920 - CARD_RIGHT}px`,
  top: `${CARD_PIC_Y}px`,
};

/** The avatar's own gamer picture, taken once it has loaded; the default until then. */
const gamerpic = ref("");

const picStyle = computed(() => ({
  left: `${CARD_PIC_X}px`,
  top: `${CARD_PIC_Y}px`,
  width: `${CARD_PIC}px`,
  height: `${CARD_PIC}px`,
  ...(gamerpic.value ? { backgroundImage: `url(${gamerpic.value})` } : {}),
}));

/** The 720p frame's own size, which the prompt row and the Guide are authored in. */
const frameStyle = {
  width: `${CANVAS_W}px`,
  height: `${CANVAS_H}px`,
};

const settingsRestBox = {
  x: PANE_X / 1.5,
  y: PANE_Y / 1.5,
  width: PANE_W / 1.5,
  height: PANE_H / 1.5,
};

const motion = {
  "--move-ms": `${MOVE_MS}ms`,
  "--move-ease": MOVE_EASE,
};

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function releasePanes(mine: number): Promise<void> {
  for (let rank = 2; rank <= 2 * POOL_SIZE; rank++) {
    await nextFrame();
    if (mine !== generation) return;
    released.value = rank;
  }
  held.value = null;
}

async function changeChannel(): Promise<void> {
  const mine = ++generation;
  phase.value = "out";
  await new Promise((resolve) => setTimeout(resolve, CHANNEL_OUT_MS));
  if (mine !== generation) return;
  held.value = new Map(pool.value.map((pane) => [pane.element, paneItem(pane)]));
  released.value = 1;
  shown.value = hub.value;
  phase.value = "collapsed";
  await nextFrame();
  await nextFrame();
  if (mine !== generation) return;
  phase.value = "in";
  void releasePanes(mine);
  const settle = CHANNEL_IN_MS + DEAL_MS + DEAL_STAGGER_MS * POOL_SIZE;
  await new Promise((resolve) => setTimeout(resolve, settle));
  if (mine === generation) phase.value = "rest";
}

/** The last channel is stored once the change has settled, so the write lands outside the transition. */
let rememberTimer: ReturnType<typeof setTimeout> | undefined;
function rememberChannel(id: string): void {
  clearTimeout(rememberTimer);
  const settle = CHANNEL_OUT_MS + CHANNEL_IN_MS + DEAL_MS + DEAL_STAGGER_MS * POOL_SIZE;
  rememberTimer = setTimeout(() => settings.updateSetting("lastChannel", id), settle);
}

function navigate(move: HubMove): void {
  const next = stepHub(hub.value, move, counts.value);
  if (next === hub.value) return;
  const channelChanged = next.channel !== hub.value.channel;
  hub.value = next;
  playSound(channelChanged ? "category" : "cursor");
  if (channelChanged) {
    rememberChannel(CHANNEL_ORDER[next.channel] ?? "apps");
    void changeChannel();
    return;
  }
  if (phase.value === "out") return;
  settle();
  generation++;
  held.value = null;
  phase.value = "rest";
  shown.value = next;
}

/** A launches the focused pane's item. A placeholder is drawn and nothing
 * else: pressing A on it does nothing, the way B does nothing at the hub root. */
function activate(): void {
  const item = rows.value[hub.value.channel]?.[hub.value.item];
  if (!item || isEmptyPane(item)) return;
  playSound("decide");
  if (isProfilePane(item)) {
    openProfile();
    return;
  }
  if (isSettingsPane(item)) {
    openSettings();
    return;
  }
  if (isAllPane(item)) {
    openPage();
    return;
  }
  launchItem(item);
}

/**
 * The remote, mapped to the controller: OK and green are A, Back and red are
 * B, the arrows are the D-pad, and Channel +/- are the bumpers. B does nothing
 * at the hub root, as on the dashboard.
 */
const MOVES: Readonly<Record<number, HubMove>> = {
  37: "left",
  38: "up",
  39: "right",
  40: "down",
  34: "pageLeft",
  33: "pageRight",
};

/** Back and red on the remote, Escape, Backspace and B on a desktop keyboard. */
const BACK_KEYS: ReadonlySet<number> = new Set([461, 403, 27, 8, 66]);

/** The remote's yellow key, which NXE's Y button maps to here. */
const YELLOW = 405;

/** The remote's blue key, which NXE's X button maps to here. UNVERIFIED on the TV. */
const BLUE = 406;

function onKeyDown(event: KeyboardEvent): void {
  if (draft.value !== null) return;
  if (guide.value) {
    if (onGuideKey(event)) {
      event.preventDefault();
      return;
    }
    if (
      event.keyCode === 89 ||
      event.keyCode === 71 ||
      event.keyCode === YELLOW ||
      event.keyCode === 461 ||
      event.keyCode === 27 ||
      event.keyCode === 403
    ) {
      event.preventDefault();
      guide.value = false;
      playSound("cancel");
    }
    return;
  }
  if (settingsStack.value.length > 0) {
    if (event.keyCode === 38 || event.keyCode === 40) {
      event.preventDefault();
      stepSettings(event.keyCode === 40 ? 1 : -1);
    } else if (event.keyCode === 13 || event.keyCode === 404) {
      event.preventDefault();
      activateSettings();
    } else if (BACK_KEYS.has(event.keyCode)) {
      event.preventDefault();
      closeSettingsLevel();
    }
    return;
  }
  if (pageOpen.value) {
    if (event.keyCode === 37 || event.keyCode === 39) {
      event.preventDefault();
      stepPage(event.keyCode === 39 ? 1 : -1);
    } else if (event.keyCode === 33 || event.keyCode === 34) {
      // The bumpers page along the row, in the hub's own 33/34 direction.
      event.preventDefault();
      stepPage(event.keyCode === 33 ? PAGE_STEP : -PAGE_STEP, stepAlongBy);
    } else if (event.keyCode === 13 || event.keyCode === 404) {
      event.preventDefault();
      launchListed();
    } else if (BACK_KEYS.has(event.keyCode)) {
      event.preventDefault();
      closePage();
    } else if (event.keyCode === 38 || event.keyCode === 40) {
      event.preventDefault();
    }
    return;
  }
  const move = MOVES[event.keyCode];
  if (move) {
    event.preventDefault();
    navigate(move);
    return;
  }
  if (event.keyCode === 13 || event.keyCode === 404) {
    event.preventDefault();
    activate();
    return;
  }
  // `X` on a desktop keyboard hides the focused pane; the remote's blue key on
  // the TV, by the same analogy that maps red to B and yellow to Y.
  if (event.keyCode === 88 || event.keyCode === BLUE) {
    event.preventDefault();
    toggleHide();
    return;
  }
  // `Y` on a desktop keyboard replays the boot.
  if (event.keyCode === 89) {
    event.preventDefault();
    booting.value = true;
    boot.value += 1;
    return;
  }
  // The Guide: G on a desktop keyboard, the remote's yellow key on the TV.
  if (event.keyCode === 71 || event.keyCode === YELLOW) {
    event.preventDefault();
    guide.value = true;
    playSound("option");
  }
}

const rings = ripplePattern(deviceSeed()).map((group) => ({
  left: `${group.left}px`,
  top: `${group.top}px`,
  width: `${group.width}px`,
  height: `${group.height}px`,
  backgroundImage: ringImage(group),
  animationDuration: `${group.periodMs}ms`,
  animationDelay: `${group.delayMs}ms`,
  "--from": String(group.from),
  "--peak": String(group.peak),
}));

watch([hubAway, guide], settle);

onMounted(() => {
  chooseBootMode();
  settleBoot();
  window.addEventListener("keydown", onKeyDown);
  void apps.load();
  expose();
});

onUnmounted(() => window.removeEventListener("keydown", onKeyDown));

function expose(): void {
  (window as typeof window & { xneDebug?: unknown }).xneDebug = {
    hub,
    shown,
    phase,
    pool,
    guide,
    pageOpen,
    pageFocus,
    settingsStack,
    boot,
  };
}
</script>

<template>
  <main
    class="stage"
    :data-settings="settingsStack.length > 0 || undefined"
    :data-page="pageOpen || undefined"
    :style="motion"
  >
    <!--
      Everything static paints before anything promoted. Unpromoted content
      painted after an animating layer has to be squashed into a layer of its
      own, and that layer changes identity mid-move, which is an allocation.
    -->
    <div class="sky" />
    <div class="floor" />
    <div class="pool" />
    <span class="bullet" :style="bulletStyle" />
    <span class="counter" :style="counterStyle">{{ counter }}</span>
    <header class="card" :style="cardStyle">
      <span class="tag">{{ settings.settings.gamertag || "Player1" }}</span>
      <span class="score"
        >{{ formatGamerscore(settings.settings.gamerscore) }}<i class="coin">G</i></span
      >
    </header>
    <div class="pic" :style="picStyle" />
    <div class="frame" data-frame :style="frameStyle">
      <PromptBar :prompts="prompts" />
    </div>
    <div class="ripples">
      <i v-for="(ring, index) in rings" :key="index" :style="ring" />
    </div>
    <!-- Over its rings, so promoted at rest like anything painted above a moving layer. -->
    <div class="orb" />

    <span
      v-for="(channel, index) in channels"
      :key="channel.id"
      class="label"
      :data-channel="channel.id"
      :data-selected="index === hub.channel || undefined"
      :style="labelStyle(index)"
      >{{ channel.label }}</span
    >

    <div class="row" data-panes>
      <HubPane
        v-for="pane in pool"
        :key="pane.element"
        :item="paneItem(pane)"
        :data-offset="pane.offset"
        :style="paneStyle(pane)"
      />
    </div>

    <AvatarFigure
      :src="avatarSrc"
      :fallback="avatarUrl"
      :playing="avatarPlaying"
      @portrait="gamerpic = $event"
      :style="avatarStyle"
    />

    <PageLayer
      :title="pageLatch.title"
      :items="pageLatch.items"
      :focus="pageFocus.item"
      :open="pageOpen"
    />

    <div class="frame" data-settings-frame :style="frameStyle">
      <SettingsLayer
        :page="settingsPage"
        :focus="settingsFocus"
        :open="settingsStack.length > 0"
        :detail="settingsDetailShown"
        :rest="settingsRestBox"
        :draft="draft"
        :numeric="draftKey === 'gamerscore'"
        @commit="commitDraft"
        @cancel="cancelDraft"
      />
    </div>

    <div class="frame" data-guide :style="frameStyle">
      <GuideOverlay
        :open="guide"
        :blade="guideBlade"
        :item="guideItem"
        :items="guideItems"
        :pic="gamerpic"
      />
    </div>

    <!--
      Mounted over the dashboard, which is already mounted. The handover is the
      boot's own plane fading out, so the dashboard behind it has to exist from
      the first frame or the boot would have to create it mid-transition.
    -->
    <BootScreen
      v-if="booting && bootMode !== 'off'"
      :key="boot"
      :mode="bootMode"
      :play="bootReady"
      @done="onBootDone"
    />
  </main>
</template>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #2c3a1a;
}

/* Lime sky, darkest at the top left and top right, a pale glow at the left
   horizon and a yellow-white one toward the right. Static paint. */
.sky {
  position: absolute;
  inset: 0 0 auto 0;
  height: 620px;
  background:
    url("./assets/hub/bokeh.svg") 0 0 / 1920px 620px no-repeat,
    radial-gradient(
      ellipse 16% 34% at 0% 100%,
      rgba(226, 246, 240, 0.95) 0%,
      rgba(226, 246, 240, 0) 100%
    ),
    radial-gradient(
      ellipse 34% 60% at 96% 100%,
      rgba(228, 242, 190, 0.85) 0%,
      rgba(200, 225, 130, 0.45) 45%,
      rgba(200, 225, 130, 0) 100%
    ),
    radial-gradient(
      ellipse 40% 45% at 52% 82%,
      rgba(204, 232, 120, 0.7) 0%,
      rgba(204, 232, 120, 0) 100%
    ),
    radial-gradient(
      ellipse 58% 72% at 72% 58%,
      rgba(122, 162, 132, 0.95) 0%,
      rgba(122, 162, 132, 0) 100%
    ),
    radial-gradient(ellipse 34% 55% at 100% 0%, rgba(4, 12, 6, 0.9) 0%, rgba(4, 12, 6, 0) 100%),
    radial-gradient(ellipse 62% 75% at 0% 0%, rgba(8, 40, 0, 0.9) 0%, rgba(8, 40, 0, 0) 100%),
    linear-gradient(180deg, #3a7a0a 0%, #8cc218 45%, #b4d64a 100%);
}

/* The floor's horizon is lit and its top is dark slate, brightest a third of
   the way down, then falling off to the foot. */
.floor {
  position: absolute;
  top: 585px;
  left: -300px;
  right: -300px;
  bottom: 0;
  border-radius: 50% 50% 0 0 / 60px 60px 0 0;
  background:
    radial-gradient(ellipse 50% 40% at 100% 0%, rgba(30, 36, 40, 0.7) 0%, rgba(30, 36, 40, 0) 100%),
    radial-gradient(
      ellipse 60% 60% at 50% 115%,
      rgba(20, 24, 28, 0.4) 0%,
      rgba(20, 24, 28, 0) 100%
    ),
    linear-gradient(
      180deg,
      #56646e 0%,
      #3f4d57 5%,
      #38444f 20%,
      #55616e 33%,
      #8e9cab 52%,
      #a3b0be 68%,
      #6d7880 86%,
      #586269 100%
    );
}

.orb {
  position: absolute;
  left: 1737px;
  top: 948px;
  width: 0;
  height: 0;
}

.orb::before {
  content: "";
  position: absolute;
  left: -38px;
  top: 46px;
  width: 76px;
  height: 22px;
  border-radius: 50%;
  background: radial-gradient(
    ellipse 50% 50% at 50% 50%,
    rgba(8, 10, 14, 0.55) 0%,
    rgba(8, 10, 14, 0.35) 55%,
    rgba(20, 24, 30, 0) 100%
  );
  will-change: transform;
}

.pool {
  position: absolute;
  left: 700px;
  top: 640px;
  width: 1220px;
  height: 440px;
  background: radial-gradient(
    ellipse 640px 300px at 1037px 380px,
    rgba(28, 35, 40, 0.94) 0%,
    rgba(34, 42, 48, 0.8) 38%,
    rgba(44, 52, 58, 0.4) 70%,
    rgba(50, 58, 64, 0) 100%
  );
}

.ripples {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.ripples i {
  position: absolute;
  background: center / 100% 100% no-repeat;
  opacity: 0.001;
  will-change: transform, opacity;
  animation: ripple 20s linear infinite;
}

@keyframes ripple {
  0% {
    transform: scale(var(--from));
    opacity: 0.001;
  }
  12% {
    opacity: var(--peak);
  }
  75% {
    opacity: var(--peak);
  }
  100% {
    transform: scale(1);
    opacity: 0.001;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ripples i {
    animation-play-state: paused;
  }
}

.orb::after {
  content: "";
  position: absolute;
  left: -36px;
  top: -36px;
  width: 72px;
  height: 72px;
  background: url("./assets/hub/orb.png") center / 72px 72px no-repeat;
  will-change: transform;
}

/* A channel label is a promoted box scaled about its left edge, so the list
   scrolls and recedes by transform and opacity alone. */
.label {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  color: #fff;
  white-space: nowrap;
  transform-origin: 0 50%;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.45);
  will-change: transform, opacity;
  transition:
    transform var(--move-ms) var(--move-ease),
    opacity var(--move-ms) var(--move-ease);
}

.bullet {
  position: absolute;
  background: #fff;
}

.row {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.row :deep(.pane) {
  transform-origin: 0 0;
  will-change: transform, opacity;
}

.counter {
  position: absolute;
  color: #56626c;
  font-size: 30px;
  line-height: 36px;
}

.stage[data-page] .counter {
  color: rgba(236, 241, 245, 0.9);
}

.card {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.tag {
  font-size: 45px;
  line-height: 52px;
}

.score {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 42px;
  line-height: 48px;
}

.coin {
  display: inline-block;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 30%, #fff 0%, #f0f3f4 60%, #cfd6da 100%);
  color: #4a5258;
  font-size: 24px;
  font-style: normal;
  font-weight: 700;
  line-height: 36px;
  text-align: center;
  text-shadow: none;
}

.pic {
  position: absolute;
  background: url("./assets/hub/gamerpic.svg") center / 100% 100% no-repeat;
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.8);
}

/* The prompt row and the Guide are authored in the 720p frame's own pixels
   and scaled to 1080p about the stage's origin by one transform. */
.frame {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  transform: scale(1.5);
  transform-origin: 0 0;
}

/* The static parts of the hub leave once a page or the settings panel has grown
   over them. They paint into the root layer, so visibility costs no layer; the
   promoted labels and panes rest at opacity instead, or their textures drop. */
.stage[data-settings] .bullet,
.stage[data-settings] .counter,
.stage[data-settings] .card,
.stage[data-settings] .pic,
.stage[data-page] .bullet,
.stage[data-page] .card,
.stage[data-page] .pic {
  animation: hub-away 0s linear 300ms forwards;
}

@keyframes hub-away {
  to {
    visibility: hidden;
  }
}

.frame[data-settings-frame] {
  z-index: 50;
}

.frame[data-guide] {
  z-index: 60;
}

@media (prefers-reduced-motion: reduce) {
  .label,
  .row :deep(.pane) {
    transition: none !important;
  }
}
</style>
