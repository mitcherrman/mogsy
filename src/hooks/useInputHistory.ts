import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  deepEqual,
  redo,
  undo,
  type HistoryState,
} from "@/lib/combat-lab/inputHistory";

/**
 * History over a canonical input state that is OWNED ELSEWHERE (existing
 * useState slices). The hook observes the composed `current` snapshot each
 * render — the same pattern the sandbox's auto-reset already uses — and
 * commits an entry when it meaningfully changed. Undo/redo restore snapshots
 * through the caller's `restore`, which writes back into the real state
 * owners, so there is never a second independently-writable copy: the stack
 * only ever holds immutable copies of states the app actually rendered.
 *
 * Guarantees:
 * - the initial (possibly localStorage-hydrated) state creates no entry;
 * - restores are not re-recorded as new edits;
 * - no-op transitions (deep-equal) are ignored;
 * - a restore or an explicit labelled commit ends any typing transaction.
 */
export function useInputHistory<S>(opts: {
  current: S;
  restore: (snapshot: S) => void;
  classify: (prev: S, next: S) => { label: string; txnKey: string | null };
  cap?: number;
  coalesceWindowMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}) {
  const { current, restore, classify, cap, coalesceWindowMs, now } = opts;
  const [history, setHistory] = useState<HistoryState<S>>(() => createHistory(current));
  const historyRef = useRef(history);
  historyRef.current = history;

  const restoringRef = useRef(false);
  const pendingLabelRef = useRef<string | null>(null);
  const classifyRef = useRef(classify);
  classifyRef.current = classify;
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const nowRef = useRef(now ?? (() => Date.now()));
  nowRef.current = now ?? nowRef.current;

  useEffect(() => {
    const h = historyRef.current;
    if (deepEqual(current, h.present.state)) {
      // The live state caught up with a restore (or nothing meaningful
      // changed — loading flags, derived data and rerenders land here). A
      // pending label whose apply turned out to be a no-op must not leak
      // onto the next unrelated edit.
      restoringRef.current = false;
      pendingLabelRef.current = null;
      return;
    }
    // A restore should land exactly on the present; if some clamp effect
    // drifted it, fall through and record the drift as a real change rather
    // than silently losing it.
    restoringRef.current = false;
    const pendingLabel = pendingLabelRef.current;
    pendingLabelRef.current = null;
    const described =
      pendingLabel !== null
        ? { label: pendingLabel, txnKey: null }
        : classifyRef.current(h.present.state, current);
    setHistory(
      commit(h, current, {
        label: described.label,
        txnKey: described.txnKey,
        at: nowRef.current(),
        cap,
        coalesceWindowMs,
      })
    );
  }, [current, cap, coalesceWindowMs]);

  const doUndo = useCallback((): string | null => {
    const h = historyRef.current;
    if (!canUndo(h)) return null;
    const undoneLabel = h.present.label ?? "change";
    const next = undo(h);
    restoringRef.current = true;
    setHistory(next);
    restoreRef.current(next.present.state);
    return undoneLabel;
  }, []);

  const doRedo = useCallback((): string | null => {
    const h = historyRef.current;
    if (!canRedo(h)) return null;
    const next = redo(h);
    restoringRef.current = true;
    setHistory(next);
    restoreRef.current(next.present.state);
    return next.present.label ?? "change";
  }, []);

  /**
   * Apply a state through the normal observer path but force the next commit's
   * label (e.g. "inputs reset"). The commit itself happens in the observer
   * effect, so it participates in branching/no-op/cap rules like any edit.
   */
  const applyLabelled = useCallback((snapshot: S, label: string) => {
    pendingLabelRef.current = label;
    restoreRef.current(snapshot);
  }, []);

  return useMemo(
    () => ({
      canUndo: canUndo(history),
      canRedo: canRedo(history),
      undo: doUndo,
      redo: doRedo,
      applyLabelled,
      /** Exposed for tests/diagnostics; not for rendering simulator data. */
      history,
    }),
    [history, doUndo, doRedo, applyLabelled]
  );
}
