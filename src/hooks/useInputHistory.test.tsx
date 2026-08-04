/**
 * Contract for useInputHistory: the hook observes a canonical state owned by
 * the caller, commits meaningful transitions, and restores snapshots through
 * the caller's own setters. Hydrated initial state must create no entry, and
 * restores must not be re-recorded as edits.
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMemo, useState } from "react";
import { useInputHistory } from "./useInputHistory";

type Snap = { champion: string; level: number };

/** Harness that owns the canonical state exactly like the sandbox does. */
function useHarness(initial: Snap, now: () => number) {
  const [champion, setChampion] = useState(initial.champion);
  const [level, setLevel] = useState(initial.level);
  const current = useMemo(() => ({ champion, level }), [champion, level]);
  const history = useInputHistory<Snap>({
    current,
    restore: (s) => {
      setChampion(s.champion);
      setLevel(s.level);
    },
    classify: (prev, next) =>
      prev.champion !== next.champion
        ? { label: "champion change", txnKey: null }
        : { label: "level change", txnKey: "level" },
    now,
  });
  return { current, setChampion, setLevel, history };
}

function mount(initial: Snap = { champion: "Akali", level: 18 }) {
  let t = 0;
  const clock = { advance: (ms: number) => (t += ms), now: () => t };
  const rendered = renderHook(() => useHarness(initial, clock.now));
  return { ...rendered, clock };
}

describe("useInputHistory", () => {
  it("creates no history for the initial (hydrated) state", () => {
    const { result } = mount({ champion: "Hydrated", level: 7 });
    expect(result.current.history.canUndo).toBe(false);
    expect(result.current.history.canRedo).toBe(false);
  });

  it("commits meaningful edits and undoes/redoes through the caller's state", () => {
    const { result } = mount();
    act(() => result.current.setChampion("Ashe"));
    expect(result.current.history.canUndo).toBe(true);
    expect(result.current.current).toEqual({ champion: "Ashe", level: 18 });

    let label: string | null = null;
    act(() => {
      label = result.current.history.undo();
    });
    expect(label).toBe("champion change");
    expect(result.current.current).toEqual({ champion: "Akali", level: 18 });
    expect(result.current.history.canRedo).toBe(true);

    act(() => {
      label = result.current.history.redo();
    });
    expect(label).toBe("champion change");
    expect(result.current.current).toEqual({ champion: "Ashe", level: 18 });
    // The restore itself was not re-recorded: exactly one undoable entry.
    expect(result.current.history.history.past).toHaveLength(1);
  });

  it("ignores no-op assignments that rebuild an equal state", () => {
    const { result } = mount();
    act(() => result.current.setChampion("Akali"));
    expect(result.current.history.canUndo).toBe(false);
  });

  it("coalesces rapid same-field edits and splits on pause", () => {
    const { result, clock } = mount();
    act(() => result.current.setLevel(1));
    clock.advance(200);
    act(() => result.current.setLevel(12));
    clock.advance(200);
    act(() => result.current.setLevel(18));
    expect(result.current.history.history.past).toHaveLength(1);

    clock.advance(60_000);
    act(() => result.current.setLevel(5));
    expect(result.current.history.history.past).toHaveLength(2);

    act(() => {
      result.current.history.undo();
    });
    expect(result.current.current.level).toBe(18);
    act(() => {
      result.current.history.undo();
    });
    expect(result.current.current.level).toBe(18); // initial level
    expect(result.current.history.canUndo).toBe(false);
  });

  it("a new edit after undo clears the redo branch", () => {
    const { result, clock } = mount();
    act(() => result.current.setChampion("Ashe"));
    clock.advance(10_000);
    act(() => result.current.setChampion("Jinx"));
    act(() => {
      result.current.history.undo();
    });
    expect(result.current.history.canRedo).toBe(true);
    clock.advance(10_000);
    act(() => result.current.setChampion("Zed"));
    expect(result.current.history.canRedo).toBe(false);
  });

  it("applyLabelled commits one labelled transaction that is undoable", () => {
    const { result, clock } = mount();
    act(() => result.current.setChampion("Ashe"));
    clock.advance(10_000);
    act(() => result.current.setLevel(4));
    clock.advance(10_000);
    act(() =>
      result.current.history.applyLabelled({ champion: "Akali", level: 18 }, "inputs reset")
    );
    expect(result.current.current).toEqual({ champion: "Akali", level: 18 });

    let label: string | null = null;
    act(() => {
      label = result.current.history.undo();
    });
    expect(label).toBe("inputs reset");
    // The complete prior setup returns in one step.
    expect(result.current.current).toEqual({ champion: "Ashe", level: 4 });
  });

  it("reset after undo invalidates the old redo branch", () => {
    const { result, clock } = mount();
    act(() => result.current.setChampion("Ashe"));
    clock.advance(10_000);
    act(() => result.current.setChampion("Jinx"));
    act(() => {
      result.current.history.undo();
    });
    expect(result.current.history.canRedo).toBe(true);
    act(() =>
      result.current.history.applyLabelled({ champion: "Akali", level: 18 }, "inputs reset")
    );
    expect(result.current.history.canRedo).toBe(false);
  });
});
