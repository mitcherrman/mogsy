/**
 * JP4 — JOURNEY REASONING & STATE LANGUAGE, in the DOM, on the real captures
 * (the Zed/Ahri reference Journey re-captured on the JP4 backend contract
 * `fc95e81e`; the Daily's M1 captures):
 *
 *   * the board: authoritative shards, mirrored fixed halves, one anchor row,
 *     stat mnemonics that cannot be read as inventory, served bonus-AD sources;
 *   * the notebook: a learned value is recalled from its `!`, not reprinted —
 *     and the first `!` teaches itself once (the coach);
 *   * the question: subject icons that reinforce nouns; a fixed box, adaptive type;
 *   * the Reasoning Chain: fixed nodes, strong operators;
 *   * the host owns its Player Columns.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { useRef } from "react";
import { useFittedQuestion } from "@/components/journey/JourneyQuestionText";
import { KNOWLEDGE_COACH_KEY, KNOWLEDGE_COACH_MS, resetKnowledgeCoach } from "@/components/journey/useKnowledgeCoach";
import { hostOfCapture, journeyArenaView } from "@/pages/dev/journey-arena/JourneyArenaHarness";
import type { ArenaRail } from "@/lib/ranked-core/arenaView";
import { masterySliceModule } from "./masterySliceModule";

const DIR = resolve(process.cwd(), "src/lib/journey/__fixtures__/jref");
type Wire = Record<string, unknown>;
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const REF = "zed_ahri.reference";
const WRONG = "zed_ahri.reference.wrong";
const TIMEOUT = "zed_ahri.reference.timeout";
const snap = (n: string, label: string) => {
  const s = load(n).find((x) => x.label === label);
  if (!s) throw new Error(`${n}: ${label}`);
  return s;
};
const seg = (s: CaptureSnapshot) => (s.envelope.payload as { segment_state: Wire | null }).segment_state;
const live = (n: string) => load(n).filter((s) => seg(s) !== null);

const Viewport = masterySliceModule.Viewport;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function view(s: CaptureSnapshot, submitChallenge: (i: number, c: unknown) => unknown = () => {}) {
  const round = readPublicRound(s.envelope);
  return (
    <QueryClientProvider client={queryClient}>
      <Viewport publicRound={round} segmentState={round.segmentState} selection={null}
        permissions={NO_INTERACTIONS} onSelect={() => {}}
        actions={{ submitChallenge: submitChallenge as never, busy: false, error: null }} skewMs={0} />
    </QueryClientProvider>
  );
}
function show(s: CaptureSnapshot, submitChallenge?: (i: number, c: unknown) => unknown) {
  vi.setSystemTime(Date.parse(s.at));
  return render(view(s, submitChallenge));
}
/** Every snapshot in order, the way a client polls (the reveal hold runs as live). */
function play(n: string, visit: (s: CaptureSnapshot) => void) {
  // In capture order by server instant (a reconnect read can precede a late read).
  const all = live(n).map((s, i) => [s, i] as const)
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
const child = () => screen.getByTestId("journey-child");
const heading = () => within(child()).getByRole("heading", { level: 2 });
const tablets = () => [...child().querySelectorAll<HTMLButtonElement>("[data-quiz-choice]")];
const labels = () => tablets().map((b) => b.querySelector("[data-choice-letter]")!.nextElementSibling!.textContent);
const marks = () => [...document.querySelectorAll<HTMLButtonElement>("button.journey-know")]
  .map((b) => `${b.dataset.testid!.replace("journey-know-", "")}:${b.dataset.facts}`).sort();
const popText = (testId: string) => {
  fireEvent.click(screen.getByTestId(testId));
  const t = screen.getByTestId(`${testId}-pop`).textContent ?? "";
  fireEvent.click(screen.getByTestId(testId));
  return t;
};
const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

// Several tests open Radix popovers (the `!` cards, the exact working, a
// stat's sources) across whole timelines; jsdom makes each open costly, so the
// file takes the repo's usual long-test budget.
vi.setConfig({ testTimeout: 25_000 });
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); resetKnowledgeCoach(); });
afterEach(() => { cleanup(); vi.useRealTimers(); resetKnowledgeCoach(); });

