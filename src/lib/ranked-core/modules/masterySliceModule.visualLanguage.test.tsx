/**
 * JP3 — THE JOURNEY VISUAL LANGUAGE, on the REAL captures (the Zed/Ahri
 * reference Journey — correct, wrong, timed out — and the Daily M1 Journeys),
 * through the production parser and `masterySliceModule`.
 *
 * jsdom has no layout: the art crops, the host proportions and the pixel
 * geometry are certified in a real browser (`JP3_HANDOFF.md`). Held here:
 *
 *   * one learned-knowledge grammar (a learned value fills the board's `?`;
 *     its `!` rides on the object it is about) — correctness never read;
 *   * the one-shot "just learned" glow, which follows the ledger, not the verdict;
 *   * the micro-chain: reached steps named from served asks, future steps bare;
 *   * the display-precision policy: no derived decimal in the normal UI, the
 *     canonical taught decimals (92.5) kept;
 *   * the board art's source order, and the host / parchment stylesheet rules.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { journeyViewFor } from "@/lib/journey/adapter";
import { chainNoun, journeyChain } from "@/lib/journey/chain";
import { JourneyStateBoard } from "@/components/journey/JourneyStateBoard";
import { displayExplanation } from "@/components/journey/JourneyCalcFlow";
import { exactValueNote } from "@/lib/journey/stats";
import { MasteryAssetsContext } from "@/features/mastery/player/MasteryAssets";
import { masterySliceModule } from "./masterySliceModule";

const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__");
const load = (file: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(FIX, `${file}.json`), "utf8"));
const REF = "jref/zed_ahri.reference";
const WRONG = "jref/zed_ahri.reference.wrong";
const TIMEOUT = "jref/zed_ahri.reference.timeout";
type Wire = Record<string, unknown>;
const seg = (s: CaptureSnapshot) => (s.envelope.payload as { segment_state: Wire | null }).segment_state;
const live = (file: string) => load(file).filter((s) => seg(s) !== null);
const snap = (file: string, label: string) => {
  const s = load(file).find((x) => x.label === label);
  if (!s) throw new Error(`${file}: ${label}`);
  return s;
};

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
/** Every snapshot in server order, one mounted module, the way a client polls. */
function play(file: string, visit: (s: CaptureSnapshot) => void) {
  const all = live(file).map((s, i) => [s, i] as const)
    .sort(([a, i], [b, j]) => Date.parse(a.at) - Date.parse(b.at) || i - j).map(([s]) => s);
  vi.setSystemTime(Date.parse(all[0].at));
  const r = render(view(all[0]));
  visit(all[0]);
  for (let i = 1; i < all.length; i++) {
    act(() => { vi.advanceTimersByTime(Date.parse(all[i].at) - Date.parse(all[i - 1].at)); });
    vi.setSystemTime(Date.parse(all[i].at));
    r.rerender(view(all[i]));
    visit(all[i]);
  }
  return r;
}
// JP4 — the JP3 "micro-chain" is the JOURNEY PATH (curriculum progress), named
// apart from a reveal's Reasoning Chain.
const chainNow = () => [...document.querySelectorAll<HTMLElement>("[data-testid^='journey-path-']")]
  .map((n) => `${n.dataset.state}:${n.querySelector(".journey-path__label")?.textContent ?? ""}`).join(" ");
const fresh = () => [...document.querySelectorAll<HTMLElement>("[data-just-learned='true']")]
  .map((e) => e.dataset.testid).sort();
