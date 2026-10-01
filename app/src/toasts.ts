/**
 * The toast queue, pure. One toast shows at a time; the rest wait their turn.
 *
 * `App.vue` owns the timers: it shows `current`, hides it after `TOAST_MS`,
 * and calls `advance` once the fade has finished.
 */

/** The disc's picture: the Xbox ball alone, or the ball turning to a trophy, a friends icon or a console. */
export type ToastIcon = "xbox" | "achievement" | "friend" | "signin";

export interface Toast {
  readonly title: string;
  readonly body: string;
  readonly icon?: ToastIcon;
}

export interface ToastQueue {
  readonly current: Toast | null;
  readonly pending: readonly Toast[];
}

export const EMPTY_TOASTS: ToastQueue = { current: null, pending: [] };

/** How long a toast stays up, and how long its fade takes. */
export const TOAST_MS = 4200;
export const TOAST_FADE_MS = 400;

/** More waiting than this and the oldest are dropped, so a burst never plays for a minute. */
export const TOAST_BACKLOG = 4;

function same(a: Toast | null | undefined, b: Toast): boolean {
  return (
    a !== null && a !== undefined && a.title === b.title && a.body === b.body && a.icon === b.icon
  );
}

/** Adds a toast. One identical to the last one waiting, or the one showing, is dropped. */
export function enqueue(queue: ToastQueue, toast: Toast): ToastQueue {
  const last = queue.pending[queue.pending.length - 1] ?? queue.current;
  if (same(last, toast)) return queue;
  if (queue.current === null) return { current: toast, pending: queue.pending };
  const pending = [...queue.pending, toast].slice(-TOAST_BACKLOG);
  return { current: queue.current, pending };
}

/** The showing toast has faded: the next one, or none. */
export function advance(queue: ToastQueue): ToastQueue {
  const [next, ...rest] = queue.pending;
  return { current: next ?? null, pending: rest };
}