const M1 = resolve(process.cwd(), "src/lib/journey/__fixtures__/m1");
const m1snap = (n: string, label: string) => {
  const s = (JSON.parse(readFileSync(join(M1, `${n}.json`), "utf8")) as CaptureSnapshot[]).find((x) => x.label === label);
  if (!s) throw new Error(`${n}: ${label}`);
  return s;
};
const board = () => screen.getByTestId("journey-board");
const half = (side: "subject" | "opponent") => screen.getByTestId(`journey-side-${side}`);

describe("stat shards: the scenario's real state, from the authority", () => {
  it("both halves draw their served shard page, row order, the owner's art; names are the payload's", () => {
    show(snap(REF, "child0-live"));
    expect(board()).toHaveAttribute("data-shards", "true");
    const page = (side: "subject" | "opponent") => [...screen.getByTestId(`journey-shards-${side}`)
      .querySelectorAll<HTMLElement>("[data-shard-id]")].map((e) => e.dataset.shardId);
    expect(page("subject")).toEqual(["5008", "5008", "5001"]);
    expect(page("opponent")).toEqual(["5005", "5008", "5001"]);
    const zed = within(screen.getByTestId("journey-shards-subject")).getAllByRole("listitem");
    expect(zed.map((e) => e.getAttribute("aria-label"))).toEqual([
      "Adaptive Force, offense shard", "Adaptive Force, flex shard", "Health Scaling, defense shard"]);
    expect(screen.getByTestId("journey-shard-subject-offense").querySelector("img")!.getAttribute("src"))
      .toBe("/assets/journey/mogzy-stat-shards/adaptive_force.png");
    expect(screen.getByTestId("journey-shard-subject-defense").querySelector("img")!.getAttribute("src"))
      .toBe("/assets/journey/mogzy-stat-shards/scaling_health.png");
  });

  it("a Journey whose payload has no page draws no shard column on EITHER half (never invented)", () => {
    show(m1snap("pantheon.standard", "child0-live"));
    expect(board()).not.toHaveAttribute("data-shards");
    expect(screen.queryByTestId("journey-shards-subject")).toBeNull();
    expect(screen.queryByTestId("journey-shards-opponent")).toBeNull();
  });
});

describe("the board: two mirrored fixed halves", () => {
  it("every reference snapshot: both halves draw the same fixed rows, and at most two anchors each", () => {
    for (const file of [REF, WRONG, TIMEOUT]) {
      for (const s of live(file)) {
        const { unmount } = show(s);
        if (screen.queryByTestId("journey-board")) {
          const rows = (side: "subject" | "opponent") => [...half(side).children]
            .map((c) => c.className.split(" ").find((k) => k.startsWith("journey-side__")) ?? c.className).join(",");
          expect(rows("subject"), `${file} ${s.label}`).toBe(rows("opponent"));
          for (const side of ["subject", "opponent"] as const) {
            const n = screen.getByTestId(`journey-anchors-${side}`).querySelectorAll(".journey-anchor").length;
            expect(n, `${file} ${s.label} ${side}`).toBeLessThanOrEqual(2);
          }
        }
        unmount();
      }
    }
  });

  it("the anchor row is ONE fixed-height line; a half never grows for its state (stylesheet)", () => {
    const rule = (sel: string) => {
      const k = CSS.indexOf(`${sel} {`);
      return k < 0 ? "" : CSS.slice(k, CSS.indexOf("}", k));
    };
    expect(rule(".journey-side__anchors")).toMatch(/height: var\(--jb-chip-h\)/);
    expect(rule(".journey-anchor")).toMatch(/white-space: nowrap/);
    expect(rule(".journey-side__shards")).toMatch(/height: var\(--jb-portrait\)/);
  });

  it("irrelevant zero modifiers are not board state (Step 4: Lethality 0, Armor pen 0% — still in the sheet)", () => {
    show(snap(REF, "child3-live"));
    expect(screen.queryByTestId("journey-stat-subject-lethality")).toBeNull();
    expect(screen.queryByTestId("journey-stat-subject-armor_penetration_percent")).toBeNull();
    fireEvent.click(screen.getByTestId("journey-open-state"));
    expect(screen.getByTestId("journey-sheet-stat-subject-lethality")).toHaveTextContent("0");
  });
});

