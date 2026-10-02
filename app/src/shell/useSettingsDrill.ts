import { computed, ref, watch } from "vue";

import { describeApp } from "../appDescriptions";
import { armHome, homeArmed } from "../homeTakeover";
import { type Button, horizontal, vertical } from "../keys";
import {
  type Page,
  type PageStack,
  pop,
  push,
  ROOT_FOCUS,
  rowCount,
  stepVertical,
  top,
} from "../pages";
import {
  AVATAR_EDITOR_URL,
  BROWSER_APP,
  DESCRIPTION_KEY,
  parseGamerscore,
  profilePage,
  settingsAction,
  settingsDetail,
  settingsPageFor,
  settingsRoot,
  settingsStep,
  type SettingDetail,
} from "../settingsScreen";
import {
  markSetupDone,
  nextSetupId,
  isSetupPage,
  setupAction,
  setupBody,
  setupPage,
  setupStepOf,
  SETUP_ROOT,
  type SetupState,
} from "../setup";
import { playSound } from "../sound";
import { friendCard as makeFriendCard, type FriendCard } from "../steam/card";
import {
  friendPageId,
  STEAM_FRIEND,
  STEAM_GAMES,
  STEAM_QR,
  steamPage,
  type SteamView,
} from "../steam/pages";
import { useAppsStore } from "../stores/apps";
import { useSettingsStore } from "../stores/settings";
import { useSteamStore } from "../stores/steam";
import { useTvStore } from "../stores/tv";
import { chooseTheme, installedThemes, selectedTheme } from "../theme/loader";

/**
 * The dashboard's own settings, as a real drill stack: the root names the
 * categories, `A` pushes a category or writes one change, `B` pops a level.
 * The profile menu and a friend's card open in the same layout. `leaveHub`
 * runs before any of them opens, to close whatever page is over the hub.
 */