const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("one learned-knowledge grammar: the board is the notebook", () => {
  it("no 'recall' pill anywhere once the learner holds the value (every reference snapshot, all three paths)", () => {
    for (const file of [REF, WRONG, TIMEOUT]) {
      for (const s of live(file)) {
        const { unmount } = show(s);
        const board = screen.queryByTestId("journey-board");
        if (board) expect(board.textContent ?? "", `${file} ${s.label}`).not.toMatch(/recall/i);
        unmount();
      }
    }
  });

  it("JP4 — `?` → value → settled `!`: each value arrives at its reveal, then lives on its object's mark", () => {
    const seen: string[] = [];
    play(REF, (s) => {
      const raw = screen.queryByTestId("journey-readout-subject-E");
      const armor = screen.queryByTestId("journey-stat-opponent-armor");
      seen.push(`${s.label}|raw=${raw ? `${raw.dataset.face}:${raw.textContent}` : "-"}|armor=${
        armor ? `${armor.dataset.face}:${armor.textContent}` : "-"}`);
    });
    const at = (label: string) => seen.find((x) => x.startsWith(`${label}|`))!;
    expect(at("child0-live")).toBe("child0-live|raw=-|armor=-");
    // Asked: the `?` on its anchor ("Raw damage" long, "Raw" short: one shows per density).
    expect(at("child1-live")).toBe("child1-live|raw=asked:Raw damageRaw?|armor=-");
    // The reveal moment: the value arrives, with its `!`.
    expect(at("child1-reveal")).toBe("child1-reveal|raw=revealed:Raw damageRaw85!|armor=-");
    // Settled: the raw damage is Zed E's `!` — not reprinted.
    expect(at("child2-live")).toBe("child2-live|raw=-|armor=asked:Armor?");
    expect(at("child2-reveal")).toBe("child2-reveal|raw=-|armor=revealed:Armor24!");
    // Settled and relied on: the armor's anchor and its `!`; the value is a recall.
    expect(at("child3-live")).toBe("child3-live|raw=-|armor=learned:Armor!");
  });

  it("the learning glow follows the LEDGER: right, wrong and timed-out reveals all glow the same fact once", () => {
    for (const file of [REF, WRONG]) {
      const glows: string[] = [];
      play(file, (s) => { glows.push(`${s.label}:${fresh().join(",")}`); });
      const at = (label: string) => glows.find((x) => x.startsWith(`${label}:`))!.slice(label.length + 1);
      // The glow arrives WITH the reveal that establishes the fact…
      expect(at("child0-reveal"), file).toBe("journey-know-subject-E");
      expect(at("child1-reveal"), file).toBe("journey-know-subject-E,journey-know-subject-readout-E,journey-readout-subject-E");
      expect(at("child2-reveal"), file).toBe("journey-know-opponent-stat-armor,journey-stat-opponent-armor");
      // …and never on a live child (nothing is learned before its reveal).
      expect(at("child1-live"), file).toBe("");
      cleanup();
    }
    // A timed-out final reveal teaches Combat damage after armor, which the
    // board never anchors — so it glows nothing, and every earlier fact stays.
    const glows: string[] = [];
    play(TIMEOUT, (s) => { glows.push(`${s.label}:${fresh().join(",")}`); });
    expect(glows.find((x) => x.startsWith("child3-timeout-reveal:"))).toBe("child3-timeout-reveal:");
    expect(screen.getByTestId("journey-stat-opponent-armor")).toHaveAttribute("data-face", "learned");
  });

  it("the glow settles: ~1.6s later the value keeps its revealed face without the glow", () => {
    const all = live(REF);
    const i = all.findIndex((s) => s.label === "child1-reveal");
    vi.setSystemTime(Date.parse(all[i - 1].at));
    const r = render(view(all[i - 1]));
    vi.setSystemTime(Date.parse(all[i].at));
    r.rerender(view(all[i]));
    expect(screen.getByTestId("journey-readout-subject-E")).toHaveAttribute("data-just-learned", "true");
    act(() => { vi.advanceTimersByTime(1700); });
    expect(screen.getByTestId("journey-readout-subject-E")).not.toHaveAttribute("data-just-learned");
    expect(screen.getByTestId("journey-readout-subject-E")).toHaveAttribute("data-face", "revealed");
  });

  it("a fresh mount (a reload) replays no glow — the notebook is simply there", () => {
    show(snap(REF, "child3-live"));
    expect(fresh()).toEqual([]);
    expect(screen.getByTestId("journey-stat-opponent-armor")).toHaveAttribute("data-face", "learned");
  });

  it("the State sheet speaks the same grammar: Ahri's armor reads '24 · learned Step 3', not 'recall it'", () => {
    show(snap(REF, "child3-live"));
    fireEvent.click(screen.getByTestId("journey-open-state"));
    const row = screen.getByTestId("journey-sheet-stat-opponent-armor");
    expect(row).toHaveTextContent("Armor24 · learned Step 3");
    expect(row.textContent).not.toMatch(/recall/i);
  });

  it("a Daily Journey keeps the same grammar (K1 Pantheon: Leona's armor fills its chip)", () => {
    show(snap("k1/pantheon.standard", "child0-reveal"));
    expect(screen.getByTestId("journey-stat-opponent-armor")).toHaveAttribute("data-face", "revealed");
    expect(screen.getByTestId("journey-know-opponent-stat-armor")).toBeInTheDocument();
  });
});

