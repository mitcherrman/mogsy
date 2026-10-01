/**
 * JP4 — JOURNEY REASONING & STATE LANGUAGE, in the DOM, on the real captures
 * (the Zed/Ahri reference Journey re-captured on the JP4 backend contract
 * `fc95e81e`; the Daily's M1 captures):
 *
 *   * the board: authoritative shards, mirrored fixed halves, one anchor row,
 *     stat mnemonics that cannot be read as inventory, served bonus-AD sources;
 *   * learned history: a learned value is recalled from its `!`, not reprinted —
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
          // JP5 — no anchor row at all (the geometry pass removed its box).
          expect(document.querySelector(".journey-side__anchors, .journey-anchor"), `${file} ${s.label}`).toBeNull();
        }
        unmount();
      }
    }
  });

  it("a half's rows are fixed boxes, and the former anchor row is gone (stylesheet)", () => {
    const rule = (sel: string) => {
      const k = CSS.indexOf(`${sel} {`);
      return k < 0 ? "" : CSS.slice(k, CSS.indexOf("}", k));
    };
    // JP5 geometry pass — the empty anchor row is removed from both densities: a
    // phone's name line spans its column; above a phone a half is id / kit / items.
    expect(CSS).not.toMatch(/journey-side__anchors|grid-area: stats|"stats"/);
    expect(CSS).toMatch(/grid-template-areas: "portrait name name" "portrait kit items";/);
    expect(CSS).toMatch(/grid-template-areas: "id" "kit" "items";/);
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
  it("JP5 — no stat mnemonic badge on the board; a stat's sources are in the champion portrait popup, drawn as the ITEMS and SHARDS they are", () => {
    show(snap(REF, "child1-live"));
    expect(screen.queryByTestId("journey-stat-subject-bonus_attack_damage")).toBeNull();
    // No slot holds a Long Sword: the champion does not own the mnemonic.
    expect(screen.getByTestId("journey-items-subject").querySelector("[data-item-id='1036']")).toBeNull();
    fireEvent.click(screen.getByTestId("journey-portrait-popup-subject"));
    fireEvent.click(screen.getByTestId("journey-portrait-popup-subject-row-bonus_attack_damage-toggle"));
    const sources = screen.getByTestId("journey-portrait-popup-subject-row-bonus_attack_damage-sources");
    const blade = sources.querySelector("[data-source-kind='item'] [data-icon-kind='item']")!;
    expect(blade).toHaveAttribute("data-item-id", "1055");
    expect(blade.className).toMatch(/journey-ico--item/);
    expect(sources.querySelectorAll("[data-source-kind='stat_mod'] [data-icon-kind='shard']")).toHaveLength(2);
  });

  it("the stylesheet: a mnemonic is round and ringed, an item square — the two never share a shape", () => {
    const rule = (sel: string) => CSS.slice(CSS.indexOf(`${sel} {`), CSS.indexOf("}", CSS.indexOf(`${sel} {`)));
    expect(rule(".journey-ico--mnemonic")).toMatch(/border-radius: 9999px/);
    expect(rule(".journey-ico--item")).toMatch(/border-radius: 3px/);
  });
});

describe("Bonus AD provenance: where 21 comes from", () => {
  it("Zed's champion portrait popup carries its served sources (item + two shards) and their exact total", () => {
    show(snap(REF, "child1-live"));
    fireEvent.click(screen.getByTestId("journey-portrait-popup-subject"));
    fireEvent.click(screen.getByTestId("journey-portrait-popup-subject-row-bonus_attack_damage-toggle"));
    const sources = screen.getByTestId("journey-portrait-popup-subject-row-bonus_attack_damage-sources");
    expect([...sources.querySelectorAll("[data-source-kind]")].map((r) => r.getAttribute("aria-label")))
      .toEqual(["Doran's Blade: +10", "Adaptive Force: +5.4", "Adaptive Force: +5.4"]);
    expect(sources).toHaveTextContent("Exact · shown 2120.8");
  });

  it("a stat with no served sources lists none (nothing is derived to fill it)", () => {
    show(m1snap("pantheon.standard", "child2-live"));
    fireEvent.click(screen.getByTestId("journey-portrait-popup-subject"));
    const toggle = screen.queryByTestId("journey-portrait-popup-subject-row-attack_damage-toggle");
    if (toggle) fireEvent.click(toggle);
    const list = screen.queryByTestId("journey-portrait-popup-subject-row-attack_damage-sources");
    expect(list?.querySelectorAll("[data-source-kind]").length ?? 0).toBe(0);
  });
});

describe("learned history: learned facts are recalled, not reprinted", () => {
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
          // …and (JP5) Step 3's armor 24 never is: it lives in Ahri's champion portrait popup.
          expect(b.textContent, `${file} ${s.label}`).not.toMatch(/\b24\b/);
        }
        unmount();
      }
    }
    show(snap(REF, "child3-live"));
    expect(popText("journey-know-subject-E")).toMatch(/Raw damage 85.*learned Step 2/);
    fireEvent.click(screen.getByTestId("journey-portrait-popup-opponent"));
    expect(screen.getByTestId("journey-portrait-popup-opponent-row-armor").textContent).toBe("Armor24Lv 2");
  });
});

describe("the `!` coach: taught once", () => {
  const COACH = "Tap champion portraits to review stats.";
  const stepTo = (r: ReturnType<typeof render>, s: CaptureSnapshot, prev: CaptureSnapshot) => {
    act(() => { vi.advanceTimersByTime(Date.parse(s.at) - Date.parse(prev.at)); });
    vi.setSystemTime(Date.parse(s.at));
    r.rerender(view(s));
  };

  it("the first portrait to gain its `!` brings the coach — not before; it leaves by itself and never comes back", () => {
    // A viewer who saw JP4's board-based coach still gets this one: its own key.
    window.localStorage.setItem("mogzy.journey.knowledgeCoach.v1", "seen");
    expect(KNOWLEDGE_COACH_KEY).toBe("mogzy.journey.portraitCoach.v1");
    const live0 = snap(REF, "child0-live");
    const reveal0 = snap(REF, "child0-reveal");
    const live1 = snap(REF, "child1-live");
    const r = show(live0);
    expect(screen.queryByTestId("journey-know-coach")).toBeNull();
    // Step 1's reveal teaches Zed E's formula (an ability `!`), but no portrait is
    // reviewable yet: no coach.
    stepTo(r, reveal0, live0);
    expect(screen.getByTestId("journey-know-subject-E")).toBeInTheDocument();
    expect(screen.queryByTestId("journey-portrait-popup-subject-mark")).toBeNull();
    expect(screen.queryByTestId("journey-know-coach")).toBeNull();
    // Step 2 states Zed's bonus AD: his portrait gains its `!` — the coach, now.
    stepTo(r, live1, reveal0);
    expect(screen.getByTestId("journey-portrait-popup-subject-mark")).toBeInTheDocument();
    const coach = screen.getByTestId("journey-know-coach");
    expect(coach).toHaveTextContent(COACH);
    expect(coach).toHaveAttribute("role", "status");
    expect(board()).toHaveAttribute("data-coach", "true");
    expect(window.localStorage.getItem(KNOWLEDGE_COACH_KEY)).toBe("seen");
    act(() => { vi.advanceTimersByTime(KNOWLEDGE_COACH_MS + 10); });
    expect(screen.queryByTestId("journey-know-coach")).toBeNull();
    // Ahri's portrait gains its `!` at Step 3's reveal — no second coach.
    const live2 = snap(REF, "child2-live");
    const reveal2 = snap(REF, "child2-reveal");
    stepTo(r, snap(REF, "child1-reveal"), live1);
    stepTo(r, live2, snap(REF, "child1-reveal"));
    stepTo(r, reveal2, live2);
    expect(screen.getByTestId("journey-portrait-popup-opponent-mark")).toBeInTheDocument();
    expect(screen.queryByTestId("journey-know-coach")).toBeNull();
  });

  it("a tap dismisses it; a reload mid-Journey shows none (the `!` is simply there)", () => {
    const r = show(snap(REF, "child0-reveal"));
    stepTo(r, snap(REF, "child1-live"), snap(REF, "child0-reveal"));
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
      // JP5 — Step 4's chain is its whole derivation (six nodes): the dense tier.
      expect(document.querySelector(".journey-reasoning__chain"))
        .toHaveAttribute("data-density", label === "child3-reveal" ? "dense" : "regular");
      cleanup();
    }
    // The node's and the operator's OWN rules (a line of their own in the sheet).
    const rule = (sel: string) => CSS.slice(CSS.lastIndexOf(`\n${sel} {`), CSS.indexOf("}", CSS.lastIndexOf(`\n${sel} {`)));
    expect(rule(".journey-node")).toMatch(/width: var\(--jn-w\);[\s\S]*height: var\(--jn-h\)/);
    expect(rule(".journey-op")).toMatch(/font-size: var\(--jop-fs\);[\s\S]*font-weight: 900/);
  });

  it("operators are read as words and drawn large; the arrow is a drawn stroke, not a faint glyph", () => {
    show(snap(REF, "child3-reveal"));
    const ops = [...document.querySelectorAll<HTMLElement>(".journey-op")];
    expect(ops.map((o) => o.textContent)).toEqual(["gives", "gives", "gives", "gives", "gives"]);
    for (const o of ops) expect(o.querySelector("svg")).not.toBeNull();
    cleanup();
    show(snap(REF, "child1-reveal"));
    // JP5: the raw answer follows by an ARROW (70 + 15 is not how 84.56 was reached).
    expect([...document.querySelectorAll<HTMLElement>(".journey-op")].map((o) => o.textContent))
      .toEqual(["+plus", "gives"]);
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
