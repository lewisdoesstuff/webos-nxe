import { afterEach, describe, expect, it, vi } from "vitest";

import { pickSteam } from "./client";

function calls(search: string): RequestInit | undefined {
  window.history.replaceState(null, "", `/${search}`);
  const fetcher = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetcher);
  void pickSteam().status();
  return (fetcher.mock.calls[0] as unknown as [string, RequestInit | undefined])[1];
}

describe("pickSteam on a desktop page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("asks the dev server for its mock unless the page says live", () => {
    expect(calls("")?.headers).toEqual({ "x-steam-mock": "1" });
    expect(calls("?steam=mock")?.headers).toEqual({ "x-steam-mock": "1" });
    expect(calls("?steam=live")?.headers).toBeUndefined();
  });
});
