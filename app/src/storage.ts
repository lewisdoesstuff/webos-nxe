/**
 * `localStorage`, tolerantly.
 *
 * Two reasons this is wrapped rather than called directly: storage can throw
 * (disabled, or full) and that must never take the UI down, and a corrupt
 * document should read as "no document" so the code defaults apply instead of
 * the app failing to start.
 */

export function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Deliberately silent: the in-memory value is already correct for this
    // session, and a full or disabled store is not worth interrupting a TV for.
  }
}
