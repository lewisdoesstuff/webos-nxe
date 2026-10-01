/**
 * Finding, reading and installing the chosen theme.
 *
 * Add-on themes live in `THEMES_DIR`, one folder each with a `theme.json`, and
 * `index.json` beside them lists the installed ids. A file:// page cannot read
 * outside its own directory, so the folder is reached through the `hack`
 * symlink (see `paths.ts`). Anything that goes wrong leaves the default theme
 * in place and a message in the console, never a broken start.
 */

import { HACK_PREFIX } from "../paths";
import { readJson, writeJson } from "../storage";
import { DEFAULT_THEME, setTheme } from "./index";
import { applyManifest, joinUrl } from "./resolve";
import {
  BUTTON_KEYS,
  ICON_KEYS,
  type ButtonKey,
  type Theme,
  type ThemeInfo,
  type ThemeManifest,
} from "./types";

export const THEMES_DIR = "/media/internal/nxe-themes";
export const THEME_KEY = "nxe.theme";
const MAX_EXTENDS = 4;
const READ_MS = 4000;

let installed: ThemeInfo[] = [{ id: DEFAULT_THEME.id, name: DEFAULT_THEME.name }];

/** The themes that can be chosen, the default first. */
export function installedThemes(): readonly ThemeInfo[] {
  return installed;
}

function themeBase(id: string): string {
  return `${HACK_PREFIX}${THEMES_DIR}/${id}`;
}

function request<T>(url: string, type: XMLHttpRequestResponseType): Promise<T> {
  return new Promise((resolve, reject) => {
    const http = new XMLHttpRequest();
    http.open("GET", url);
    http.responseType = type;
    http.timeout = READ_MS;
    http.addEventListener("load", () => {
      // file:// reports status 0 on success
      if (http.status === 0 || (http.status >= 200 && http.status < 300)) {
        resolve(http.response as T);
      } else reject(new Error(`${url}: ${http.status}`));
    });
    http.addEventListener("error", () => reject(new Error(`${url}: unreadable`)));
    http.addEventListener("timeout", () => reject(new Error(`${url}: timed out`)));
    http.send();
  });
}

async function readJsonFile<T>(url: string): Promise<T> {
  return JSON.parse(await request<string>(url, "text")) as T;
}

