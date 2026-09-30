import { defineStore } from "pinia";
import { ref } from "vue";

import { mergeSettings, SETTINGS_DEFAULTS, type SettingChange, type Settings } from "../settings";
import { readJson, writeJson } from "../storage";

/**
 * Settings, persisted to `localStorage` on the app-scoped `file://` origin.
 *
 * Written whole rather than merged, so a deleted key stays deleted. Defaults
 * drive the UI immediately — there is no storage to wait for, so nothing blocks
 * render.
 */
const SETTINGS_KEY = "ooo.lew.xne.settings";

/** How many launches the recently used list keeps. */
const RECENT_LIMIT = 32;

export const useSettingsStore = defineStore("settings", () => {
  const { settings: initial, migrated } = mergeSettings(readJson(SETTINGS_KEY));
  const settings = ref<Settings>(initial);

  function persist(): void {
    writeJson(SETTINGS_KEY, settings.value);
  }

  if (migrated) persist();

  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    settings.value = { ...settings.value, [key]: value };
    persist();
  }

  function isAppHidden(appId: string): boolean {
    return settings.value.hiddenApps.includes(appId);
  }

  function setAppHidden(appId: string, hidden: boolean): void {
    const hiddenApps = hidden
      ? [...new Set([...settings.value.hiddenApps, appId])]
      : settings.value.hiddenApps.filter((id) => id !== appId);
    updateSetting("hiddenApps", hiddenApps);
  }

  /** `section` of null puts the app back on whatever section it came from. */
  function setAppSection(appId: string, section: string | null): void {
    const appSection = { ...settings.value.appSection };
    if (section === null) delete appSection[appId];
    else appSection[appId] = section;
    updateSetting("appSection", appSection);
  }

  /**
   * The whole of a section's app order, written over whatever was stored for those
   * apps. The order is written whole because a single move is only visible if the
   * apps around it are in the stored list too.
   */
  function setAppOrder(order: readonly string[], save = true): void {
    const mine = new Set(order);
    const rest = settings.value.appOrder.filter((id) => !mine.has(id));
    settings.value = { ...settings.value, appOrder: [...rest, ...order] };
    if (save) persist();
  }

  function isAppHome(appId: string): boolean {
    return settings.value.homeApps.includes(appId);
  }

  /** Pin an app to the end of Home, or take it off. */
  function setAppHome(appId: string, home: boolean): void {
    const rest = settings.value.homeApps.filter((id) => id !== appId);
    updateSetting("homeApps", home ? [...rest, appId] : rest);
  }

  /** Home's whole order, kept ahead of pins the device no longer lists. */
  function setHomeOrder(order: readonly string[], save = true): void {
    const mine = new Set(order);
    const rest = settings.value.homeApps.filter((id) => !mine.has(id));
    settings.value = { ...settings.value, homeApps: [...order, ...rest] };
    if (save) persist();
  }

  function setSortMode(section: string, mode: Settings["sortModes"][string]): void {
    updateSetting("sortModes", { ...settings.value.sortModes, [section]: mode });
  }

  /** Set an app's description, or take the user's text away so the shipped line returns. */
  function setAppDescription(appId: string, text: string): void {
    const { [appId]: _dropped, ...rest } = settings.value.appDescriptions;
    const trimmed = text.trim();
    updateSetting("appDescriptions", trimmed === "" ? rest : { ...rest, [appId]: trimmed });
  }

  function clearHiddenApps(): void {
    updateSetting("hiddenApps", []);
  }

  /** Put the blades, the apps on them and their order back the way they shipped. */
  function resetLayout(): void {
    settings.value = {
      ...settings.value,
      appOrder: [],
      hiddenApps: [],
      homeApps: [],
      appSection: {},
      sortModes: {},
    };
    persist();
  }

  function resetToDefaults(): void {
    settings.value = { ...SETTINGS_DEFAULTS };
    persist();
  }

  /**
   * One change from the settings screen, already resolved to its value, so the
   * screen never has to know how a key is stored.
   */
  function applyChange(change: SettingChange): void {
    switch (change.kind) {
      case "flag":
        updateSetting(change.key, change.value);
        return;
      case "level":
        updateSetting(change.key, change.value);
        return;
      case "choice":
        updateSetting(change.key, change.value);
        return;
      case "sort":
        setSortMode(change.section, change.mode);
        return;
      case "app-section":
        setAppSection(change.appId, change.section);
        return;
      case "app-description":
        setAppDescription(change.appId, change.text);
        return;
      case "app-hidden":
        setAppHidden(change.appId, change.hidden);
        return;
      case "app-order":
        setAppOrder(change.order);
        return;
      case "hidden-clear":
        clearHiddenApps();
        return;
      case "layout-reset":
        resetLayout();
    }
  }

  /**
   * An app has been launched, so it goes to the top of the recently used list.
   * Nothing else writes `recentApps`: the launch path does.
   */
  function noteLaunch(appId: string): void {
    const recentApps = [appId, ...settings.value.recentApps.filter((id) => id !== appId)].slice(
      0,
      RECENT_LIMIT,
    );
    updateSetting("recentApps", recentApps);
  }

  return {
    settings,
    updateSetting,
    isAppHidden,
    setAppHidden,
    setAppSection,
    setAppOrder,
    isAppHome,
    setAppHome,
    setHomeOrder,
    persist,
    setSortMode,
    clearHiddenApps,
    resetLayout,
    applyChange,
    noteLaunch,
    resetToDefaults,
  };
});