describe("stat mnemonics are symbols, never inventory", () => {
  it("Bonus AD wears the Long Sword as a ROUND badge outside the item slots; Doran's Blade stays an item", () => {
    show(snap(REF, "child1-live"));
    const bonus = screen.getByTestId("journey-stat-subject-bonus_attack_damage");
    const mnemonic = screen.getByTestId("journey-stat-subject-bonus_attack_damage-icon");
    expect(mnemonic).toHaveAttribute("data-icon-kind", "stat");
    expect(mnemonic).toHaveAttribute("data-mnemonic", "1036");
    expect(mnemonic.className).toMatch(/journey-ico--mnemonic/);
    expect(mnemonic.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("journey-items-subject")).not.toContainElement(mnemonic);
    // No slot holds a Long Sword: the champion does not own the mnemonic.
    expect(screen.getByTestId("journey-items-subject").querySelector("[data-item-id='1036']")).toBeNull();
    // The real item source is drawn as an ITEM tile.
    const blade = screen.getByTestId("journey-stat-subject-bonus_attack_damage-source-0");
    expect(blade).toHaveAttribute("data-icon-kind", "item");
    expect(blade).toHaveAttribute("data-item-id", "1055");
    expect(blade.className).toMatch(/journey-ico--item/);
    expect(bonus).toContainElement(blade);
  });

  it("the stylesheet: a mnemonic is round and ringed, an item square — the two never share a shape", () => {
    const rule = (sel: string) => CSS.slice(CSS.indexOf(`${sel} {`), CSS.indexOf("}", CSS.indexOf(`${sel} {`)));
    expect(rule(".journey-ico--mnemonic")).toMatch(/border-radius: 9999px/);
    expect(rule(".journey-ico--item")).toMatch(/border-radius: 3px/);
  });
});

describe("Bonus AD provenance: where 21 comes from", () => {
  it("the anchor carries its served sources (item + two shards) and opens their breakdown", () => {
    show(snap(REF, "child1-live"));
    const bonus = screen.getByTestId("journey-stat-subject-bonus_attack_damage");
    expect(bonus.tagName).toBe("BUTTON");
    const kinds = [...screen.getByTestId("journey-stat-subject-bonus_attack_damage-sources").children]
      .map((e) => `${(e as HTMLElement).dataset.iconKind}:${(e as HTMLElement).dataset.itemId ?? (e as HTMLElement).dataset.shardId}`);
    expect(kinds).toEqual(["item:1055", "shard:5008", "shard:5008"]);
    fireEvent.click(bonus);
    const card = screen.getByTestId("journey-sources-card");
    expect([...card.querySelectorAll("[data-source-kind]")].map((r) => r.getAttribute("aria-label")))
      .toEqual(["Doran's Blade: +10", "Adaptive Force: +5.4", "Adaptive Force: +5.4"]);
    expect(card).toHaveTextContent("Exact20.8");
    expect(card).toHaveTextContent("Shown as 21 · rounded for display");
  });

  it("a stat with no served sources is a plain anchor (nothing is derived to fill it)", () => {
    show(m1snap("pantheon.standard", "child2-live"));
    for (const a of document.querySelectorAll<HTMLElement>(".journey-anchor")) {
      expect(a.tagName).toBe("SPAN");
      expect(a.querySelector(".journey-anchor__sources")).toBeNull();
    }
  });
});