/** WebGL will not take a file:// image, so a boot texture is read as bytes and handed over as a data URI. */
async function inline(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const bytes = new Uint8Array(await request<ArrayBuffer>(url, "arraybuffer"));
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  const mime = /\.jpe?g$/i.test(url) ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${btoa(binary)}`;
}

/** The boot textures, and the settings pane's icon, which the hub treats as a path unless it is a data URI. */
async function inlineImages(theme: Theme): Promise<Theme> {
  const { orb, wordmark, flare } = theme.boot;
  const buttonKeys = BUTTON_KEYS.filter((key) => theme.icons.buttons[key] !== undefined);
  const [orbUrl, markUrl, flareUrl, settingsUrl, coinUrl, cards, buttonUrls] = await Promise.all([
    inline(orb.url),
    inline(wordmark.url),
    inline(flare.url),
    inline(theme.art.settings),
    inline(theme.art.orb),
    Promise.all(theme.cards.map(inline)),
    Promise.all(buttonKeys.map((key) => inline(theme.icons.buttons[key] as string))),
  ]);
  const iconKeys = ICON_KEYS.filter((key) => theme.icons[key] !== undefined);
  const iconUrls = await Promise.all(iconKeys.map((key) => inline(theme.icons[key] as string)));
  const icons: Record<string, string> = {};
  iconKeys.forEach((key, index) => {
    icons[key] = iconUrls[index] ?? "";
  });
  const buttons: Partial<Record<ButtonKey, string>> = {};
  buttonKeys.forEach((key, index) => {
    buttons[key] = buttonUrls[index] ?? "";
  });
  return {
    ...theme,
    art: { orb: coinUrl, settings: settingsUrl },
    icons: { ...icons, buttons },
    cards,
    boot: {
      ...theme.boot,
      orb: { ...orb, url: orbUrl },
      wordmark: { ...wordmark, url: markUrl },
      flare: { ...flare, url: flareUrl },
    },
  };
}

async function build(id: string, depth: number): Promise<Theme> {
  if (id === DEFAULT_THEME.id) return DEFAULT_THEME;
  if (depth > MAX_EXTENDS) throw new Error(`theme ${id}: extends chain too deep`);
  const base = themeBase(id);
  const manifest = await readJsonFile<ThemeManifest>(joinUrl(base, "theme.json"));
  const under = await build(manifest.extends ?? DEFAULT_THEME.id, depth + 1);
  return applyManifest(under, { ...manifest, id }, base);
}

async function loadFonts(theme: Theme): Promise<void> {
  const faces = theme.fonts.map(async (font) => {
    const face = new FontFace(font.family, `url("${font.src}")`, { weight: String(font.weight) });
    document.fonts.add(await face.load());
  });
  await Promise.allSettled(faces);
}

function install(theme: Theme): void {
  setTheme(theme);
  const root = document.documentElement;
  root.style.setProperty("--theme-orb", `url("${theme.art.orb}")`);
  for (const key of BUTTON_KEYS) {
    const url = theme.icons.buttons[key];
    if (url !== undefined) root.style.setProperty(`--theme-btn-${key}`, `url("${url}")`);
  }
  for (const key of ICON_KEYS) {
    const url = theme.icons[key];
    if (url !== undefined) {
      root.style.setProperty(`--theme-${key}`, `url("${url}")`);
      root.dataset[`${key}Art`] = "";
    }
  }
  if (Object.keys(theme.icons.buttons).length > 0) root.dataset.buttonArt = "";
  for (const [name, value] of Object.entries(theme.cssVars)) root.style.setProperty(name, value);
}

/** The theme used when nothing has been picked and it is installed. */
const PREFERRED_THEME = "nxe";

/** The id to start with: the address's `?theme=`, else the stored choice, else NXE if installed, else the default. */
export function chosenThemeId(): string {
  const asked = new URLSearchParams(window.location.search).get("theme");
  if (asked !== null && asked !== "") return asked;
  const stored = readJson(THEME_KEY);
  if (typeof stored === "string" && stored !== "") return stored;
  return installed.some((info) => info.id === PREFERRED_THEME) ? PREFERRED_THEME : DEFAULT_THEME.id;
}

let selected = DEFAULT_THEME.id;

/** The theme that will start next time: the one picked in Settings, which is the active one until the app restarts. */
export function selectedTheme(): ThemeInfo {
  return installed.find((info) => info.id === selected) ?? (installed[0] as ThemeInfo);
}

/** Remember a theme for the next start. */
export function chooseTheme(id: string): void {
  if (!installed.some((info) => info.id === id)) return;
  selected = id;
  writeJson(THEME_KEY, id);
}

async function listInstalled(): Promise<void> {
  try {
    const ids = await readJsonFile<unknown>(`${HACK_PREFIX}${THEMES_DIR}/index.json`);
    if (!Array.isArray(ids)) return;
    const found = await Promise.all(
      ids
        .filter((id): id is string => typeof id === "string" && id !== DEFAULT_THEME.id)
        .map(async (id) => {
          try {
            const manifest = await readJsonFile<ThemeManifest>(
              joinUrl(themeBase(id), "theme.json"),
            );
            return { id, name: manifest.name } satisfies ThemeInfo;
          } catch {
            return null;
          }
        }),
    );
    installed = [installed[0] as ThemeInfo, ...found.filter((info) => info !== null)];
  } catch {
    // no add-on folder: only the default is installed
  }
}

/** Load the chosen theme and make it active. Resolves either way. */
export async function loadTheme(): Promise<void> {
  await listInstalled();
  const id = chosenThemeId();
  selected = id;
  let theme = DEFAULT_THEME;
  try {
    if (id !== DEFAULT_THEME.id) theme = await inlineImages(await build(id, 0));
    await loadFonts(theme);
  } catch (cause) {
    console.error(`[nxe] theme "${id}" failed, using the default`, cause);
    theme = DEFAULT_THEME;
  }
  install(theme);
}