describe("the Journey Path (JP3 micro-chain)", () => {
  it("names REACHED steps from their served asks; future steps are bare (the server has not published them)", () => {
    const at: Record<string, string> = {};
    play(REF, (s) => { at[s.label] = chainNow(); });
    expect(at["child0-live"]).toBe("current:Formula future: future: future:");
    expect(at["child1-live"]).toBe("done:Formula current:Raw damage future: future:");
    // During a reveal the step on screen is DONE (its fact is established)…
    expect(at["child2-reveal"]).toBe("done:Formula done:Raw damage done:Armor future:");
    // …and stays done after its reveal window, while the next step opens.
    expect(at["child2-reveal-late"]).toMatch(/^done:Formula done:Raw damage done:Armor /);
    expect(at["child3-live"]).toBe("done:Formula done:Raw damage done:Armor current:Final damage");
    expect(at["finished"]).toBe("done:Formula done:Raw damage done:Armor done:Final damage");
  });

  it("…whatever the verdict: the wrong and timed-out paths draw the identical chain", () => {
    for (const [file, label] of [[WRONG, "child2-reveal"], [TIMEOUT, "child2-reveal"]] as const) {
      show(snap(file, label));
      expect(chainNow(), file).toBe("done:Formula done:Raw damage done:Armor future:");
      cleanup();
    }
  });

  it("the vocabulary is generic: served family/metric keys, never a champion, an ability or a recipe", () => {
    expect(chainNoun({ family: "ability_damage_formula", metric: "ability_damage_formula", subjectRef: "E" })).toBe("Formula");
    expect(chainNoun({ family: "combat_ability_raw_damage", metric: "ability_physical_damage_before_armor", subjectRef: "Q" })).toBe("Raw damage");
    expect(chainNoun({ family: "combat_ability_damage", metric: "ability_magic_damage_after_magic_resist", subjectRef: "Q" })).toBe("Final damage");
    expect(chainNoun({ family: "champion_stat_level", metric: "base_magic_resist", subjectRef: "" })).toBe("MR");
    expect(chainNoun({ family: "ability_cooldown_rank", metric: "ability_cooldown", subjectRef: "R" })).toBe("R cooldown");
    expect(chainNoun({ family: "combat_cooldown", metric: "ability_cooldown", subjectRef: "Q" })).toBe("Q haste CD");
    expect(chainNoun({ family: "ability_cooldown_compare", metric: "ability_cooldown", subjectRef: "E" })).toBe("E compare");
    expect(chainNoun({ family: "something_new", metric: "unheard_of", subjectRef: "" })).toBeNull();
    // Future nodes are never labelled, even if a caller passes more children.
    const reached = [{ index: 0, asks: { engine: "champion", family: "ability_damage_formula", metric: "ability_damage_formula", subjectRef: "E", subject: "X" } }];
    expect(journeyChain(reached, 3, 0, false).map((n) => [n.state, n.label]))
      .toEqual([["current", "Formula"], ["future", null], ["future", null]]);
    const src = readFileSync(resolve(process.cwd(), "src/lib/journey/chain.ts"), "utf8");
    expect(src).not.toMatch(/zed|ahri|shadow slash|volibear|pantheon/i);
  });

  it("Daily Journeys get their own chain from their own asks (M1 Pantheon, 5 steps)", () => {
    show(snap("m1/pantheon.standard", "child3-live"));
    expect(chainNow()).toBe("done:Armor done:E compare done:Final damage current:Final damage future:");
  });
});