describe("the notebook: learned facts are recalled, not reprinted", () => {
  it("after its reveal a learned value never reappears as board text; it is one `!` away", () => {
    for (const file of [REF, WRONG, TIMEOUT]) {
      for (const s of live(file)) {
        const i = Number(/^child(\d)/.exec(s.label)?.[1] ?? "9");
        if (i < 2 && !/^(final|finished)/.test(s.label)) continue;
        const { unmount } = show(s);
        const b = screen.queryByTestId("journey-board");
        if (b) {
          // Step 2's raw 85 is never printed again on the board…
          expect(b.textContent, `${file} ${s.label}`).not.toMatch(/\b85\b/);
          // …and Step 3's armor 24 only at its own reveal (the moment).
          if (!/^child2-reveal/.test(s.label)) expect(b.textContent, `${file} ${s.label}`).not.toMatch(/\b24\b/);
        }
        unmount();
      }
    }
    show(snap(REF, "child3-live"));
    expect(popText("journey-know-subject-E")).toMatch(/Raw damage 85.*learned Step 2/);
    expect(popText("journey-know-opponent-stat-armor")).toMatch(/Armor 24.*learned Step 3/);
  });
});

describe("the `!` coach: taught once", () => {
  const COACH = "Learned facts live on the board. Hover or tap to recall.";
  const stepTo = (r: ReturnType<typeof render>, s: CaptureSnapshot, prev: CaptureSnapshot) => {
    act(() => { vi.advanceTimersByTime(Date.parse(s.at) - Date.parse(prev.at)); });
    vi.setSystemTime(Date.parse(s.at));
    r.rerender(view(s));
  };

  it("the first learned `!` brings the coach; it leaves by itself and never comes back", () => {
    const live0 = snap(REF, "child0-live");
    const reveal0 = snap(REF, "child0-reveal");
    const r = show(live0);
    expect(screen.queryByTestId("journey-know-coach")).toBeNull();
    stepTo(r, reveal0, live0);
    const coach = screen.getByTestId("journey-know-coach");
    expect(coach).toHaveTextContent(COACH);
    expect(coach).toHaveAttribute("role", "status");
    expect(board()).toHaveAttribute("data-coach", "true");
    expect(window.localStorage.getItem(KNOWLEDGE_COACH_KEY)).toBe("seen");
    act(() => { vi.advanceTimersByTime(KNOWLEDGE_COACH_MS + 10); });
    expect(screen.queryByTestId("journey-know-coach")).toBeNull();
    // The next learned fact (Step 2's raw damage) glows — no second coach.
    const live1 = snap(REF, "child1-live");
    const reveal1 = snap(REF, "child1-reveal");
    stepTo(r, live1, reveal0);
    stepTo(r, reveal1, live1);
    expect(screen.getByTestId("journey-readout-subject-E")).toHaveAttribute("data-just-learned", "true");
    expect(screen.queryByTestId("journey-know-coach")).toBeNull();
  });

  it("a tap dismisses it; a reload mid-Journey shows none (the notebook is simply there)", () => {
    const r = show(snap(REF, "child0-live"));
    stepTo(r, snap(REF, "child0-reveal"), snap(REF, "child0-live"));
    fireEvent.pointerDown(screen.getByTestId("journey-know-coach"));
    expect(screen.queryByTestId("journey-know-coach")).toBeNull();
    cleanup();
    resetKnowledgeCoach();
    show(snap(REF, "child2-live"));
    expect(screen.queryByTestId("journey-know-coach")).toBeNull();
  });

  it("the State sheet keeps a permanent legend", () => {
    show(snap(REF, "child3-live"));
    fireEvent.click(screen.getByTestId("journey-open-state"));
    expect(screen.getByTestId("journey-sheet-legend")).toHaveTextContent(/Learned knowledge\..*Hover or tap a ! on the board to recall/);
  });
});

