/**
 * THE BOTTOM DOCK — two mirrored anchors, shared by every Mogzy corner control.
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
 * So the corner becomes a real thing with real slots.
 *
 * TWO SIDES, NOT ONE CORNER
 * ─────────────────────────
 * Both controls first shared the bottom-RIGHT corner, tabs in a row. That put
 * a contextual, transient control (Report) and a persistent one (Rules) in the
 * same 230px of a phone, and it read as one crowded cluster rather than two
 * controls with different jobs. They are now a mirrored PAIR:
 *
 *   ┌──────────────┐                              ┌──────────────┐
 *   │ open panel   │                              │ open panel   │
 *   └──────────────┘                              └──────────────┘
 *   [ Report ]                                         [ Rules ]
 *   └─ bottom-left ─┘                        └─ bottom-right ─┘
 *
 * Each side is its own anchor with its own panel stack and tab row, and the
 * two are geometric mirrors: same insets, same gap, same tab treatment. The
 * left stack is `items-start` so its panel expands rightward, INWARD across
 * the viewport, and can never run off the left edge; the right stack is
 * `items-end` and expands leftward, exactly as it always did.
 *
 * Tabs still share a ROW within a side, so a third control on either side
 * wraps rather than stacking a phone out of room.
 *
 * ONE PANEL OPEN AT A TIME — ACROSS BOTH SIDES
 * ────────────────────────────────────────────
 * Exclusivity is a property of the DOCK, not of a side. Report on the left and
 * Rules on the right would physically fit side by side on a desktop, but two
 * open parchments either side of a live question is two things asking to be
 * read while a server clock runs. Opening either still collapses the other.
 *
 * Two open panels would stack to ~144vh. So opening one collapses the others —
 * but through `onCollapse`, which is distinct from `onClose` on purpose. For
 * Ranked Rules, closing IS the acknowledgement ("these rules have been put in
 * front of this browser and put away again"). A panel that was shoved aside by
 * a control the player reached for instead was never read, and must not spend
 * the one showing that feature gets. Ranked's rules scroll passes a collapse that
 * does not acknowledge; a caller with no such distinction can leave
 * `onCollapse` unset and get `onClose`.
 *
 * WHAT ELSE LIVES DOWN THERE
 * ──────────────────────────
 * The bottom-left was not empty: `FloatingFriendsButton`, the Community
 * trigger, is pinned at `bottom-6 left-6` on every gameplay route. A 44px tab
 * at `bottom-4 left-3` lands on top of it. Rather than nudge one of them by
 * hand — the coincidence this file exists to abolish — the dock PUBLISHES
 * whether its left side is occupied (`useMogzyDockOccupied`), and the shell
 * lifts the Community trigger clear while it is. Occupancy is real
 * registration state, so the trigger drops back the moment the reporter
 * unmounts, which on a non-quiz route is always.
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

/** Which bottom corner a dock occupant anchors to. */
export type MogzyDockSide = "left" | "right";

/** Ascending; lower sorts first (panels: higher up, tabs: further inboard). */
export const DOCK_ORDER = {
  /** Contextual and transient — the leftmost tab, closest to the thumb. */
  questionReport: 10,
  /** Persistent per-mode explanation. */
  rules: 20,
} as const;

/** Where each occupant anchors. The pair is mirrored: Report left, Rules right. */
export const DOCK_SIDE = {
  questionReport: "left",
  rules: "right",
} as const satisfies Record<string, MogzyDockSide>;

interface DockRegistration {
  id: string;
  side: MogzyDockSide;
  collapse: () => void;
}

interface SideSlots {
  panelSlot: HTMLElement | null;
  tabSlot: HTMLElement | null;
}

interface MogzyDockValue {
  slots: Record<MogzyDockSide, SideSlots>;
  /** Which sides currently have at least one registered occupant. */
  occupied: Record<MogzyDockSide, boolean>;
  /** Register a panel so the dock can ask it to collapse. */
  register: (registration: DockRegistration) => () => void;
  /** "I am open now" — every other registered panel is asked to collapse. */
  claimExclusive: (id: string) => void;
}

const DockContext = createContext<MogzyDockValue | null>(null);

