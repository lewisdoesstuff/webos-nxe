import { onUnmounted, ref, watch, type Ref } from "vue";

/**
 * Where a closed layer waits. A layer at rest opacity is still drawn every
 * frame, and a closed page and settings screen together cost a row move about
 * ten points of frame coverage on the TV. Just off the frame the compositor
 * culls them yet keeps their textures, so opening still allocates nothing.
 * A 2D translate, because a 3D one would promote the container itself.
 */
export const PARKED = "translate(2400px, 0px)";

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
