<script setup lang="ts" vapor>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import { AVATAR_CANVAS } from "./avatar/framing";
import { lookFor, type Look } from "./avatar/look";
import { drawBackdrop } from "./backdrop";
import { type BootReason, type BootSpeed, resolveBootMode } from "./boot";
import AvatarFigure from "./components/AvatarFigure.vue";
import BootScreen from "./components/BootScreen.vue";
import FriendCardLayer from "./components/FriendCard.vue";
import GuideOverlay from "./components/GuideOverlay.vue";
import HubPane from "./components/HubPane.vue";
import LiveInput from "./components/LiveInput.vue";
import PageLayer from "./components/PageLayer.vue";
import PromptBar from "./components/PromptBar.vue";
import SettingsLayer from "./components/SettingsLayer.vue";
import ToastLayer from "./components/ToastLayer.vue";
import { deviceSeed } from "./deviceSeed";
import { DIM_OUT_MS } from "./guide";
import {
  avatarPlace,
  BULLET_SIZE,
  BULLET_X,
  BULLET_Y,
  CARD_PIC,
  CARD_PIC_X,
  CARD_PIC_Y,
  CARD_RIGHT,
  CHANNEL_DIP,
  CHANNEL_IN_EASE,
  CHANNEL_IN_MS,
  CHANNEL_OUT_EASE,
  CHANNEL_OUT_MS,
  COUNTER_X,
  COUNTER_Y,
  counterText,
  HIDDEN,
  type HubMove,
  type HubState,
  LABEL_FONT,
  LABEL_H,
  labelSlot,
  MOVE_EASE,
  MOVE_MS,
  PAGE_STEP,
  PANE_W,
  PANE_X,
  advancePins,
  paneSlot,
  placePool,
  PAST_OFFSET,
  POOL_SIZE,
  type PooledPane,
  stepHub,
} from "./hub";
import {
  DEAL_FRAMES_MS,
  FOLD_FRAMES_MS,
  LEAVE,
  RETURN,
  dealFrames,
  foldFrames,
  hiddenThroughout,
  keyframe,
  cruiseFor,
  cruiseTrack,
  rowTrack,
  slotFrame,
  swingFrames,
  trackAt,
  trackFrames,
  trackMs,
  type MotionFrame,
  type RowTrack,
} from "./hubMotion";
import {
  type HubItem,
  channelPage,
  friendIdOf,
  friendsRow,
  hubRow,
  isAllPane,
  isEmptyPane,
  isFriendPane,
  isHideable,
  isProfilePane,
  isSettingsPane,
  launchTarget,
  pageItems,
  withDescriptions,
  withDetail,
} from "./hubRows";
import { type Button, buttonFor, horizontal } from "./keys";
import { PAGE_COUNTER_X, PAGE_COUNTER_Y } from "./pageRow";
import {
  counterText as pageCounterText,
  DRILL_MS,
  type PageFocus,
  ROOT_FOCUS,
  shellPrompts,
  stepAlong,
  stepAlongBy,
} from "./pages";
import type { PaneItem } from "./panel";
import { PARK_WARM_MS, PARKED, useParked, warming } from "./parked";
import { liveTarget, nameInputs } from "./preview/live";
import { CANVAS_H, CANVAS_W } from "./ribbon";
import { ringSrc, ripplePattern } from "./ripples";
import { CHANNEL_ORDER, isChannel, SECTIONS, startChannel } from "./sections";
import type { Settings } from "./settings";
import { AVATAR_DOWNLOAD, formatGamerscore } from "./settingsScreen";
import { setupDone } from "./setup";
import { framesCalm, nextFrame, wait } from "./shell/frames";
import { play, stop, stopAll } from "./shell/scripted";
import { useArtBake } from "./shell/useArtBake";
import { useGuideNav } from "./shell/useGuideNav";
import { usePaneMove } from "./shell/usePaneMove";
import { useSettingsDrill } from "./shell/useSettingsDrill";
import { useToasts } from "./shell/useToasts";
import { playSound, type Sound } from "./sound";
import { useAppsStore } from "./stores/apps";
import { useInputsStore } from "./stores/inputs";
import { useSettingsStore } from "./stores/settings";
import { useSteamStore } from "./stores/steam";
import { useStorageStore } from "./stores/storage";
import { useSystemToastsStore } from "./stores/systemToasts";
import { theme } from "./theme";
import { activateFonts } from "./theme/loader";

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
const steam = useSteamStore();
/** The gamertag shown: the Steam persona name while signed in to Steam, else the stored one. */
const gamertag = computed(() => {
  const status = steam.status;
  if (status.state === "signedIn" && status.name) return status.name;
  return settings.settings.gamertag || "Player1";
});
const inputs = useInputsStore();
const storage = useStorageStore();
void storage.refresh();

/** Where the user is. The labels follow it at once. Resumes the stored
 * channel rather than always starting on Apps. */
const start = startChannel(
  settings.settings.rememberChannel ? settings.settings.lastChannel : "home",
);
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
 * `boot` is a counter rather than a boolean so that `R` can replay it: setting
 * the same boolean to true twice would not remount the component.
 */
