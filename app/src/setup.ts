import type { DialogPage } from "./pages";
import { readJson, writeJson } from "./storage";

export const SETUP_KEY = "nxe.setup";
export const SETUP_PREFIX = "setup:";
export const SETUP_ROOT = `${SETUP_PREFIX}home`;

export type SetupStep = "home" | "home-confirm" | "launch" | "theme" | "avatar" | "steam";

/** The pages in order. `home-confirm` is only reached from `home`. */
export const SETUP_STEPS: readonly SetupStep[] = ["home", "launch", "theme", "avatar", "steam"];

export interface SetupState {
  /** Whether the Home key already opens this app, or null when that cannot be read. */
  readonly homeArmed: boolean | null;
  /** Whether LG Input Hook is installed, or null when unreadable. */
  readonly inputHook?: boolean | null;
  /** Whether the init.d hook that re-arms it at boot is in place, or null when unreadable. */
  readonly bootHook: boolean | null;
  /** Whether the init.d link that opens this app after boot is in place, or null when unreadable. */
  readonly launchHook: boolean | null;
  /** Whether the NXE theme add-on is installed on this device. */
  readonly nxeInstalled: boolean;
  /** Whether the theme chosen for the next start is NXE. */
  readonly nxeChosen: boolean;
  /** Whether the NXE theme can be downloaded from here. */
  readonly nxeDownloadable: boolean;
  /** Whether a download is running, or the last one failed. */
  readonly nxeDownload: "idle" | "busy" | "failed";
  readonly steamSignedIn: boolean;
}

export type SetupAction =
  | { readonly kind: "next" }
  | { readonly kind: "confirm" }
  | { readonly kind: "arm" }
  | { readonly kind: "boot" }
  | { readonly kind: "launch" }
  | { readonly kind: "theme"; readonly id: string }
  | { readonly kind: "download-theme" }
  | { readonly kind: "avatar" }
  | { readonly kind: "steam" }
  | { readonly kind: "done" };

export function setupDone(): boolean {
  return readJson(SETUP_KEY) === true;
}

export function markSetupDone(): void {
  writeJson(SETUP_KEY, true);
}

export function isSetupPage(id: string): boolean {
  return id.startsWith(SETUP_PREFIX);
}

export function setupStepOf(id: string): SetupStep | null {
  const step = id.slice(SETUP_PREFIX.length);
  if (step === "home-confirm") return step;
  return SETUP_STEPS.find((entry) => entry === step) ?? null;
}

/** The page after this one, or null past the last step. */
export function nextSetupId(id: string): string | null {
  const current = setupStepOf(id);
  const at = SETUP_STEPS.findIndex(
    (step) => step === (current === "home-confirm" ? "home" : current),
  );
  const next = SETUP_STEPS[at + 1];
  return at < 0 || next === undefined ? null : `${SETUP_PREFIX}${next}`;
}

const SKIP = { id: "skip", label: "Not Now" };

function homeOptions(state: SetupState): DialogPage["options"] {
  if (state.homeArmed !== true) return [{ id: "confirm", label: "Set Up Home Button" }, SKIP];
  if (state.bootHook === true) return [{ id: "next", label: "Continue" }];
  return [{ id: "boot", label: "Enable at Boot" }, SKIP];
}

export function setupPage(step: SetupStep, state: SetupState): DialogPage {
  const id = `${SETUP_PREFIX}${step}`;
  switch (step) {
    case "home":
      return {
        kind: "dialog",
        id,
        title: "Home Button",
        options: homeOptions(state),
        back: state.homeArmed === true && state.bootHook === true ? "next" : "skip",
      };
    case "home-confirm":
      return {
        kind: "dialog",
        id,
        title: "Home Button",
        options: [
          { id: "arm", label: "Set Up Now" },
          { id: "skip", label: "Cancel" },
        ],
        back: "skip",
      };
    case "launch":
      return {
        kind: "dialog",
        id,
        title: "Start at Boot",
        options:
          state.launchHook === true
            ? [{ id: "next", label: "Continue" }]
            : [{ id: "launch", label: "Open at Boot" }, SKIP],
        back: state.launchHook === true ? "next" : "skip",
      };
    case "theme":
      if (state.nxeChosen) {
        return {
          kind: "dialog",
          id,
          title: "NXE Theme",
          options: [{ id: "next", label: "Continue" }],
          back: "next",
        };
      }
      if (state.nxeDownload === "busy") {
        return {
          kind: "dialog",
          id,
          title: "NXE Theme",
          options: [{ id: "wait", label: "Please Wait" }],
          back: "wait",
        };
      }
      if (!state.nxeInstalled && state.nxeDownloadable) {
        return {
          kind: "dialog",
          id,
          title: "NXE Theme",
          options: [{ id: "download", label: "Download NXE Theme" }, SKIP],
          back: "skip",
        };
      }
      return {
        kind: "dialog",
        id,
        title: "NXE Theme",
        options: state.nxeInstalled
          ? [{ id: "use", label: "Use NXE Theme" }, SKIP]
          : [{ id: "next", label: "Continue" }],
        back: state.nxeInstalled ? "skip" : "next",
      };
    case "avatar":
      return {
        kind: "dialog",
        id,
        title: "Avatar",
        options: [{ id: "customize", label: "Customize Avatar" }, SKIP],
        back: "skip",
      };
    case "steam":
      return {
        kind: "dialog",
        id,
        title: "Steam",
        options: state.steamSignedIn
          ? [{ id: "done", label: "Finish" }]
          : [
              { id: "signin", label: "Sign In with QR Code" },
              { id: "done", label: "Finish" },
            ],
        back: "done",
      };
  }
}

