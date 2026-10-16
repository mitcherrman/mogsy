/**
 * JATTN1 — THE BOARD'S ATTENTION GRAMMAR in the DOM, on REAL captures from the
 * JATTN1 backend (`__fixtures__/jattn1/`), through the production module
 * (`masterySliceModule`) exactly as every host draws it:
 *
 * JUX1-F1 (owner-approved language) replaced three of JATTN1's looks:
 *
 *   CHANGED  the state stays on the object (`journey-changed`, `data-new`,
 *            the struck level) but draws no green rim and no green pulse;
 *   SAVED    the persistent gold `!`; the moment it is saved the OBJECT
 *            ARRIVES (`data-arrival`: the double flash) for ~1.6s — live
 *            only, never on a reload; one polite "Saved to the board: …"
 *            line in the reveal region. A purchase watched live arrives the
 *            same way on its slot, once;
 *   RELEVANT a continuous gold ring on what the question is about (the
 *            server's focus; both sides of a comparison), "relevant to this
 *            question" in their accessible names; no popover ever opens.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { resetKnowledgeCoach } from "@/components/journey/useKnowledgeCoach";
import { SAVED_NOW_MS } from "@/components/journey/useSavedNow";
import { ITEM_ARRIVAL_MS } from "@/components/journey/useItemArrivals";
import { masterySliceModule } from "./masterySliceModule";

const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__");
type Wire = Record<string, unknown>;
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(FIX, `${n}.json`), "utf8"));
const answersOf = (n: string) => {
  const [dir, file] = n.split("/");
  return JSON.parse(readFileSync(join(FIX, dir, "answers", `${file}.answers.json`), "utf8")) as
    { index: number; correct_answer: string }[];
};
const snap = (n: string, label: string) => {
  const s = load(n).find((x) => x.label === label);
  if (!s) throw new Error(`${n}: ${label}`);
  return s;
};
const seg = (s: CaptureSnapshot) => (s.envelope.payload as { segment_state: Wire | null }).segment_state;

const Viewport = masterySliceModule.Viewport;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function view(s: CaptureSnapshot) {
  const round = readPublicRound(s.envelope);
  return (
    <QueryClientProvider client={queryClient}>
      <Viewport publicRound={round} segmentState={round.segmentState} selection={null}
        permissions={NO_INTERACTIONS} onSelect={() => {}}
        actions={{ submitChallenge: (() => {}) as never, busy: false, error: null }} skewMs={0} />
    </QueryClientProvider>
  );
}
function show(s: CaptureSnapshot) {
  vi.setSystemTime(Date.parse(s.at));
  return render(view(s));
}
/** From `from` to `to` (labels), polling as a client does; `visit` after each. */
function play(n: string, from: string, to: string, visit: (s: CaptureSnapshot) => void = () => {}) {
  // In capture order by server instant (a reconnect read can precede a late read).
  const all = load(n).filter((s) => seg(s) !== null).map((s, i) => [s, i] as const)
    .sort(([x, i], [y, j]) => Date.parse(x.at) - Date.parse(y.at) || i - j).map(([s]) => s);
  const a = all.findIndex((s) => s.label === from);
  const b = all.findIndex((s) => s.label === to);
  const run = all.slice(a, b + 1);
  vi.setSystemTime(Date.parse(run[0].at));
  const r = render(view(run[0]));
  visit(run[0]);
  for (let i = 1; i < run.length; i++) {
    act(() => { vi.advanceTimersByTime(Date.parse(run[i].at) - Date.parse(run[i - 1].at)); });
    vi.setSystemTime(Date.parse(run[i].at));
    r.rerender(view(run[i]));
    visit(run[i]);
  }
  return r;
}
const q = (id: string) => screen.queryByTestId(id);
/** JUX1-F1 — the objects arriving right now (the double flash), by test id. */
const arrivals = () => [...document.querySelectorAll<HTMLElement>('[data-arrival="true"]')].map((t) => t.dataset.testid).sort();
const reticles = () => [...document.querySelectorAll<HTMLElement>(".journey-reticle")].map((t) => t.dataset.testid).sort();
const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8").replace(/\r\n/g, "\n");

const REF = "jattn1/zed_ahri.reference";
const EXT = "jattn1/ashe_jinx.extended";
const EXT_WRONG = "jattn1/ashe_jinx.extended.wrong";

vi.setConfig({ testTimeout: 25_000 });
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); resetKnowledgeCoach(); });
afterEach(() => { cleanup(); vi.useRealTimers(); resetKnowledgeCoach(); document.documentElement.classList.remove("reduce-motion"); });

