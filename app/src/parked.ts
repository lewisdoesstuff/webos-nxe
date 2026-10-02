import { onUnmounted, ref, watch, type Ref } from "vue";

/**
 * Where a closed layer waits. A layer at rest opacity is still drawn every
 * frame, and a closed page, settings screen and toast at rest opacity cost the
 * TV four of its five render passes a frame. Off the frame the compositor culls
 * them yet keeps their textures, so opening still allocates nothing. Far enough
 * that a page pane parked left of its row is off the frame too.
 * A 2D translate, because a 3D one would promote the container itself.
 */
export const PARKED = "translate(3200px, 0px)";

/** How long after the boot a parked layer stays on the frame, so it is painted before it leaves. */
export const PARK_WARM_MS = 800;

/** Whether a closed layer is parked: it leaves at once when opened, and parks only after its fade out. */
export function useParked(open: () => boolean, fadeMs: number): Ref<boolean> {
  const parked = ref(!open());
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(open, (now) => {
    clearTimeout(timer);
    if (now) parked.value = false;
    else
      timer = setTimeout(() => {
        parked.value = true;
      }, fadeMs + 50);
  });
  onUnmounted(() => clearTimeout(timer));
  return parked;
}
