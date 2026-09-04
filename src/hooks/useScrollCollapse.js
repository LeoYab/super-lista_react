import { useEffect, useState } from 'react';

/**
 * Tracks window scroll to drive a "collapse on scroll-down" UI pattern
 * (e.g. shrinking a sticky header to give a list more room).
 *
 * Uses hysteresis rather than a per-frame delta: it only flips state once
 * the scroll position has moved by `flipDistance` px away from wherever it
 * was the last time state changed. A per-frame delta check flickers on any
 * momentary reversal inside a single scroll gesture — e.g. the deceleration
 * curve of a mouse-wheel "smooth scroll" often overshoots and settles back a
 * few px right at the end, which a naive delta check reads as "scrolled
 * back up". Comparing against the last flip point instead ignores that kind
 * of in-gesture noise while still reacting immediately to a genuine
 * direction change (a real upward swipe starts accumulating from the
 * current position right away).
 *
 * Returns true once scrolled down past `threshold` px from the top AND
 * `flipDistance` px past the last flip; returns false again near the top
 * of the page or once scrolled back up `flipDistance` px from the last flip.
 * `flipDistance` defaults fairly high (well above a single line of text)
 * because mouse-wheel "smooth scroll" easing can overshoot the target and
 * settle back 20-35px right after a fast scroll — with a smaller margin
 * that settle-back alone reads as a genuine reversal and flips state right
 * back. A real swipe/scroll gesture moves far more than this either way.
 */
const useScrollCollapse = (threshold = 24, flipDistance = 56) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    let lastFlipScrollY = window.scrollY;

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
      } else if (currentScrollY - lastFlipScrollY > flipDistance) {
        setIsCollapsed(true);
        lastFlipScrollY = currentScrollY;
      } else if (lastFlipScrollY - currentScrollY > flipDistance) {
        setIsCollapsed(false);
        lastFlipScrollY = currentScrollY;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold, flipDistance]);

  return isCollapsed;
};

export default useScrollCollapse;