describe("display precision (owner lock)", () => {
  /**
   * Decimals visible in the stage's TEXT (exact values live in hover titles and
   * the Reasoning Chain's exact-working card, closed here). JP4: the armor
   * formula node's "≈ 0.806" is the served multiplier, drawn as the formula it
   * is — the one coefficient the primary chain shows.
   */
  const visibleDecimals = () => {
    const stage = screen.getByTestId("journey-stage").cloneNode(true) as HTMLElement;
    stage.querySelectorAll(".journey-node--formula .journey-node__value").forEach((n) => n.remove());
    return (stage.textContent ?? "").match(/×?\d+\.\d+/g) ?? [];
  };
  // Canonical TAUGHT decimals: the formula's own rank values, as served.
  const TAUGHT = new Set(["92.5", "137.5", "182.5", "12.5"]);

  it("no derived decimal on any reference snapshot; the taught 92.5 and the served ×coefficient stay", () => {
    for (const file of [REF, WRONG, TIMEOUT]) {
      for (const s of live(file)) {
        const { unmount } = show(s);
        if (screen.queryByTestId("journey-stage")) {
          const derived = visibleDecimals().filter((d) => !d.startsWith("×") && !TAUGHT.has(d));
          expect(derived, `${file} ${s.label}`).toEqual([]);
        }
        unmount();
      }
    }
    show(snap(REF, "child0-live"));
    expect(screen.getByTestId("journey-stage").textContent).toContain("70 / 92.5 / 115 / 137.5 / 160");
  });

  it("the Daily Journeys too (M1 Volibear / Pantheon / Ahri Survival: 68.8675 AD, 50.08 armor, 10.909s…)", () => {
    for (const file of ["m1/voli.standard", "m1/pantheon.standard", "m1/ahri.survival"]) {
      for (const s of live(file)) {
        const { unmount } = show(s);
        if (screen.queryByTestId("journey-stage")) {
          // A Daily Combat child STATES its formula (canonical, e.g. 1.6 ratios are
          // percentages): only the stated-formula line may carry a taught decimal.
          const stated = screen.queryByTestId("journey-stated-formula")?.textContent ?? "";
          const derived = visibleDecimals().filter((d) => !d.startsWith("×") && !stated.includes(d));
          expect(derived, `${file} ${s.label}`).toEqual([]);
        }
        unmount();
      }
    }
  });

  it("a served 'which rounds to N' sentence reads with the whole value; the exact one is a note, never 'rounded up'", () => {
    expect(displayExplanation("Ahri's Armor at level 2: 24.024 armor, which rounds to 24 for this question.")).toEqual({
      text: "Ahri's Armor at level 2: 24 armor.",
      exact: "Exact value 24.024 · shown as 24, rounded for display. Calculations use the exact value.",
    });
    expect(displayExplanation("Ahri Q cooldown: 7 seconds.")).toEqual({ text: "Ahri Q cooldown: 7 seconds.", exact: null });
    expect(displayExplanation("Leona wins by 10 seconds.").exact).toBeNull();
    // Every exact-value note the UI can produce says "rounded for display".
    for (const n of [84.56, 24.024, 20.8, 68.1804, 0.5, 2.5]) {
      expect(exactValueNote(n)).toMatch(/rounded for display/);
      expect(exactValueNote(n)).not.toMatch(/rounded up|rounded down/i);
    }
  });
});