describe("question icons reinforce nouns", () => {
  const icons = () => [...heading().querySelectorAll<HTMLElement>("[data-icon-kind]")]
    .map((e) => `${e.dataset.iconKind}:${e.parentElement!.textContent}`);

  it("Step 2: the ability; Step 3: the champion and the stat; Step 4: the ability and the target", () => {
    show(snap(REF, "child1-live"));
    expect(icons()).toEqual(["ability:Rank 1 Shadow Slash"]);
    cleanup();
    show(snap(REF, "child2-live"));
    expect(icons()).toEqual(["champion:Ahri", "stat:Armor"]);
    cleanup();
    show(snap(REF, "child3-live"));
    expect(icons()).toEqual(["ability:Rank 1 Shadow Slash", "champion:Ahri"]);
    // The words are unchanged; every icon is decorative (no duplicate speech).
    expect(heading()).toHaveTextContent("How much physical damage does Zed's Rank 1 Shadow Slash deal to Ahri?");
    for (const i of heading().querySelectorAll("[data-icon-kind]")) expect(i.getAttribute("aria-hidden")).toBe("true");
  });

  it("a formula recall marks its ability; icons stay few (at most three per sentence)", () => {
    show(snap(REF, "child0-live"));
    expect(icons().length).toBeLessThanOrEqual(3);
    expect(icons().every((x) => x.startsWith("ability:"))).toBe(true);
  });
});

describe("the question: fixed box, adaptive type", () => {
  function Harness({ lines, room }: { lines: number; room: number }) {
    const host = useRef<HTMLDivElement>(null);
    useFittedQuestion(host, `k${lines}`);
    return (
      <div ref={host} style={{ ["--jq-q-min" as string]: "17px", ["--jq-q-max" as string]: "24px" }}>
        <header data-surface-region="prompt" style={{ minHeight: `${room}px` }}>
          <h2 data-lines={lines}>question</h2>
        </header>
      </div>
    );
  }
  let restore: (() => void) | null = null;
  beforeEach(() => {
    // jsdom has no layout: a heading is `lines` lines of its fitted size.
    const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement) {
        if (this.tagName !== "H2" || !this.dataset.lines) return 0;
        const fs = parseFloat(this.closest<HTMLElement>("div")!.style.getPropertyValue("--jq-q-fs"));
        return fs * Number(this.dataset.lines);
      },
    });
    restore = () => Object.defineProperty(HTMLElement.prototype, "offsetHeight", d);
  });
  afterEach(() => { restore?.(); });

  it("a short question takes the largest size; a long one the largest that fits; never below the floor", () => {
    const fitOf = (lines: number, room: number) => {
      const { container, unmount } = render(<Harness lines={lines} room={room} />);
      const v = (container.firstElementChild as HTMLElement).dataset.qFit;
      unmount();
      return Number(v);
    };
    expect(fitOf(1, 100)).toBe(24);          // short: the ceiling
    expect(fitOf(4, 80)).toBe(20);           // long: 4 lines × 20px = 80
    expect(fitOf(5, 99)).toBe(19.5);         // half-pixel steps
    expect(fitOf(20, 80)).toBe(17);          // never below the floor
  });

  it("the stage owns the range and centres the question in its box (stylesheet)", () => {
    expect(CSS).toMatch(/\.journey-stage \{ --jq-q-min: 17px; --jq-q-max: 23px; \}/);
    expect(CSS).toMatch(/@media \(min-width: 1024px\) \{ \.journey-stage \{ --jq-q-min: 18px; --jq-q-max: 30px; \} \}/);
    const k = CSS.indexOf(".journey-question .journey-ask [data-testid=\"scenario-surface\"] > header {");
    expect(CSS.slice(k, CSS.indexOf("}", k))).toMatch(/justify-content: center;[\s\S]*text-align: center/);
    expect(CSS).toMatch(/font-size: var\(--jq-q-fs, 1\.125rem\);[\s\S]{0,60}text-wrap: balance/);
  });
});

