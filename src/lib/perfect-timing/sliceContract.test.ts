/**
 * PT5 — the Mastery Slice readers over the REAL backend capture
 * (`sliceCaptureV1.json`, backend `perfect-timing/pt5-slice-authority`), plus
 * every way a deal could leak an answer or break the one-ability promise.
 */
import { describe, expect, it } from "vitest";
import capture from "./__fixtures__/sliceCaptureV1.json";
import { PtContractError } from "./contract";
import { parseSliceDeal, parseSliceRelease, toSliceRevealBase } from "./sliceContract";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const deal = () => clone(capture.deal.response) as Json;
const release = (i: number) => clone(capture.locks[i].response) as Json;

describe("parseSliceDeal", () => {
  it("reads the captured Ezreal Q slice: one ability, ranks 1 → 3 → 3, Sheen last", () => {
    const d = parseSliceDeal(capture.deal.response);
    expect([d.champion, d.slot, d.ability_name]).toEqual(["Ezreal", "Q", "Mystic Shot"]);
    expect(d.stages.map((s) => [s.kind, s.rank, s.ability_haste, s.modifier?.name ?? null])).toEqual([
      ["foundation", 1, 0, null], ["rank_up", 3, 0, null], ["equipped", 3, 10, "Sheen"],
    ]);
    expect(d.stages[2].modifier).toEqual({ type: "item", item_id: 3057, name: "Sheen", ability_haste: 10 });
    expect(d.assumption).toBe("no_cooldown_refunds");
    expect(d.start_stage).toBe(1);
  });

  it("reads a resumed deal with its earlier stages closed", () => {
    const d = parseSliceDeal(capture.resume.response);
    expect(d.start_stage).toBe(3);
    expect(d.stages.map((s) => s.round_id === null)).toEqual([true, true, false]);
  });

  it.each([
    ["target_ms", (d: Json) => { d.stages[0].target_ms = 5500; }],
    ["cooldown", (d: Json) => { d.cooldown = "5.5"; }],
    ["cooldown_raw", (d: Json) => { d.authority.cooldown_raw = "5.5 / 5.25 / 5 / 4.75 / 4.5"; }],
    ["by_rank", (d: Json) => { d.by_rank = [5.5]; }],
    ["base_cooldown_ms", (d: Json) => { d.stages[2].base_cooldown_ms = 5000; }],
    ["exact_ms", (d: Json) => { d.stages[2].exact_ms = "4545.4545"; }],
    ["calculation", (d: Json) => { d.calculation = {}; }],
    ["formula", (d: Json) => { d.stages[2].modifier.formula = "x"; }],
  ])("refuses a deal that carries %s anywhere", (_key, mutate) => {
    const d = deal();
    mutate(d);
    expect(() => parseSliceDeal(d)).toThrow(/answer key in a pre-reveal payload/);
  });

  it.each([
    ["a different rank on rank up", (d: Json) => { d.stages[1].rank = 2; }],
    ["stages out of order", (d: Json) => { d.stages = [d.stages[1], d.stages[0], d.stages[2]]; }],
    ["two stages", (d: Json) => { d.stages.pop(); }],
    ["an item before the equipped stage", (d: Json) => { d.stages[1].modifier = d.stages[2].modifier; }],
    ["haste before the item", (d: Json) => { d.stages[0].ability_haste = 10; }],
    ["haste that is not the item's", (d: Json) => { d.stages[2].ability_haste = 20; }],
    ["no item on the equipped stage", (d: Json) => { d.stages[2].modifier = null; }],
    ["a duplicate round id", (d: Json) => { d.stages[1].round_id = d.stages[0].round_id; }],
    ["a round id on a closed stage", (d: Json) => { d.start_stage = 2; }],
    ["no round id on an open stage", (d: Json) => { d.stages[0].round_id = null; }],
    ["an unknown assumption", (d: Json) => { d.assumption = "with_refunds"; }],
    ["an unknown key", (d: Json) => { d.extra = 1; }],
    ["a v1 contract string", (d: Json) => { d.contract = "perfect_timing.deal.v1"; }],
    ["a bad slice id", (d: Json) => { d.slice_id = "pt_" + "0".repeat(32); }],
  ])("refuses %s", (_why, mutate) => {
    const d = deal();
    mutate(d);
    expect(() => parseSliceDeal(d)).toThrow(PtContractError);
  });
});

describe("parseSliceRelease", () => {
  it("reads each captured stage release and keeps the server's numbers", () => {
    const rs = capture.locks.map((l) => parseSliceRelease(l.response));
    expect(rs.map((r) => [r.stage, r.kind, r.target_ms])).toEqual([[1, "foundation", 5500], [2, "rank_up", 5000], [3, "equipped", 4545]]);
    expect(rs[2].calculation).toMatchObject({ base_cooldown_ms: 5000, ability_haste: 10, exact_ms: "4545.4545" });
    expect(rs[2].authority.item).toEqual({ item_id: 3057, name: "Sheen", ability_haste: 10, source_revision: "4065930" });
    // The whole progression only comes with the final stage.
    expect(rs.map((r) => r.authority.cooldown_raw)).toEqual([null, null, "5.5 / 5.25 / 5 / 4.75 / 4.5"]);
  });

  it("puts only this rank's value in the shared reveal view", () => {
    const view = toSliceRevealBase(parseSliceRelease(capture.locks[0].response));
    expect(view.cooldownRaw).toBe("5.5");
    expect(view.rank).toBe(1);
  });

  it.each([
    ["an error that is not elapsed - target", (r: Json) => { r.error_ms += 1; }],
    ["an exact value that does not round to the target", (r: Json) => { r.calculation.exact_ms = "4600.0000"; }],
    ["haste without its item", (r: Json) => { r.authority.item = null; }],
    ["an item haste that disagrees", (r: Json) => { r.authority.item.ability_haste = 12; }],
    ["a kind that is not its stage's", (r: Json) => { r.kind = "rank_up"; }],
    ["a rank that is not its stage's", (r: Json) => { r.calculation.rank = 1; }],
    ["an out-of-enum tier", (r: Json) => { r.tier = "excellent"; }],
    ["an unknown key", (r: Json) => { r.extra = true; }],
  ])("refuses %s", (_why, mutate) => {
    const r = release(2);
    mutate(r);
    expect(() => parseSliceRelease(r)).toThrow(PtContractError);
  });

  it("refuses a no-haste stage whose target is not its base", () => {
    const r = release(0);
    r.calculation.base_cooldown_ms = 5000;
    expect(() => parseSliceRelease(r)).toThrow(PtContractError);
  });
});