const boot = ref(0);
/** The longest the settled logo waits for steady frames. */
const SETTLE_MAX_MS = 10000;
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
  bootMode.value = resolveBootMode(preference, {
    cold: true,
    reduceMotion: settings.settings.reduceMotion,
  });
}

const { text: toastText, shown: toastShown, notify, loadFont, signIn } = useToasts();

/** Steam's answer to who is signed in, which the sign-in toast waits for so it names the right account. */
let steamStarted: Promise<void> = Promise.resolve();

function signInToast(): void {
  signIn(() => gamertag.value, steamStarted);
}

function firstRun(): void {
  const forced = new URLSearchParams(window.location.search).get("setup") === "1";
  if (forced || !setupDone()) setTimeout(openSetup, 1500);
}

/**
 * The dashboard stays unpainted behind the boot until the bumper has settled.
 * Painting it and adding the theme's fonts keeps the TV to about a frame a
 * second for several seconds, which would stutter the bumper and hold the
 * boot's own start back. Instead the settled logo is held while that happens,
 * and the handover goes ahead once frames are steady again.
 */
const dashShown = ref(false);
const bootHold = ref(true);

function showDash(): void {
  dashShown.value = true;
  activateFonts();
}

async function onBootHeld(): Promise<void> {
  showDash();
  await framesCalm(SETTLE_MAX_MS);
  bootHold.value = false;
}

function onBootDone(payload: { reason: BootReason }): void {
  if (payload.reason === "skipped") console.info("[nxe] boot skipped");
  booting.value = false;
  setTimeout(signInToast, 600);
  firstRun();
}

/** A boot resolved to off never mounts, so the dashboard is simply the first thing shown. */
function settleBoot(): void {
  if (bootMode.value === "off") {
    showDash();
    booting.value = false;
    setTimeout(signInToast, 900);
    firstRun();
  }
}

const channels = CHANNEL_ORDER.map(
  (id) => SECTIONS.find((section) => section.id === id) ?? SECTIONS[0],
);

/** The settings the rows read. A write to any other setting keeps this identity, so it rebuilds no row. */
const ROW_KEYS = [
  "hiddenApps",
  "homeApps",
  "recentApps",
  "appOrder",
  "appSection",
  "appDescriptions",
  "sortModes",
  "gamertag",
  "gamerscore",
] as const;
const rowSettings = computed((previous?: Settings) => {
  const next = settings.settings;
  return previous && ROW_KEYS.every((key) => previous[key] === next[key]) ? previous : next;
});

const rows = computed(() =>
  channels.map((channel) => {
    if (channel.id === "friends") {
      return friendsRow(steam.friends, steam.status.state === "signedIn", steam.enabled);
    }
    const row = withDescriptions(
      hubRow(channel.id, apps.launchPoints, rowSettings.value),
      rowSettings.value.appDescriptions,
    );
    if (channel.id === "home") {
      return row.map((item) => (isProfilePane(item) ? { ...item, title: gamertag.value } : item));
    }
    if (channel.id === "system") return withDetail(row, "nxe:settings", storage.free);
    return channel.id === "inputs" ? nameInputs(row, inputs.statuses) : row;
  }),
);

/** The item under the hub's focus, if there is one. */
const focused = computed(() => rows.value[hub.value.channel]?.[hub.value.item]);

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

const {
  stack: settingsStack,
  isOpen: settingsOpen,
  open: openSettings,
  openSetup,
  openProfile,
  openFriend,
  draft,
  draftKey,
  commitDraft,
  cancelDraft,
  onButton: onSettingsButton,
  page: settingsPage,
  focus: settingsFocus,
  detail: settingsDetailShown,
  friendCard,
} = useSettingsDrill(() => {
  pageOpen.value = false;
});

/** Which element each item index draws on, once a reorder or a slide past one has moved an item off its modulo place. */
const pins = ref<ReadonlyMap<number, number>>(new Map());

const shownRow = computed(() => rows.value[shown.value.channel] ?? []);

const pool = computed(() =>
  placePool(shown.value.item, shownRow.value.length, paneSlot, POOL_SIZE, pins.value),
);

const {
  moving,
  canMove,
  pinLabel,
  start: startMove,
  onButton: onMoveButton,
} = usePaneMove({ rows, hub, shown, pool, pins, resting: () => phase.value === "rest" });

const {
  blade: guideBlade,
  item: guideItem,
  items: guideItems,
  onButton: onGuideButton,
  reset: resetGuide,
} = useGuideNav(rows, (item) => {
  guide.value = false;
  playSound("hudSelect");
  if (isSettingsPane(item)) openSettings();
  else launchItem(item);
});

/**
 * The shell's prompt row: the hub's at the root, the open page's over it, and
 * nothing under the Guide, which carries its own row inside its chrome. The
 * settings drill carries its own stack and reads the same way a channel page
 * does: `A` Select, `B` Back.
 */
