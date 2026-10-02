import type { DialogPage } from "./pages";
import { readJson, writeJson } from "./storage";

export const SETUP_KEY = "nxe.setup";
export const SETUP_PREFIX = "setup:";
export const SETUP_ROOT = `${SETUP_PREFIX}home`;

export type SetupStep = "home" | "theme" | "avatar" | "steam";

export const SETUP_STEPS: readonly SetupStep[] = ["home", "theme", "avatar", "steam"];

export interface SetupState {
  /** Whether the NXE theme add-on is installed on this device. */
  readonly nxeInstalled: boolean;
  /** Whether the theme chosen for the next start is NXE. */
  readonly nxeChosen: boolean;
  readonly steamSignedIn: boolean;
}

export type SetupAction =
  | { readonly kind: "next" }
  | { readonly kind: "theme"; readonly id: string }
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
  return SETUP_STEPS.find((entry) => entry === step) ?? null;
}

/** The page after this one, or null past the last step. */
export function nextSetupId(id: string): string | null {
  const at = SETUP_STEPS.findIndex((step) => step === setupStepOf(id));
  const next = SETUP_STEPS[at + 1];
  return at < 0 || next === undefined ? null : `${SETUP_PREFIX}${next}`;
}

const SKIP = { id: "skip", label: "Not Now" };

export function setupPage(step: SetupStep, state: SetupState): DialogPage {
  const id = `${SETUP_PREFIX}${step}`;
  switch (step) {
    case "home":
      return {
        kind: "dialog",
        id,
        title: "Home Button",
        options: [{ id: "next", label: "Continue" }],
        back: "next",
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

export function setupBody(step: SetupStep, state: SetupState): string {
  switch (step) {
    case "home":
      return "To make the Home button open this dashboard, run tools/homectl.sh arm from a computer. The screen goes dark for about 90 seconds, and restarting the TV undoes it.";
    case "theme":
      if (state.nxeChosen) return "The NXE theme is chosen and takes effect at the next start.";
      return state.nxeInstalled
        ? "The NXE theme is installed. Use it for the retail look. It takes effect at the next start."
        : "The NXE theme is not installed. Run tools/install-theme.sh nxe from a computer to add it.";
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
    case "next":
    case "skip":
      return step === "steam" ? { kind: "done" } : { kind: "next" };
    case "use":
      return step === "theme" ? { kind: "theme", id: "nxe" } : null;
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
