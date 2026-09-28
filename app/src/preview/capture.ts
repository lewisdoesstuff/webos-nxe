import { callLuna, type LunaParams, type LunaPayload } from "../luna";
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, previewPath, type PreviewSlot } from "./inputs";

/** The shape of `callLuna`, so a test can hand in a caller of its own. */
export type LunaCaller = <T extends object = LunaPayload>(
  uri: string,
  params?: LunaParams,
) => Promise<T>;

/**
 * Photographing an input, which on this TV means photographing the panel.
 *
 * `executeOneShot` grabs the composited output, not a video plane, which is why
 * `method: "screen"` is the only value that works. Measured on 9.2.4 with
 * `com.webos.app.hdmi3` in the foreground:
 *
 *   screen    480x270 jpeg, a real picture of the source
 *   video     REFUSED_NO_SIGNAL, always, even with the input app running
 *   blended   ERROR_INTERNAL while an input is up
 *   source    ERROR_INTERNAL
 *   graphic   byte-identical to screen
 *   display   byte-identical to screen
 *
 * An HDMI input is a full-screen app, so there is no VT plane for `video` to
 * read. `screen` reads what the panel is actually showing, which is the only
 * place the picture exists.
 *
 * The catch is that the input is up precisely while the launcher is not, and a
 * backgrounded `file://` app on this firmware does not run timers. Measured:
 * zero `setTimeout`, zero `requestAnimationFrame` and zero worker timers fired
 * in 40 s behind an input, while 2000 Luna request/reply round trips completed
 * in 4.8 s. So the wait is a chain of round trips, not a timer.
 */

const CAPTURE_URI = "luna://com.webos.service.capture/executeOneShot";
const FOREGROUND_URI = "luna://com.webos.applicationManager/getForegroundAppInfo";

/**
 * How long to let an input settle between attempts.
 *
 * Measured by sweeping the delay and reading what came back. The input app
 * paints an info card of its own inside half a second and the source syncs
 * after that, and the gap is very much not fixed. Switching input to input, one
 * source was up at 2.5 s. Switching *from the launcher*, which tears the video
 * pipeline down and rebuilds it, the same television took 15 to 25 s. 6 s
 * catches the quick case on the first attempt and leaves the rest to the later
 * ones.
 */
export const SETTLE_MS = 6000;

/**
 * A ceiling on the round trips one settle may spend, in case they come back far
 * faster than the 2.4 ms they measured at. At that rate 6 s is about 2500 calls.
 */
export const SETTLE_MAX_CALLS = 6000;

/**
 * How many times to photograph before giving up on this visit.
 *
 * Each attempt is one settle, one shot and one judgement, and it stops at the
 * first frame that is a picture, so a source that syncs quickly costs a single
 * attempt and about 2500 round trips. The last shot lands at 30 s, which covers
 * the slowest source measured here. Past that the row draws its glyph, which is
 * where it would have been anyway, and the next visit tries again.
 */
export const ATTEMPTS = 5;

/**
 * How big a captured file has to be to be a picture of something.
 *
 * A capture that succeeds is not a capture that worked. The service answers
 * `returnValue: true` for the input app's own info card, which is a black frame
 * with a small grey label on it, and that is a valid JPEG that would sit on a row
 * looking broken. Everything here is judged on the byte count the service
 * reports, because that is the only measurement available at the moment it
 * matters: decoding the file into a canvas needs the page to be decoding images,
 * and a hidden `file://` app on this firmware stops doing that within seconds of
 * going to the background, so a pixel check made right after a capture never
 * completes.
 *
 * Measured jpeg sizes at 480x270 on this TV, and they do not overlap:
 *
 *   input info card      2667, 3849, 3884, 4247 bytes
 *   a picture of a source 22968 up to 291622 bytes
 *
 * 12000 sits in the gap with room on both sides. Size is a crude proxy for
 * detail rather than for brightness, so a real but very flat frame can fall
 * under it. That is the safe direction to be wrong in: the row keeps the glyph.
 */
export const MIN_FRAME_BYTES = 12_000;

