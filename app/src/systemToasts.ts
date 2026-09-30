/**
 * The TV's own toasts, turned into ours.
 *
 * The notification manager announces every toast on `getToastNotification` to
 * anything that subscribes. The first reply is only the subscription's
 * acknowledgement; each toast after it carries a `message`, sometimes a
 * `title`, and the id of the app that raised it.
 */

import type { Toast } from "./toasts";

const LONGEST = 48;

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= LONGEST ? flat : `${flat.slice(0, LONGEST - 1).trimEnd()}…`;
}

/**
 * A toast for one payload, or null for the acknowledgement and for anything
 * with nothing to say. `nameOf` turns an app id into the name it shows under.
 */
export function toastFrom(
  payload: Readonly<Record<string, unknown>>,
  nameOf: (appId: string) => string,
): Toast | null {
  const message = typeof payload["message"] === "string" ? clip(payload["message"]) : "";
  if (message === "") return null;
  const title = typeof payload["title"] === "string" ? clip(payload["title"]) : "";
  const source = typeof payload["sourceId"] === "string" ? payload["sourceId"] : "";
  return {
    title: title !== "" ? title : clip(nameOf(source) || "Notification"),
    body: message,
    icon: "xbox",
  };
}
