/**
 * JATTN1 — DEPLOY ORDER: frontend first, backend second.
 *
 * The J3 reader is a strict allowlist, so a frontend that predates JATTN1
 * refuses a Combat focus carrying `target_stat`. This frontend must therefore
 * draw BOTH backends, and must keep refusing anything else unknown:
 *
 *   prior backend   `__fixtures__/jattn1/prior-backend/` — the real payloads of
 *                   the backend currently on `origin/master` (no `target_stat`,
 *                   `object: null` on damage facts), same harness and seeds
 *                   as `__fixtures__/jattn1/`;
 *   JATTN1 backend  `__fixtures__/jattn1/` — the same Journeys with the
 *                   additive keys.
 *
 * Both are read by the production path (`readPublicRound` → the module), so
 * the current strict Ranked reader is exercised, not a test-only parse.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { readJourneyJ3 } from "@/lib/journey/j3";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { resetKnowledgeCoach } from "@/components/journey/useKnowledgeCoach";
import { masterySliceModule } from "./masterySliceModule";

const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__");
type Wire = Record<string, unknown>;
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(FIX, `${n}.json`), "utf8"));
const seg = (s: CaptureSnapshot) => (s.envelope.payload as { segment_state: Wire | null }).segment_state;
const journeyOf = (s: CaptureSnapshot) =>
  (seg(s) as { challenges: { journey: { children: { state: { focus: Wire } }[] } } } | null)?.challenges.journey;

const PAIRS = [
  ["jattn1/prior-backend/zed_ahri.reference", "jattn1/zed_ahri.reference"],
  ["jattn1/prior-backend/pantheon.standard", "jattn1/pantheon.standard"],
] as const;

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
const savedTags = () => [...document.querySelectorAll<HTMLElement>(".journey-saved-tag")].map((t) => t.dataset.testid).sort();
const reticles = () => [...document.querySelectorAll<HTMLElement>(".journey-reticle")].map((t) => t.dataset.testid).sort();

/** Every snapshot in server-instant order, polled as a client does; what the board shows at each. */
function playAll(n: string) {
  const all = load(n).filter((s) => seg(s) !== null).map((s, i) => [s, i] as const)
    .sort(([x, i], [y, j]) => Date.parse(x.at) - Date.parse(y.at) || i - j).map(([s]) => s);
  const seen: { label: string; saved: string[]; savedLine: string | null; reticles: string[]; board: boolean }[] = [];
  const visit = (s: CaptureSnapshot) => seen.push({
    label: s.label, saved: savedTags(), savedLine: screen.queryByTestId("journey-saved-line")?.textContent ?? null,
    reticles: reticles(), board: screen.queryByTestId("journey-board") !== null,
  });
  vi.setSystemTime(Date.parse(all[0].at));
  const r = render(view(all[0]));
  visit(all[0]);
  for (let i = 1; i < all.length; i++) {
    act(() => { vi.advanceTimersByTime(Date.parse(all[i].at) - Date.parse(all[i - 1].at)); });
    vi.setSystemTime(Date.parse(all[i].at));
    r.rerender(view(all[i]));
    visit(all[i]);
  }
  cleanup();
  return seen;
}

vi.setConfig({ testTimeout: 30_000 });
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); resetKnowledgeCoach(); });
afterEach(() => { cleanup(); vi.useRealTimers(); resetKnowledgeCoach(); });

describe("the prior backend's payload (no JATTN1 keys) on this frontend", () => {
  it.each(PAIRS)("%s is genuinely pre-JATTN1 and every snapshot reads through the strict Ranked reader", (prior) => {
    const raw = readFileSync(join(FIX, `${prior}.json`), "utf8");
    expect(raw).not.toContain("\"target_stat\"");
    for (const s of load(prior)) {
      const round = readPublicRound(s.envelope);
      const j = round.segmentState?.journey;
      if (!j) continue;
      for (const c of j.children) {
        if (c.state.focus?.engine === "combat") expect(c.state.focus.targetStat, s.label).toBeNull();
      }
    }
  });
});

describe("the JATTN1 backend's payload on this frontend", () => {
  it.each(PAIRS)("%s → %s: reads, and a post-mitigation Combat child names its target stat", (_prior, next) => {
    const stats = new Set<string | null>();
    for (const s of load(next)) {
      const j = readPublicRound(s.envelope).segmentState?.journey;
      for (const c of j?.children ?? []) if (c.state.focus?.engine === "combat") stats.add(c.state.focus.targetStat);
    }
    expect([...stats].some((x) => x === "armor" || x === "magic_resist")).toBe(true);
  });
});

describe("same Journey, both backends, through the module", () => {
  it.each(PAIRS)("%s ≡ %s: identical Saved behaviour; Relevant differs only by the target_stat portrait cue", (prior, next) => {
    const a = playAll(prior);
    const b = playAll(next);
    expect(b.map((x) => x.label)).toEqual(a.map((x) => x.label));
    // The board draws at the same instants on both (always on a live child).
    expect(b.map((x) => [x.label, x.board])).toEqual(a.map((x) => [x.label, x.board]));
    expect(a.filter((x) => x.label.endsWith("-live")).every((x) => x.board)).toBe(true);
    // SAVED does not depend on the new keys: raw damage is anchored by the legacy
    // field name on the prior payload and by its structured object on the new one.
    expect(b.map((x) => [x.label, x.saved, x.savedLine])).toEqual(a.map((x) => [x.label, x.saved, x.savedLine]));
    expect(a.some((x) => x.saved.length > 0)).toBe(true);
    // RELEVANT: never fewer cues; the new payload adds exactly the target's
    // portrait where its focus names a stat — so the prior payload, lacking
    // the key, drew no target cue there (no inference).
    let added = 0;
    for (let i = 0; i < a.length; i++) {
      const extra = b[i].reticles.filter((t) => !a[i].reticles.includes(t));
      expect(a[i].reticles.filter((t) => !b[i].reticles.includes(t)), a[i].label).toEqual([]);
      for (const t of extra) expect(t, b[i].label).toMatch(/^journey-portrait-popup-(subject|opponent)-relevant$/);
      added += extra.length;
    }
    expect(added).toBeGreaterThan(0);
  });
});

describe("the reader stays strict (validation not weakened)", () => {
  const combatChild = () => {
    const s = load("jattn1/zed_ahri.reference").find((x) => x.label === "child3-live")!;
    return structuredClone(journeyOf(s)!);
  };
  it("target_stat outside armor | magic_resist is refused", () => {
    const raw = combatChild();
    raw.children[3].state.focus.target_stat = "attack_damage";
    expect(() => readJourneyJ3(raw)).toThrow(/target_stat/);
  });
  it("an unknown key on a Combat focus is still refused", () => {
    const raw = combatChild();
    raw.children[3].state.focus.target_value = 42;
    expect(() => readJourneyJ3(raw)).toThrow();
  });
  it("target_stat is Combat-only: a champion or matchup focus carrying it is refused", () => {
    const raw = combatChild();
    const champion = raw.children.find((c) => c.state.focus?.engine === "champion");
    expect(champion).toBeDefined();
    champion!.state.focus.target_stat = "armor";
    expect(() => readJourneyJ3(raw)).toThrow();
  });
});