const INPUT_HOOK_NOTE =
  " LG Input Hook is installed, so Home is added to its key bindings instead. Open Input Hook once after each restart.";

export function setupBody(step: SetupStep, state: SetupState): string {
  const note = state.inputHook === true ? INPUT_HOOK_NOTE : "";
  switch (step) {
    case "home":
      if (state.homeArmed === true) {
        return state.bootHook === true
          ? `The Home button opens this dashboard, and is set again at every boot.${note}`
          : `The Home button opens this dashboard until the TV restarts. Enable it at boot to hook it again each time the TV starts. Remove the init.d link 62-nxe-homehook to undo.${note}`;
      }
      return `Make the Home button open this dashboard instead of the TV's home screen.${note}`;
    case "home-confirm":
      return `A small hook is loaded into the TV\u2019s input service, with no restart. Home then opens this app, and holding Home no longer does LG\u2019s own action. Restarting the TV undoes it.${note}`;
    case "launch":
      return state.launchHook === true
        ? "This dashboard opens after the TV starts."
        : "Open this dashboard after the TV starts, instead of stopping on LG's home screen. Remove the init.d link 61-nxe-launch to undo.";
    case "theme":
      if (state.nxeChosen) return "The NXE theme is chosen and is applied when setup finishes.";
      if (state.nxeDownload === "busy") return "Downloading the NXE theme. This takes a moment.";
      if (state.nxeInstalled) {
        return "The NXE theme is installed. Use it for the retail look. It is applied when setup finishes.";
      }
      if (state.nxeDownloadable) {
        return state.nxeDownload === "failed"
          ? "The download failed. Check the TV's connection and try again."
          : "Download the NXE theme for the retail look. It needs the internet and is applied when setup finishes.";
      }
      return "The NXE theme is not installed. Run tools/install-theme.sh nxe from a computer to add it.";
    case "avatar":
      return "Design your avatar on 360sona in the TV's browser and save the export to Downloads as MyAvatar.glb. It appears at the next start.";
    case "steam":
      return state.steamSignedIn
        ? "You are signed in to Steam."
        : "Sign in with the Steam mobile app to see your friends and games.";
  }
}

/** What `A` on a setup option does. Null for an option the page does not have. */
export function setupAction(pageId: string, optionId: string): SetupAction | null {
  const step = setupStepOf(pageId);
  if (step === null) return null;
  switch (optionId) {
    case "confirm":
      return step === "home" ? { kind: "confirm" } : null;
    case "arm":
      return step === "home-confirm" ? { kind: "arm" } : null;
    case "boot":
      return step === "home" ? { kind: "boot" } : null;
    case "launch":
      return step === "launch" ? { kind: "launch" } : null;
    case "next":
    case "skip":
      if (step === "home-confirm") return { kind: "next" };
      return step === "steam" ? { kind: "done" } : { kind: "next" };
    case "use":
      return step === "theme" ? { kind: "theme", id: "nxe" } : null;
    case "download":
      return step === "theme" ? { kind: "download-theme" } : null;
    case "customize":
      return step === "avatar" ? { kind: "avatar" } : null;
    case "signin":
      return step === "steam" ? { kind: "steam" } : null;
    case "done":
      return { kind: "done" };
    default:
      return null;
  }
}
