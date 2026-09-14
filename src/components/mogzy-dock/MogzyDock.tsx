/**
 * THE BOTTOM-RIGHT DOCK — one anchor, shared by every Mogzy corner control.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `MogzyExplainsPanel` hard-codes `fixed bottom-4 right-3`. That was correct
 * while Ranked Rules was its only caller and the corner was empty. The moment
 * a second control wants the same corner — FB1-4's question reporter — two
 * `position: fixed` boxes land on identical coordinates and the newer one
 * covers the older one, on every route and at every width. Nudging one of them
 * by 60px would be a coincidence maintained by hand, not a layout.
 *
 * So the corner becomes a real thing with real slots:
 *
 *      ┌───────────────────────┐
 *      │   open panel (one)    │   ← panels stack, newest-opened wins
 *      └───────────────────────┘
 *                 [ Report ] [ Rules ]   ← tabs sit in a row, `order`-sorted
 *
 * Tabs share a ROW rather than a column because two stacked tabs plus an open
 * panel is taller than a 667px phone, while two tabs side by side are ~230px
 * of the 351px a 375px viewport leaves after the dock's own insets.
 *
 * ONE PANEL OPEN AT A TIME, AND WHY IT IS NOT `onClose`
 * ────────────────────────────────────────────────────
 * Two open panels would stack to ~144vh. So opening one collapses the others —
 * but through `onCollapse`, which is distinct from `onClose` on purpose. For
 * Ranked Rules, closing IS the acknowledgement ("these rules have been put in
 * front of this browser and put away again"). A panel that was shoved aside by
 * a control the player reached for instead was never read, and must not spend
 * the one showing that feature gets. Ranked's rules scroll passes a collapse that
 * does not acknowledge; a caller with no such distinction can leave
 * `onCollapse` unset and get `onClose`.
 *
 * THE DOCK OWNS NO LAYOUT ANYWHERE ELSE. It is `pointer-events-none` except on
 * the live boxes, exactly as the panel's own anchor was, so the empty corner
 * never eats a click meant for the arena underneath.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Ascending; lower sorts first (panels: higher up, tabs: further left). */
export const DOCK_ORDER = {
  /** Contextual and transient — the leftmost tab, closest to the thumb. */
  questionReport: 10,
  /** Persistent per-mode explanation. */
  rules: 20,
} as const;

interface DockRegistration {
  id: string;
  collapse: () => void;
}

interface MogzyDockValue {
  panelSlot: HTMLElement | null;
  tabSlot: HTMLElement | null;
  /** Register a panel so the dock can ask it to collapse. */
  register: (registration: DockRegistration) => () => void;
  /** "I am open now" — every other registered panel is asked to collapse. */
  claimExclusive: (id: string) => void;
}

const DockContext = createContext<MogzyDockValue | null>(null);

export function MogzyDockProvider({ children }: { children: ReactNode }) {
  const [panelSlot, setPanelSlot] = useState<HTMLElement | null>(null);
  const [tabSlot, setTabSlot] = useState<HTMLElement | null>(null);
  const registrations = useRef(new Map<string, DockRegistration>());

  const register = useCallback((registration: DockRegistration) => {
    registrations.current.set(registration.id, registration);
    return () => {
      // Only if it is still ours: a StrictMode double-mount re-registers under
      // the same id before the first cleanup runs, and an unconditional delete
      // would drop the live registration.
      if (registrations.current.get(registration.id) === registration) {
        registrations.current.delete(registration.id);
      }
    };
  }, []);

  const claimExclusive = useCallback((id: string) => {
    for (const [otherId, registration] of registrations.current) {
      if (otherId !== id) registration.collapse();
    }
  }, []);

  const valueRef = useRef<MogzyDockValue | null>(null);
  valueRef.current = { panelSlot, tabSlot, register, claimExclusive };

  return (
    <DockContext.Provider value={valueRef.current}>
      {children}
      <MogzyDockRoot onPanelSlot={setPanelSlot} onTabSlot={setTabSlot} />
    </DockContext.Provider>
  );
}

/**
 * The anchor itself. Rendered by the provider rather than placed by hand, so
 * there is exactly one of it and no route can forget it or add a second.
 */
function MogzyDockRoot({
  onPanelSlot,
  onTabSlot,
}: {
  onPanelSlot: (el: HTMLElement | null) => void;
  onTabSlot: (el: HTMLElement | null) => void;
}) {
  return (
    <div
      data-testid="mogzy-dock"
      className="pointer-events-none fixed bottom-4 right-3 z-40 flex max-w-[calc(100vw-1.5rem)]
        flex-col items-end gap-2 sm:bottom-5 sm:right-4"
    >
      <div
        ref={onPanelSlot}
        data-testid="mogzy-dock-panels"
        className="pointer-events-none flex w-full flex-col items-end gap-2 empty:hidden"
      />
      <div
        ref={onTabSlot}
        data-testid="mogzy-dock-tabs"
        /* `flex-wrap` and not `overflow`: if a third control ever joins, the
           tabs drop to a second line rather than one of them vanishing off the
           right edge of a phone. */
        className="pointer-events-none flex flex-wrap items-center justify-end gap-2 empty:hidden"
      />
    </div>
  );
}

export interface MogzyDockSlot {
  /** Portal target for the open panel, or null when no dock is mounted. */
  panelSlot: HTMLElement | null;
  /** Portal target for the collapsed tab, or null when no dock is mounted. */
  tabSlot: HTMLElement | null;
}

/**
 * Claim a place in the dock.
 *
 * Returns null slots when no dock is mounted, which is the signal for a panel
 * to fall back to its own fixed anchor. That fallback is what keeps every
 * existing test — and any surface that renders a panel outside the app shell —
 * working unchanged.
 */
export function useMogzyDockSlot(args: {
  id: string;
  open: boolean;
  onCollapse: () => void;
}): MogzyDockSlot {
  const { id, open, onCollapse } = args;
  const dock = useContext(DockContext);

  // The collapse callback is read through a ref so re-registering is driven by
  // the id alone. A caller that rebuilds its handler each render would
  // otherwise churn the registration map on every frame of a live match.
  const collapseRef = useRef(onCollapse);
  collapseRef.current = onCollapse;

  const register = dock?.register;
  useEffect(() => {
    if (!register) return;
    return register({ id, collapse: () => collapseRef.current() });
  }, [register, id]);

  const claimExclusive = dock?.claimExclusive;
  useEffect(() => {
    if (open) claimExclusive?.(id);
  }, [open, claimExclusive, id]);

  return { panelSlot: dock?.panelSlot ?? null, tabSlot: dock?.tabSlot ?? null };
}
