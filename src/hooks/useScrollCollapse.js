import { useCallback, useRef, useState } from 'react';

/**
 * Drives a "collapse on scroll-down" UI pattern (e.g. shrinking a sticky
 * header to give a list more room) by comparing the current scroll
 * position against a fixed point on the page, with hysteresis between the
 * collapse and expand thresholds.
 *
 * This hook went through three earlier versions - a per-frame scroll delta,
 * anchor-based hysteresis with a cooldown, then a *single* fixed sentinel
 * point compared with a cooldown - and all three still flickered on real
 * scroll input (confirmed via phone screen recordings each time). The fixed
 * sentinel got the geometry right: comparing against a point that never
 * moves removes the feedback loops that come from momentum overshoot,
 * rubber-band bounce, and layout shift corrupting a *moving* reference.
 * But that version still used the exact same line for both the collapse and
 * expand decision, gated only by a minimum time between flips - and a
 * cooldown limits how *often* the header can flip, it does nothing to stop
 * it from genuinely flipping every time the scroll position drifts back and
 * forth across that one pixel line. A hand or a trackpad naturally does
 * exactly that while paused near a point, with each crossing easily spaced
 * further apart than any reasonable cooldown, which is why the header
 * settled into a steady flicker right at the threshold instead of cleanly
 * collapsing.
 *
 * The actual fix is hysteresis, not a longer cooldown: collapsing still
 * triggers the moment the sentinel scrolls above the viewport (top < 0),
 * but expanding back requires scrolling up until the sentinel is
 * `hysteresisPx` further down than that (top > hysteresisPx). Small
 * back-and-forth motion anywhere inside that gap can't cross both lines, so
 * it physically can't flip - there's no timing window to tune, and no
 * cooldown/retry bookkeeping needed either.
 *
 * All of the decision logic runs as a plain side effect, deliberately
 * outside any `setState` updater function. React 18 StrictMode intentionally
 * double-invokes functional `setState` updaters in development to catch
 * impure ones; `isCollapsedRef` mirrors the committed state synchronously so
 * the "did this actually change" check can happen before ever touching
 * `setState`, keeping the updater itself trivial.
 *
 * (A plain scroll listener is used as the trigger instead of
 * IntersectionObserver - the more idiomatic way to watch a fixed point -
 * because its callback, like requestAnimationFrame, is deferred by the
 * browser whenever the document isn't actively compositing, confirmed via
 * `document.visibilityState` during testing. A scroll listener doesn't have
 * that failure mode.)
 *
 * `sentinelRef` is a callback ref rather than a plain ref object: the
 * sentinel element only exists once its parent has actually rendered (e.g.
 * after a list finishes loading), so a plain `useRef` + effect can end up
 * wiring the listener up against a still-null `.current` on first mount and
 * never retry once the element appears. A callback ref runs again every
 * time the underlying DOM node changes (attaches, swaps, or unmounts), so
 * the listener is always attached to whatever's current.
 */
const useScrollCollapse = (hysteresisPx = 48) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isCollapsedRef = useRef(false);
  const cleanupRef = useRef(null);

  const sentinelRef = useCallback((node) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (!node) return;

    const evaluate = () => {
      const top = node.getBoundingClientRect().top;
      const shouldCollapse = isCollapsedRef.current ? top < hysteresisPx : top < 0;
      if (shouldCollapse === isCollapsedRef.current) return;

      isCollapsedRef.current = shouldCollapse;
      setIsCollapsed(shouldCollapse);
    };

    evaluate(); // sync initial state (e.g. landing mid-scroll on reload)
    window.addEventListener('scroll', evaluate, { passive: true });
    cleanupRef.current = () => window.removeEventListener('scroll', evaluate);
  }, [hysteresisPx]);

  return { isCollapsed, sentinelRef };
};

export default useScrollCollapse;
