/**
 * JOURNEY-MOTION-V1 — the state beat, through the production viewport.
 *
 * Real captures (`lib/journey/__fixtures__/m1`, backend `jm1/motion-backend`,
 * the semantic beat policy: one transition = 900 ms, a group = 1300 ms) with
 * extra reads at each beat's first instant, middle and last millisecond.
 *
 * jsdom has no layout and does not run CSS animations, so what is provable
 * here is WHICH object carries the transition state the motion layer keys on
 * (`data-changed`, `data-new`, the unlock ghost, the item's gain tag), that
 * nothing the beat adds lays out, and that the beat is the server's instant.
 * Geometry and real motion are certified in a browser — see
 * `JOURNEY_MOTION_V1_FRONTEND_HANDOFF.md`.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readPublicRound, type SegmentStateView } from "@/lib/ranked-public/contracts";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { journeyKnowledge, type JourneyKnowledge } from "@/lib/journey/knowledge";
import { beatShortStamp, beatStamps, itemGainTags } from "@/lib/journey/beat";
import type { JourneyTransition } from "@/lib/journey/contract";
import { masterySliceModule } from "./masterySliceModule";

const M1 = resolve(process.cwd(), "src/lib/journey/__fixtures__/m1");
const cache = new Map<string, CaptureSnapshot[]>();
const load = (n: string): CaptureSnapshot[] => {
  if (!cache.has(n)) cache.set(n, JSON.parse(readFileSync(join(M1, `${n}.json`), "utf8")));
  return cache.get(n)!;
};
const snap = (n: string, label: string): CaptureSnapshot => {
  const s = load(n).find((x) => x.label === label);
  if (!s) throw new Error(`${n}: ${label}`);
  return s;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wire = (s: CaptureSnapshot): any => (s.envelope.payload as any).segment_state;
const stateOf = (s: CaptureSnapshot): SegmentStateView => readPublicRound(s.envelope).segmentState!;
const marksOf = (s: CaptureSnapshot): JourneyKnowledge => {
  const st = stateOf(s);
  return journeyKnowledge(st.journey, st.ownChallengeReveals, st.ownCardIndex);
};
const summary = (k: JourneyKnowledge) => Object.fromEntries([...k.values()].map((m) =>
  [m.key, m.facts.map((f) => [f.fact, f.display, f.child + 1])]));
const opensAt = (s: CaptureSnapshot) => Date.parse(wire(s).own_card_started_at);

const Viewport = masterySliceModule.Viewport;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function view(s: CaptureSnapshot) {
  const round = readPublicRound(s.envelope);
  return (
    <QueryClientProvider client={queryClient}>
      <Viewport publicRound={round} segmentState={round.segmentState} selection={null}
        permissions={NO_INTERACTIONS} onSelect={() => {}}
        actions={{ submitChallenge: () => {}, busy: false, error: null }} skewMs={0} />
    </QueryClientProvider>
  );
}
function show(s: CaptureSnapshot) {
  vi.setSystemTime(Date.parse(s.at));
  return render(view(s));
}
/** Walk the captures from child 0 to `upTo`, on server time. */
function play(n: string, upTo: string) {
  const all = load(n).filter((s) => wire(s) !== null);
  const seq = all.slice(all.findIndex((x) => x.label === "child0-open"), all.findIndex((x) => x.label === upTo) + 1);
  vi.setSystemTime(Date.parse(seq[0].at));
  const r = render(view(seq[0]));
  for (let i = 1; i < seq.length; i++) {
    act(() => { vi.advanceTimersByTime(Date.parse(seq[i].at) - Date.parse(seq[i - 1].at)); });
    vi.setSystemTime(Date.parse(seq[i].at));
    r.rerender(view(seq[i]));
  }
  return r;
}
const beat = () => screen.getByTestId("journey-stage").getAttribute("data-beat");
const changed = () => [...document.querySelectorAll("[data-testid^='journey-'][data-changed='true']")]
  .map((e) => e.getAttribute("data-testid")).sort();