export type CaptureReason =
  | "disabled"
  | "not-foreground"
  | "no-bytes"
  | "blank"
  | "denied"
  | "failed";

export type CaptureOutcome =
  | { ok: true; bytes: number; at: number }
  | { ok: false; reason: CaptureReason };

export interface CaptureOptions {
  call?: LunaCaller;
  settleMs?: number;
  maxCalls?: number;
  attempts?: number;
  now?: () => number;
}

/**
 * Take a still of `appId` into `slot`, and report the byte count and the time
 * only if the frame turned out to be a picture of something.
 *
 * Never rejects. A capture is a cache fill, so every failure is a reason rather
 * than an exception, and the caller's only correct response to any of them is to
 * leave the previous still alone.
 *
 * One caveat worth stating: a refused round trip ends a settle, but one that is
 * never answered leaves this promise pending for good, because the single timer
 * that could have noticed is a timer this page cannot run. Nothing waits on it,
 * so the cost of that is a capture that never happens.
 */
export async function captureStill(
  appId: string,
  slot: PreviewSlot,
  options: CaptureOptions = {},
): Promise<CaptureOutcome> {
  const call = options.call ?? callLuna;
  const now = options.now ?? Date.now;
  const attempts = options.attempts ?? ATTEMPTS;
  const settleMs = options.settleMs ?? SETTLE_MS;
  const maxCalls = options.maxCalls ?? SETTLE_MAX_CALLS;

  let reason: CaptureReason = "blank";

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const foreground = await settle(call, settleMs, maxCalls);
    // The launcher being back on the panel means the photograph would be of
    // Blades, and there is nothing to wait for.
    if (foreground !== appId) return { ok: false, reason: "not-foreground" };

    const at = now();
    let bytes: number;
    try {
      bytes = await shoot(call, appId, slot);
    } catch (cause) {
      const code = typeof cause === "object" && cause !== null ? String(cause) : "";
      return { ok: false, reason: /denied|permission/i.test(code) ? "denied" : "failed" };
    }

    // A capture that fails can still leave a file behind: asking for `rgba` writes
    // a zero byte file and answers ERROR_INTERNAL. Trusting what arrived rather
    // than the write we asked for is what keeps a broken image off the row.
    if (bytes < MIN_FRAME_BYTES) {
      reason = bytes > 0 ? "blank" : "no-bytes";
      continue;
    }

    return { ok: true, bytes, at };
  }

  return { ok: false, reason };
}

async function shoot(call: LunaCaller, appId: string, slot: PreviewSlot): Promise<number> {
  const payload = await call(CAPTURE_URI, {
    path: previewPath(appId, slot),
    method: "screen",
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    format: "jpeg",
  });
  const bytes = Number(payload["writtenBytes"]);
  return Number.isFinite(bytes) ? bytes : 0;
}

/**
 * Spend the settle, watching which app is in the foreground on the way through.
 *
 * The budget is elapsed time rather than a round count, because a round trip is
 * not a fixed cost: they measured 2.4 ms idle and over 6 ms while an input was
 * still coming up, so a fixed count would make the settle anything from 2.5 s to
 * 15 s. `Date.now()` is a clock read inside a reply rather than a timer, which
 * is one of the few things this page can still do while it is off the screen.
 *
 * Resolves with the last foreground app id seen, or undefined if the service
 * stopped answering.
 */
function settle(call: LunaCaller, ms: number, maxCalls: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    const start = Date.now();
    let last: string | undefined;
    let calls = 0;

    const step = (): void => {
      // One call is always spent, because its answer is what says whether the
      // input is even up. An input that never arrives costs nothing beyond it.
      if (calls > 0 && (Date.now() - start >= ms || calls >= maxCalls)) {
        resolve(last);
        return;
      }
      calls += 1;
      call(FOREGROUND_URI, {}).then(
        (payload) => {
          last = foregroundOf(payload);
          step();
        },
        () => resolve(last),
      );
    };

    step();
  });
}

function foregroundOf(payload: LunaPayload): string | undefined {
  const appId = payload["appId"];
  return typeof appId === "string" && appId !== "" ? appId : undefined;
}
