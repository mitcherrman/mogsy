/**
 * PGM2 — the five specialized bonus games on their public pages, against a
 * stand-in for the PUBLIC session contract (the backend's own tests cover its
 * grading, ownership, lock-once and secrecy).
 *
 * For each game: it deals, plays a round through the real primitive, draws
 * the server's reveal, reports the round with the answer ONLY after that
 * reveal, ends on a results screen with Play again and the way back to More
 * Challenges, and shows none of the owner lab's chrome.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import capture from "@/lib/combat-estimate/__fixtures__/combatAuthorityCapture.json";
import type { CapturedScenario } from "@/lib/combat-estimate/contract";
import { labFixturesFor, type DropFixture } from "@/pages/dev/interaction-lab/labFixtures";
import {
  ReportableQuestionProvider, useReportableQuestion,
} from "@/lib/feedback/reportable-question";
import type { BonusSessionsApi } from "@/lib/public-modes/sessionsApi";
import type { PublicModeEntry } from "@/lib/public-modes/contracts";
import RangefinderGame from "./RangefinderGame";
import GlyphPressGame from "./GlyphPressGame";
import StatDropGame from "./StatDropGame";
import CombatEstimateGame from "./CombatEstimateGame";

function mockBoxes() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const id = this.getAttribute?.("data-testid");
    const size: Record<string, [number, number]> = {
      "rangefinder-field": [668, 420], "gp-bed": [600, 300], "gp-drum-window": [400, 56],
    };
    const [w, h] = size[id ?? ""] ?? [0, 0];
    return { x: 0, y: 0, left: 0, top: 0, right: w, bottom: h, width: w, height: h, toJSON() {} } as DOMRect;
  });
}

beforeEach(() => { mockBoxes(); URL.revokeObjectURL = vi.fn(); });
afterEach(() => { vi.restoreAllMocks(); });

const entry = (id: string, title: string) => ({ id, title, reportId: id } as unknown as PublicModeEntry);

function ReportProbe() {
  const snap = useReportableQuestion();
  return <pre data-testid="report-probe">{JSON.stringify(snap)}</pre>;
}
const report = () => JSON.parse(screen.getByTestId("report-probe").textContent || "null");

const host = (node: React.ReactNode) => render(
  <MemoryRouter initialEntries={["/quiz/more-challenges/x"]}>
    <ReportableQuestionProvider>{node}<ReportProbe /></ReportableQuestionProvider>
  </MemoryRouter>);

const OWNER_WORDS = /owner|prototype|playtest|Dev fixture|backend|PERFECT_TIMING|NUMERIC_LAB|commit/i;

function noOwnerChrome() {
  const text = document.body.textContent ?? "";
  // The report probe prints JSON; judge only what a player can read.
  const probe = screen.getByTestId("report-probe").textContent ?? "";
  expect(text.replace(probe, "")).not.toMatch(OWNER_WORDS);
  expect(screen.getByTestId("bonus-game-back").getAttribute("href")).toBe("/quiz/more-challenges");
}

// ── Rangefinder ─────────────────────────────────────────────────────────────

const stops = (seed: string) => {
  const out = [];
  for (let u = 100; u <= 6000; u += 25) out.push({ token: `rf_${seed}_${u}`, units: u });
  return out;
};

function rfApi() {
  const api = {
    startRangefinder: vi.fn(async () => ({
      contract: "interaction_lab.rangefinder.session.v1", session_id: "sess-rf", authority_label: "x", pool_size: 227,
      rounds: [0, 1].map((i) => ({
        index: i,
        content: {
          prompt: "Set the target at the cast limit.", measureLabel: "Rangefinder · Cast range",
          subject: { label: i ? "Spirit Rush" : "Zephyr", sublabel: i ? "Ahri · R" : "Janna · W", slot: i ? "R" : "W", monogram: "W" },
          field: { unitLabel: "units", stops: stops(String(i)) }, footnote: "Cast range as the League Wiki publishes it",
        },
        art: i ? { champion: "Ahri", slot: "R" } : { champion: "Janna", slot: "W" },
        locked: false,
      })),
    })),
    lockRangefinder: vi.fn(async (sid: string, index: number, stop: string) => {
      const units = Number(stop.split("_")[2]);
      return {
        contract: "interaction_lab.rangefinder.reveal.v1", session_id: sid, index,
        reveal: { lockedToken: stop, canonicalToken: `rf_${index}_550`, verdict: units === 550 ? "exact" : units < 550 ? "short" : "long",
          measurementLabel: "Cast range", canonicalUnits: 550, lockedUnits: units, deltaUnits: units - 550,
          note: null, source: { label: "League Wiki", url: "https://wiki.leagueoflegends.com/x" } },
      };
    }),
  } as unknown as BonusSessionsApi;
  return api;
}

async function lockRangefinder(steps: number) {
  const field = screen.getByTestId("rangefinder-field");
  fireEvent.keyDown(field, { key: "Home" });
  for (let i = 0; i < steps; i++) fireEvent.keyDown(field, { key: "ArrowRight" });
  fireEvent.click(screen.getByTestId("rangefinder-lock"));
  await waitFor(() => expect(screen.getByTestId("rangefinder-game").dataset.phase).toBe("revealed"), { timeout: 3000 });
}

describe("PGM2 — Rangefinder (public)", () => {
  it("plays a session, reports with the answer only after the reveal, and ends on results", async () => {
    const api = rfApi();
    host(<RangefinderGame entry={entry("rangefinder", "Rangefinder")} api={api} />);
    expect(screen.getByTestId("bonus-game-loading")).toBeTruthy();
    await screen.findByTestId("rangefinder-game");
    noOwnerChrome();
    expect(report()).toMatchObject({ gameModeId: "rangefinder", category: "Leaguecraft", mode: "Rangefinder" });
    expect(report().canonicalAnswer).toBeNull();

    await lockRangefinder(18);
    expect(report().canonicalAnswer).toBe("550 units");
    expect(report().answerEvidence).toContain("League Wiki");
    fireEvent.click(screen.getByTestId("bonus-game-next"));
    expect(screen.getByTestId("bonus-game-counter").textContent).toBe("Round 2 / 2");
    expect(report().canonicalAnswer).toBeNull();
    await lockRangefinder(30);
    fireEvent.click(screen.getByTestId("bonus-game-finish"));
    const results = screen.getByTestId("bonus-game-results");
    expect(within(results).getByTestId("bonus-game-results-headline")).toHaveTextContent("1 of 2 exact");
    expect(within(results).getByTestId("bonus-game-results-back").getAttribute("href")).toBe("/quiz/more-challenges");
    expect(results.textContent).toMatch(/never change your Daily score or your Ranked rating/);
    fireEvent.click(within(results).getByTestId("bonus-game-play-again"));
    await waitFor(() => expect(api.startRangefinder).toHaveBeenCalledTimes(2));
  });

  it("an expired session offers a new game, in player words", async () => {
    const { BonusSessionError } = await import("@/lib/public-modes/sessionsApi");
    const api = rfApi();
    (api.lockRangefinder as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new BonusSessionError("gone", 404, "SESSION_EXPIRED"));
    host(<RangefinderGame entry={entry("rangefinder", "Rangefinder")} api={api} />);
    await screen.findByTestId("rangefinder-game");
    fireEvent.keyDown(screen.getByTestId("rangefinder-field"), { key: "End" });
    fireEvent.click(screen.getByTestId("rangefinder-lock"));
    const err = await screen.findByTestId("bonus-game-round-error", undefined, { timeout: 3000 });
    expect(err).toHaveTextContent("This game expired. Start a new one.");
    fireEvent.click(within(err).getByText("Start a new game"));
    await waitFor(() => expect(api.startRangefinder).toHaveBeenCalledTimes(2));
  });
});

// ── Glyph Press ─────────────────────────────────────────────────────────────

const KAISA = ["K", "A", "I", "S", "A"];

function gpApi() {
  const api = {
    startGlyphPress: vi.fn(async () => ({
      contract: "interaction_lab.glyph_press.session.v1", session_id: "sess-gp", authority_label: "x", pool_size: 9,
      rounds: [{
        index: 0,
        content: {
          prompt: "Set this champion's name.", categoryLabel: "Champion",
          clue: { caption: null, monogram: "Ch", mediaPath: "/api/game-modes/glyph_press/sessions/sess-gp/rounds/0/clue" },
          structure: { cells: [{ kind: "glyph", index: 0 }, { kind: "glyph", index: 1 }, { kind: "glyph", index: 2 },
            { kind: "mark", text: "'" }, { kind: "glyph", index: 3 }, { kind: "glyph", index: 4 }], glyphCount: 5 },
          alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", soundingsAllowed: 3, footnote: "League Wiki",
        },
        ledger: { engraved: [null, null, "I", null, null], soundings: [] },
        locked: false,
      }],
    })),
    clueImage: vi.fn(async () => "blob:clue"),
    soundGlyphPress: vi.fn(async (sid: string, index: number, glyph: string) => ({
      contract: "interaction_lab.glyph_press.ledger.v1", session_id: sid, index,
      ledger: { engraved: [null, null, "I", null, null].map((e, i) => (KAISA[i] === glyph ? glyph : e)),
        soundings: [{ glyph, hits: KAISA.filter((g) => g === glyph).length }] },
    })),
    lockGlyphPress: vi.fn(async (sid: string, index: number, glyphs: readonly (string | null)[]) => ({
      contract: "interaction_lab.glyph_press.reveal.v1", session_id: sid, index,
      reveal: { glyphs: KAISA, results: ["right", "sounded", "given", "right", "sounded"], locked: [...glyphs],
        verdict: "solved", answerText: "Kai'Sa", scoreText: "2 of 2 glyphs set right", note: null, source: null },
    })),
  } as unknown as BonusSessionsApi;
  return api;
}

describe("PGM2 — Glyph Press (public)", () => {
  it("fetches the clue from the public route, sounds, locks, and never shows the name before the reveal", async () => {
    const api = gpApi();
    host(<GlyphPressGame entry={entry("glyph_press", "Glyph Press")} api={api} />);
    await screen.findByTestId("glyph-press-game");
    noOwnerChrome();
    expect(api.clueImage).toHaveBeenCalledWith("/api/game-modes/glyph_press/sessions/sess-gp/rounds/0/clue");
    expect((document.body.textContent ?? "")).not.toMatch(/Kai'?Sa/i);
    fireEvent.click(screen.getByTestId("gp-sound"));
    fireEvent.keyDown(screen.getByTestId("gp-forme"), { key: "a" });
    await waitFor(() => expect(api.soundGlyphPress).toHaveBeenCalled());
    const forme = screen.getByTestId("gp-forme");
    fireEvent.keyDown(forme, { key: "k" });
    fireEvent.keyDown(forme, { key: "s" });
    fireEvent.click(screen.getByTestId("gp-lock"));
    await waitFor(() => expect(screen.getByTestId("glyph-press-game").dataset.phase).toBe("revealed"), { timeout: 3000 });
    expect(report()).toMatchObject({ gameModeId: "glyph_press", canonicalAnswer: "Kai'Sa" });
    fireEvent.click(screen.getByTestId("bonus-game-finish"));
    expect(screen.getByTestId("bonus-game-results-headline")).toHaveTextContent("1 of 1 solved");
  });
});

// ── Stat Drop and Combat Estimate ───────────────────────────────────────────

const DROPS = labFixturesFor("stat-drop") as DropFixture[];
const SCENARIOS = (capture as unknown as { scenarios: CapturedScenario[] }).scenarios;

function feedback(guess: number, canonical: number) {
  const error = guess - canonical;
  return { guess, canonical, error, abs_error: Math.abs(error), relative_error: canonical ? Math.abs(error) / Math.abs(canonical) : null, graded: false };
}

function numericApi() {
  const two = DROPS.slice(0, 2);
  const ce = SCENARIOS.slice(0, 1);
  const api = {
    startStatDrop: vi.fn(async () => ({
      contract: "bonus_session.stat_drop.v1", session_id: "sess-sd",
      public: { contract: "numeric_lab.stat_drop.public.v1", authority_label: "x",
        rounds: two.map((f) => ({ id: f.id, domain: f.domain, title: f.title, shape: f.shape, provenance_label: f.provenance, content: f.content })) },
    })),
    lockStatDrop: vi.fn(async (_sid: string, index: number, value: number) => ({
      contract: "bonus_session.stat_drop.release.v1", index,
      release: { round_id: two[index].id, authority_label: "x", released: two[index].hidden },
      feedback: feedback(value, two[index].hidden.canonicalValue),
    })),
    startCombatEstimate: vi.fn(async () => ({
      contract: "bonus_session.combat_estimate.v1", session_id: "sess-ce",
      public: { contract: "numeric_lab.combat_estimate.public.v1", authority_label: "x",
        capture: { contract: "combat_estimate.capture.v1", implementation: "combat_calculations.physical_ability_damage.v1" },
        rounds: ce.map((s) => ({
          id: s.id, kind: s.kind, difficulty: s.difficulty, metric: s.metric,
          attacker: { champion: s.attacker.champion, level: s.attacker.level, items: s.attacker.items,
            stats: { attack_damage: s.attacker.stats.attack_damage, bonus_attack_damage: s.attacker.stats.bonus_attack_damage, ability_power: s.attacker.stats.ability_power } },
          ability: { slot: s.ability.slot, name: s.ability.name, rank: s.ability.rank, max_rank: s.ability.max_rank, component: s.ability.component },
          target: s.target, penetration: s.penetration, scale: s.scale, assumptions: s.assumptions,
        })) },
    })),
    lockCombatEstimate: vi.fn(async (_sid: string, index: number, estimate: number) => {
      const s = ce[index];
      return {
        contract: "bonus_session.combat_estimate.release.v1", index,
        release: { round_id: s.id, authority_label: "x",
          released: { metric: s.metric, exact: s.answer.exact, whole: s.answer.whole, result: s.result, working: s.working,
            provenance: s.provenance, formula_text: s.ability.formula_text, tier: s.ability.tier } },
        feedback: feedback(estimate, s.answer.whole),
      };
    }),
  } as unknown as BonusSessionsApi;
  return { api, two, ce };
}

describe("PGM2 — Stat Drop (public)", () => {
  it("locks once per round, reveals the value with the error, grades nothing", async () => {
    const { api, two } = numericApi();
    host(<StatDropGame entry={entry("stat_drop", "Stat Drop")} api={api} />);
    const slider = await screen.findByRole("slider");
    noOwnerChrome();
    expect(report().canonicalAnswer).toBeNull();
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: /lock/i }));
    await waitFor(() => expect(screen.getByTestId("stat-drop-game")).toHaveAttribute("data-phase", "revealed"), { timeout: 3000 });
    expect(api.lockStatDrop).toHaveBeenCalledWith("sess-sd", 0, expect.any(Number));
    expect(report()).toMatchObject({ gameModeId: "stat_drop", canonicalAnswer: two[0].hidden.canonicalDisplay });
    expect(screen.getByTestId("stat-drop-game-rail-right").textContent).toMatch(/No — estimation only/);
    expect(document.body.textContent).not.toMatch(/\b(Correct|Incorrect|Passed|Failed)\b/);
  });
});

describe("PGM2 — Combat Estimate (public)", () => {
  it("draws no fake opponent or clock, locks once, and reveals CE1's descriptive comparison", async () => {
    const { api, ce } = numericApi();
    host(<CombatEstimateGame entry={entry("combat_estimate", "Combat Estimate")} api={api} />);
    const root = await screen.findByTestId("combat-estimate-game");
    noOwnerChrome();
    expect(root.textContent).not.toMatch(/\bBot\b/);
    const slider = within(root).getByRole("slider");
    act(() => { slider.focus(); });
    for (let i = 0; i < 3; i++) fireEvent.keyDown(slider, { key: "PageUp" });
    fireEvent.click(within(root).getByRole("button", { name: /lock estimate/i }));
    await waitFor(() => expect(root).toHaveAttribute("data-phase", "revealed"));
    expect(report()).toMatchObject({ gameModeId: "combat_estimate", canonicalAnswer: String(ce[0].answer.whole) });
    expect(report().answerEvidence).not.toMatch(/backend/);
    fireEvent.click(screen.getByTestId("bonus-game-finish"));
    expect(screen.getByTestId("bonus-game-results")).toHaveTextContent(/Off by|Run complete/);
  });
});
