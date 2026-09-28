/**
 * Shapes we consume from Luna. Fields are optional because a payload's exact
 * shape varies by webOS version — probe what is there rather than assuming
 * (PLAN §3.1, §14).
 */

/** An entry as `listLaunchPoints` reports it. */
export interface LaunchPoint {
  id: string;
  title: string;
  icon?: string;
  largeIcon?: string;
  iconColor?: string;
  appType?: string;
  folderPath?: string;
  visible?: boolean;
}

/** The subset of `listLaunchPoints` we depend on. */
export interface ListLaunchPointsResult {
  launchPoints?: LaunchPoint[];
}

/**
 * The subset of `listApps` we use.
 *
 * `listApps` carries richer per-app data than `listLaunchPoints` — notably the
 * icon paths and `iconColor` (PLAN §8c) — but it also returns system apps the
 * stock home keeps out of the way, so it is used to *enrich* rather than to
 * decide what is shown.
 */
export interface ListAppsResult {
  apps?: LaunchPoint[];
}

/** A Luna failure payload; Luna reports errors in-band, not by throwing. */
export interface LunaFailure {
  errorCode?: string | number;
  errorText?: string;
  returnValue?: boolean;
}
