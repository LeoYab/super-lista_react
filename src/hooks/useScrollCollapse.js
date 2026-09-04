import { useEffect, useState } from 'react';

/**
 * Tracks window scroll to drive a "collapse on scroll-down" UI pattern
 * (e.g. shrinking a sticky header to give a list more room).
 *
 * Combines anchor-based hysteresis (only flips once the scroll position has
 * moved `flipDistance` px away from wherever it was at the last flip) with a
 * minimum time gap between flips (`minFlipIntervalMs`). The distance check
 * alone isn't enough: real scroll input is noisy (momentum-deceleration
 * overshoot that settles back a bit, a mouse-wheel/trackpad's residual
 * micro-jitter right as the user's hand slows down near the flip point,
 * scroll events that arrive as one big coalesced jump instead of many small
 * ones) and can cross the same boundary back and forth in rapid succession,
 * which read naively looks like the header should flip every time — that's
 * exactly the reported "opens and closes constantly while scrolling up"
 * bug. Rate-limiting flips with a short cooldown makes rapid back-and-forth
 * flipping structurally impossible (at most one flip per cooldown window)
 * without adding any perceptible lag to a real, deliberate scroll gesture.
 *
 * Returns true once scrolled down past `threshold` px from the top AND
 * `flipDistance` px past the last flip; returns false again near the top of
 * the page (always, regardless of cooldown — reaching the very top should
 * never be blocked from re-expanding) or once scrolled back up
 * `flipDistance` px from the last flip.
 */
const useScrollCollapse = (threshold = 24, flipDistance = 36, minFlipIntervalMs = 220) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    let lastFlipScrollY = window.scrollY;
    let lastFlipTime = 0;

    // Deliberately not throttled through requestAnimationFrame: rAF is
    // paused by the browser whenever the page isn't the actively
    // compositing tab (Page Visibility API), which would silently stop
    // this listener from ever updating. Reading scrollY and comparing two
    // numbers is cheap enough to run on every native scroll event as-is.
    const onScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY <= threshold) {
        setIsCollapsed(false);
        lastFlipScrollY = currentScrollY;
        lastFlipTime = performance.now();
        return;
      }

      const now = performance.now();
      if (now - lastFlipTime < minFlipIntervalMs) return;

      if (currentScrollY - lastFlipScrollY > flipDistance) {
        setIsCollapsed(true);
        lastFlipScrollY = currentScrollY;
        lastFlipTime = now;
      } else if (lastFlipScrollY - currentScrollY > flipDistance) {
        setIsCollapsed(false);
        lastFlipScrollY = currentScrollY;
        lastFlipTime = now;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold, flipDistance, minFlipIntervalMs]);

  return isCollapsed;
};

export default useScrollCollapse;
