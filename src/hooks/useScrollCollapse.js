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
 * `flipDistance` px past the last flip (subject to the cooldown); returns
 * false again near the top of the page, or once scrolled back up
 * `flipDistance` px from the last flip (also subject to the cooldown).
 */
const useScrollCollapse = (threshold = 24, flipDistance = 36, minFlipIntervalMs = 300) => {
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
      const now = performance.now();

      // The cooldown applies uniformly, including the "near the top" case.
      // It used to bypass the cooldown so reaching the top always expanded
      // instantly, but that meant the browser's own rubber-band/momentum
      // bounce around the top of the page — which can cross back and forth
      // over `threshold` several times in well under 220ms while it settles
      // — flipped state on every single crossing, uncooled. That was the
      // real cause of the reported "opens and closes constantly while
      // scrolling up": it always happens near the top, exactly where a
      // bounce lives. Gating this branch too means the same one-flip-per-
      // cooldown-window guarantee applies everywhere, at the cost of a
      // barely-perceptible (<300ms) delay before it expands right at the top.
      if (now - lastFlipTime < minFlipIntervalMs) return;

      if (currentScrollY <= threshold) {
        setIsCollapsed(false);
        lastFlipScrollY = currentScrollY;
        lastFlipTime = now;
        return;
      }

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