export function useSettingsDrill(leaveHub: () => void) {
  const apps = useAppsStore();
  const settings = useSettingsStore();
  const tv = useTvStore();
  const steam = useSteamStore();

  const stack = ref<PageStack>([]);
  const isOpen = computed(() => stack.value.length > 0);

  const steamView = computed((): SteamView => ({
    status: steam.status,
    friends: steam.friends,
    qr: steam.qr,
    error: steam.error,
    games: steam.games,
    enabled: steam.enabled,
  }));

  function openOn(page: Page): void {
    leaveHub();
    stack.value = push([], page);
    playSound("transition");
  }

  /** Open the settings over the hub, from its System pane or the Guide. */
  function open(): void {
    openOn(settingsRoot());
    void tv.loadSystem().then(refreshTop);
  }

  /** The profile's menu, opened by A on the profile pane. */
  function openProfile(): void {
    openOn(profilePage());
  }

  /** A friend's card, opened by A on their pane. */
  function openFriend(friendId: string): void {
    const card = settingsPageFor(
      friendPageId(friendId),
      settings.settings,
      [],
      tv.snapshot,
      steamView.value,
    );
    if (card) openOn(card);
  }

  const homeIsArmed = ref<boolean | null>(null);

  function setupState(): SetupState {
    return {
      homeArmed: homeIsArmed.value,
      nxeInstalled: installedThemes().some((info) => info.id === "nxe"),
      nxeChosen: selectedTheme().id === "nxe",
      steamSignedIn: steam.status.state === "signedIn",
    };
  }

  function setupPageFor(id: string): Page | null {
    const stepId = setupStepOf(id);
    return stepId === null ? null : setupPage(stepId, setupState());
  }

  /** The first-run setup, over the hub. */
  function openSetup(): void {
    const page = setupPageFor(SETUP_ROOT);
    if (page) openOn(page);
    void homeArmed().then((armed) => {
      homeIsArmed.value = armed;
      if (top(stack.value)?.page.id === SETUP_ROOT) refreshTop();
    });
  }

  function finishSetup(): void {
    markSetupDone();
    stack.value = [];
    playSound("transition");
  }

  /** Replace the setup page with the next one, or finish. */
  function advanceSetup(from: string): void {
    const next = nextSetupId(from);
    const page = next === null ? null : setupPageFor(next);
    if (page === null) {
      finishSetup();
      return;
    }
    stack.value = [{ page, focus: ROOT_FOCUS }];
  }

  function activateSetup(optionId: string): void {
    const frame = top(stack.value);
    if (!frame) return;
    const action = setupAction(frame.page.id, optionId);
    if (!action) return;
    playSound("select");
    switch (action.kind) {
      case "next":
        advanceSetup(frame.page.id);
        return;
      case "done":
        finishSetup();
        return;
      case "confirm": {
        const page = setupPageFor("setup:home-confirm");
        if (page) stack.value = push(stack.value, page);
        return;
      }
      case "arm":
        void armHome().then((ran) => {
          if (ran) return;
          playSound("back");
          advanceSetup(frame.page.id);
        });
        return;
      case "theme":
        chooseTheme(action.id);
        advanceSetup(frame.page.id);
        return;
      case "avatar":
        void apps.launch(BROWSER_APP, { target: AVATAR_EDITOR_URL });
        return;
      case "steam": {
        const qr = steamPage(STEAM_QR, steamView.value);
        if (!qr) return;
        stack.value = push(stack.value, qr);
        loadPushed(STEAM_QR);
      }
    }
  }

  /** What is being typed in the profile menu, or null. While it is set, keys belong to the entry. */
  const draft = ref<string | null>(null);
  const draftKey = ref<string>("gamertag");

  /** Keep a typed value. An empty gamertag or a gamerscore that is not a number is refused and kept open. */
  function commitDraft(value: string): void {
    if (draftKey.value === "gamerscore") {
      const score = parseGamerscore(value);
      if (score === null) {
        playSound("back");
        return;
      }
      settings.applyChange({ kind: "level", key: "gamerscore", value: score });
    } else if (draftKey.value.startsWith(DESCRIPTION_KEY)) {
      const appId = draftKey.value.slice(DESCRIPTION_KEY.length);
      settings.applyChange({ kind: "app-description", appId, text: value });
    } else {
      if (value === "") {
        playSound("back");
        return;
      }
      settings.applyChange({ kind: "choice", key: "gamertag", value });
    }
    draft.value = null;
    playSound("select");
    refreshTop();
  }

  function cancelDraft(): void {
    draft.value = null;
    playSound("back");
  }

  function draftFor(key: string): string {
    if (key.startsWith(DESCRIPTION_KEY)) {
      return describeApp(key.slice(DESCRIPTION_KEY.length), settings.settings.appDescriptions);
    }
    if (key === "gamerscore") return String(settings.settings.gamerscore);
    return settings.settings.gamertag || "Player1";
  }

  function step(delta: number): void {
    const next = stepVertical(stack.value, delta);
    if (next === stack.value) return;
    stack.value = next;
    playSound("focus");
  }

  /** Load what a pushed page shows, from Steam or the TV. */
  function loadPushed(id: string): void {
    const pageId = id.slice("settings:".length);
    if (id === STEAM_QR) void steam.beginQr();
    if (id.startsWith(STEAM_GAMES)) void steam.loadGames(id.slice(STEAM_GAMES.length));
    if (pageId === "system") void tv.loadSystem().then(refreshTop);
    else if (pageId.startsWith("tv-")) void tv.loadPage(pageId).then(refreshTop);
  }

  function activate(): void {
    const frame = top(stack.value);
    if (!frame) return;
    if (frame.page.kind === "dialog" && isSetupPage(frame.page.id)) {
      const option = frame.page.options[frame.focus.item];
      if (option) activateSetup(option.id);
      return;
    }
    const action = settingsAction(
      frame.page,
      frame.focus,
      settings.settings,
      apps.launchPoints,
      tv.snapshot,
      steamView.value,
    );
    if (!action) return;
    playSound("select");
    switch (action.kind) {
      case "push": {
        const pushed = [...push(stack.value, action.page)];
        const last = pushed[pushed.length - 1];
        if (last && action.focusItem !== undefined) {
          pushed[pushed.length - 1] = { ...last, focus: { ...last.focus, item: action.focusItem } };
        }
        stack.value = pushed;
        loadPushed(action.page.id);
        return;
      }
      case "edit":
        draftKey.value = action.key;
        draft.value = draftFor(action.key);
        return;
      case "theme":
        chooseTheme(action.id);
        stack.value = pop(stack.value);
        refreshTop();
        return;
      case "launch": {
        const target = action.params["target"];
        // Desktop Chrome has no TV browser to launch, so the page opens in a tab.
        if (typeof target === "string" && typeof window.PalmServiceBridge !== "function") {
          window.open(target, "_blank", "noopener");
          return;
        }
        void apps.launch(action.id, { ...action.params });
        return;
      }
      case "steam":
        void steam.signOut();
        return;
      case "setup":
        openSetup();
        return;
      case "tv":
        tv.apply(action.def, action.value);
        if (action.pop) stack.value = pop(stack.value);
        refreshTop();
        return;
      case "change":
        settings.applyChange(action.change);
        refreshTop();
    }
  }

  /** Left or right on a TV row: a toggle flips, a choice steps, a slider moves. */
  function stepValue(dir: number): void {
    const frame = top(stack.value);
    if (!frame) return;
    const action = settingsStep(frame.page, frame.focus, tv.snapshot, dir);
    if (!action || action.kind !== "tv") return;
    tv.apply(action.def, action.value);
    playSound("focus");
    refreshTop();
  }

  function closeLevel(): void {
    const frame = top(stack.value);
    if (frame && frame.page.kind === "dialog" && isSetupPage(frame.page.id)) {
      activateSetup(frame.page.back);
      return;
    }
    stack.value = pop(stack.value);
    playSound("back");
    if (stack.value.length === 0) playSound("transition");
  }

  /**
   * Rebuild the open page after a change, keeping the focus where it was.
   * Unhiding shrinks the Hidden Apps list under the focus, so the stored page
   * would point past its end; the rebuilt one cannot. A rebuild is paint on a
   * surface whose layer already exists.
   */
  function refreshTop(): void {
    const frame = top(stack.value);
    if (!frame) return;
    const rebuilt = isSetupPage(frame.page.id)
      ? setupPageFor(frame.page.id)
      : settingsPageFor(
          frame.page.id,
          settings.settings,
          apps.launchPoints,
          tv.snapshot,
          steamView.value,
        );
    if (!rebuilt) return;
    const count = rowCount(rebuilt, frame.focus);
    const focus =
      count === 0 ? frame.focus : { ...frame.focus, item: Math.min(frame.focus.item, count - 1) };
    stack.value = [...stack.value.slice(0, -1), { page: rebuilt, focus }];
  }

  /** A button while the drill is open. Whether it was one the drill reads. */
  function onButton(button: Button | null, repeat: boolean): boolean {
    const down = vertical(button);
    if (down !== null) {
      step(down);
      return true;
    }
    const across = horizontal(button);
    if (across !== null) {
      stepValue(across * (repeat ? 5 : 1));
      return true;
    }
    if (button === "a") activate();
    else if (button === "b") closeLevel();
    else return false;
    return true;
  }

  const page = computed(() => top(stack.value)?.page ?? settingsRoot());
  const focus = computed(() => top(stack.value)?.focus ?? ROOT_FOCUS);
  const detail = computed((): SettingDetail => {
    const frame = top(stack.value);
    if (!frame) return { values: [], description: "" };
    if (frame.page.kind === "dialog") {
      const stepId = setupStepOf(frame.page.id);
      return { values: [], description: stepId === null ? "" : setupBody(stepId, setupState()) };
    }
    return settingsDetail(
      frame.page,
      frame.focus,
      settings.settings,
      apps.launchPoints,
      tv.snapshot,
      steamView.value,
    );
  });

  /** The friend card shown while a friend's page is the open page. */
  const friendCard = computed((): FriendCard | null => {
    const id = top(stack.value)?.page.id ?? "";
    if (!id.startsWith(STEAM_FRIEND)) return null;
    const friend = steam.friends.find((entry) => entry.id === id.slice(STEAM_FRIEND.length));
    return friend ? makeFriendCard(friend) : null;
  });

  /** The Steam screens follow the store, and the code is dropped once its page is left. */
  watch(
    () => [steam.status, steam.friends, steam.qr, steam.games],
    () => {
      const id = top(stack.value)?.page.id ?? "";
      if (id === STEAM_QR && steam.status.state === "signedIn") {
        stack.value = pop(stack.value);
        playSound("select");
      }
      if (id.startsWith("settings:steam") || id === "setup:steam") refreshTop();
    },
  );
  watch(
    () => top(stack.value)?.page.id,
    (id) => {
      if (id !== STEAM_QR && steam.qr !== null) steam.cancelQr();
    },
  );

  return {
    stack,
    isOpen,
    open,
    openSetup,
    openProfile,
    openFriend,
    draft,
    draftKey,
    commitDraft,
    cancelDraft,
    onButton,
    page,
    focus,
    detail,
    friendCard,
  };
}