const newItems = () => [...document.querySelectorAll("[data-testid^='journey-item-'][data-new='true']")]
  .map((e) => e.getAttribute("data-testid")).sort();

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("the captures carry the semantic beat policy", () => {
  it("one transition = 900 ms, a group = 1300 ms, and the shares sum to the frozen delay", () => {
    const j = wire(snap("voli.standard", "child4-beat")).challenges.journey;
    expect(j.open_delays_ms).toEqual([0, 0, 900, 0, 1300]);
    const shares = (child: number) => j.transitions.filter((t: { before_child: number }) => t.before_child === child)
      .map((t: { beat_ms: number }) => t.beat_ms);
    expect(shares(2)).toEqual([900]);
    expect(shares(4)).toEqual([650, 650]);
    expect(wire(snap("ahri.survival", "child1-beat")).challenges.journey.open_delays_ms).toEqual([0, 900]);
  });

  it("the server holds the child closed through the beat's last millisecond, then opens it", () => {
    for (const [n, c] of [["voli.standard", 2], ["voli.standard", 4], ["ahri.survival", 1], ["pantheon.standard", 4]] as const) {
      const start = snap(n, `child${c}-beat-start`);
      const end = snap(n, `child${c}-beat-end`);
      const open = snap(n, `child${c}-open`);
      const beatMs = wire(open).challenges.journey.open_delays_ms[c];
      expect(wire(start).challenges.challenges).toHaveLength(c);
      expect(wire(end).challenges.challenges).toHaveLength(c);
      expect(wire(open).challenges.challenges).toHaveLength(c + 1);
      expect(opensAt(end) - Date.parse(end.at)).toBe(1);
      // The beat as served: first read 10 ms in, open at exactly beat_ms.
      expect(opensAt(start) - Date.parse(start.at)).toBe(beatMs - 10);
    }
  });
});

describe("the changed object — and only it — carries the transition state", () => {
  it("a single purchase: only the new slot is new; no level, rank or unlock moves", () => {
    play("voli.standard", "child2-beat");
    expect(beat()).toBe("active");
    expect(newItems()).toEqual(["journey-item-subject-0"]);
    expect(changed()).toEqual([]);
    expect(screen.getByTestId("journey-beat-stamp")).toHaveTextContent("First back");
  });

  it("the purchase's own stat lines ride its slot, from the server's events only", () => {
    const s = snap("voli.standard", "child2-beat");
    play("voli.standard", "child2-beat");
    const tag = screen.getByTestId("journey-item-gain-subject-0");
    expect(tag).toHaveTextContent("+10 AH · +20 AD");
    expect(tag).toHaveAttribute("aria-hidden", "true");
    // Every number on the tag is a `stat_change.delta` the server sent.
    const deltas = wire(s).challenges.journey.transitions.flatMap((t: { events: { type: string; delta?: number }[] }) =>
      t.events.filter((e) => e.type === "stat_change").map((e) => String(e.delta)));
    for (const n of tag.textContent!.match(/\d+/g)!) expect(deltas).toContain(n);
    // No tag on a slot that did not change, nor on the other side.
    expect(screen.queryAllByTestId(/^journey-item-gain-/)).toHaveLength(1);
  });

  it("a level beat: both levels roll, the served ranks fill, both Rs unlock", () => {
    play("voli.standard", "child4-beat");
    expect(beat()).toBe("active");
    for (const side of ["subject", "opponent"]) {
      const lv = screen.getByTestId(`journey-level-${side}`);
      expect(lv).toHaveAttribute("data-changed", "true");
      expect(lv.querySelector(".journey-level__from")).toHaveTextContent("4");
      expect(lv.querySelector(".journey-level__to")).toHaveTextContent("6");
      expect(screen.getByTestId(`journey-unlock-${side}-R`)).toBeInTheDocument();
      expect(screen.getByTestId(`journey-ability-${side}-R`)).not.toHaveAttribute("data-locked");
    }
    // Exactly the served ranks: Volibear W 2→3, Lee Sin Q 2→3, plus both Rs.
    expect(changed()).toEqual([
      "journey-ability-opponent-Q", "journey-ability-opponent-R",
      "journey-ability-subject-R", "journey-ability-subject-W",
      "journey-level-opponent", "journey-level-subject",
    ]);
    // J3 states no max rank: the rank is the digit on the tile, and only the
    // raised ones are marked new (the digit pops; there are no pips to fill).
    const digit = (id: string) => screen.getByTestId(id);
    expect(digit("journey-pips-subject-W")).toHaveAttribute("data-rank-only", "true");
    expect(digit("journey-pips-subject-W")).toHaveAttribute("data-new", "true");
    expect(digit("journey-pips-subject-W")).toHaveTextContent("3");
    expect(digit("journey-pips-opponent-Q")).toHaveAttribute("data-new", "true");
    expect(digit("journey-pips-subject-Q")).not.toHaveAttribute("data-new");
    expect(digit("journey-pips-subject-E")).not.toHaveAttribute("data-new");
    // Unrelated abilities are untouched.
    expect(screen.queryByTestId("journey-unlock-subject-Q")).toBeNull();
    expect(screen.getByTestId("journey-ability-subject-Q")).not.toHaveAttribute("data-changed");
  });

  it("before the level beat R is locked; the unlock comes from the served rank-up, per side", () => {
    show(snap("voli.standard", "child3-open"));
    expect(screen.getByTestId("journey-ability-subject-R")).toHaveAttribute("data-locked", "true");
    expect(screen.queryByTestId("journey-unlock-subject-R")).toBeNull();
  });

  it("ahri: level + Q rank + R unlock read as ONE progression moment", () => {
    play("ahri.survival", "child1-beat");
    expect(beat()).toBe("active");
    expect(screen.getAllByTestId("journey-beat-stamp")).toHaveLength(1);
    expect(screen.getByTestId("journey-beat-stamp")).toHaveTextContent("Lv 6 · R unlocked");
    expect(screen.getByTestId("journey-unlock-subject-R")).toBeInTheDocument();
    expect(screen.getByTestId("journey-ability-subject-Q")).toHaveAttribute("data-changed", "true");
  });
});

