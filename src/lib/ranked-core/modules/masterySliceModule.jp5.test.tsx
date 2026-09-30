/**
 * JP5 — THE REASONING CHAIN, BEFORE AND AFTER THE ANSWER, in the DOM, on the
 * real captures (the Zed/Ahri reference Journey; the Daily's M1 captures):
 *
 *   * LIVE: the established facts a child relies on, resurfaced under its
 *     question — and only where the server says it relies on them;
 *   * the EQUATION UNFOLD: the whole derivation at once, auto-compressed
 *     inside the SERVER's reveal window, reopened by a tap;
 *   * the magnitude bar, sized by the served multiplier;
 *   * reduced motion; the fixed stage; every Journey host; ordinary Ranked.
 *
 * The data layer is `lib/journey/jp5.contract.test.ts`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { useRef } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InteractiveScenarioSurface } from "@/components/question-surface/InteractiveScenarioSurface";
import { useFittedQuestion } from "@/components/journey/JourneyQuestionText";
import { resetKnowledgeCoach } from "@/components/journey/useKnowledgeCoach";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { hostOfCapture, journeyArenaView, withRevealWindow } from "@/pages/dev/journey-arena/JourneyArenaHarness";
import type { ArenaRail } from "@/lib/ranked-core/arenaView";
import { masterySliceModule } from "./masterySliceModule";

const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__");
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(FIX, `${n}.json`), "utf8"));
const REF = "jref/zed_ahri.reference";
const WRONG = "jref/zed_ahri.reference.wrong";
const TIMEOUT = "jref/zed_ahri.reference.timeout";
const PANTHEON = "m1/pantheon.standard";
const VOLI = "m1/voli.standard";
const VOLI_SURVIVAL = "m1/voli.survival";
const AHRI_SURVIVAL = "m1/ahri.survival";
const snap = (n: string, label: string) => {
  const s = load(n).find((x) => x.label === label);
  if (!s) throw new Error(`${n}: ${label}`);
  return s;
};
type Wire = Record<string, unknown>;
const segWire = (s: CaptureSnapshot) => (s.envelope.payload as { segment_state: Wire }).segment_state;

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
/** Mount one snapshot at its own server instant (`at` overrides the client's clock). */
function show(s: CaptureSnapshot, at: number = Date.parse(s.at)) {
  vi.setSystemTime(at);
  return render(view(s));
}
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8").replace(/\r\n/g, "\n");
/** The JP5 block of the stylesheet (it is the last one). */
const JP5 = CSS.slice(CSS.indexOf("JP5 — THE REASONING CHAIN, BEFORE AND AFTER THE ANSWER."));

const reveal = () => screen.getByTestId("journey-reveal");
const chain = () => screen.getByTestId("journey-combat-working");
const steps = () => [...chain().querySelectorAll<HTMLElement>("li.journey-reasoning__step")];
/** The steps a learner can read: a folded step is `aria-hidden` and `inert`. */
const readable = () => steps().filter((li) => li.getAttribute("aria-hidden") !== "true");
const texts = (lis: HTMLElement[]) => lis.map((li) => li.querySelector(".journey-node")!.textContent);
const transform = () => within(chain()).getByRole("button", { name: /Damage taken/ });
const EXPANDED = ["85Raw damage", "24Ahri armor", "100100 + 24Formula", "0.806Multiplier", "80.6%Damage taken", "68Final damage"];
const COMPRESSED = ["85Raw damage", "24Ahri armor", "80.6%Damage taken", "68Final damage"];

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); resetKnowledgeCoach(); });
afterEach(() => { cleanup(); vi.useRealTimers(); resetKnowledgeCoach(); });

