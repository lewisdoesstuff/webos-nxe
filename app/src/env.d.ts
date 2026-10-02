/// <reference types="vite/client" />

/**
 * Luna's in-page bridge, injected by WAM. Present on the TV (`file://` app
 * origin) and absent in desktop Chrome — which is exactly why the transport is
 * pluggable (`./luna.ts`).
 *
 * Measured on webOS 9.2.4: a bridge instance has exactly `call`, `cancel` and
 * `onservicecallback`. Responses arrive on `onservicecallback`, and `call` takes
 * **no** callback argument. The 3-arg form is the documented shape on other
 * builds, so it is wired up as well rather than assumed away.
 */
interface PalmServiceBridge {
  onservicecallback: ((payload: string) => void) | null;
  call(uri: string, params: string, onResponse?: (payload: string) => void): void;
  cancel(): void;
}

interface Window {
  PalmServiceBridge?: new () => PalmServiceBridge;
  /** Set on the TV only; the mock transport is selected when this is missing. */
  webOS?: unknown;
}

/** Where the NXE theme zip is downloaded from, and its SHA-256. Empty when the build has no source. */
declare const NXE_THEME_URL: string;
declare const NXE_THEME_SHA256: string;