describe("a grouped beat renders as one coherent moment", () => {
  it("pantheon: level 4 + a first-back Long Sword keeps the recipe's narration in the one stamp", () => {
    play("pantheon.standard", "child4-beat");
    expect(screen.getByTestId("journey-beat-stamp")).toHaveTextContent("Lv 4 · First back");
    expect(screen.getByTestId("journey-item-gain-subject-0")).toHaveTextContent("+10 AD");
  });

  it("level 6 + R + Lee Sin's Cloth Armor: one stamp, one status region, every object in the same beat", () => {
    play("voli.standard", "child4-beat");
    expect(screen.getAllByTestId("journey-beat")).toHaveLength(1);
    expect(screen.getByTestId("journey-beat-stamp")).toHaveTextContent("Lv 6 · R unlocked");
    expect(newItems()).toEqual(["journey-item-opponent-0"]);
    expect(screen.getByTestId("journey-item-gain-opponent-0")).toHaveTextContent("+15 Armor");
    // Assistive tech still gets every line, in the server's order.
    expect(within(screen.getByTestId("journey-beat")).getAllByTestId("journey-beat-line").map((l) => l.textContent))
      .toEqual([
        "Volibear · Level 6", "Volibear · R unlocked", "Volibear · W rank 2 → 3",
        "Lee Sin · Level 6", "Lee Sin · Q rank 2 → 3", "Lee Sin · R unlocked",
        "Lee Sin buys Cloth Armor", "Lee Sin · +15 Armor (Cloth Armor)",
      ]);
  });

  it("the group's beat is the server's 1300 ms, not a sum: it ends at the open instant", () => {
    const s = snap("voli.standard", "child4-beat-start");
    play("voli.standard", "child4-beat-start");
    expect(beat()).toBe("active");
    act(() => { vi.advanceTimersByTime(opensAt(s) - Date.now() - 1); });
    expect(beat()).toBe("active");
    act(() => { vi.advanceTimersByTime(2); });
    expect(beat()).toBe("idle");
    expect(screen.queryByTestId("journey-beat-stamp")).toBeNull();
    expect(screen.queryAllByTestId(/^journey-item-gain-/)).toHaveLength(0);
  });
});

