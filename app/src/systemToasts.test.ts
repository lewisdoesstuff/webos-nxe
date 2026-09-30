import { describe, expect, it } from "vitest";

import { toastFrom } from "./systemToasts";

const names = (id: string): string => (id === "netflix" ? "Netflix" : "");

describe("system toasts", () => {
  it("ignore the subscription's acknowledgement", () => {
    expect(toastFrom({ subscribed: true, returnValue: true }, names)).toBeNull();
    expect(toastFrom({ message: "   " }, names)).toBeNull();
  });

  it("title a toast with its own title, else the app's name", () => {
    expect(toastFrom({ message: "New episode", sourceId: "netflix" }, names)).toEqual({
      title: "Netflix",
      body: "New episode",
      icon: "xbox",
    });
    expect(toastFrom({ title: "Doorbell", message: "Someone is at the door" }, names)?.title).toBe(
      "Doorbell",
    );
  });

  it("fall back to a plain label for an app it does not know", () => {
    expect(toastFrom({ message: "Hello", sourceId: "com.unknown" }, names)?.title).toBe(
      "Notification",
    );
  });

  it("shorten a long message to one line", () => {
    const toast = toastFrom({ message: `${"word ".repeat(30)}end`, sourceId: "netflix" }, names);
    expect(toast?.body.length).toBeLessThanOrEqual(48);
    expect(toast?.body.endsWith("…")).toBe(true);
  });
});
