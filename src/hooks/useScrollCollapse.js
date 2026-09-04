import { useCallback, useRef, useState } from 'react';

/**
 * Drives a "collapse on scroll-down" UI pattern (e.g. shrinking a sticky
 * header to give a list more room) by comparing the current scroll
 * position against a single fixed point, instead of tracking scroll
 * direction/velocity from a moving reference.
 *
 * Earlier approaches (a per-frame scroll delta, then anchor-based
 * hysteresis with a cooldown) both kept finding new ways to flicker on
 * real scroll input: momentum-deceleration overshoot, the browser's own
 * rubber-band bounce at the top of the page, and — confirmed via a real
 * phone screen recording — plain touch-scroll jitter. All of those failure
 * modes came from the same root problem: reconstructing "did the user
 * actually change direction" from a *moving* reference point (the
 * position at the last flip) is inherently noisy, because that reference
 * itself shifts every time state changes.
 *
 * Comparing against a single *fixed* point removes that whole class of
 * bug: attach `sentinelRef` to a zero-size element positioned `offsetPx`
 * down from the top of the scrollable content (an absolutely-positioned
 * child of a `position: relative` ancestor works well). `isCollapsed`
 * becomes true once that fixed point has scrolled above the viewport,
 * false again once it's back in view (including at the very top of the
 * page). There's no accumulated distance or last-flip state to get
 * corrupted by a single noisy sample — it's the same one comparison every
 * time, so the only way to flip rapidly is to genuinely cross that one
 * line back and forth, which a short cooldown comfortably absorbs.
 *
 * The cooldown itself needs care: if a flip is blocked because it lands
 * inside the cooldown window, and the user's scroll gesture happens to
 * stop right there, nothing else would ever re-check the sentinel and the
 * header gets stuck showing the wrong state until the next scroll tick.
 * A blocked evaluation schedules a retry for when the cooldown actually
 * clears, instead of being silently dropped.
 *
 * All of the decision logic (the sentinel check, the cooldown, scheduling
 * a retry) runs as a plain side effect, deliberately outside any
 * `setState` updater function. React 18 StrictMode intentionally
 * double-invokes functional `setState` updaters in development to catch
 * impure ones; an earlier version of this hook did the cooldown/timer
 * bookkeeping *inside* the updater, so StrictMode silently ran that
 * bookkeeping twice per real scroll event, corrupting `lastFlipTime` and
 * scheduling duplicate retries. `isCollapsedRef` mirrors the committed
 * state synchronously so the "did this actually change" check can happen
 * before ever touching `setState`, keeping the updater itself trivial.
 *
 * (IntersectionObserver is the more idiomatic way to watch a fixed point
 * like this, but its callback is deferred by the browser whenever the
 * document isn't actively compositing — confirmed via
 * `document.visibilityState` during testing — the same throttling that
 * ruled out requestAnimationFrame for this hook. A plain scroll listener
 * doesn't have that failure mode.)
 *
 * `sentinelRef` is a callback ref rather than a plain ref object: the
 * sentinel element only exists once its parent has actually rendered
 * (e.g. after a list finishes loading), so a plain `useRef` + effect can
 * end up wiring the listener up against a still-null `.current` on first
 * mount and never retry once the element appears. A callback ref runs
 * again every time the underlying DOM node changes (attaches, swaps, or
 * unmounts), so the listener is always attached to whatever's current.
 */
const useScrollCollapse = (minFlipIntervalMs = 150) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isCollapsedRef = useRef(false);
  const cleanupRef = useRef(null);

  const sentinelRef = useCallback((node) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (!node) return;

    let lastFlipTime = 0;
    let retryTimer = null;

    const evaluate = () => {
      const shouldCollapse = node.getBoundingClientRect().top < 0;
      if (shouldCollapse === isCollapsedRef.current) return;

      const now = performance.now();
      const elapsed = now - lastFlipTime;
      if (elapsed < minFlipIntervalMs) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(evaluate, minFlipIntervalMs - elapsed + 10);
        return;
      }

      lastFlipTime = now;
      isCollapsedRef.current = shouldCollapse;
      setIsCollapsed(shouldCollapse);
    };

    evaluate(); // sync initial state (e.g. landing mid-scroll on reload)
    window.addEventListener('scroll', evaluate, { passive: true });
    cleanupRef.current = () => {
      clearTimeout(retryTimer);
      window.removeEventListener('scroll', evaluate);
    };
  }, [minFlipIntervalMs]);

  return { isCollapsed, sentinelRef };
};

export default useScrollCollapse;