describe("knowledge marks survive the beat, and the beat adds none", () => {
  it("Volibear Q keeps its `!` and its facts through the Caulfield's beat", () => {
    const before = snap("voli.standard", "child1-reveal-late");
    const during = snap("voli.standard", "child2-beat");
    expect(summary(marksOf(during))).toEqual(summary(marksOf(before)));
    play("voli.standard", "child2-beat");
    expect(screen.getByTestId("journey-know-subject-Q")).toBeInTheDocument();
  });

  it("the modified-cooldown fact child 2 asks is NOT a mark until child 2's reveal", () => {
    const asked = wire(snap("voli.standard", "child2-open")).challenges.journey.children[2].learner.asks_fact;
    expect(asked).toBeTruthy();
    for (const label of ["child2-beat-start", "child2-beat", "child2-beat-end", "child2-open", "child2-live"]) {
      const facts = [...marksOf(snap("voli.standard", label)).values()].flatMap((m) => m.facts.map((f) => f.fact));
      expect(facts, label).not.toContain(asked.fact);
    }
    const revealed = [...marksOf(snap("voli.standard", "child2-reveal")).values()].flatMap((m) => m.facts.map((f) => f.fact));
    expect(revealed).toContain(asked.fact);
  });

  it("no ability pulses because of an item: the item → ability link is not in the public data", () => {
    play("voli.standard", "child2-beat");
    expect(screen.getByTestId("journey-ability-subject-Q")).not.toHaveAttribute("data-changed");
    expect(document.querySelectorAll(".journey-kit .journey-changed, [data-testid^='journey-ability-'] .journey-changed"))
      .toHaveLength(0);
  });
});

describe("nothing the beat adds lays out, and the next child replaces it", () => {
  it("the beat's additions are out of flow: sr-only lines, the stamp in the header's own line, an absolute tag", () => {
    play("voli.standard", "child2-beat");
    expect(screen.getByTestId("journey-beat")).toHaveClass("sr-only");
    expect(screen.getByTestId("journey-beat-stamp").closest(".journey-board__eyebrow")).not.toBeNull();
    expect(screen.getByTestId("journey-item-gain-subject-0")).toHaveClass("journey-item-gain");
    // No scrim: nothing covers the board.
    expect(document.querySelector(".journey-beat .absolute.inset-0")).toBeNull();
  });

  it("the board node is the same through the beat and into the next child", () => {
    const r = play("voli.standard", "child2-beat");
    const board = screen.getByTestId("journey-board");
    const band = screen.getByTestId("scenario-hero");
    act(() => { vi.advanceTimersByTime(opensAt(snap("voli.standard", "child2-beat")) - Date.now() + 100); });
    const open = snap("voli.standard", "child2-open");
    vi.setSystemTime(Date.parse(open.at));
    r.rerender(view(open));
    expect(screen.getByTestId("journey-board")).toBe(board);
    expect(screen.getByTestId("scenario-hero")).toBe(band);
    expect(beat()).toBe("idle");
    expect(screen.getByTestId("journey-child")).toBeInTheDocument();
    expect(screen.queryByTestId("journey-beat")).toBeNull();
    expect(screen.queryByTestId("journey-beat-stamp")).toBeNull();
    // The marks outlive the beat; the transient tag does not.
    expect(newItems()).toEqual(["journey-item-subject-0"]);
    expect(screen.queryAllByTestId(/^journey-item-gain-/)).toHaveLength(0);
  });
});

