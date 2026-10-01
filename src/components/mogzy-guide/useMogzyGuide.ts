import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { selectGuideMessage } from "./priority";
import {
  getDefaultGuideStorage,
  guideStorageKey,
  type GuideStorage,
} from "./storage";
import type { GuideHoverMessage, GuideMessage } from "./types";

/** Grace before a hover/focus leave clears the message (same value as the Hub guide). */
export const GUIDE_HOVER_CLEAR_DELAY_MS = 140;

export const GUIDE_AMBIENT_DEFAULTS = {
  initialDelayMs: 4000,
  visibleMs: 6000,
  gapMs: 24000,
} as const;

export interface UseMogzyGuideOptions {
  /** Stable surface name, e.g. `"hub"`, `"leaguecraft"`. Namespaces persistence and test ids. */
  surface: string;
  /**
   * Candidate messages derived from the surface's OWN state. Most important
   * first. Ineligible ones (seen / dismissed) are filtered here, not by the caller.
   */
  messages: readonly GuideMessage[];
  /** `false` hides the guide entirely (e.g. while a modal is open). Default true. */
  enabled?: boolean;
  /** Override persistence (tests). Default: browser localStorage with in-memory fallback. */
  storage?: GuideStorage;
  /** Cadence for `ambient` candidates, which rotate one at a time. */
  ambient?: Partial<{ initialDelayMs: number; visibleMs: number; gapMs: number }>;
}

export interface MogzyGuideController {
  /** The one message to display right now, or null. Feed to `<MogzyGuide message>`. */
  message: GuideMessage | null;
  /** Show a hover/focus message immediately (cancels a pending clear). */
  hover(message: GuideHoverMessage): void;
  /** Clear the hover message after the grace delay. */
  clearHover(): void;
  /** Dismiss the active message (or the given id). Feed to `<MogzyGuide onDismiss>`. */
  dismiss(id?: string): void;
  /** Forget persisted `once` records for this surface's current candidates. */
  resetSeen(): void;
}

export function useMogzyGuide({
  surface,
  messages,
  enabled = true,
  storage,
  ambient,
}: UseMogzyGuideOptions): MogzyGuideController {
  const store = useMemo(() => storage ?? getDefaultGuideStorage(), [storage]);
  const keyOf = useCallback((id: string) => guideStorageKey(surface, id), [surface]);

  const [hoverMessage, setHoverMessage] = useState<GuideMessage | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [ambientOn, setAmbientOn] = useState(false);
  const [ambientIdx, setAmbientIdx] = useState(0);

  // Ids that were consumed by being SHOWN during this mount. They stay eligible
  // until dismissed/expired so recording "seen" never yanks the bubble away;
  // on the next mount they are excluded by the persisted record.
  const shownRef = useRef<Set<string>>(new Set());
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const eligible = useCallback(
    (m: GuideMessage) => {
      if (dismissed.has(m.id)) return false;
      if (m.once && store.has(keyOf(m.id)) && !shownRef.current.has(m.id)) return false;
      return true;
    },
    [dismissed, store, keyOf],
  );

  const ambientList = useMemo(
    () => messages.filter((m) => m.priority === "ambient" && eligible(m)),
    [messages, eligible],
  );
  const ambientKey = ambientList.map((m) => m.id).join("|");
  const cadence = { ...GUIDE_AMBIENT_DEFAULTS, ...ambient };

  // Ambient rotation: wait → show one → hide → wait → next.
  useEffect(() => {
    if (!enabled || ambientList.length === 0) {
      setAmbientOn(false);
      return;
    }
    const delay = ambientOn
      ? cadence.visibleMs
      : ambientIdx === 0
        ? cadence.initialDelayMs
        : cadence.gapMs;
    const t = setTimeout(() => {
      if (ambientOn) {
        setAmbientOn(false);
        setAmbientIdx((i) => i + 1);
      } else {
        setAmbientOn(true);
      }
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ambientKey, ambientOn, ambientIdx, cadence.visibleMs, cadence.initialDelayMs, cadence.gapMs]);

  const message = useMemo(() => {
    if (!enabled) return null;
    const candidates = messages.filter((m) => m.priority !== "ambient" && m.priority !== "hover" && eligible(m));
    if (hoverMessage) candidates.push(hoverMessage);
    if (ambientOn && ambientList.length > 0) {
      candidates.push(ambientList[ambientIdx % ambientList.length]);
    }
    return selectGuideMessage(candidates);
  }, [enabled, messages, eligible, hoverMessage, ambientOn, ambientList, ambientIdx]);

  const activeId = message?.id ?? null;
  const activeOnce = message?.once;
  const activeTtl = message?.ttlMs;

  const dismiss = useCallback(
    (id?: string) => {
      const target = id ?? activeId;
      if (!target) return;
      const m = messages.find((c) => c.id === target);
      if (m?.once === "dismiss") store.set(keyOf(target));
      setHoverMessage((h) => (h?.id === target ? null : h));
      setDismissed((prev) => new Set(prev).add(target));
    },
    [activeId, messages, store, keyOf],
  );

  // `once: "show"` — record as soon as it is displayed.
  useEffect(() => {
    if (activeId && activeOnce === "show") {
      shownRef.current.add(activeId);
      store.set(keyOf(activeId));
    }
  }, [activeId, activeOnce, store, keyOf]);

  // ttl — expiry is a dismissal.
  useEffect(() => {
    if (!activeId || !activeTtl || activeTtl <= 0) return;
    const t = setTimeout(() => dismiss(activeId), activeTtl);
    return () => clearTimeout(t);
  }, [activeId, activeTtl, dismiss]);

  const cancelClear = () => {
    if (clearTimer.current !== null) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
  };

  const hover = useCallback((m: GuideHoverMessage) => {
    cancelClear();
    setHoverMessage({ ...m, priority: "hover" });
  }, []);

  const clearHover = useCallback(() => {
    cancelClear();
    clearTimer.current = setTimeout(() => {
      clearTimer.current = null;
      setHoverMessage(null);
    }, GUIDE_HOVER_CLEAR_DELAY_MS);
  }, []);

  useEffect(() => cancelClear, []);

  const resetSeen = useCallback(() => {
    for (const m of messages) if (m.once) store.clear(keyOf(m.id));
    shownRef.current.clear();
    setDismissed(new Set());
  }, [messages, store, keyOf]);

  return { message, hover, clearHover, dismiss, resetSeen };
}