const prompts = computed(() => {
  if (settingsOpen.value) return shellPrompts(guide.value, settingsStack.value);
  return shellPrompts(
    guide.value,
    pageOpen.value ? [{ page: page.value, focus: pageFocus.value }] : [],
    {
      canHide: isHideable(focused.value),
      canMove: canMove.value,
      moving: moving.value !== null,
      pin: pinLabel.value ?? (isChannel(hub.value.channel, "home") ? "Remove" : null),
      select: isFriendPane(focused.value) ? "View Details" : null,
    },
  );
});

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
  const item = focused.value;
  if (!isHideable(item)) return;
  if (isChannel(hub.value.channel, "home")) settings.setAppHome(item.id, false);
  else settings.setAppHidden(item.id, !settings.isAppHidden(item.id));
  playSound("option");
  hub.value = clampItem(hub.value);
  shown.value = clampItem(shown.value);
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
  playSound("transition");
}

/** The focus goes home once the panes have faded, so the jump is never seen. */
function closePage(): void {
  pageOpen.value = false;
  playSound("back");
  playSound("transition");
  setTimeout(() => {
    if (!pageOpen.value) pageFocus.value = ROOT_FOCUS;
  }, 250);
}

function stepPage(delta: number, step: typeof stepAlong = stepAlong): void {
  const next = step([{ page: page.value, focus: pageFocus.value }], delta)[0];
  if (!next || next.focus === pageFocus.value) return;
  pageFocus.value = next.focus;
  playSound(delta > 0 ? "panelRight" : "panelLeft");
}

function launchListed(): void {
  const item = pageLatch.value.items[pageFocus.value.item] as HubItem | undefined;
  if (!item) return;
  playSound("select");
  launchItem(item);
}

const counts = computed(() => rows.value.map((row) => row.length));

/** The Friends channel swaps the gamerscore for how many friends are online, as retail's card did. */
const onFriends = computed(
  () => isChannel(shown.value.channel, "friends") && steam.status.state === "signedIn",
);
const onlineCount = computed(
  () => steam.friends.filter((friend) => friend.state !== "offline").length,
);

/** Nothing has moved for half a second: the live input preview may come up. */
const stood = ref(false);
let standTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => [
    shown.value.channel,
    shown.value.item,
    pageOpen.value,
    guide.value,
    settingsStack.value.length,
  ],
  () => {
    stood.value = false;
    if (standTimer !== null) clearTimeout(standTimer);
    standTimer = setTimeout(() => {
      stood.value = true;
    }, 500);
    const onInputs = isChannel(shown.value.channel, "inputs");
    if (onInputs) void inputs.refresh();
    if (isChannel(shown.value.channel, "system")) void storage.refresh();
    inputs.watch(settings.settings.livePreviews && onInputs);
  },
  { immediate: true },
);

void inputs.refresh();

const liveInput = computed(() =>
  liveTarget({
    enabled: settings.settings.livePreviews,
    channel: channels[shown.value.channel]?.id ?? "",
    itemId: shownRow.value[shown.value.item]?.id ?? null,
    settled: stood.value,
    covered: pageOpen.value || guide.value || settingsOpen.value || booting.value,
    statuses: inputs.statuses,
  }),
);

watch(
  () => [shown.value.channel, shown.value.item] as const,
  ([channel, item], [was, before]) => {
    pins.value =
      channel === was ? advancePins(pins.value, before - 1, item - 1) : new Map<number, number>();
  },
  { flush: "sync" },
);

/** The row rests hidden until the first load resolves, so an empty hub is never seen. */
const loaded = computed(() => apps.status === "ready" || apps.status === "error");

const counter = computed(() =>
  !loaded.value
    ? ""
    : pageOpen.value
      ? pageCounterText(page.value, pageFocus.value)
      : moving.value !== null
        ? `Moving ${counterText(shown.value.item, shownRow.value.length)}`
        : counterText(shown.value.item, shownRow.value.length),
);

const { bootReady, noteKey } = useArtBake({
  rows,
  channel: () => hub.value.channel,
  loaded,
  booting,
});

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
const hubAway = computed(() => pageOpen.value || settingsOpen.value);

interface PaneMotion {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly opacity: number;
  readonly transition: string;
}

