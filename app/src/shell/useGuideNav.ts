import { computed, type Ref, ref } from "vue";

import { stepFocus } from "../focus/row";
import { BLADE_COUNT, BLADE_IDS } from "../guide";
import { type HubItem, pageItems } from "../hubRows";
import { type Button, horizontal, vertical } from "../keys";
import { CHANNEL_ORDER, type SectionId } from "../sections";
import { playBladeSound, playSound } from "../sound";

/**
 * The Guide's blades, mapped onto this TV: Settings is the System channel,
 * Games and Media are those channels, Marketplace is LG's store, and the
 * gamertag blade, the scene data's `home`, is the Apps channel. It opens on
 * the gamertag blade. `choose` takes the item A picks.
 */
export function useGuideNav(
  rows: Ref<readonly (readonly HubItem[])[]>,
  choose: (item: HubItem) => void,
) {
  const home = BLADE_IDS.indexOf("player1");
  const blade = ref(home);
  const item = ref(0);

  /** Back to the gamertag blade, for the next time the Guide opens. */
  function reset() {
    blade.value = home;
    item.value = 0;
  }

  function channelItems(id: SectionId): HubItem[] {
    return pageItems(rows.value[CHANNEL_ORDER.indexOf(id)] ?? []);
  }

  const bladeRows = computed(() => {
    switch (BLADE_IDS[blade.value]) {
      case "settings":
        return channelItems("system");
      case "games":
        return channelItems("games");
      case "media":
        return channelItems("media");
      case "marketplace":
        return channelItems("apps").filter((row) => row.id === "com.webos.app.discovery");
      default:
        return channelItems("apps");
    }
  });

  const items = computed(() => bladeRows.value.map((row) => row.title));

  /** A button while the Guide is open. Whether it was one the Guide reads. */
  function onButton(button: Button | null): boolean {
    const across = horizontal(button);
    if (across !== null) {
      // The blades stop at either end rather than wrap: the stacks are the ring laid flat.
      const next = Math.min(Math.max(blade.value + across, 0), BLADE_COUNT - 1);
      if (next === blade.value) return true;
      blade.value = next;
      item.value = 0;
      playBladeSound();
      return true;
    }
    const down = vertical(button);
    if (down !== null) {
      item.value = stepFocus(item.value, down, bladeRows.value.length);
      playSound("hudFocus");
      return true;
    }
    if (button === "a") {
      const row = bladeRows.value[item.value];
      if (row) choose(row);
      return true;
    }
    return false;
  }

  return { blade, item, items, onButton, reset };
}