// JUX1-F1: the transient "Saved" tag became the ARRIVAL moment — the object
// itself carries `data-arrival` (the stylesheet's double flash) for the same
// window, on the same object, from the same source (`useSavedNow`).
describe("SAVED — the `!` stays, the arrival is a moment", () => {
  it("Step 1's reveal saves Ashe W: THAT tile arrives for ~1.6s, then only the `!`", () => {
    play(EXT, "child0-live", "child0-reveal");
    expect(arrivals()).toEqual(["journey-ability-host-subject-W"]);
    expect(document.querySelector(".journey-saved-tag")).toBeNull();     // no transient tag any more
    expect(q("journey-know-subject-W")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(SAVED_NOW_MS + 10); });
    expect(arrivals()).toEqual([]);
    expect(q("journey-know-subject-W")).toBeInTheDocument();
  });

  it("a wrong answer saves the same fact, with the same cue — and never says correct", () => {
    play(EXT_WRONG, "child0-live", "child0-reveal");
    expect(q("journey-reveal-verdict")).toHaveAttribute("data-correct", "false");
    expect(arrivals()).toEqual(["journey-ability-host-subject-W"]);
    const line = q("journey-saved-line")!;
    expect(line.textContent).toMatch(/Saved to the board: Ashe W cooldown, \d+ seconds$/);
    expect(line.textContent).not.toMatch(/correct|learned/i);
    expect(q("journey-reveal")!.contains(line)).toBe(true);           // the existing polite region
  });

  it("a champion stat: the portrait arrives, and its `!` means SAVED", () => {
    play(EXT, "child2-live", "child2-reveal");
    expect(arrivals()).toEqual(["journey-portrait-host-opponent"]);
    expect(q("journey-portrait-popup-opponent-mark")).toBeInTheDocument();
    expect(q("journey-portrait-popup-opponent")).toHaveAccessibleName(/saved facts to review/);
  });

  it("a reload in the middle of a reveal replays nothing: the `!` is simply there", () => {
    show(snap(EXT, "child0-reveal"));
    expect(q("journey-know-subject-W")).toBeInTheDocument();
    expect(arrivals()).toEqual([]);
  });

  it("a stated premise stat is inspectable but wears no `!` (Zed's bonus AD at Step 2)", () => {
    show(snap(REF, "child1-live"));
    expect(q("journey-portrait-popup-subject")).toHaveAttribute("data-known", "true");
    expect(q("journey-portrait-popup-subject-mark")).toBeNull();
  });
});

describe("ONE Saved rule in the DOM: a knowledge arrival always lands on an object wearing its `!`", () => {
  it.each([[EXT], [EXT_WRONG], [REF], ["jattn1/zed_ahri.reference.timeout"], ["jattn1/voli.standard"], ["jattn1/voli.survival"]])(
    "%s, played end to end", (n) => {
      const all = load(n).filter((s) => seg(s) !== null);
      let tags = 0;
      play(n, all[0].label, all[all.length - 1].label, (s) => {
        const knowledge = arrivals().filter((id) => !id!.startsWith("journey-item-"));
        // The moment lives inside the reveal hold only.
        if (knowledge.length) expect(q("journey-reveal"), `${n} ${s.label}`).not.toBeNull();
        for (const id of knowledge) {
          tags++;
          const portrait = /^journey-portrait-host-(subject|opponent)$/.exec(id!);
          const ability = /^journey-ability-host-(subject|opponent)-([QWER])$/.exec(id!);
          const mark = portrait ? q(`journey-portrait-popup-${portrait[1]}-mark`) : q(`journey-know-${ability![1]}-${ability![2]}`);
          expect(mark, `${n} ${s.label} ${id}`).not.toBeNull();
          // …and the reveal's polite line says it, in the same region.
          expect(q("journey-saved-line")?.textContent ?? "", `${n} ${s.label}`).toMatch(/^ ?Saved to the board: /);
        }
      });
      expect(tags, n).toBeGreaterThan(0);
    });

  it("a damage-after-armor reveal (unmarked, state-bound) claims nothing: no tag, no saved line", () => {
    play(EXT, "child3-live", "child3-reveal-late", (s) => {
      if (!s.label.startsWith("child3-reveal")) return;
      expect(q("journey-reveal"), s.label).not.toBeNull();             // its own reveal still runs
      expect(arrivals(), s.label).toEqual([]);
      expect(q("journey-saved-line"), s.label).toBeNull();
    });
  });
});

