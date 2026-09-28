import type { LaunchPoint } from "../types";

/**
 * Stand-ins for the TV's launch points, shaped like `listLaunchPoints`
 * (PLAN §8c). Deliberately include a `folderPath` and vendor-ish ids so the UI
 * is exercised against realistic data, and no `icon` on some entries so the
 * "no icon" fallback path is visible in dev.
 */
export const sampleLaunchPoints: LaunchPoint[] = [
  {
    id: "com.webos.app.livetv",
    title: "Live TV",
    appType: "system",
    folderPath: "/usr/palm/applications/com.webos.app.livetv",
    visible: true,
  },
  {
    id: "com.webos.app.hdmi1",
    title: "HDMI 1",
    appType: "system",
    visible: true,
  },
  {
    id: "com.webos.app.browser",
    title: "Web Browser",
    appType: "system",
    folderPath: "/usr/palm/applications/com.webos.app.browser",
    visible: true,
  },
  {
    id: "netflix",
    title: "Netflix",
    iconColor: "#e50914",
    visible: true,
  },
  {
    id: "youtube.leanback.v4",
    title: "YouTube",
    iconColor: "#ff0000",
    visible: true,
  },
  {
    id: "com.webos.app.settings",
    title: "Settings",
    appType: "system",
    iconColor: "#89b4fa",
    visible: true,
  },
  {
    id: "org.webosbrew.hbchannel",
    title: "Homebrew Channel",
    iconColor: "#a6e3a1",
    visible: true,
  },
  {
    id: "com.webos.app.music",
    title: "Music",
    visible: true,
  },
];