function paneMotion(pane: PooledPane): PaneMotion {
  let { x, y, scale, opacity } = pane.slot;
  let transition = driving.value ? "none" : moveTransition;
  const dips = pane.offset === 0 && pane.item !== null;
  if (hubAway.value || !loaded.value) {
    opacity = HIDDEN;
    transition = swinging.value ? "none" : `opacity ${CHANNEL_OUT_MS}ms ${CHANNEL_OUT_EASE}`;
  } else if (phase.value === "out") {
    opacity = dips ? CHANNEL_DIP : HIDDEN;
    transition = `opacity ${CHANNEL_OUT_MS}ms ${CHANNEL_OUT_EASE}`;
  } else if (phase.value === "collapsed") {
    if (pane.offset > 0) x = PANE_X + PANE_W * (1 - scale);
    opacity = dips ? CHANNEL_DIP : HIDDEN;
    transition = "none";
  } else if (phase.value === "in") {
    transition = pane.offset > 0 ? "none" : `opacity ${CHANNEL_IN_MS}ms ${CHANNEL_IN_EASE}`;
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

/** On Friends the one figure stands by the focused pane, tinted for that friend. */
const onFriendsChannel = computed(() => isChannel(hub.value.channel, "friends"));
const friendLook = computed((): Look | null => {
  if (!onFriendsChannel.value) return null;
  const id = friendIdOf(shownRow.value[shown.value.item]);
  return id === null ? null : lookFor(id);
});

/**
 * The avatar stands beside the profile pane and moves with it, on the pane's
 * own transition, at the pane's depth so nearer panes cover it. Away from
 * Apps it rests hidden where it last stood, so its layer keeps its texture.
 */
const avatarPane = computed(() =>
  onFriendsChannel.value
    ? pool.value.find((pane) => pane.offset === 0)
    : pool.value.find((pane) => isProfilePane(paneItem(pane))),
);

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
  if (friendCard.value !== null) {
    const scale = 0.88;
    return {
      transform: `translate3d(${1440 - scale * AVATAR_CANVAS.centre}px, ${900 - scale * AVATAR_CANVAS.feet}px, 0) scale(${scale})`,
      opacity: "1",
      "z-index": "60",
      transition: `opacity ${CHANNEL_OUT_MS}ms linear`,
    };
  }
  const motion = paneMotion(pane);
  const place = avatarPlace(motion, pane.offset, AVATAR_CANVAS, onFriendsChannel.value);
  if (onFriendsChannel.value) {
    const still =
      !settling.value && !hubAway.value && phase.value === "rest" && friendLook.value !== null;
    return {
      transform: `translate3d(${place.x}px, ${place.y}px, 0) scale(${place.scale})`,
      opacity: still ? "1" : `${HIDDEN}`,
      "z-index": `${pane.slot.z}`,
      transition: `opacity ${still ? 160 : 60}ms linear`,
    };
  }
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
  if (friendCard.value !== null) return !booting.value && loaded.value && phase.value === "rest";
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
    height: `${LABEL_H}px`,
    "font-size": `${LABEL_FONT}px`,
    "line-height": `${LABEL_H}px`,
    transform: `translate3d(${slot.x}px, ${slot.y}px, 0) scale(${slot.scale})`,
    opacity: `${hubAway.value ? HIDDEN : slot.opacity}`,
    ...(swinging.value ? { transition: labelSwing.value } : {}),
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

/**
 * Anchored by its left edge like the picture beside it, so a window that is not
 * 1920 wide moves both together. A box this wide holds any gamertag, and its
 * text is right-aligned to the edge that touches the picture.
 */
const CARD_W = 480;
const cardStyle = {
  left: `${CARD_RIGHT - CARD_W}px`,
  width: `${CARD_W}px`,
  top: `${CARD_PIC_Y}px`,
};

/** The avatar's own gamer picture, taken once it has loaded; the default until then. */
const gamerpic = ref("");

/** The signed-in Steam account's picture in place of the avatar's portrait, while there is one. */
const shownPic = computed(() => {
  const status = steam.status;
  return status.state === "signedIn" && status.avatar ? status.avatar : gamerpic.value;
});

const picStyle = computed(() => ({
  left: `${CARD_PIC_X}px`,
  top: `${CARD_PIC_Y}px`,
  width: `${CARD_PIC}px`,
  height: `${CARD_PIC}px`,
  ...(shownPic.value ? { backgroundImage: `url(${shownPic.value})` } : {}),
}));

/** The 720p frame's own size, which the prompt row and the Guide are authored in. */
const frameStyle = {
  width: `${CANVAS_W}px`,
  height: `${CANVAS_H}px`,
};

/**
 * A closed Guide and friend card wait off the frame, so the compositor stops
 * drawing their resting layers. Off the frame they are never rastered, so they
 * sit on it for a moment after the boot, long enough to paint once.
 */
watch(
  booting,
  (busy) => {
    if (!busy) setTimeout(() => (warming.value = false), PARK_WARM_MS);
  },
  { immediate: true },
);
const guideAway = useParked(() => guide.value, DIM_OUT_MS);
const friendAway = useParked(() => friendCard.value !== null, DRILL_MS);
const guideParked = computed(() => guideAway.value && !warming.value);
watch(guideAway, (away) => {
  if (away) resetGuide();
});
const friendParked = computed(() => friendAway.value && !warming.value);
const parkedFrame = { transform: `${PARKED} scale(1.5)` };

const motion = {
  "--move-ms": `${MOVE_MS}ms`,
  "--move-ease": MOVE_EASE,
};

/** How long the deal takes, from the focused pane fading up to the last pane landing. */
const DEAL_SETTLE_MS = CHANNEL_IN_MS + DEAL_FRAMES_MS;

/**
 * Row moves and the deal run retail's own motion (`hubMotion.ts`): each pane
 * element gets frames along the 3D card line through the Web Animations API,
 * on the compositor, while its inline style already holds where it will rest.
 * `driving` turns the CSS transition off meanwhile, and `moves` remembers each
 * element's move so an interrupting one starts from where the pane stands.
 */
const driving = ref(false);
let rowRun: { track: RowTrack; start: number } | null = null;
let drivingTimer: ReturnType<typeof setTimeout> | undefined;

function paneElements(): HTMLElement[] {
  const row = document.querySelector("[data-panes]");
  return row ? (Array.from(row.children) as HTMLElement[]) : [];
}

function avatarElement(): HTMLElement | null {
  return document.querySelector("canvas.avatar");
}

/** Stops every scripted move and deal, so each pane falls back to its inline style. */
function cancelDriven(): void {
  const avatar = avatarElement();
  stopAll(avatar ? [...paneElements(), avatar] : paneElements());
  rowRun = null;
  clearTimeout(drivingTimer);
  driving.value = false;
}

/** Repeats closer together than this, in one direction, are a held stick. */
const HELD_MS = 300;
/**
 * The last left or right press, taken or not, and the repeat interval smoothed
 * over the hold, since repeats land on whole frames. Counting every press
 * rather than every move keeps the cruise at the stick's own rate.
 */
let lastPress = { at: -Infinity, direction: 0, interval: HELD_MS, holding: false };

/** How far a held stick may run the row ahead of where it stands, which the pool's spare cards cover. */
const ROW_LAG = 2;

/** Where the row stands, in items, and how fast it is going. */
/**
 * The animation timeline's time. A new move takes over from where the running
 * one stands at this instant, and its animations are started at this same
 * instant, so the hand-over is seamless. Reading `performance.now()` instead
 * put the two a frame or so apart, which showed as the row twitching back on
 * each press of a held stick.
 */
function timelineNow(): number {
  const time = document.timeline.currentTime;
  return typeof time === "number" ? time : performance.now();
}

function rowAt(now: number, rest: number): { position: number; velocity: number } {
  return rowRun ? trackAt(rowRun.track, now - rowRun.start) : { position: rest, velocity: 0 };
}

function animateAvatar(
  frames: readonly MotionFrame[],
  offsets: readonly number[],
  options: KeyframeAnimationOptions,
): Animation | null {
  const avatar = avatarElement();
  if (!avatar || onFriendsChannel.value) return null;
  return play(
    avatar,
    frames.map((frame, index) => {
      const place = avatarPlace(frame, offsets[index] ?? 0, AVATAR_CANVAS);
      return {
        transform: `translate3d(${place.x}px, ${place.y}px, 0) scale(${place.scale})`,
        opacity: `${frame.opacity}`,
      };
    }),
    options,
  );
}

/** Runs the row from where it stands to the new focus on retail's spring, every pane on the same track. */
async function driveMove(
  from: { position: number; velocity: number },
  at: number,
  cruise: number | null = null,
): Promise<void> {
  driving.value = true;
  clearTimeout(drivingTimer);
  await nextTick();
  const target = shown.value.item;
  const track =
    cruise === null
      ? rowTrack(from.position, from.velocity, target)
      : cruiseTrack(from.position, from.velocity, target, cruise);
  const duration = trackMs(track);
  rowRun = { track, start: at };
  const started: Animation[] = [];
  const elements = paneElements();
  const avatarOf = avatarPane.value?.element;
  const options = { duration, easing: "linear" };
  for (const pane of pool.value) {
    const element = elements[pane.element];
    if (!element) continue;
    if (pane.item === null || duration === 0 || hiddenThroughout(track, pane.item)) {
      stop(element);
      continue;
    }
    const frames = trackFrames(track, pane.item, pane.slot);
    started.push(play(element, frames.map(keyframe), options));
    if (pane.element === avatarOf) {
      const item = pane.item;
      const avatar = animateAvatar(
        frames,
        track.positions.map((position) => item - position),
        options,
      );
      if (avatar) started.push(avatar);
    }
  }
  for (const animation of started) animation.startTime = at;
  drivingTimer = setTimeout(() => {
    driving.value = false;
    rowRun = null;
  }, duration);
}

async function driveDeal(mine: number): Promise<void> {
  await nextTick();
  if (mine !== generation) return;
  const elements = paneElements();
  const avatarOf = avatarPane.value?.element;
  const options: KeyframeAnimationOptions = {
    duration: DEAL_FRAMES_MS,
    delay: CHANNEL_IN_MS,
    easing: "linear",
    fill: "backwards",
  };
  for (const pane of pool.value) {
    const element = elements[pane.element];
    if (!element || pane.item === null || pane.offset <= 0) continue;
    const frames = dealFrames(pane.offset, pane.slot);
    play(element, frames.map(keyframe), options);
    if (pane.element === avatarOf) {
      animateAvatar(
        frames,
        frames.map(() => pane.offset),
        options,
      );
    }
  }
}

/**
 * The cards the deal shows get their new content one a frame, ahead of their
 * reveal. The spare cards past either end are out of sight until the next
 * move, so they wait until the deal has landed: each content swap is a pane's
 * worth of raster on the TV's GPU, and doing all of them inside the deal cost
 * it a frame in every two.
 */
async function releasePanes(mine: number): Promise<void> {
  for (let rank = 2; rank <= PAST_OFFSET; rank++) {
    await nextFrame();
    if (mine !== generation) return;
    released.value = rank;
  }
  await wait(DEAL_SETTLE_MS);
  for (let rank = PAST_OFFSET + 1; rank <= 2 * POOL_SIZE; rank++) {
    await nextFrame();
    if (mine !== generation) return;
    released.value = rank;
  }
  held.value = null;
}

/**
 * Settings opening and closing on retail's scene transition: the spill folds
 * away behind the focused card, the channel list goes, and the focused card
 * swings away about its left edge; closing, it swings back and the spill deals
 * out again. `swinging` holds the CSS transitions off while it runs.
 */
const swinging = ref(false);
const labelSwing = ref("none");
let swingTimer: ReturnType<typeof setTimeout> | undefined;

function swingFor(ms: number): void {
  swinging.value = true;
  clearTimeout(swingTimer);
  swingTimer = setTimeout(() => (swinging.value = false), ms);
}

function fadeOnly(frame: Keyframe): Keyframe {
  return frame.offset === undefined
    ? { opacity: frame.opacity ?? "1" }
    : { opacity: frame.opacity ?? "1", offset: frame.offset };
}

async function driveLeave(): Promise<void> {
  const total = LEAVE.panel[1];
  labelSwing.value = `opacity ${LEAVE.channel[1] - LEAVE.channel[0]}ms linear ${LEAVE.channel[0]}ms`;
  swingFor(total);
  await nextTick();
  const elements = paneElements();
  const avatarOf = avatarPane.value?.element;
  for (const pane of pool.value) {
    const element = elements[pane.element];
    if (!element || pane.item === null || pane.offset < 0) continue;
    let options: KeyframeAnimationOptions;
    let frames: Keyframe[];
    if (pane.offset === 0) {
      frames = swingFrames(slotFrame(pane.slot), 0, 90, LEAVE.panel, total, false);
      options = { duration: total, easing: "linear" };
    } else {
      frames = foldFrames(pane.offset).map(keyframe);
      options = { duration: FOLD_FRAMES_MS, easing: "linear" };
    }
    play(element, frames, options);
    const avatar = avatarElement();
    if (pane.element === avatarOf && avatar) {
      play(avatar, frames.map(fadeOnly), options);
    }
  }
}

async function driveReturn(): Promise<void> {
  const total = RETURN.channel[1];
  labelSwing.value = `opacity ${RETURN.channel[1] - RETURN.channel[0]}ms ease-out ${RETURN.channel[0]}ms`;
  swingFor(total);
  await nextTick();
  const elements = paneElements();
  const avatarOf = avatarPane.value?.element;
  const options: KeyframeAnimationOptions = { duration: RETURN.panel[1], easing: "linear" };
  const dealing: KeyframeAnimationOptions = {
    duration: DEAL_FRAMES_MS,
    delay: RETURN.panel[1],
    easing: "linear",
    fill: "backwards",
  };
  for (const pane of pool.value) {
    const element = elements[pane.element];
    if (!element || pane.item === null || pane.offset < 0) continue;
    const frames =
      pane.offset === 0
        ? swingFrames(slotFrame(pane.slot), 90, 0, RETURN.panel, RETURN.panel[1], true)
        : dealFrames(pane.offset, pane.slot).map(keyframe);
    play(element, frames, pane.offset === 0 ? options : dealing);
    const avatar = avatarElement();
    if (pane.element === avatarOf && avatar) {
      play(avatar, frames.map(fadeOnly), pane.offset === 0 ? options : dealing);
    }
  }
}

async function changeChannel(): Promise<void> {
  const mine = ++generation;
  cancelDriven();
  phase.value = "out";
  await wait(CHANNEL_OUT_MS);
  if (mine !== generation) return;
  held.value = new Map(pool.value.map((pane) => [pane.element, paneItem(pane)]));
  released.value = 1;
  shown.value = hub.value;
  phase.value = "collapsed";
  await nextFrame();
  await nextFrame();
  if (mine !== generation) return;
  phase.value = "in";
  void driveDeal(mine);
  void releasePanes(mine);
  await wait(DEAL_SETTLE_MS);
  if (mine === generation) phase.value = "rest";
}

/** The last channel is stored once the change has settled, so the write lands outside the transition. */
let rememberTimer: ReturnType<typeof setTimeout> | undefined;
function rememberChannel(id: string): void {
  clearTimeout(rememberTimer);
  if (!settings.settings.rememberChannel) return;
  rememberTimer = setTimeout(
    () => settings.updateSetting("lastChannel", id),
    CHANNEL_OUT_MS + DEAL_SETTLE_MS,
  );
}

/** The cue a hub move plays. Down the channel list plays `channelup`, the list itself moving up, as retail does. */
function navSound(move: HubMove): Sound {
  if (move === "down") return "channelUp";
  if (move === "up") return "channelDown";
  return move === "left" || move === "pageLeft" ? "panelLeft" : "panelRight";
}

function navigate(move: HubMove): void {
  const next = stepHub(hub.value, move, counts.value);
  if (next === hub.value) return;
  const channelChanged = next.channel !== hub.value.channel;
  const single = move === "left" || move === "right";
  const pressed = timelineNow();
  const direction = Math.sign(next.item - hub.value.item);
  const holding = single && direction === lastPress.direction && pressed - lastPress.at < HELD_MS;
  const gap = pressed - lastPress.at;
  lastPress = {
    at: pressed,
    direction,
    interval: holding && lastPress.holding ? lastPress.interval * 0.75 + gap * 0.25 : gap,
    holding,
  };
  if (
    !channelChanged &&
    single &&
    Math.abs(next.item - rowAt(pressed, next.item).position) > ROW_LAG
  ) {
    return;
  }
  hub.value = next;
  playSound(navSound(move));
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
  const from = rowAt(pressed, shown.value.item);
  const cruise = holding && rowRun !== null ? cruiseFor(lastPress.interval) : null;
  shown.value = next;
  void driveMove(from, pressed, cruise);
}

/** A launches the focused pane's item. A placeholder is drawn and nothing
 * else: pressing A on it does nothing, the way B does nothing at the hub root. */
function activate(): void {
  const item = focused.value;
  if (!item || isEmptyPane(item)) return;
  playSound("select");
  const friendId = friendIdOf(item);
  if (isProfilePane(item)) openProfile();
  else if (isSettingsPane(item)) openSettings();
  else if (friendId !== null) openFriend(friendId);
  else if (isAllPane(item)) openPage();
  else launchItem(item);
}

const HUB_MOVES: Partial<Record<Button, HubMove>> = {
  left: "left",
  right: "right",
  up: "up",
  down: "down",
  pageLeft: "pageLeft",
  pageRight: "pageRight",
};

/** A button while the Guide is open: its own navigation, and Y, the Guide button or B closes it. */
function onGuideKey(button: Button | null): boolean {
  if (onGuideButton(button)) return true;
  if (button !== "y" && button !== "guide" && button !== "b") return false;
  guide.value = false;
  playSound("hudClose");
  return true;
}

/** A button while a channel's page is open. Up and down are swallowed: the page is one row. */
function onPageKey(button: Button | null): boolean {
  const across = horizontal(button);
  if (across !== null) stepPage(across);
  else if (button === "pageRight") stepPage(PAGE_STEP, stepAlongBy);
  else if (button === "pageLeft") stepPage(-PAGE_STEP, stepAlongBy);
  else if (button === "a") launchListed();
  else if (button === "b") closePage();
  else return button === "up" || button === "down";
  return true;
}

/** A button at the hub root. B does nothing here, as on the dashboard. */
function onHubKey(button: Button | null): boolean {
  if (button === "y") {
    startMove();
    return true;
  }
  const move = button === null ? undefined : HUB_MOVES[button];
  if (move) navigate(move);
  else if (button === "a") activate();
  else if (button === "x") toggleHide();
  else if (button === "replay") {
    bootHold.value = false;
    booting.value = true;
    boot.value += 1;
  } else if (button === "guide") {
    guide.value = true;
    playSound("hudOpen");
  } else return false;
  return true;
}

let visibleSince = performance.now();
let hiddenAt: number | null = null;
/** Away this long, the TV was off or on another input, and a return is a fresh start. */
const AWAY_REPLAY_MS = 30 * 60 * 1000;

function noteVisibility(): void {
  if (document.hidden) {
    hiddenAt ??= Date.now();
    return;
  }
  visibleSince = performance.now();
  const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
  hiddenAt = null;
  if (away >= AWAY_REPLAY_MS && bootMode.value !== "off" && !booting.value) {
    bootHold.value = false;
    booting.value = true;
    boot.value += 1;
  }
}

/** Home relaunches the running app: on screen already it toggles the Guide, from the background it only returns. */
function onRelaunch(): void {
  const system = (window as typeof window & { webOSSystem?: { launchParams?: string } })
    .webOSSystem;
  let home = false;
  try {
    home = Boolean(JSON.parse(system?.launchParams || "{}")?.home);
  } catch {}
  if (!home) return;
  if (document.hidden || performance.now() - visibleSince < 1500) return;
  if (guide.value) onGuideKey("guide");
  else if (!booting.value && !settingsOpen.value && !pageOpen.value && moving.value === null)
    onHubKey("guide");
}

function onKeyDown(event: KeyboardEvent): void {
  noteKey();
  if (draft.value !== null) return;
  const button = buttonFor(event.keyCode);
  let consumed: boolean;
  if (guide.value) consumed = onGuideKey(button);
  else if (settingsOpen.value) consumed = onSettingsButton(button, event.repeat);
  else if (pageOpen.value) consumed = onPageKey(button);
  else if (moving.value !== null) {
    onMoveButton(button);
    consumed = true;
  } else consumed = onHubKey(button);
  if (consumed) event.preventDefault();
}

/**
 * Each ring group is a canvas drawn once, because a canvas is one texture and
 * one quad, where a promoted box this size is eight 256px tiles the compositor
 * redraws every frame the rings move.
 */
const ringGroups = ripplePattern(deviceSeed());
const rings = ringGroups.map((group) => ({
  left: `${group.left}px`,
  top: `${group.top}px`,
  width: `${group.width}px`,
  height: `${group.height}px`,
  animationDuration: `${group.periodMs}ms`,
  animationDelay: `${group.delayMs}ms`,
  "--from": String(group.from),
  "--peak": String(group.peak),
}));

function drawRings(): void {
  const canvases = document.querySelectorAll<HTMLCanvasElement>(".ripples canvas");
  ringGroups.forEach((group, index) => {
    const canvas = canvases[index];
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = group.width;
    canvas.height = group.height;
    const image = new Image();
    image.addEventListener("load", () => context.drawImage(image, 0, 0, group.width, group.height));
    image.src = ringSrc(group);
  });
}

watch([hubAway, guide], ([away, open]) => {
  if (away || open) cancelDriven();
  settle();
});

watch(hubAway, (away) => {
  cancelDriven();
  void (away ? driveLeave() : driveReturn());
});

watch(
  () => settings.settings.steam,
  (on) => void steam.setEnabled(on),
);

onMounted(() => {
  drawRings();
  const backdrop = document.querySelector<HTMLCanvasElement>("canvas.backdrop");
  if (backdrop) void drawBackdrop(backdrop);
  chooseBootMode();
  settleBoot();
  window.addEventListener("keydown", onKeyDown);
  document.addEventListener("webOSRelaunch", onRelaunch);
  document.addEventListener("visibilitychange", noteVisibility);
  void apps.load();
  void loadFont();
  useSystemToastsStore().start(notify);
  steam.enabled = settings.settings.steam;
  steamStarted = settings.settings.steam ? steam.start(notify) : Promise.resolve();
  expose();
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
  document.removeEventListener("webOSRelaunch", onRelaunch);
  document.removeEventListener("visibilitychange", noteVisibility);
});

function expose(): void {
  (window as typeof window & { nxeDebug?: unknown }).nxeDebug = {
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
    :data-unready="!dashShown || undefined"
    :data-settings="settingsOpen || undefined"
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
      <span class="tag">{{ gamertag }}</span>
      <span v-if="onFriends" class="score">{{ onlineCount }} online</span>
      <span v-else class="score"
        >{{ formatGamerscore(settings.settings.gamerscore) }}<i class="coin">G</i></span
      >
    </header>
    <div class="pic" :style="picStyle" />
    <canvas class="backdrop" :data-shown="settingsOpen || undefined" />
    <div class="frame" data-frame :style="frameStyle">
      <PromptBar
        v-if="settings.settings.hintBar"
        :prompts="prompts"
        :remote="settings.settings.remoteHints"
      />
    </div>
    <div class="ripples">
      <canvas v-for="(ring, index) in rings" :key="index" :style="ring" />
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
      :fallback="theme().avatar"
      :playing="avatarPlaying"
      :look="friendLook"
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
        :open="settingsOpen && !friendCard"
        :detail="settingsDetailShown"
        :draft="draft"
        :numeric="draftKey === 'gamerscore'"
        @commit="commitDraft"
        @cancel="cancelDraft"
      />
    </div>

    <div class="frame" data-friend :style="[frameStyle, friendParked ? parkedFrame : null]">
      <FriendCardLayer :card="friendCard" :focus="settingsFocus.item" :open="friendCard !== null" />
    </div>

    <div class="frame" data-guide :style="[frameStyle, guideParked ? parkedFrame : null]">
      <GuideOverlay
        :open="guide"
        :blade="guideBlade"
        :item="guideItem"
        :items="guideItems"
        :pic="shownPic"
        :profile="gamertag"
        :show-clock="settings.settings.showClock"
        :clock24h="settings.settings.clock24h"
        :remote="settings.settings.remoteHints"
      />
    </div>

    <LiveInput :target="liveInput" />

    <ToastLayer :toast="toastText" :shown="toastShown" />

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
      :hold="bootHold"
      @held="onBootHeld"
      @done="onBootDone"
    />
  </main>
</template>

<style scoped>
.stage[data-unready] > :not(.boot) {
  visibility: hidden;
}

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
      ellipse 40% 60% at 92% 100%,
      rgba(246, 252, 215, 0.95) 0%,
      rgba(214, 236, 150, 0.55) 45%,
      rgba(200, 225, 130, 0) 100%
    ),
    radial-gradient(
      ellipse 46% 45% at 60% 95%,
      rgba(244, 255, 250, 0.9) 0%,
      rgba(230, 246, 190, 0.4) 50%,
      rgba(230, 246, 190, 0) 100%
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

.ripples canvas {
  position: absolute;
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
  .ripples canvas {
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
  background: var(--theme-orb) center / 72px 72px no-repeat;
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
  padding-right: 4px;
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
  background: var(
      --theme-gamerscore,
      radial-gradient(circle at 50% 30%, #fff 0%, #f0f3f4 60%, #cfd6da 100%)
    )
    center / 100% 100% no-repeat;
  color: #4a5258;
  font-size: 24px;
  font-style: normal;
  font-weight: 700;
  line-height: 36px;
  text-align: center;
  text-shadow: none;
}

:global(:root[data-gamerscore-art] .coin) {
  color: transparent;
}

.pic {
  position: absolute;
  background: var(--theme-gamerpic, url("./assets/hub/gamerpic.svg")) center / 100% 100% no-repeat;
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

/* Settings stands on the flat wallpaper instead of the hub's floor: dark green
   above, white-blue at the lower left, yellow and orange at the right. Both
   layers already exist, so swapping their paint allocates nothing. */
/* Painted once after the static content, so nothing it covers is squashed above it. */
.backdrop {
  position: absolute;
  left: 0;
  top: 0;
  width: 1920px;
  height: 1080px;
  opacity: 0;
  will-change: opacity;
  transition: opacity 200ms linear;
  pointer-events: none;
}

.backdrop[data-shown] {
  opacity: 1;
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
