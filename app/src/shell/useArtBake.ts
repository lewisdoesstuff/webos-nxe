import { type Ref, ref, watch } from "vue";

import { checkArt, prepareArt, prepareFloor } from "../artCache";
import type { HubItem } from "../hubRows";
import { paneArt } from "../panel";
import { useAppsStore } from "../stores/apps";
import { nextFrame, wait } from "./frames";

/** The longest the boot waits for the channel, so a slow Luna never holds it for long. */
const BOOT_WAIT_MS = 4000;
/** How long the boot waits for the channel's art to decode; the rest finishes under the bumper. */
const DECODE_WAIT_MS = 250;
/** Past the boot's last frame and the teardown of its layer. */
const BAKE_DELAY_MS = 1500;
/** How long the hub must be left alone before the next bake, so a bake never lands inside a transition. */
const QUIET_MS = 600;

function artOf(items: readonly HubItem[]): Set<string> {
  return new Set(items.map((item) => paneArt(item)).filter((url) => url !== null));
}

interface BakeDeps {
  readonly rows: Ref<readonly (readonly HubItem[])[]>;
  /** The channel the boot hands over to. */
  readonly channel: () => number;
  /** The first app list has resolved. */
  readonly loaded: Ref<boolean>;
  readonly booting: Ref<boolean>;
}

/**
 * The art the panes draw, scaled and with its reflections baked (`artCache.ts`).
 *
 * The boot waits on black until the channel it hands over to is ready, so that
 * work and the row's first paint land before the run rather than in its
 * frames. Every other channel's art follows once the boot has finished, one a
 * frame and only while no key has been pressed for a moment, and any stored
 * art is checked against its icon.
 */
export function useArtBake({ rows, channel, loaded, booting }: BakeDeps) {
  const apps = useAppsStore();
  const bootReady = ref(false);
  let lastKeyAt = 0;
  let baking = 0;

  function readyToBoot(reason: string): void {
    if (bootReady.value) return;
    bootReady.value = true;
    console.info(`[nxe] boot starts at ${Math.round(performance.now())}ms: ${reason}`);
  }
  setTimeout(() => readyToBoot("waited the longest it may"), BOOT_WAIT_MS);

  async function prepareShown(): Promise<void> {
    const urls = [...artOf(rows.value[channel()] ?? [])];
    const shown = Promise.all([prepareFloor(), ...urls.map((url) => prepareArt(url))]);
    await Promise.race([shown, wait(DECODE_WAIT_MS)]);
    await nextFrame();
    await nextFrame();
    readyToBoot("the channel is ready");
  }

  watch(loaded, (is) => is && void prepareShown(), { immediate: true });

  async function quiet(): Promise<void> {
    while (performance.now() - lastKeyAt < QUIET_MS) await nextFrame();
  }

  async function bake(mine: number): Promise<void> {
    await prepareFloor();
    for (const work of [prepareArt, checkArt]) {
      for (const url of artOf(rows.value.flat())) {
        if (mine !== baking) return;
        await quiet();
        await work(url);
        await nextFrame();
      }
    }
  }

  watch(
    [() => apps.launchPoints, booting],
    ([, busy]) => {
      if (busy) return;
      const mine = ++baking;
      setTimeout(() => mine === baking && void bake(++baking), BAKE_DELAY_MS);
    },
    { immediate: true },
  );

  /** A key went down: the bake waits until the hub has been left alone. */
  function noteKey(): void {
    lastKeyAt = performance.now();
  }

  return { bootReady, noteKey };
}