describe("LIVE: what this step builds on, before the answer", () => {
  it("Zed/Ahri Step 4: 85 Raw damage → 24 Ahri armor → ? Final damage, in the prompt's own box", () => {
    show(snap(REF, "child3-live"));
    const live = screen.getByTestId("journey-live-chain");
    expect(live).toHaveAttribute("data-reasoning", "live");
    expect(live).toHaveAccessibleName("What this step builds on");
    const nodes = [...live.querySelectorAll<HTMLElement>(".journey-node")];
    expect(nodes.map((n) => n.textContent)).toEqual(["85Raw damage", "24Ahri armor", "?Final damage"]);
    expect([...live.querySelectorAll(".journey-op")].map((o) => o.getAttribute("data-op"))).toEqual(["→", "→"]);
    // The asked value is the answer's own box, open: a `?`, said as what it is.
    expect(nodes[2].className).toMatch(/journey-node--final/);
    expect(nodes[2].className).toMatch(/journey-node--asked/);
    expect(nodes[2]).toHaveAccessibleName("Final damage: the value this step asks for");
    expect(live.querySelector("ol")).toHaveAttribute("data-phase", "live");
    // It lives INSIDE the prompt region, under the question: no new region, no second component.
    const prompt = screen.getByTestId("journey-child").querySelector('[data-surface-region="prompt"]')!;
    expect(prompt).toContainElement(live);
    expect(within(prompt as HTMLElement).getByRole("heading", { level: 2 })).toHaveTextContent(
      "How much physical damage does Zed's Rank 1 Shadow Slash deal to Ahri?");
    expect(document.querySelectorAll(".journey-reasoning")).toHaveLength(1);
  });

  it("shows nothing of the answer: the chain is the two learned values and a `?`", () => {
    for (const label of ["child3-open", "child3-live"]) {
      show(snap(REF, label));
      expect(screen.getByTestId("journey-live-chain").textContent, label).toBe("85Raw damagegives24Ahri armorgives?Final damage");
      expect(screen.queryByTestId("journey-reveal")).toBeNull();
      cleanup();
    }
  });

  it("the board is untouched: its `!` marks still hold the facts, and it reprints none of them", () => {
    show(snap(REF, "child3-live"));
    const board = screen.getByTestId("journey-board");
    expect(board.querySelector(".journey-reasoning, .journey-node")).toBeNull();
    const marks = [...board.querySelectorAll<HTMLButtonElement>("button.journey-know")];
    expect(marks.length).toBeGreaterThanOrEqual(2);              // Zed E, Ahri's armor
    expect(board.textContent).not.toMatch(/\b85\b|\b24\b/);       // the notebook never reprints (JP4)
  });

  it("Step 2 keeps its JP4 question: it relies on the FORMULA, which is not a value to chain (owner)", () => {
    show(snap(REF, "child1-live"));
    expect(screen.queryByTestId("journey-live")).toBeNull();
    expect(document.querySelector(".journey-reasoning")).toBeNull();
    expect(within(screen.getByTestId("journey-child")).getByRole("heading", { level: 2 })).toHaveTextContent(
      "How much physical damage does Zed's Rank 1 Shadow Slash deal before armor?");
  });

  it("no chain for a child with no served dependency: Steps 1 and 3, ability haste, a cooldown comparison", () => {
    for (const [file, label] of [[REF, "child0-live"], [REF, "child2-live"], [VOLI, "child2-live"], [VOLI, "child4-live"],
      [AHRI_SURVIVAL, "child2-live"], [PANTHEON, "child1-live"], [PANTHEON, "child3-live"]] as const) {
      show(snap(file, label));
      expect(screen.queryByTestId("journey-live"), `${file} ${label}`).toBeNull();
      cleanup();
    }
  });

  it("the same live chain whatever the earlier verdicts: wrong answers and a timeout teach the same facts", () => {
    for (const file of [REF, WRONG, TIMEOUT]) {
      show(snap(file, "child3-live"));
      expect(screen.getByTestId("journey-live-chain").textContent, file).toBe("85Raw damagegives24Ahri armorgives?Final damage");
      cleanup();
    }
  });

  it("GENERIC — Pantheon/Leona (Daily): Leona's armor, learned at Step 1, resurfaces at Step 3 beside the stated formula", () => {
    show(snap(PANTHEON, "child2-live"));
    const nodes = [...screen.getByTestId("journey-live-chain").querySelectorAll(".journey-node")];
    expect(nodes.map((n) => n.textContent)).toEqual(["50Leona armor", "?Final damage"]);
    // The formula this child STATES stays the question's own premise line.
    expect(screen.getByTestId("journey-stated-formula")).toHaveTextContent("Aegis Assault (E)");
    expect(screen.getByTestId("journey-live-chain").textContent).not.toMatch(/55|105/);
  });

  it("beside a stated formula the chain belongs to that premise line, in phrasing elements only", () => {
    show(snap(PANTHEON, "child2-live"));
    const premise = screen.getByTestId("scenario-context");
    const live = screen.getByTestId("journey-live");
    expect(premise).toContainElement(live);
    expect(live.className).toMatch(/journey-live--premise/);
    expect(live).toHaveAttribute("data-yields", "true");
    // A <p> may hold only phrasing content: no div / ol / li anywhere inside it.
    expect(premise.querySelector("div, ol, ul, li")).toBeNull();
    // The list semantics survive as roles.
    expect(within(live).getByRole("list")).toBeInTheDocument();
    expect(within(live).getAllByRole("listitem")).toHaveLength(2);
    // The compact form's one-word name for the asked value is carried, not derived in CSS.
    expect(live.querySelector('[data-node="asked"] .journey-node__label')).toHaveAttribute("data-short", "Final");
    // Spoken, the dependency is whole: whose armor, and what is asked.
    expect(within(live).getByRole("group", { name: "Leona armor: 50" })).toBeInTheDocument();
    // Without a stated formula (Zed Step 4) the chain is the prompt's own last block, as before.
    cleanup();
    show(snap(REF, "child3-live"));
    expect(screen.queryByTestId("scenario-context")).toBeNull();
    expect(screen.getByTestId("journey-live").tagName).toBe("DIV");
  });

  it("the COMPACT form (a phone): mnemonic + value → `?` + kind, finishing the formula's last line", () => {
    // [armor] 50 → ? Final: labels give way (the spoken label keeps them), the
    // asked node keeps its one-word kind, the chain flows inline in the premise line.
    expect(JP5).toMatch(/\.journey-ask\[data-live-fit="compact"\] \.journey-live--premise \{\n\s*display: inline-flex;/);
    expect(JP5).toMatch(/\.journey-ask\[data-live-fit="compact"\] \.journey-reasoning__chain\[data-phase="live"\] \.journey-node__label \{ display: none; \}/);
    expect(JP5).toMatch(/\.journey-node__label\[data-short\]::after \{\n\s*content: attr\(data-short\);/);
    // Never taller than the text line it sits on (1rem), so the premise line does not grow.
    expect(JP5).toMatch(/\.journey-ask\[data-live-fit="compact"\] \.journey-reasoning__chain\[data-phase="live"\] \.journey-node \{[^}]*height: 1rem;/);
  });
});

describe("the EQUATION UNFOLD: the whole derivation, all at once", () => {
  it("the reveal opens EXPANDED: six nodes, in order, in the first frame — nothing arrives later", () => {
    show(snap(REF, "child3-reveal"));
    expect(reveal()).toHaveAttribute("data-unfold", "expanded");
    expect(reveal()).toHaveAttribute("data-unfold-by", "reveal");
    expect(chain().querySelector("ol")).toHaveAttribute("data-phase", "expanded");
    expect(texts(readable())).toEqual(EXPANDED);              // before any timer has run
    expect(steps()).toHaveLength(6);
    // One chain on screen: the live chain has become this one.
    expect(screen.queryByTestId("journey-live")).toBeNull();
    expect(document.querySelectorAll(".journey-reasoning")).toHaveLength(1);
    // What Steps 2 and 3 established was already on screen; the rest is the unfold.
    expect(steps().map((li) => li.dataset.given ?? "new")).toEqual(["true", "true", "new", "new", "new", "new"]);
    expect(steps().map((li) => li.dataset.detail ?? "-")).toEqual(["-", "-", "true", "true", "-", "-"]);
  });

  it("all at once in the stylesheet too: one entrance for every new step, no per-step delay anywhere", () => {
    expect(JP5).toMatch(/\.journey-reveal\[data-unfold\] \.journey-reasoning__step:not\(\[data-given\]\),\n\s*\.journey-reveal\[data-unfold\] \.journey-magnitude \{ animation: journey-unfold-in 260ms ease-out; \}/);
    // No serial reveal: no step is addressed by position, and no step's animation is delayed.
    expect(JP5).not.toMatch(/journey-reasoning__step[^{]*:nth/);
    expect(JP5).not.toMatch(/journey-unfold-in[^;]*\d+ms[^;]*\d+ms/);
    expect(JP5).not.toMatch(/animation-delay/);
    show(snap(REF, "child3-reveal"));
    for (const li of steps()) expect(li.getAttribute("style")).toBeNull();
  });

  it("arrows only, and the Exact control keeps the real working: 84.56 × 0.8063 ≈ 68.1804", () => {
    show(snap(REF, "child3-reveal"));
    expect([...chain().querySelectorAll(".journey-op")].map((o) => o.getAttribute("data-op"))).toEqual(["→", "→", "→", "→", "→"]);
    expect(chain().textContent).not.toMatch(/[×=]|84\.56|24\.024|68\.18|0\.8063/);
    fireEvent.click(screen.getByTestId("journey-combat-working-exact"));
    const exact = screen.getByTestId("journey-combat-working-exact-pop");
    expect(exact).toHaveTextContent("84.56 × 0.8063 ≈ 68.1804");
    expect(exact).toHaveTextContent("Shown as 68 · rounded for display");
  });

  it("right, wrong and timed out unfold the same derivation (only the verdict's words differ)", () => {
    for (const [file, label, verdict] of [[REF, "child3-reveal", "Correct · 68"], [WRONG, "child3-reveal", "Correct · 68"],
      [TIMEOUT, "child3-timeout-reveal", "Time's up · 68"]] as const) {
      show(snap(file, label));
      expect(screen.getByTestId("journey-reveal-verdict"), file).toHaveTextContent(verdict);
      expect(texts(readable()), file).toEqual(EXPANDED);
      cleanup();
    }
    // A wrong answer at the asked step itself (Step 3 of the wrong path is a stat
    // recall — no derivation): its reveal is JP4's two-node chain, unchanged.
    show(snap(WRONG, "child2-reveal"));
    expect(screen.getByTestId("journey-reveal-verdict")).toHaveTextContent("Not quite · 24");
    expect(reveal()).not.toHaveAttribute("data-unfold");
  });

  it("a chain with no derivation detail does not unfold: Steps 2 and 3 are exactly JP4's", () => {
    show(snap(REF, "child1-reveal"));
    expect(reveal()).not.toHaveAttribute("data-unfold");
    const raw = screen.getByTestId("journey-raw-working");
    expect(raw.querySelector("ol")).not.toHaveAttribute("data-phase");
    expect([...raw.querySelectorAll(".journey-node")].map((n) => n.textContent)).toEqual([
      "70Base damage", "70% of 21 =15Bonus AD damage", "85Raw damage"]);
    expect(raw.querySelector("button.journey-node, .journey-magnitude")).toBeNull();
    cleanup();
    show(snap(REF, "child2-reveal"));
    expect(reveal()).not.toHaveAttribute("data-unfold");
    expect(screen.getByTestId("journey-stat-working").querySelector(".journey-magnitude")).toBeNull();
  });
});

describe("auto-compress, inside the SERVER's reveal window", () => {
  it("production's 1750ms window is too short to divide: the derivation stays open until the child leaves", () => {
    const s = snap(REF, "child3-reveal");
    expect(segWire(s).reveal_window_ms).toBe(1750);
    show(s);
    tick(1749);
    expect(reveal()).toHaveAttribute("data-unfold", "expanded");
    expect(texts(readable())).toEqual(EXPANDED);
  });

  it.each([[3500, 2100], [4000, 2400], [4500, 2700]])(
    "a served %ims window: expanded, then compressed at %ims of it — and the reveal still ends with the window",
    (windowMs, compressAt) => {
      show(withRevealWindow(snap(REF, "child3-reveal"), windowMs));
      tick(compressAt - 1);
      expect(reveal()).toHaveAttribute("data-unfold", "expanded");
      tick(1);
      expect(reveal()).toHaveAttribute("data-unfold", "compressed");
      expect(reveal()).toHaveAttribute("data-unfold-by", "reveal");
      expect(texts(readable())).toEqual(COMPRESSED);
      // The folded steps are out of the reading and the tab order, not merely unseen.
      const folded = steps().filter((li) => li.dataset.detail === "true");
      expect(folded).toHaveLength(2);
      for (const li of folded) { expect(li).toHaveAttribute("aria-hidden", "true"); expect(li).toHaveAttribute("inert"); }
      // Nothing extends the reveal: it is gone exactly when the server's window is.
      tick(windowMs - compressAt - 1);
      expect(screen.queryByTestId("journey-reveal")).not.toBeNull();
      tick(1);
      expect(screen.queryByTestId("journey-reveal")).toBeNull();
    });

  it("follows the SERVER's clock: a reload late in the window lands compressed, and replays nothing", () => {
    const s = withRevealWindow(snap(REF, "child3-reveal"), 4000);
    show(s, Date.parse(s.at) + 3000);                       // 3.0s into a 4.0s reveal
    expect(reveal()).toHaveAttribute("data-unfold", "compressed");
    cleanup();
    show(s, Date.parse(s.at) + 1000);                       // 1.0s in: still expanded, compresses 1.4s later
    expect(reveal()).toHaveAttribute("data-unfold", "expanded");
    tick(1399);
    expect(reveal()).toHaveAttribute("data-unfold", "expanded");
    tick(1);
    expect(reveal()).toHaveAttribute("data-unfold", "compressed");
  });
});

describe("manual reopen: the compressed transformation is a control", () => {
  it("the 80.6% node is a button that says what it does; tapping it reopens the full equation", () => {
    show(withRevealWindow(snap(REF, "child3-reveal"), 4000));
    tick(2400);
    const t = transform();
    expect(t.tagName).toBe("BUTTON");
    expect(t).toHaveAttribute("aria-expanded", "false");
    expect(t).toHaveAccessibleName("Damage taken: 80.6%. Show the full equation");
    fireEvent.click(t);
    expect(reveal()).toHaveAttribute("data-unfold", "expanded");
    expect(reveal()).toHaveAttribute("data-unfold-by", "learner");
    expect(transform()).toHaveAttribute("aria-expanded", "true");
    expect(transform()).toHaveAccessibleName("Damage taken: 80.6%. Hide the full equation");
    expect(texts(readable())).toEqual(EXPANDED);
    for (const li of steps()) expect(li).not.toHaveAttribute("inert");
  });

  it("a reopened equation STAYS open until it is closed or the child leaves (no second auto-compress)", () => {
    show(withRevealWindow(snap(REF, "child3-reveal"), 4000));
    tick(2400);
    fireEvent.click(transform());                           // reopened at 2.4s
    tick(1599);                                             // …to the last millisecond of the window
    expect(reveal()).toHaveAttribute("data-unfold", "expanded");
    tick(1);                                                // the child leaves: the reveal goes with it
    expect(screen.queryByTestId("journey-reveal")).toBeNull();
  });

  it("closing it again is the learner's too, and it stays closed", () => {
    show(withRevealWindow(snap(REF, "child3-reveal"), 4500));
    tick(2700);
    fireEvent.click(transform());
    fireEvent.click(transform());
    expect(reveal()).toHaveAttribute("data-unfold", "compressed");
    expect(reveal()).toHaveAttribute("data-unfold-by", "learner");
    tick(1700);
    expect(reveal()).toHaveAttribute("data-unfold", "compressed");
  });

  it("a tap BEFORE the auto-compress takes over: the chain is then only what the learner set it to", () => {
    show(withRevealWindow(snap(REF, "child3-reveal"), 4000));
    tick(500);
    fireEvent.click(transform());                           // closed early, by hand
    expect(reveal()).toHaveAttribute("data-unfold", "compressed");
    fireEvent.click(transform());                           // and reopened
    tick(3000);                                             // past the 2.4s point: no auto-compress now
    expect(reveal()).toHaveAttribute("data-unfold", "expanded");
  });

  it("at production's 1750ms the node is the same control (the learner can still fold the derivation)", () => {
    show(snap(REF, "child3-reveal"));
    fireEvent.click(transform());
    expect(texts(readable())).toEqual(COMPRESSED);
  });
});

describe("the magnitude bar is sized by the SERVED multiplier", () => {
  const bar = () => screen.getByTestId("journey-combat-working-magnitude");

  it("Zed/Ahri: --jm-ratio is the working's mitigation_multiplier (0.8063), from raw 85 to final 68", () => {
    show(snap(REF, "child3-reveal"));
    expect(bar()).toHaveAttribute("data-ratio", "0.8063");
    expect(bar().style.getPropertyValue("--jm-ratio")).toBe("0.8063");
    expect(bar()).toHaveAccessibleName("85 raw, 80.6% taken: 68 final");
    expect(bar().textContent).toBe("85 raw68 final");
    expect(chain()).toContainElement(bar());                 // under the equation, in the same reveal box
  });

  it("the stylesheet draws exactly that ratio; nothing in the client divides two damage numbers", () => {
    expect(JP5).toMatch(/\.journey-magnitude__fill \{[^}]*width: calc\(var\(--jm-ratio\) \* 100%\);/);
    // It BEGINS at the whole (100%) and contracts to the served share.
    expect(JP5).toMatch(/@keyframes journey-magnitude-contract \{\n\s*from \{ width: 100%; \}\n\}/);
    const drawn = readFileSync(resolve(process.cwd(), "src/components/journey/JourneyReasoning.tsx"), "utf8");
    expect(drawn).toContain('"--jm-ratio": String(magnitude.ratio)');
    expect(drawn).not.toMatch(/magnitude\.(from|to)\)?\s*[/*]|Number\(magnitude/);
  });

  it("follows the SERVED coefficient even when it disagrees with the numbers around it", () => {
    // A working whose served multiplier says 0.5 while its raw / final still read
    // 85 / 68: the bar is the multiplier's, never 68 ÷ 85.
    const s = JSON.parse(JSON.stringify(snap(REF, "child3-reveal"))) as CaptureSnapshot;
    const w = (segWire(s).own_challenge_reveals as Wire[])[3].combat_working as Wire;
    Object.assign(w, { effective_armor: 100, mitigation_multiplier: 0.5 });
    (w.target_armor as Wire).value = 100;
    show(s);
    expect(bar()).toHaveAttribute("data-ratio", "0.5");
    expect(bar().style.getPropertyValue("--jm-ratio")).toBe("0.5");
    expect(bar().textContent).toBe("85 raw68 final");
    expect(transform()).toHaveTextContent("50%Damage taken");
  });

  it("Pantheon/Leona: the same bar at that Journey's own served multiplier (0.6663)", () => {
    show(snap(PANTHEON, "child2-reveal"));
    expect(bar()).toHaveAttribute("data-ratio", "0.6663");
    expect(bar()).toHaveAccessibleName("124 raw, 66.6% taken: 83 final");
  });

  it("compressed: the bar is out of the reading (the four-node summary stands alone)", () => {
    show(snap(REF, "child3-reveal"));
    fireEvent.click(transform());
    expect(bar()).toHaveAttribute("aria-hidden", "true");
    expect(JP5).toMatch(/\.journey-reveal\[data-unfold="compressed"\] \.journey-magnitude \{ opacity: 0; \}/);
  });
});

describe("GENERIC reuse: Pantheon/Leona's learned armor, then its Combat application", () => {
  it("Step 3's reveal unfolds the same grammar from that child's own working; only the ARMOR was given", () => {
    show(snap(PANTHEON, "child2-reveal"));
    expect(reveal()).toHaveAttribute("data-unfold", "expanded");
    expect(texts(readable())).toEqual([
      "124Raw damage", "50Leona armor", "100100 + 50Formula", "0.666Multiplier", "66.6%Damage taken", "83Final damage"]);
    // Leona's armor was learned at Step 1 (given); the raw damage comes from the
    // formula this child STATES, so it is part of what the reveal adds.
    expect(steps().map((li) => li.dataset.given ?? "new")).toEqual(["new", "true", "new", "new", "new", "new"]);
    expect(screen.getByTestId("journey-combat-working-formula")).toHaveTextContent("55 + 100% total AD (69) + 150% bonus AD (0)");
  });

  it("a Combat child with a STATED armor (Step 4) unfolds too, with nothing given and no live chain", () => {
    show(snap(PANTHEON, "child3-live"));
    expect(screen.queryByTestId("journey-live")).toBeNull();
    cleanup();
    show(snap(PANTHEON, "child3-reveal"));
    expect(steps().map((li) => li.dataset.given ?? "new")).toEqual(["new", "new", "new", "new", "new", "new"]);
    expect(texts(readable()).at(-1)).toBe("75Final damage");
  });
});

describe("reduced motion", () => {
  /** The JP5 block with its `no-preference` media block and its keyframes removed. */
  const withoutMotion = () => {
    const cut = (text: string, open: string) => {
      let out = text;
      for (let at = out.indexOf(open); at >= 0; at = out.indexOf(open)) {
        let depth = 0;
        let end = out.indexOf("{", at);
        for (; end < out.length; end++) {
          if (out[end] === "{") depth++;
          if (out[end] === "}" && --depth === 0) break;
        }
        out = out.slice(0, at) + out.slice(end + 1);
      }
      return out;
    };
    return cut(cut(JP5, "@media (prefers-reduced-motion: no-preference) {"), "@keyframes ");
  };

  it("every JP5 animation and transition is declared ONLY under `prefers-reduced-motion: no-preference`", () => {
    const still = withoutMotion().split("\n").filter((l) => /\b(animation|transition)\s*:/.test(l));
    // What is left outside it is the app's own switch turning them off.
    expect(still.length).toBeGreaterThan(0);
    for (const l of still) expect(l).toMatch(/animation: none !important; transition: none !important;/);
    expect(JP5).toMatch(/html\.reduce-motion \.journey-reveal\[data-unfold\] \.journey-reasoning__step,/);
    expect(JP5).toMatch(/html\.reduce-motion \.journey-magnitude \* \{ animation: none !important; transition: none !important; \}/);
  });

  it("without motion the bar is simply drawn at the served ratio, and the fold is an instant state", () => {
    const still = withoutMotion();
    expect(still).toMatch(/\.journey-magnitude__fill \{[^}]*width: calc\(var\(--jm-ratio\) \* 100%\);/);
    expect(still).toMatch(/\.journey-reasoning__chain\[data-phase="compressed"\] > \.journey-reasoning__step\[data-detail\] \{\n\s*max-width: 0;/);
  });

  it("the phases themselves do not depend on motion: expanded → compressed → reopened still happen", () => {
    document.documentElement.classList.add("reduce-motion");
    try {
      show(withRevealWindow(snap(REF, "child3-reveal"), 4000));
      expect(texts(readable())).toEqual(EXPANDED);
      tick(2400);
      expect(texts(readable())).toEqual(COMPRESSED);
      fireEvent.click(transform());
      expect(texts(readable())).toEqual(EXPANDED);
    } finally {
      document.documentElement.classList.remove("reduce-motion");
    }
  });
});

describe("the fixed stage: nothing here moves a region (JP2)", () => {
  it("the reveal is still the prompt box's own layer; JP5 sets no stage reserve and no region size", () => {
    const base = CSS.slice(CSS.indexOf("\n.journey-reveal {"), CSS.indexOf("}", CSS.indexOf("\n.journey-reveal {")));
    expect(base).toMatch(/position: absolute;[\s\S]*height: var\(--jq-prompt-h\);/);
    // JP5 never redefines a reserve, the board band, the question box or a region.
    expect(JP5).not.toMatch(/--jq-prompt-h\s*:|--jq-answers-h\s*:|--jb-band-h\s*:|--qs-[a-z-]+\s*:/);
    expect(JP5).not.toMatch(/\.journey-band\b|\.journey-question \{|\.journey-stage \{|data-surface-region/);
    expect(JP5).not.toMatch(/overflow(-y)?: (auto|scroll)/);      // no inner scroll
  });

  it("the live chain is inside the prompt region, and yields rather than grow it", () => {
    expect(JP5).toMatch(/\.journey-ask\[data-live-fit="yielded"\] \.journey-live \{ display: none; \}/);
    show(snap(REF, "child3-live"));
    const live = screen.getByTestId("journey-live");
    expect(live).toHaveAttribute("data-yields", "true");
    expect(live.closest('[data-surface-region="prompt"]')).not.toBeNull();
    // The answers region is the prompt's next sibling, as on every child.
    const regions = [...screen.getByTestId("journey-child").querySelectorAll("[data-surface-region]")]
      .map((r) => r.getAttribute("data-surface-region"));
    expect(regions).toEqual(["prompt", "answers"]);
  });

  it("one node size through expanded → compressed; a phone takes two rows expanded, one compressed", () => {
    show(snap(REF, "child3-reveal"));
    // Expanded: a deliberate break at the derivation's middle (three and three)…
    const items = [...chain().querySelector("ol")!.children].map((li) => li.className);
    expect(items.indexOf("journey-reasoning__break")).toBe(3);
    expect(JP5).toMatch(/@container jreveal \(max-width: 25\.99rem\) \{\n\s*\.journey-reasoning__chain\[data-phase="expanded"\] > \.journey-reasoning__break \{\n\s*display: block;\n\s*flex-basis: 100%;/);
    expect(JP5).toMatch(/\.journey-reasoning__break \{ display: none; \}/);
    // …and none compressed: the four nodes are one row.
    fireEvent.click(transform());
    expect(chain().querySelector(".journey-reasoning__break")).toBeNull();
    // The folding rules change no node's box (only the folded step's own max-width).
    const fold = JP5.slice(JP5.indexOf("/* FOLDING:"), JP5.indexOf("/* THE TRANSFORMATION NODE"));
    expect(fold).not.toMatch(/--jn-[wh]\s*:|(?<![-\w])(width|height)\s*:/);
    for (const n of chain().querySelectorAll(".journey-node")) expect(n.getAttribute("style")).toBeNull();
  });

  describe("useFittedQuestion: the block steps down before the box would grow", () => {
    function Harness({ lines, room }: { lines: number; room: number }) {
      const host = useRef<HTMLDivElement>(null);
      useFittedQuestion(host, `k${lines}:${room}`);
      return (
        <div ref={host} style={{ ["--jq-q-min" as string]: "17px", ["--jq-q-max" as string]: "24px" }}>
          <header data-surface-region="prompt" style={{ minHeight: `${room}px` }}>
            <h2 data-lines={lines}>question</h2>
            <div data-yields="true" data-stacked="40" data-inline="24" data-compact="12">chain</div>
          </header>
        </div>
      );
    }
    const host = (el: HTMLElement) => el.closest<HTMLElement>("div[style]")!;
    let restore: (() => void) | null = null;
    beforeEach(() => {
      // jsdom has no layout: the heading is `lines` lines of its fitted size, and
      // the yielding block is its stacked / one-line height, or gone when yielded.
      const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
      const p = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent")!;
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get(this: HTMLElement) {
          if (this.tagName === "H2") return parseFloat(host(this).style.getPropertyValue("--jq-q-fs")) * Number(this.dataset.lines);
          if (this.dataset.yields) {
            const tier = host(this).dataset.liveFit;
            return Number(tier === "inline" ? this.dataset.inline : tier === "compact" ? this.dataset.compact : this.dataset.stacked);
          }
          return 0;
        },
      });
      Object.defineProperty(HTMLElement.prototype, "offsetParent", {
        configurable: true,
        get(this: HTMLElement) {
          return this.dataset.yields && host(this).dataset.liveFit !== "yielded" ? this.parentElement : null;
        },
      });
      restore = () => {
        Object.defineProperty(HTMLElement.prototype, "offsetHeight", h);
        Object.defineProperty(HTMLElement.prototype, "offsetParent", p);
      };
    });
    afterEach(() => { restore?.(); });

    const fit = (lines: number, room: number) => {
      const { container, unmount } = render(<Harness lines={lines} room={room} />);
      const el = container.firstElementChild as HTMLElement;
      const out = [Number(el.dataset.qFit), el.dataset.liveFit ?? "stacked"] as const;
      unmount();
      return out;
    };

    it("stacked where it fits; then one line; then the compact form; yielded only where none does", () => {
      expect(fit(2, 100)).toEqual([24, "stacked"]);          // 2 × 24 + 40 = 88
      expect(fit(2, 80)).toEqual([20, "stacked"]);           // the type makes the room: 2 × 20 + 40
      expect(fit(3, 80)).toEqual([18.5, "inline"]);          // 3 × 17 + 40 > 80; 3 × 18.5 + 24 ≤ 80
      expect(fit(3, 70)).toEqual([19, "compact"]);           // 3 × 17 + 24 > 70; 3 × 19 + 12 ≤ 70
      expect(fit(4, 75)).toEqual([18.5, "yielded"]);         // 4 × 17 + 12 > 75: the question alone, 4 × 18.5 ≤ 75
      expect(fit(4, 60)).toEqual([17, "yielded"]);           // never below the floor
    });
  });
});

describe("every Journey host draws the same chain", () => {
  const crest = (rail: ArenaRail) => (rail.kind === "combatant" ? rail.journey ?? null : null);

  it("Ranked Bot (the reference): the Journey owns the columns, and the chain is the module's", () => {
    const s = snap(REF, "child3-live");
    expect(hostOfCapture("jref-zed-ahri")).toBe("ranked");
    expect(crest(journeyArenaView(readPublicRound(s.envelope), s.at, 0, "ranked").left)).not.toBeNull();
    show(s);
    expect(screen.getByTestId("journey-live-chain")).toBeInTheDocument();
  });

  it("Daily Standard (Pantheon): the host keeps its columns; the live chain and the unfold are identical", () => {
    const s = snap(PANTHEON, "child2-live");
    expect(hostOfCapture("m1-pantheon")).toBe("daily");
    expect(crest(journeyArenaView(readPublicRound(s.envelope), s.at, 0, "daily").left)).toBeNull();
    show(s);
    expect(screen.getByTestId("journey-live-chain").textContent).toBe("50Leona armorgives?Final damage");
    cleanup();
    show(withRevealWindow(snap(PANTHEON, "child2-reveal"), 4000));
    expect(reveal()).toHaveAttribute("data-unfold", "expanded");
    tick(2400);
    expect(reveal()).toHaveAttribute("data-unfold", "compressed");
    expect(texts(readable())).toEqual(["124Raw damage", "50Leona armor", "66.6%Damage taken", "83Final damage"]);
  });

  it("Daily Survival (Volibear): a Combat child there unfolds the same way, on its own per-child clock", () => {
    const s = snap(VOLI_SURVIVAL, "child2-reveal");
    expect(hostOfCapture("m1-voli-survival")).toBe("daily");
    expect(readPublicRound(s.envelope).segmentState!.journey!.plan).toBe("survival");
    show(s);
    expect(reveal()).toHaveAttribute("data-unfold", "expanded");
    expect(steps()).toHaveLength(6);
    expect(texts(readable()).slice(2, 5).map((t) => t!.replace(/^[\d.%+ ]+/, ""))).toEqual(["Formula", "Multiplier", "Damage taken"]);
    expect(screen.getByTestId("journey-combat-working-magnitude")).toBeInTheDocument();
  });

  it("Survival's haste and cooldown children keep their JP4 reveal: no chain is invented for them", () => {
    show(snap(AHRI_SURVIVAL, "child2-reveal"));
    expect(reveal()).toHaveAttribute("data-working", "explanation");
    expect(reveal()).not.toHaveAttribute("data-unfold");
    expect(document.querySelector(".journey-reasoning")).toBeNull();
    cleanup();
    show(snap(VOLI, "child4-reveal"));                        // a cooldown comparison
    expect(reveal()).toHaveAttribute("data-working", "explanation");
    expect(document.querySelector(".journey-reasoning")).toBeNull();
  });
});

describe("ordinary (non-Journey) Ranked is untouched", () => {
  it("the shared surface draws a prompt footer only when a caller passes one — and only the Journey stage does", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/question-surface/InteractiveScenarioSurface.tsx"), "utf8");
    expect(src).toMatch(/promptFooter = null,/);
    expect(src).toContain("{promptFooter}");
    const passers: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) && readFileSync(p, "utf8").includes("promptFooter={")) {
          passers.push(p.replace(/\\/g, "/").replace(/^.*\/src\//, "src/"));
        }
      }
    };
    walk(resolve(process.cwd(), "src"));
    expect(passers).toEqual(["src/components/journey/JourneyStageQuestion.tsx"]);
  });

  it("an ordinary question's prompt region is byte-for-byte what it was: a heading, nothing under it", () => {
    render(
      <InteractiveScenarioSurface
        question={{ questionId: "q1", prompt: "Which item costs more?", category: "",
          options: [{ id: "0", index: 0, label: "A" }, { id: "1", index: 1, label: "B" }] }}
        selectedOptionId={null}
        permissions={{ canSelectAnswer: true, canChangeAnswer: true, canSelectAbility: false,
          canReviewSubmission: false, canConfirmSubmission: false, canAdvance: false }}
        onSelectOption={() => {}} variant="competitive" settings={{ mediaScale: "none" }} scenarioSource={null} reveal={null} />,
    );
    const prompt = document.querySelector('[data-surface-region="prompt"]')!;
    expect([...prompt.children].map((c) => c.tagName)).toEqual(["H2"]);
    expect(prompt.querySelector("h2")).toHaveTextContent("Which item costs more?");
    expect(document.querySelector(".journey-live, .journey-reasoning, .journey-magnitude")).toBeNull();
  });

  it("the reveal timing a Journey's chain reads is never passed to an ordinary slice's renderer", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/ranked-core/modules/MasterySliceChallengeSurface.tsx"), "utf8");
    const ordinary = src.slice(src.indexOf("<OrdinaryChild"), src.indexOf("/>", src.indexOf("<OrdinaryChild")));
    expect(ordinary).not.toMatch(/revealWindowMs|revealEndsAt/);
  });
});