export function MogzyDockProvider({ children }: { children: ReactNode }) {
  const [leftPanelSlot, setLeftPanelSlot] = useState<HTMLElement | null>(null);
  const [leftTabSlot, setLeftTabSlot] = useState<HTMLElement | null>(null);
  const [rightPanelSlot, setRightPanelSlot] = useState<HTMLElement | null>(null);
  const [rightTabSlot, setRightTabSlot] = useState<HTMLElement | null>(null);
  const registrations = useRef(new Map<string, DockRegistration>());

  /* Occupancy is STATE and not a ref read, because the shell re-layouts on it
     (the Community trigger steps aside for a left-docked tab). Counting rather
     than a boolean: StrictMode double-mounts, and a plain flag flipped false by
     the first cleanup would drop the live occupant's claim. */
  const [counts, setCounts] = useState<Record<MogzyDockSide, number>>({ left: 0, right: 0 });

  const register = useCallback((registration: DockRegistration) => {
    registrations.current.set(registration.id, registration);
    setCounts(prev => ({ ...prev, [registration.side]: prev[registration.side] + 1 }));
    return () => {
      // Only if it is still ours: a StrictMode double-mount re-registers under
      // the same id before the first cleanup runs, and an unconditional delete
      // would drop the live registration.
      if (registrations.current.get(registration.id) === registration) {
        registrations.current.delete(registration.id);
      }
      setCounts(prev => ({
        ...prev,
        [registration.side]: Math.max(0, prev[registration.side] - 1),
      }));
    };
  }, []);

  const claimExclusive = useCallback((id: string) => {
    for (const [otherId, registration] of registrations.current) {
      if (otherId !== id) registration.collapse();
    }
  }, []);

  const valueRef = useRef<MogzyDockValue | null>(null);
  valueRef.current = {
    slots: {
      left: { panelSlot: leftPanelSlot, tabSlot: leftTabSlot },
      right: { panelSlot: rightPanelSlot, tabSlot: rightTabSlot },
    },
    occupied: { left: counts.left > 0, right: counts.right > 0 },
    register,
    claimExclusive,
  };

  return (
    <DockContext.Provider value={valueRef.current}>
      {children}
      <MogzyDockRoot
        side="left"
        onPanelSlot={setLeftPanelSlot}
        onTabSlot={setLeftTabSlot}
      />
      <MogzyDockRoot
        side="right"
        onPanelSlot={setRightPanelSlot}
        onTabSlot={setRightTabSlot}
      />
    </DockContext.Provider>
  );
}

/**
 * One anchor. Rendered by the provider rather than placed by hand, so there is
 * exactly one per side and no route can forget one or add a third.
 *
 * The two sides are the same box mirrored — same insets, same gap, same
 * `max-w` — so the pair reads as deliberate rather than as two controls that
 * happened to land near opposite corners.
 */
function MogzyDockRoot({
  side,
  onPanelSlot,
  onTabSlot,
}: {
  side: MogzyDockSide;
  onPanelSlot: (el: HTMLElement | null) => void;
  onTabSlot: (el: HTMLElement | null) => void;
}) {
  const anchor = side === "left"
    ? "left-3 items-start sm:left-4"
    : "right-3 items-end sm:right-4";
  const align = side === "left" ? "items-start" : "items-end";
  const justify = side === "left" ? "justify-start" : "justify-end";

  return (
    <div
      data-testid={`mogzy-dock-${side}`}
      data-dock-side={side}
      className={`pointer-events-none fixed bottom-4 z-40 flex max-w-[calc(100vw-1.5rem)]
        flex-col gap-2 sm:bottom-5 ${anchor}`}
    >
      <div
        ref={onPanelSlot}
        data-testid={`mogzy-dock-panels-${side}`}
        className={`pointer-events-none flex w-full flex-col gap-2 empty:hidden ${align}`}
      />
      <div
        ref={onTabSlot}
        data-testid={`mogzy-dock-tabs-${side}`}
        /* `flex-wrap` and not `overflow`: if a third control ever joins a side,
           the tabs drop to a second line rather than one of them vanishing off
           the edge of a phone. */
        className={`pointer-events-none flex flex-wrap items-center gap-2 empty:hidden ${justify}`}
      />
    </div>
  );
}

/**
 * Is either bottom corner currently claimed by a dock occupant?
 *
 * The shell uses this to move its own floating furniture out from under a tab
 * — see the Community trigger in `Layout`. Returns false with no dock mounted,
 * which is the correct answer: no dock, no tab, nothing to step aside for.
 */
export function useMogzyDockOccupied(side: MogzyDockSide): boolean {
  return useContext(DockContext)?.occupied[side] ?? false;
}

export interface MogzyDockSlot {
  /** Portal target for the open panel, or null when no dock is mounted. */
  panelSlot: HTMLElement | null;
  /** Portal target for the collapsed tab, or null when no dock is mounted. */
  tabSlot: HTMLElement | null;
}

/**
 * Claim a place in the dock, on one side of it.
 *
 * Returns null slots when no dock is mounted, which is the signal for a panel
 * to fall back to its own fixed anchor. That fallback is what keeps every
 * existing test — and any surface that renders a panel outside the app shell —
 * working unchanged.
 */
export function useMogzyDockSlot(args: {
  id: string;
  side: MogzyDockSide;
  open: boolean;
  onCollapse: () => void;
}): MogzyDockSlot {
  const { id, side, open, onCollapse } = args;
  const dock = useContext(DockContext);

  // The collapse callback is read through a ref so re-registering is driven by
  // the id and side alone. A caller that rebuilds its handler each render would
  // otherwise churn the registration map on every frame of a live match.
  const collapseRef = useRef(onCollapse);
  collapseRef.current = onCollapse;

  const register = dock?.register;
  useEffect(() => {
    if (!register) return;
    return register({ id, side, collapse: () => collapseRef.current() });
  }, [register, id, side]);

  const claimExclusive = dock?.claimExclusive;
  useEffect(() => {
    if (open) claimExclusive?.(id);
  }, [open, claimExclusive, id]);

  const slots = dock?.slots[side];
  return { panelSlot: slots?.panelSlot ?? null, tabSlot: slots?.tabSlot ?? null };
}
