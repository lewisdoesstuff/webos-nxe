import { describe, expect, it } from "vitest";

import { advance, EMPTY_TOASTS, enqueue, TOAST_BACKLOG } from "./toasts";

const a = { title: "A", body: "one" };
const b = { title: "B", body: "two" };

describe("toast queue", () => {
  it("shows the first toast at once", () => {
    expect(enqueue(EMPTY_TOASTS, a).current).toEqual(a);
  });

  it("holds later toasts in order and plays them after each fade", () => {
    let queue = enqueue(enqueue(EMPTY_TOASTS, a), b);
    expect(queue.pending).toEqual([b]);
    queue = advance(queue);
    expect(queue.current).toEqual(b);
    expect(advance(queue)).toEqual(EMPTY_TOASTS);
  });

  it("drops a repeat of the toast showing or waiting", () => {
    const queue = enqueue(EMPTY_TOASTS, a);
    expect(enqueue(queue, a)).toBe(queue);
    const waiting = enqueue(queue, b);
    expect(enqueue(waiting, b)).toBe(waiting);
  });

  it("keeps only the newest backlog", () => {
    let queue = enqueue(EMPTY_TOASTS, a);
    for (let index = 0; index < TOAST_BACKLOG + 3; index++) {
      queue = enqueue(queue, { title: "n", body: String(index) });
    }
    expect(queue.pending).toHaveLength(TOAST_BACKLOG);
    expect(queue.pending[TOAST_BACKLOG - 1]?.body).toBe(String(TOAST_BACKLOG + 2));
  });
});