describe("the board's champion art", () => {
  const board = (assets: Parameters<typeof MasteryAssetsContext.Provider>[0]["value"]) => {
    const s = snap(REF, "child3-live");
    const segState = readPublicRound(s.envelope).segmentState!;
    const v = journeyViewFor(segState.journey, {
      ownNextChallengeIndex: segState.ownNextChallengeIndex, ownCardStartedAt: segState.ownCardStartedAt,
      ownFinished: segState.ownFinished,
    })!;
    render(<MasteryAssetsContext.Provider value={assets}><JourneyStateBoard state={v.board} /></MasteryAssetsContext.Provider>);
  };

  it("loading-screen art first (composed on the champion), the splash if it fails, decorative only", () => {
    board({
      championIconUrl: () => null, itemIconUrl: () => null,
      championLoadingUrl: (_id, name) => `loading:${name}`, championSplashUrl: (_id, name) => `splash:${name}`,
    });
    const zed = screen.getByTestId("journey-art-subject");
    expect(zed).toHaveAttribute("aria-hidden", "true");
    expect(zed).toHaveAttribute("data-art", "loading");
    expect(zed.querySelector("img")).toHaveAttribute("src", "loading:Zed");
    fireEvent.error(zed.querySelector("img")!);
    expect(screen.getByTestId("journey-art-subject")).toHaveAttribute("data-art", "splash");
    expect(screen.getByTestId("journey-art-subject").querySelector("img")).toHaveAttribute("src", "splash:Zed");
    expect(screen.getByTestId("journey-art-opponent").querySelector("img")).toHaveAttribute("src", "loading:Ahri");
    // A board-level layer (outer edges), not inside a side's content.
    expect(screen.getByTestId("journey-side-subject")).not.toContainElement(zed);
  });

  it("no resolver draws no art and no box", () => {
    board({ championIconUrl: () => null, itemIconUrl: () => null });
    expect(screen.queryByTestId("journey-art-subject")).toBeNull();
    expect(screen.queryByTestId("journey-art-opponent")).toBeNull();
  });

  it("the stylesheet: an upper-body crop at the outer edge, faded into a dark centre; the phone keeps its splash", () => {
    expect(CSS).toMatch(/\.journey-board__art \{ display: none; \}/);
    expect(CSS).toMatch(/--jp3-art-h: 150cqh;/);
    expect(CSS).toMatch(/\.journey-board__art--subject img \{ left: calc\(var\(--jp3-face-x\)/);
    expect(CSS).toMatch(/\.journey-board::after \{[^}]*radial-gradient/);
  });
});

describe("the host and the parchment (stylesheet)", () => {
  it("the Journey widens the centre only while a Journey is on the stage; ordinary Ranked is untouched", () => {
    expect(CSS).toMatch(/\.ranked-arena-grid:has\(\.journey-viewport\) \{\s*grid-template-columns: minmax\(0, 20fr\) minmax\(0, 60fr\) minmax\(0, 20fr\);/);
    expect(CSS).toMatch(/\.ranked-arena-grid:has\(\.journey-viewport\) \{\s*grid-template-columns: minmax\(0, 18fr\) minmax\(0, 64fr\) minmax\(0, 18fr\);/);
    const arena = readFileSync(resolve(process.cwd(), "src/components/ranked-arena/CanonicalArena.tsx"), "utf8");
    expect(arena).toContain("lg:grid-cols-[minmax(0,23fr)_minmax(0,54fr)_minmax(0,23fr)]");
    // Every host rule is scoped by the Journey's own viewport.
    const hostRules = CSS.match(/[^}\n]*\.ranked-arena-grid[^{]*\{/g) ?? [];
    for (const r of hostRules.filter((x) => !x.includes("data-phone-arena"))) expect(r).toContain(":has(.journey-viewport)");
  });

  it("the parchment engraving is printed WHOLE on the Journey stage: centred, masked to itself, no bleed", () => {
    const at = CSS.indexOf('.journey-question .question-surface-stack > .question-motif-layer:is([data-motif-art="champ-combat"])::before {');
    expect(at).toBeGreaterThan(0);
    const rule = [CSS.slice(at), CSS.slice(CSS.indexOf("{", at) + 1, CSS.indexOf("}", at))];
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/height: 100%;/);
    expect(rule![1]).toMatch(/aspect-ratio: 704 \/ 561;/);
    expect(rule![1]).toMatch(/translate\(-50%, -50%\)/);
    expect(rule![1]).toMatch(/mask-image: radial-gradient\(closest-side/);
  });

  it("the answer tablets' polish changes no geometry (no padding, border-width or size in the JP3 tablet rules)", () => {
    const jp3 = CSS.slice(CSS.indexOf("JP3 — JOURNEY VISUAL LANGUAGE"));
    const tabletRules = jp3.match(/[^}]*\[data-quiz-choice\][^{]*\{[^}]*\}/g) ?? [];
    expect(tabletRules.length).toBeGreaterThan(0);
    for (const r of tabletRules) {
      const body = r.slice(r.indexOf("{"));
      expect(body).not.toMatch(/(^|[\s;{])(padding|border-width|width|height|min-height|margin)\s*:/);
    }
  });
});
