import type {
  PersonaState,
  QrPoll,
  SteamApi,
  SteamFriend,
  SteamGames,
  SteamStatus,
} from "../../app/src/steam/types.ts";

/** A friend's avatar as a data URI: a flat square, so the mock needs no network. */
function avatar(hue: number, letter: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="184" height="184">` +
    `<rect width="184" height="184" fill="hsl(${hue},45%,38%)"/>` +
    `<text x="92" y="126" font-size="96" font-family="sans-serif" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const ROSTER: readonly { name: string; hue: number }[] = [
  { name: "Halo Fan 42", hue: 120 },
  { name: "MasterChief117", hue: 200 },
  { name: "Cortana", hue: 260 },
  { name: "GrifBall", hue: 20 },
  { name: "Sticky Note", hue: 50 },
  { name: "Arbiter", hue: 330 },
];

/**
 * A backend that never touches Steam. The QR is scanned by itself after a few
 * polls, and the friends change state as they are fetched, so the toasts have
 * something to fire on.
 *
 * `?steamScan=` in the dev URL sets how many polls the scan takes.
 */
export function createMockBackend(scanAfter = 4): SteamApi {
  let signedIn = false;
  let polls = 0;
  let fetches = 0;
  let challenge = 0;

  function friendsNow(): SteamFriend[] {
    const tick = fetches;
    return ROSTER.map((entry, index): SteamFriend => {
      const base = {
        id: String(76561198000000000n + BigInt(index)),
        name: entry.name,
        avatar: avatar(entry.hue, entry.name.slice(0, 1)),
      };
      const cycle = (tick + index * 2) % 8;
      let state: PersonaState = "offline";
      if (index === 0) state = tick === 0 ? "offline" : "online";
      else if (cycle < 3) state = "online";
      else if (cycle === 3) state = "away";
      else if (cycle === 4) state = "busy";
      if (index === 1) return { ...base, state: "play", game: "Halo 3" };
      if (index === 3 && cycle < 5) return { ...base, state: "play", game: "Portal 2" };
      return { ...base, state };
    });
  }

  return {
    async status(): Promise<SteamStatus> {
      return signedIn
        ? {
            state: "signedIn",
            steamId: "76561198000000999",
            name: "Player1",
            avatar: avatar(90, "P"),
          }
        : { state: "signedOut" };
    },
    async beginQr(): Promise<QrPoll> {
      polls = 0;
      challenge += 1;
      return { state: "pending", url: `https://s.team/q/1/mock${challenge}` };
    },
    async pollQr(): Promise<QrPoll> {
      polls += 1;
      if (polls >= scanAfter) {
        signedIn = true;
        return { state: "signedIn" };
      }
      if (polls >= scanAfter - 1)
        return { state: "scanned", url: `https://s.team/q/1/mock${challenge}` };
      return { state: "pending", url: `https://s.team/q/1/mock${challenge}` };
    },
    async friends(): Promise<readonly SteamFriend[]> {
      if (!signedIn) throw new Error("Not signed in.");
      const out = friendsNow();
      fetches += 1;
      return out;
    },
    async games(steamId: string): Promise<SteamGames> {
      const at = Number(BigInt(steamId) - 76561198000000000n);
      if (at === 2) return { games: [], hidden: true };
      if (at === 4) return { games: [], hidden: false };
      const titles = [
        "Halo 3",
        "Portal 2",
        "Half-Life 2",
        "Left 4 Dead 2",
        "Team Fortress 2",
        "Braid",
      ];
      return {
        games: titles.map((name, index) => ({
          id: String(index + 1),
          name,
          icon: avatar((index * 55) % 360, name.slice(0, 1)),
          minutes: 6000 - index * 900 + at * 13,
        })),
        hidden: false,
      };
    },

    async signOut(): Promise<void> {
      signedIn = false;
      fetches = 0;
    },
  };
}
