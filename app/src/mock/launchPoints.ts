import type { LaunchPoint } from "../types";

/**
 * The TV's own launch points, as `listLaunchPoints` reported them on
 * 2026-09-29, trimmed to the fields the hub reads. The icon paths are real, and
 * `mock-tv/` mirrors those files so the dev server serves them at the same
 * `hack` paths the TV does.
 */
export const sampleLaunchPoints: LaunchPoint[] = [
  {
    id: "com.webos.app.discovery",
    title: "Apps",
    icon: "/mnt/otncabi/usr/palm/applications/com.webos.app.discovery/asset/hd1080/lgstore.png",
    largeIcon:
      "/mnt/otncabi/usr/palm/applications/com.webos.app.discovery/asset/hd1080/lgstore_130x130.png",
    iconColor: "#4faa6e",
    visible: true,
  },
  {
    id: "youtube.leanback.v4",
    title: "YouTube AdFree",
    icon: "/media/developer/apps/usr/palm/applications/youtube.leanback.v4/icon.png",
    largeIcon: "/media/developer/apps/usr/palm/applications/youtube.leanback.v4/largeIcon.png",
    iconColor: "#FFFFFF",
    visible: true,
  },
  {
    id: "cdp-30",
    title: "Plex",
    icon: "/media/cryptofs/apps/usr/palm/applications/cdp-30/Plex_80x80.png",
    largeIcon: "/media/cryptofs/apps/usr/palm/applications/cdp-30/Plex_130x130.png",
    extraLargeIcon:
      "/media/cryptofs/apps/usr/palm/applications/cdp-30/59519089675923734_38196222_192x192_webos.png",
    iconColor: "#000000",
    visible: true,
  },
  {
    id: "tv.twitch.tv.starshot.lg",
    title: "Twitch",
    icon: "/media/cryptofs/apps/usr/palm/applications/tv.twitch.tv.starshot.lg/TWITCH_APP_ICON.png",
    largeIcon:
      "/media/cryptofs/apps/usr/palm/applications/tv.twitch.tv.starshot.lg/TWITCH_APP_ICON.png",
    extraLargeIcon:
      "/media/cryptofs/apps/usr/palm/applications/tv.twitch.tv.starshot.lg/88729987682314794_37494902_192x192_webos.png",
    iconColor: "#9146ff",
    visible: true,
  },
  {
    id: "com.collegehumor.chdropout",
    title: "Dropout",
    icon: "/media/cryptofs/apps/usr/palm/applications/com.collegehumor.chdropout/icon.png",
    largeIcon:
      "/media/cryptofs/apps/usr/palm/applications/com.collegehumor.chdropout/largeIcon.png",
    extraLargeIcon:
      "/media/cryptofs/apps/usr/palm/applications/com.collegehumor.chdropout/68793134134796495_38294255_192x192_webos.png",
    iconColor: "#222222",
    visible: true,
  },
  {
    id: "spotify-beehive",
    title: "Spotify - Music and Podcasts",
    icon: "/media/cryptofs/apps/usr/palm/applications/spotify-beehive/icon.png",
    largeIcon: "/media/cryptofs/apps/usr/palm/applications/spotify-beehive/largeIcon.png",
    extraLargeIcon:
      "/media/cryptofs/apps/usr/palm/applications/spotify-beehive/93762770087526135_37810389_192x192_webos.png",
    iconColor: "#191414",
    visible: true,
  },
  {
    id: "com.limelight.webos",
    title: "Moonlight",
    icon: "/media/developer/apps/usr/palm/applications/com.limelight.webos/icon.png",
    largeIcon: "/media/developer/apps/usr/palm/applications/com.limelight.webos/icon_large.png",
    iconColor: "#ffffff",
    visible: true,
  },
  {
    id: "org.webosbrew.hbchannel",
    title: "Homebrew Channel",
    icon: "/media/developer/apps/usr/palm/applications/org.webosbrew.hbchannel/assets/icon80.png",
    largeIcon:
      "/media/developer/apps/usr/palm/applications/org.webosbrew.hbchannel/assets/icon130.png",
    iconColor: "#cf0652",
    visible: true,
  },
  {
    id: "com.webos.app.lgchannels",
    title: "LG Channels",
    icon: "/media/system/apps/usr/palm/applications/com.webos.app.lgchannels/icon.png",
    largeIcon: "/media/system/apps/usr/palm/applications/com.webos.app.lgchannels/icon_130x130.png",
    iconColor: "#FD312E",
    visible: true,
  },
  {
    id: "com.webos.app.sportsteamsettings",
    title: "Sports",
    icon: "/usr/palm/applications/com.webos.app.sportsteamsettings/sys-assets/ic_app_sportalarm_2k.png",
    largeIcon:
      "/usr/palm/applications/com.webos.app.sportsteamsettings/sys-assets/ic_app_sportalarm_2k.png",
    extraLargeIcon:
      "/usr/palm/applications/com.webos.app.sportsteamsettings/sys-assets/ic_app_sportalarm_4k.png",
    iconColor: "#8BAA35",
    visible: true,
  },
  {
    id: "com.webos.app.homeconnect",
    title: "Home Hub",
    icon: "/usr/palm/applications/com.webos.app.homeconnect/icon.png",
    largeIcon: "/usr/palm/applications/com.webos.app.homeconnect/icon.png",
    extraLargeIcon: "/usr/palm/applications/com.webos.app.homeconnect/icon_large.png",
    iconColor: "#5e7bce",
    visible: true,
  },
  {
    id: "com.webos.app.lifeonscreen",
    title: "Always Ready",
    icon: "/usr/palm/applications/com.webos.app.lifeonscreen/icon.png",
    largeIcon: "/usr/palm/applications/com.webos.app.lifeonscreen/icon-large.png",
    extraLargeIcon: "/usr/palm/applications/com.webos.app.lifeonscreen/icon-large.png",
    iconColor: "#4980A6",
    visible: true,
  },
  {
    id: "com.webos.app.browser",
    title: "Web Browser",
    icon: "/media/system/apps/usr/palm/applications/com.webos.app.browser/assets/hd1080/webbrowser_icon.png",
    largeIcon:
      "/media/system/apps/usr/palm/applications/com.webos.app.browser/assets/hd1080/webbrowser_large_icon.png",
    extraLargeIcon:
      "/media/system/apps/usr/palm/applications/com.webos.app.browser/assets/hd1080/webbrowser_extra_large_icon.png",
    iconColor: "#5C75B8",
    visible: true,
  },
  {
    id: "com.webos.app.mediadiscovery",
    title: "Media Player",
    icon: "/usr/palm/applications/com.webos.app.mediadiscovery/icon.png",
    largeIcon: "/usr/palm/applications/com.webos.app.mediadiscovery/icon.png",
    extraLargeIcon: "/usr/palm/applications/com.webos.app.mediadiscovery/icon_mediadiscovery.png",
    iconColor: "#7e56b1",
    visible: true,
  },
  {
    id: "amazon.alexa.view",
    title: "Amazon Alexa",
    icon: "/usr/palm/applications/amazon.alexa.view/icon.png",
    largeIcon: "/usr/palm/applications/amazon.alexa.view/largeIcon.png",
    iconColor: "#ffffff",
    visible: true,
  },
  {
    id: "com.webos.app.camera",
    title: "Camera",
    icon: "/usr/palm/applications/com.webos.app.camera/camera.png",
    largeIcon: "/usr/palm/applications/com.webos.app.camera/camera.png",
    iconColor: "#7e56b1",
    visible: true,
  },
  {
    id: "com.pirate.refresh",
    title: "Auto Token Refresh",
    icon: "/media/developer/apps/usr/palm/applications/com.pirate.refresh/icon.png",
    largeIcon: "/media/developer/apps/usr/palm/applications/com.pirate.refresh/largeIcon.png",
    visible: true,
  },
  {
    id: "org.webosbrew.custom-screensaver",
    title: "Custom Screensaver",
    icon: "/media/developer/apps/usr/palm/applications/org.webosbrew.custom-screensaver/assets/icon80.png",
    largeIcon:
      "/media/developer/apps/usr/palm/applications/org.webosbrew.custom-screensaver/assets/icon130.png",
    iconColor: "#ffffff",
    visible: true,
  },
  {
    id: "ooo.lew.lifesgoodwithoutspying",
    title: "Life's Good Without Spying",
    icon: "/media/developer/apps/usr/palm/applications/ooo.lew.lifesgoodwithoutspying/icon.png",
    largeIcon:
      "/media/developer/apps/usr/palm/applications/ooo.lew.lifesgoodwithoutspying/largeIcon.png",
    visible: true,
  },
  {
    id: "webos.day",
    title: "LG Streaming Week",
    icon: "/media/cryptofs/apps/usr/palm/applications/webos.day/123222645423676526_38452546_80x80_webos.png",
    largeIcon:
      "/media/cryptofs/apps/usr/palm/applications/webos.day/123222645401061869_38452546_130x130_webos.png",
    extraLargeIcon:
      "/media/cryptofs/apps/usr/palm/applications/webos.day/123222645470322962_38452546_192x192_webos.png",
    iconColor: "#fd322e",
    visible: true,
  },
  {
    id: "netflix",
    title: "Netflix",
    icon: "/media/cryptofs/apps/usr/palm/applications/netflix/SMALL_APP_ICON.png",
    largeIcon: "/media/cryptofs/apps/usr/palm/applications/netflix/LARGE_APP_ICON.png",
    extraLargeIcon:
      "/media/cryptofs/apps/usr/palm/applications/netflix/122784482674557419_21790820472215287large_app_icon_192x192.png",
    iconColor: "#ffffff",
    visible: true,
  },
  {
    id: "ooo.lew.lemmonlauncher",
    title: "LemmonLauncher",
    icon: "/media/developer/apps/usr/palm/applications/ooo.lew.lemmonlauncher/icons/icon-80.png",
    largeIcon:
      "/media/developer/apps/usr/palm/applications/ooo.lew.lemmonlauncher/icons/icon-256.png",
    iconColor: "#f9e2af",
    visible: true,
  },
  {
    id: "ooo.lew.blades",
    title: "Blades",
    icon: "/media/developer/apps/usr/palm/applications/ooo.lew.blades/icons/icon-80.png",
    largeIcon: "/media/developer/apps/usr/palm/applications/ooo.lew.blades/icons/icon-256.png",
    iconColor: "#9bd32b",
    visible: true,
  },
  {
    id: "org.local.openxmb.c5",
    title: "Home",
    icon: "/media/developer/apps/usr/palm/applications/org.local.openxmb.c5/icon.png",
    largeIcon: "/media/developer/apps/usr/palm/applications/org.local.openxmb.c5/largeIcon.png",
    iconColor: "#10182b",
    visible: true,
  },
  {
    id: "ooo.lew.xne",
    title: "XNE",
    icon: "/media/developer/apps/usr/palm/applications/ooo.lew.xne/icons/icon-80.png",
    largeIcon: "/media/developer/apps/usr/palm/applications/ooo.lew.xne/icons/icon-256.png",
    iconColor: "#0f0f0f",
    visible: true,
  },
];
