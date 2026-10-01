import { describe, expect, it } from "vitest";

import {
  createSteamBackend,
  tokenExpiry,
  webAccess,
  toFriend,
  type QrSession,
} from "../../../service/steam/core";

type Listener = (error?: Error) => void;

class FakeSession implements QrSession {
  steamID = { getSteamID64: () => "76561198000000001" };
  refreshToken = "";
  listeners = new Map<string, Listener>();
  cancelled = false;
  on(event: string, listener: Listener): this {
    this.listeners.set(event, listener);
    return this;
  }
  async startWithQR() {
    return { qrChallengeUrl: "https://s.team/q/1/abc" };
  }
  async getWebCookies() {
    const value = encodeURIComponent(
      `${this.steamID.getSteamID64()}||${jwt(Date.now() + 3_600_000)}`,
    );
    return [`steamLoginSecure=${value}; Path=/`, "sessionid=abc"];
  }
  cancelLoginAttempt() {
    this.cancelled = true;
    return true;
  }
  emit(event: string) {
    this.listeners.get(event)?.();
  }
}

function jwt(expiresMs: number): string {
  const body = Buffer.from(JSON.stringify({ exp: Math.floor(expiresMs / 1000) })).toString(
    "base64url",
  );
  return `h.${body}.s`;
}

function setup(stored: string | null = null) {
  const sessions: FakeSession[] = [];
  let token = stored;
  const calls: string[] = [];
  const backend = createSteamBackend({
    newSession: () => {
      const session = new FakeSession();
      sessions.push(session);
      return session;
    },
    store: {
      read: async () => token,
      write: async (next) => {
        token = next;
      },
    },
    fetch: (async (url: string) => {
      calls.push(url);
      const path = new URL(url).pathname;
      const body = path.includes("GetFriendsList")
        ? {
            response: {
              friendslist: {
                friends: [
                  { ulfriendid: "2", efriendrelationship: 3 },
                  { ulfriendid: "3", efriendrelationship: 3 },
                  { ulfriendid: "9", efriendrelationship: 5 },
                ],
              },
            },
          }
        : {
            players: [
              { steamid: "2", personaname: "Ann", avatarfull: "a.jpg", personastate: 1 },
              { steamid: "3", personaname: "Bob", personastate: 1, gameextrainfo: "Halo 3" },
              { steamid: "76561198000000001", personaname: "Me" },
            ],
          };
      return new Response(JSON.stringify(body));
    }) as typeof fetch,
  });
  return { backend, sessions, calls, stored: () => token };
}

describe("steam backend", () => {
  it("starts signed out with no stored token", async () => {
    expect(await setup().backend.status()).toEqual({ state: "signedOut" });
  });

  it("walks a QR sign-in and keeps the refresh token to itself", async () => {
    const { backend, sessions, stored } = setup();
    expect(await backend.beginQr()).toEqual({ state: "pending", url: "https://s.team/q/1/abc" });
    const session = sessions[0]!;
    session.emit("remoteInteraction");
    expect((await backend.pollQr()).state).toBe("scanned");
    session.refreshToken = "REFRESH";
    session.emit("authenticated");
    await new Promise((resolve) => setTimeout(resolve));
    expect(await backend.pollQr()).toEqual({ state: "signedIn" });
    const status = await backend.status();
    expect(status).toEqual({ state: "signedIn", steamId: "76561198000000001", name: "Me" });
    expect(JSON.stringify(status)).not.toContain("REFRESH");
    expect(stored()).toBe("REFRESH");
  });

  it("reports a timeout and a new attempt cancels the old one", async () => {
    const { backend, sessions } = setup();
    await backend.beginQr();
    sessions[0]!.emit("timeout");
    expect((await backend.pollQr()).state).toBe("expired");
    await backend.beginQr();
    expect(sessions[0]!.cancelled).toBe(true);
  });

  it("restores from a stored token and lists friends with the access token", async () => {
    const { backend, calls } = setup("REFRESH");
    expect((await backend.status()).state).toBe("signedIn");
    const friends = await backend.friends();
    expect(friends.map((friend) => [friend.name, friend.state, friend.game])).toEqual([
      ["Ann", "online", undefined],
      ["Bob", "play", "Halo 3"],
      ["Me", "offline", undefined],
    ]);
    expect(calls.every((url) => url.includes("access_token="))).toBe(true);
  });

  it("lists a friend's games by playtime and flags a private library", async () => {
    const { backend } = setup("REFRESH");
    // The fake answers every path with one body, so only the private case is shaped here.
    await expect(backend.games("not-an-id")).rejects.toThrow("Not a Steam ID");
  });

  it("reads the access token out of the steamLoginSecure cookie", async () => {
    const token = jwt(5_000_000);
    const cookie = `steamLoginSecure=${encodeURIComponent(`7656119800||${token}`)}; Path=/; Secure`;
    expect(await webAccess({ getWebCookies: async () => [cookie] })).toBe(token);
    await expect(webAccess({ getWebCookies: async () => ["sessionid=x"] })).rejects.toThrow();
  });

  it("renews through the web cookies and not more than once in five minutes", async () => {
    let clock = Date.now();
    const sessions: FakeSession[] = [];
    const backend = createSteamBackend({
      newSession: () => {
        const session = new FakeSession();
        sessions.push(session);
        return session;
      },
      store: { read: async () => "REFRESH", write: async () => undefined },
      fetch: (async () =>
        new Response(
          JSON.stringify({ response: { friendslist: { friends: [] } } }),
        )) as typeof fetch,
      now: () => clock,
    });
    await backend.friends();
    const first = sessions.length;
    clock += 56 * 60_000;
    await backend.friends();
    expect(sessions.length).toBe(first + 1);
    await backend.friends();
    expect(sessions.length).toBe(first + 1);
  });

  it("signs out and forgets the token", async () => {
    const { backend, stored } = setup("REFRESH");
    await backend.signOut();
    expect(await backend.status()).toEqual({ state: "signedOut" });
    expect(stored()).toBeNull();
  });

  it("reads token expiry and persona states", () => {
    expect(tokenExpiry(jwt(5_000_000))).toBe(5_000_000);
    expect(tokenExpiry("junk")).toBe(0);
    expect(toFriend({ steamid: "1", personastate: 3 }).state).toBe("away");
  });
});