describe("reduced motion", () => {
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
  const motion = css.slice(css.indexOf("JOURNEY-MOTION-V1 — THE BEAT IS THE STATE CHANGING"),
    css.indexOf(".journey-question__content--veiled"));
  const gated = motion.slice(motion.indexOf("@media (prefers-reduced-motion: no-preference)"));

  it("every Journey beat animation is gated behind `prefers-reduced-motion: no-preference`", () => {
    const ungated = motion.slice(0, motion.indexOf("@media (prefers-reduced-motion: no-preference)"));
    expect(ungated).not.toMatch(/animation\s*:/);
    for (const k of ["journey-changed-pulse", "journey-level-roll", "journey-pip-fill", "journey-unlock-art",
      "journey-unlock-lock", "journey-item-in", "journey-gain-in"]) {
      expect(gated).toMatch(new RegExp(`animation: ${k} `));
    }
    // The unlock ghost is hidden unless it is animating.
    expect(ungated).toMatch(/\.journey-unlock-lock \{ display: none;/);
  });

  it("every beat motion finishes inside the 900 ms compact beat", () => {
    for (const m of gated.matchAll(/animation: [\w-]+ ([\d.]+)(ms|s)(?: ([\d.]+)ms)?/g)) {
      const dur = Number(m[1]) * (m[2] === "s" ? 1000 : 1);
      expect(dur + Number(m[3] ?? 0)).toBeLessThanOrEqual(900);
    }
  });

  it("under reduced motion the state still reads, and the beat is still the server's", () => {
    const mm = vi.spyOn(window, "matchMedia").mockImplementation((q: string) => ({
      matches: q.includes("reduce"), media: q, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList);
    try {
      const s = snap("voli.standard", "child4-beat");
      play("voli.standard", "child4-beat");
      expect(beat()).toBe("active");
      expect(screen.getByTestId("journey-beat-stamp")).toHaveTextContent("Lv 6 · R unlocked");
      expect(screen.getByTestId("journey-level-subject")).toHaveAttribute("data-changed", "true");
      expect(screen.getByTestId("journey-item-gain-opponent-0")).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(opensAt(s) - Date.now() - 1); });
      expect(beat()).toBe("active");
      act(() => { vi.advanceTimersByTime(2); });
      expect(beat()).toBe("idle");
    } finally {
      mm.mockRestore();
    }
  });
});

describe("the stamp and tag helpers (pure)", () => {
  const t = (events: JourneyTransition["events"]): JourneyTransition =>
    ({ fromNode: "a", toNode: "b", label: null, events, beat: { ms: 900, until: null } });

  it("a progression beat is one short stamp; a purchase alone names its kind", () => {
    expect(beatShortStamp(t([
      { kind: "level", side: "subject", from: 5, to: 6 }, { kind: "ability_unlock", side: "subject", slot: "R" },
      { kind: "purchase", side: "opponent", group: null, items: [{ slot: 0, itemId: 1029, name: "Cloth Armor" }] },
    ]))).toBe("Lv 6 · R unlocked");
    expect(beatShortStamp(t([{ kind: "level", side: "subject", from: 5, to: 6 },
      { kind: "level", side: "opponent", from: 4, to: 5 }]))).toBe("Level up");
    expect(beatShortStamp(t([{ kind: "purchase", side: "subject", group: null,
      items: [{ slot: 1, itemId: 1036, name: "Long Sword" }] }]))).toBe("Purchase");
    expect(beatShortStamp(t([{ kind: "ability_rank", side: "subject", slot: "Q", from: 1, to: 2 }]))).toBe("Rank up");
    expect(beatShortStamp(t([{ kind: "level", side: "subject", from: 3, to: 4 },
      { kind: "purchase", side: "subject", group: "first_back", items: [{ slot: 0, itemId: 1036, name: "Long Sword" }] },
    ]))).toBe("Lv 4 · First back");
    expect(beatStamps(t([{ kind: "ability_unlock", side: "subject", slot: "R" },
      { kind: "level", side: "subject", from: 5, to: 6 }]))).toEqual(["Ultimate unlocked", "Level up"]);
  });

  it("a gain tag needs a stat line whose source is an item this transition bought on that side", () => {
    const tags = itemGainTags(t([
      { kind: "purchase", side: "subject", group: null, items: [{ slot: 2, itemId: 3133, name: "Caulfield's Warhammer" }] },
      { kind: "stat_change", side: "subject", key: "ability_haste", delta: 10, source: "Caulfield's Warhammer" },
      // Same item name, other side: not this slot's line.
      { kind: "stat_change", side: "opponent", key: "armor", delta: 15, source: "Caulfield's Warhammer" },
      // A stat line with no bought source, and a from/to delta: never an item tag.
      { kind: "stat_change", side: "subject", key: "armor", delta: 5, source: null },
      { kind: "stat_delta", side: "subject", key: "armor", from: 30, to: 35 },
    ]));
    expect([...tags]).toEqual([["subject:2", ["+10 AH"]]]);
  });
});