describe("RELEVANT NOW — a gold ring from the server's focus", () => {
  it("a Combat child after armor: the attacker's ability AND the target's portrait (`target_stat: armor`)", () => {
    show(snap(EXT, "child3-live"));
    expect(reticles()).toEqual(["journey-portrait-popup-opponent-relevant", "journey-relevant-subject-W"]);
    expect(screen.getByTestId("journey-ability-subject-W")).toHaveAccessibleName(/relevant to this question$/);
    expect(q("journey-portrait-popup-opponent")).toHaveAccessibleName(/relevant to this question$/);
    // Inspectable W carries it on its `!` too (its keyboard target).
    expect(q("journey-know-subject-W")).toHaveAccessibleName(/relevant to this question$/);
  });

  it("a raw-damage child names no target stat: only the ability", () => {
    show(snap(EXT, "child1-live"));
    expect(reticles()).toEqual(["journey-relevant-subject-W"]);
  });

  it("Ashe R vs Jinx R: both R tiles, symmetric; Jinx R has no `!`; no value anywhere on the board", () => {
    show(snap(EXT, "child10-live"));
    expect(reticles()).toEqual(["journey-relevant-opponent-R", "journey-relevant-subject-R"]);
    expect(q("journey-know-opponent-R")).toBeNull();
    expect(q("journey-know-subject-R")).toBeInTheDocument();
    // No popover content is in the DOM (the cue opens nothing), and the board
    // never draws the comparison's answer (a champion).
    expect(document.querySelector("[data-radix-popper-content-wrapper]")).toBeNull();
    const winner = String(answersOf(EXT)[10].correct_answer);
    expect(screen.getByTestId("journey-board").textContent).not.toContain(`${winner} wins`);
    // The relevant opponent R tile is not focusable: nothing is there to inspect.
    const jinxR = screen.getByTestId("journey-ability-opponent-R");
    expect(jinxR.closest(".journey-know-host")!.querySelector("button")).toBeNull();
  });

  it("the ring is drawn per child (keyed on the step): one continuous gold ring, steady, no rails", () => {
    show(snap(EXT, "child3-live"));
    expect(screen.getByTestId("journey-relevant-subject-W")).toHaveAttribute("data-step", "3");
    const rule = /\.journey-reticle \{[\s\S]*?\n\}/.exec(CSS)![0];
    // A continuous ring: an inset line in the object's outset box, in the ring's gold.
    expect(rule).toMatch(/inset 0 0 0 var\(--jattn-line\) rgb\(var\(--jattn-ring\)/);
    expect(CSS).toMatch(/--jattn-ring: 255 208 88;/);
    // Not the `!` badge's gold, never ice, never animated (no blinking), and no rails.
    expect(rule).not.toMatch(/232 201 122|#e8c97a|animation/i);
    expect(CSS).not.toMatch(/jattn-ice|\.journey-reticle::(before|after)|journey-reticle-in/);
    expect(CSS).not.toMatch(/\.journey-portrait-btn\[data-focus="true"\]/);
  });

  it("no popover opens by itself on any snapshot of the extended Journey", () => {
    play(EXT, "child0-leadin", "finished", (s) => {
      expect(document.querySelector("[data-radix-popper-content-wrapper]"), s.label).toBeNull();
      expect(document.querySelector('[aria-haspopup="dialog"][data-state="open"]'), s.label).toBeNull();
    });
  });
});

describe("CHANGED — the state, without a rim (JUX1-F1)", () => {
  it("the Pickaxe slot and the ranked-up W tile keep the changed state for their child, but draw no green rim", () => {
    show(snap(EXT, "child4-live"));
    const pickaxe = document.querySelector<HTMLElement>('[data-testid^="journey-item-subject-"][data-item-id="1037"]')!;
    expect(pickaxe.className).toContain("journey-changed");
    expect(pickaxe.className).not.toContain("ring-1");                 // the old outer ring is gone
    cleanup();
    show(snap(EXT, "child6-live"));
    const tile = screen.getByTestId("journey-ability-subject-W").firstElementChild!;
    expect(tile.className).toContain("journey-changed");               // ability tiles keep it now
    expect(screen.getByTestId("journey-level-subject")).toHaveAttribute("data-changed", "true");
    cleanup();
    show(snap(EXT, "child7-live"));
    expect(screen.getByTestId("journey-ability-subject-W").firstElementChild!.className).not.toContain("journey-changed");
    // No green rim and no green beat pulse: the values (struck level, new rank digit, gain tag) say it.
    expect(CSS).not.toMatch(/\.journey-changed::after|jattn-green|journey-changed-pulse/);
  });

  it("a bought item arrives live on its slot — once; a mount mid-beat replays nothing", () => {
    play(EXT, "child3-reveal-end", "child4-beat-start");
    const pickaxe = document.querySelector<HTMLElement>('[data-testid^="journey-item-subject-"][data-item-id="1037"]')!;
    expect(arrivals()).toEqual([pickaxe.dataset.testid]);
    act(() => { vi.advanceTimersByTime(ITEM_ARRIVAL_MS + 10); });
    expect(arrivals()).toEqual([]);
    cleanup();
    show(snap(EXT, "child4-beat-start"));                               // a reload in the beat
    expect(arrivals()).toEqual([]);
    expect(document.querySelector<HTMLElement>('[data-item-id="1037"]')).toHaveAttribute("data-new", "true");
  });

  it("the same purchase re-delivered by later polls, and the next questions, flash nothing more", () => {
    // Count arrivals STARTING (the attribute newly appearing): the one window
    // that opens at the beat may still be open at the next poll; it never reopens.
    let starts = 0;
    let prev = new Set<string>();
    play(EXT, "child3-reveal-end", "child5-live", () => {
      const now = new Set(arrivals().filter((id) => id!.startsWith("journey-item-")) as string[]);
      for (const id of now) if (!prev.has(id)) starts++;
      prev = now;
    });
    expect(starts).toBe(1);
  });

  it("the Pickaxe's own stat line joins its slot by item id during the beat", () => {
    show(snap(EXT, "child4-beat"));
    const tag = document.querySelector<HTMLElement>(".journey-item-gain")!;
    expect(tag).toHaveTextContent("+25 AD");
  });
});

describe("every host, the same grammar", () => {
  it.each([
    ["Daily Standard", "jattn1/voli.standard", "child1-live", ["journey-portrait-popup-opponent-relevant", "journey-relevant-subject-Q"]],
    ["Survival", "jattn1/voli.survival", "child2-live", ["journey-portrait-popup-opponent-relevant", "journey-relevant-subject-Q"]],
    ["admin reference", REF, "child3-live", ["journey-portrait-popup-opponent-relevant", "journey-relevant-subject-E"]],
  ])("%s", (_host, n, label, expected) => {
    show(snap(n, label));
    expect(reticles()).toEqual(expected);
  });

  it("nothing in the grammar knows which host it is in", () => {
    for (const f of ["src/lib/journey/attention.ts", "src/components/journey/useSavedNow.ts",
      "src/components/journey/useKnowledgeCoach.ts", "src/components/journey/JourneyStateBoard.tsx"]) {
      expect(readFileSync(resolve(process.cwd(), f), "utf8"), f).not.toMatch(/journey_library|journeyLibrary|\.plan\b|hostOf|data-host/);
    }
  });
});

describe("mobile, keyboard and reduced motion (stylesheet)", () => {
  it("every `!` keeps a ≥ 24px tap target; the ability's grows around a small tile", () => {
    expect(CSS).toMatch(/\.journey-know \{ width: 0\.625rem; height: 0\.625rem;[^}]*\}\n\.journey-know::before \{ inset: -7px; \}/);
    expect(CSS).toMatch(/--jattn-grow: max\(0px, calc\(\(24px - var\(--jb-ability\)\) \/ 2\)\)/);
  });

  it("the double flash and the portalled coach obey both reduced-motion switches", () => {
    const flash = CSS.slice(CSS.indexOf("JUX1-F1 — ARRIVING: THE DOUBLE FLASH."));
    // Exactly two flashes, declared only where motion is welcome.
    expect(flash).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\n[^@]*animation: journey-arrival-flash 380ms ease-in-out 2;/);
    expect(flash.match(/animation: journey-arrival-flash/g)).toHaveLength(1);
    // Without motion: a still white-gold edge (the OS switch, and the app's).
    expect(flash).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\n[^@]*box-shadow: 0 0 0 2px rgb\(var\(--jattn-flash\)/);
    expect(flash).toMatch(/html\.reduce-motion \.journey-items > \[data-arrival="true"\] \{\n {2}box-shadow:/);
    expect(CSS).toMatch(/html\.reduce-motion \.journey-board \* \{ animation: none !important; \}/);
    expect(CSS).toMatch(/html\.reduce-motion \.journey-coach,\nhtml\.reduce-motion \.journey-coach \* \{ animation: none !important; transition: none !important; \}/);
    // Never green, never the whole board.
    expect(/@keyframes journey-arrival-flash \{[\s\S]*?\n\}/.exec(CSS)![0]).not.toMatch(/143 208 160|jattn-green/);
    expect(flash).not.toMatch(/\.journey-board\[data-arrival|\.journey-board \{/);
  });

  it("under the app's Reduce Motion the states still appear (no movement, same DOM)", () => {
    document.documentElement.classList.add("reduce-motion");
    play(EXT, "child0-live", "child0-reveal");
    expect(arrivals()).toEqual(["journey-ability-host-subject-W"]);
    expect(reticles()).toEqual(["journey-relevant-subject-W"]);
  });
});
