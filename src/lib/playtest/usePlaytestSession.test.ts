/**
 * RB3 — the guided playtest's step machine, on its own.
 *
 * What it must get right is not "does it walk a list" but "can a refresh, a
 * double click or a lost storage write corrupt the sequence". So every case
 * here is about state that came from the SERVER (the settled-segment count)
 * versus state that came from the viewer (which pages they have read), and
 * about which of the two a failure can damage.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePlaytestSession } from "./usePlaytestSession";
import { PLAYTEST_INTRO, PLAYTEST_OUTRO, type PlaytestInterstitial } from "./preset";

const PAGES: readonly PlaytestInterstitial[] = [
  { id: "a", afterSegments: 2, eyebrow: "Next", heading: "A", body: ["a"], action: "Continue" },
  { id: "b", afterSegments: 4, eyebrow: "Next", heading: "B", body: ["b"], action: "Continue" },
];

const run = (over: Partial<Parameters<typeof usePlaytestSession>[0]> = {}) =>
  renderHook((props: Parameters<typeof usePlaytestSession>[0]) =>
    usePlaytestSession(props), {
    initialProps: {
      matchId: "m1", completedSegments: 0, matchOver: false, pages: PAGES, ...over,
    },
  });

beforeEach(() => { window.sessionStorage.clear(); });
afterEach(() => { window.sessionStorage.clear(); });

describe("the sequence", () => {
  it("opens on the intro, before a match exists", () => {
    const { result } = run({ matchId: null, completedSegments: null });
    expect(result.current.stage).toBe("intro");
    expect(result.current.page).toBe(PLAYTEST_INTRO);
  });

  it("plays gameplay at a boundary with no page on it", () => {
    const { result } = run({ completedSegments: 1 });
    expect(result.current.stage).toBe("gameplay");
    expect(result.current.page).toBeNull();
  });

  it("raises the page the server's own segment count is due", () => {
    const { result } = run({ completedSegments: 2 });
    expect(result.current.stage).toBe("interstitial");
    expect(result.current.page?.id).toBe("a");
  });

  it("returns to gameplay once the page is pressed past", () => {
    const { result } = run({ completedSegments: 2 });
    act(() => result.current.advance());
    expect(result.current.stage).toBe("gameplay");
  });

  it("raises the NEXT page at its own boundary", () => {
    const { result, rerender } = run({ completedSegments: 2 });
    act(() => result.current.advance());
    rerender({ matchId: "m1", completedSegments: 4, matchOver: false, pages: PAGES });
    expect(result.current.page?.id).toBe("b");
  });

  it("runs the CANONICAL result before the outro, never instead of it", () => {
    const { result } = run({ completedSegments: 6, matchOver: true });
    // `result` means the Ranked MatchOverFrame is what is on screen.
    expect(result.current.stage).toBe("result");
    act(() => result.current.advance());
    expect(result.current.stage).toBe("outro");
    expect(result.current.page).toBe(PLAYTEST_OUTRO);
  });
});

describe("the match is held for a page and only for a page", () => {
  it("holds while an interstitial is up", () => {
    const { result } = run({ completedSegments: 2 });
    expect(result.current.paused).toBe(true);
  });

  it("does not hold during gameplay", () => {
    expect(run({ completedSegments: 1 }).result.current.paused).toBe(false);
  });

  it("does not hold on the intro — there is no match to hold", () => {
    expect(run({ matchId: null, completedSegments: null }).result.current.paused)
      .toBe(false);
  });

  it("does not hold before the first snapshot lands", () => {
    // Holding here would stop the very poll that answers where we are.
    expect(run({ completedSegments: null }).result.current.paused).toBe(false);
  });

  it("does not hold after the match is over", () => {
    expect(run({ completedSegments: 6, matchOver: true }).result.current.paused)
      .toBe(false);
  });
});

describe("advancing is idempotent", () => {
  it("two presses land on the same step, not two steps forward", () => {
    const { result } = run({ completedSegments: 2 });
    act(() => { result.current.advance(); result.current.advance(); });
    expect(result.current.stage).toBe("gameplay");
    // `b` is NOT dismissed: a double click cannot skip a page it never saw.
    expect(JSON.parse(window.sessionStorage.getItem("mogzy.playtest.read.m1")!))
      .toEqual(["a"]);
  });

  it("a press with no page on screen does nothing", () => {
    const { result } = run({ completedSegments: 1 });
    act(() => result.current.advance());
    expect(window.sessionStorage.getItem("mogzy.playtest.read.m1")).toBeNull();
  });
});

describe("a refresh", () => {
  it("resumes at the server's position, not at the start", () => {
    // A fresh hook — the mount a reload produces — with the server saying 4.
    const { result } = run({ completedSegments: 4 });
    expect(result.current.stage).toBe("interstitial");
    expect(result.current.page?.id).toBe("b");
  });

  it("does not re-show a page this viewer already read", () => {
    window.sessionStorage.setItem("mogzy.playtest.read.m1", JSON.stringify(["a"]));
    const { result } = run({ completedSegments: 2 });
    expect(result.current.stage).toBe("gameplay");
  });

  it("degrades to re-showing ONE page when storage is unusable", () => {
    // The worst case is deliberately bounded: a lost dismissal record costs
    // the player a page they have seen before. It cannot lose their position,
    // because their position is the server's segment count.
    const get = window.sessionStorage.getItem;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.sessionStorage as any).getItem = () => { throw new Error("blocked"); };
    try {
      const { result } = run({ completedSegments: 2 });
      expect(result.current.stage).toBe("interstitial");
      expect(result.current.page?.id).toBe("a");
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.sessionStorage as any).getItem = get;
    }
  });

  it("keeps one match's record out of another's", () => {
    window.sessionStorage.setItem("mogzy.playtest.read.m1", JSON.stringify(["a"]));
    const { result } = run({ matchId: "m2", completedSegments: 2 });
    expect(result.current.page?.id).toBe("a");
  });
});
