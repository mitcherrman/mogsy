/**
 * PT4 contract tests over the REAL backend capture.
 *
 * `__fixtures__/captureV1.json` is byte-identical to backend
 * League_Combat_Simulator `perfect_timing/fixtures/capture_v1.json` at
 * `1b81c460` (branch perfect-timing/pt3-cooldown-authority); see
 * `__fixtures__/captureV1.md`.
 */
import { describe, expect, it } from "vitest";
import capture from "./__fixtures__/captureV1.json";
import {
  DEAL_CONTRACT, PtContractError, RELEASE_CONTRACT, assertNoAnswerKeys, isAnswerKey, parseDeal, parseRelease, toRevealView,
} from "./contract";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const deal = () => clone(capture.deal.response) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const release = (i = 0) => clone(capture.locks[i].response) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("perfect_timing.deal.v1 — captured", () => {
  it("parses the captured deal exactly", () => {
    const d = parseDeal(deal());
    expect(d.contract).toBe(DEAL_CONTRACT);
    expect(d.data_label).toEqual({ patch_label: null, patch_source: "unknown", ability_haste: 0 });
    expect(d.rounds).toHaveLength(5);
    expect(d.rounds.map((r) => `${r.champion} ${r.slot} ${r.rank ?? "any"}`)).toEqual([
      "Ahri E any", "Lux E 4", "Ahri W 4", "Annie Q any", "Aatrox E 2",
    ]);
  });

  it("the captured deal carries no answer key at any depth", () => {
    expect(() => assertNoAnswerKeys(capture.deal.response)).not.toThrow();
    expect(JSON.stringify(capture.deal.response)).not.toMatch(/target|cooldown|by_rank/i);
  });

  it.each([
    ["target_ms", 7000],
    ["cooldown", 7],
    ["cooldown_seconds", 7],
    ["cooldown_raw", "7 / 7 / 7"],
    ["by_rank", [7, 7, 7]],
  ])("refuses a deal round carrying %s", (key, value) => {
    const d = deal();
    d.rounds[1][key] = value;
    expect(() => parseDeal(d)).toThrow(/answer key/);
  });

  it("refuses an answer key nested anywhere, and at the top level", () => {
    const nested = deal();
    nested.rounds[0].extra = { deeper: [{ Cooldown_MS: 1 }] };
    expect(() => parseDeal(nested)).toThrow(/answer key/);
    const top = deal();
    top.target_ms = 1;
    expect(() => parseDeal(top)).toThrow(/answer key/);
  });

  it("refuses an unknown contract, an unknown key and wrong types", () => {
    expect(() => parseDeal({ ...deal(), contract: "perfect_timing.deal.v2" })).toThrow(PtContractError);
    const extra = deal(); extra.rounds[0].hint = "x";
    expect(() => parseDeal(extra)).toThrow(/unexpected key/);
    const missing = deal(); delete missing.rounds[0].expires_at;
    expect(() => parseDeal(missing)).toThrow(/missing/);
    const slot = deal(); slot.rounds[0].slot = "P";
    expect(() => parseDeal(slot)).toThrow(/slot/);
    const rankStr = deal(); rankStr.rounds[1].rank = "4";
    expect(() => parseDeal(rankStr)).toThrow(/integer/);
    const rankHigh = deal(); rankHigh.rounds[1].rank = 6;
    expect(() => parseDeal(rankHigh)).toThrow(/range/);
    const id = deal(); id.rounds[0].round_id = "Ahri-E";
    expect(() => parseDeal(id)).toThrow(/pt_/);
    const dup = deal(); dup.rounds[1].round_id = dup.rounds[0].round_id;
    expect(() => parseDeal(dup)).toThrow(/duplicate/);
    const haste = deal(); haste.data_label.ability_haste = 20;
    expect(() => parseDeal(haste)).toThrow(/ability_haste/);
    const source = deal(); source.data_label.patch_source = "guess";
    expect(() => parseDeal(source)).toThrow(/patch_source/);
    expect(() => parseDeal({ ...deal(), rounds: [] })).toThrow(/non-empty/);
  });

  it("isAnswerKey names the leak set", () => {
    expect(["target_ms", "cooldown", "cooldown_raw", "COOLDOWN_SECONDS", "by_rank"].every(isAnswerKey)).toBe(true);
    expect(["round_id", "rank", "rank_count", "expires_at"].some(isAnswerKey)).toBe(false);
  });
});

describe("perfect_timing.release.v1 — captured", () => {
  it("parses every captured release, and each answers its own lock request", () => {
    for (const lock of capture.locks) {
      const r = parseRelease(clone(lock.response));
      expect(r.contract).toBe(RELEASE_CONTRACT);
      expect(r.round_id).toBe(lock.round_id);
      expect(r.elapsed_ms).toBe(lock.request.elapsed_ms);
    }
    expect(capture.locks.map((l) => l.response.tier)).toEqual(["perfect", "great", "good", "miss", "perfect"]);
  });

  it("maps a release to the PT1 reveal view without computing anything", () => {
    expect(toRevealView(parseRelease(release(1)))).toEqual({
      elapsedMs: 8925, targetMs: 8500, errorMs: 425, absErrorMs: 425, relativeError: 0.05,
      tier: "great", points: 80, plausible: true, cooldownRaw: "10 / 9.5 / 9 / 8.5 / 8", rank: 4,
    });
    // The captured exceeds_server_window verdict reads as an unverified timing.
    expect(toRevealView(parseRelease(release(4))).plausible).toBe(false);
    // Rank-invariant ability: no rank on the authority.
    expect(toRevealView(parseRelease(release(0))).rank).toBeNull();
  });

  it("refuses a tier outside the enum, wrong types and inconsistent arithmetic", () => {
    expect(() => parseRelease({ ...release(), tier: "excellent" })).toThrow(/tier/);
    expect(() => parseRelease({ ...release(), contract: "perfect_timing.release.v0" })).toThrow(/contract/);
    expect(() => parseRelease({ ...release(), points: 101 })).toThrow(/points/);
    expect(() => parseRelease({ ...release(), points: 9.5 })).toThrow(/integer/);
    expect(() => parseRelease({ ...release(), elapsed_ms: "11760" })).toThrow(/integer/);
    expect(() => parseRelease({ ...release(), error_ms: 240 })).toThrow(/error_ms/);
    expect(() => parseRelease({ ...release(), abs_error_ms: 1 })).toThrow(/abs_error_ms/);
    expect(() => parseRelease({ ...release(), relative_error: -1 })).toThrow(/relative_error/);
    const verdict = release(); verdict.plausibility.verdict = "tampered";
    expect(() => parseRelease(verdict)).toThrow(/verdict/);
    const extra = release(); extra.authority.scoring_version = "pt-scoring-0.1";
    expect(() => parseRelease(extra)).toThrow(/unexpected key/);
  });
});
