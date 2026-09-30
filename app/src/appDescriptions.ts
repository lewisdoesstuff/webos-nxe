/** The second line a common app's pane carries, in the voice of the retail tiles. */
export const DEFAULT_DESCRIPTIONS: Readonly<Record<string, string>> = {
  netflix: "Instantly watch TV episodes and movies",
  "youtube.leanback.v4": "Watch and share videos from around the world",
  "spotify-beehive": "Music for every moment",
  amazon: "Watch movies and TV with Prime Video",
  "com.disney.disneyplus-prod": "Stream Disney, Pixar, Marvel and Star Wars",
  hulu: "Stream TV shows and movies",
  "cdp-30": "Your media and free movies and TV",
  "tv.twitch.tv.starshot.lg": "Watch live games and streamers",
  "com.webos.app.lgchannels": "Free live TV and on-demand",
  "com.webos.app.browser": "Browse the web on your TV",
  "com.apple.appletv": "Apple TV+ and your library",
  "com.hbo.hbomax": "Stream HBO originals and more",
  "com.webos.app.lifeonscreen": "Art, music and ambient scenes",
  "com.webos.app.homeconnect": "Control your connected devices",
  "com.webos.app.discovery": "Find and install more apps",
};

/** What an app's pane says under its name: the user's text when there is one, the shipped line otherwise. */
export function describeApp(id: string, overrides: Readonly<Record<string, string>>): string {
  const own = overrides[id];
  if (own !== undefined && own.trim() !== "") return own.trim();
  return DEFAULT_DESCRIPTIONS[id] ?? "";
}