describe("the Reasoning Chain: one node grammar, strong operators", () => {
  it("every node of every reference reveal is the same box; the chain says its density", () => {
    for (const label of ["child1-reveal", "child2-reveal", "child3-reveal"]) {
      show(snap(REF, label));
      const nodes = [...document.querySelectorAll<HTMLElement>(".journey-node")];
      expect(nodes.length, label).toBeGreaterThan(1);
      for (const n of nodes) expect(n.getAttribute("style"), label).toBeNull();
      expect(document.querySelector(".journey-reasoning__chain")).toHaveAttribute("data-density", "regular");
      cleanup();
    }
    const rule = (sel: string) => CSS.slice(CSS.lastIndexOf(`${sel} {`), CSS.indexOf("}", CSS.lastIndexOf(`${sel} {`)));
    expect(rule(".journey-node")).toMatch(/width: var\(--jn-w\);[\s\S]*height: var\(--jn-h\)/);
    expect(rule(".journey-op")).toMatch(/font-size: var\(--jop-fs\);[\s\S]*font-weight: 900/);
  });

  it("operators are read as words and drawn large; the arrow is a drawn stroke, not a faint glyph", () => {
    show(snap(REF, "child3-reveal"));
    const ops = [...document.querySelectorAll<HTMLElement>(".journey-op")];
    expect(ops.map((o) => o.textContent)).toEqual(["gives", "gives", "gives"]);
    for (const o of ops) expect(o.querySelector("svg")).not.toBeNull();
    cleanup();
    show(snap(REF, "child1-reveal"));
    expect([...document.querySelectorAll<HTMLElement>(".journey-op")].map((o) => o.textContent))
      .toEqual(["+plus", "=equals"]);
  });
});

describe("the host owns its Player Columns", () => {
  it("an unhosted Ranked match draws the Journey crest; a hosted Daily stage keeps its own columns", () => {
    const s = snap(REF, "child1-live");
    const round = readPublicRound(s.envelope);
    const crest = (rail: ArenaRail) => (rail.kind === "combatant" ? rail.journey ?? null : null);
    expect(crest(journeyArenaView(round, s.at, 0, "ranked").left)).not.toBeNull();
    expect(crest(journeyArenaView(round, s.at, 0, "daily").left)).toBeNull();
    expect(crest(journeyArenaView(round, s.at, 0, "daily").right)).toBeNull();
    expect(hostOfCapture("jref-zed-ahri")).toBe("ranked");
    expect(hostOfCapture("m1-pantheon")).toBe("daily");
    expect(hostOfCapture("m1-ahri-survival")).toBe("daily");
  });

  it("production: the Journey's rails are drawn only for an unhosted match; the recede keys on the crest", () => {
    const match = readFileSync(resolve(process.cwd(), "src/pages/quiz-ranked/QuizRankedMatch.tsx"), "utf8");
    expect(match).toMatch(/const journeyRails = journeySeg\?\.journey && !host\s*\n?\s*\? journeyRailsFor\(/);
    // The Journey's recede of the banners applies only where the Journey drew
    // its crest (it owns the columns) — a host's module history is its own.
    const recede = (CSS.match(/[^}\n]*\[data-testid\^="module-history-"\][^{]*\{/g) ?? [])
      .filter((r) => r.includes(".journey-viewport"));
    expect(recede.length).toBeGreaterThan(0);
    for (const r of recede) expect(r).toContain(':has([data-testid^="journey-crest-"])');
  });
});

describe("ordinary Ranked is untouched", () => {
  it("the shared question surface renders the served prompt unless a caller passes a rich one", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/question-surface/InteractiveScenarioSurface.tsx"), "utf8");
    expect(src).toContain("{promptNode ?? question.prompt}");
    expect(src).toMatch(/promptNode = null,/);
    // Only the Journey stage passes one.
    const passers: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) && readFileSync(p, "utf8").includes("promptNode={")) {
          passers.push(p.replace(/\\/g, "/").replace(/^.*\/src\//, "src/"));
        }
      }
    };
    walk(resolve(process.cwd(), "src"));
    expect(passers).toEqual(["src/components/journey/JourneyStageQuestion.tsx"]);
  });
});
