/**
 * UX-7 — contract tests of the E3B campaign client against REAL responses:
 * `fixtures/e3b-campaign-samples.json` (the backend's 13 samples, verbatim) and
 * `fixtures/e3b-live-capture.json` (states captured from a local E3B backend by
 * `scripts/dynasty/capture_ux7_e3b_live.py`). If the campaign schema, the request
 * shapes or the series linkage drift, these fail first.
 */
import { describe, expect, it, vi } from "vitest";
import samplesJson from "./fixtures/e3b-campaign-samples.json";
import liveJson from "./fixtures/e3b-live-capture.json";
import { CampaignContractError, readCampaignList, readCampaignSnapshot, type CampaignSnapshot } from "./campaignContracts";
import { CAMPAIGN_SERIES_STORE_KEY, CampaignError, CampaignSeriesTransport, LiveCampaignClient, abandonRequest, settleRequest } from "./campaignTransport";
import { isManaged, readE2Snapshot } from "./e2contracts";
import { memoryStore } from "./fixtureServer";
import { LIVE_STORE_KEY } from "./liveTransport";
import { isFinalRound, stripBeats } from "@/pages/dev/dynasty-v2/campaign/campaignView";

vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "http://backend.test",
  buildAdminHeaders: vi.fn(async () => ({ Authorization: "Bearer owner-session" })),
}));

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Sample = { state: string; request: Json; response: Json };
const SAMPLES = (samplesJson as unknown as { samples: Sample[] }).samples;
const LIVE = (liveJson as unknown as { samples: Sample[] }).samples;
const S = Object.fromEntries([...SAMPLES, ...LIVE].map((x) => [x.state, x])) as Record<string, Sample>;
const R = (state: string) => JSON.parse(JSON.stringify(S[state].response));
const SNAPSHOTS = ["campaign_created", "series_result_awaiting_settlement", "series_settled_transition", "campaign_in_series", "champion_ending", "elimination_ending", "abandoned", "rematch_window", "abandoned_unsettled"];
const BASE = "http://backend.test/api/admin/dynasty/v2";

/** The refusal a call must end in. */
async function fails(p: Promise<unknown>): Promise<CampaignError> {
  try { await p; } catch (e) { return e as CampaignError; }
  throw new Error("expected a refusal");
}

function scripted(queue: { status?: number; body?: unknown; throws?: boolean }[]) {
  const calls: { url: string; method: string; body: Json }[] = [];
  const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected request ${String(url)}`);
    if (next.throws) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { "Content-Type": "application/json" } });
  });
  return { f: f as unknown as typeof fetch, calls };
}

describe("E3B campaign responses (backend samples + live capture)", () => {
  it("every captured snapshot and listing passes the UX-7 gate", () => {
    for (const st of SNAPSHOTS) expect(readCampaignSnapshot(R(st)).schema_revision, st).toBeGreaterThanOrEqual(1);
    for (const st of ["discovery_single", "discovery_none", "discovery_all", "listing_all"]) expect(readCampaignList(R(st)).campaigns).toBeInstanceOf(Array);
    expect(readCampaignList(R("discovery_single")).resume.reason).toBe("single");
    expect(readCampaignList(R("discovery_none")).resume.reason).toBe("none");
  });

  it("refuses drifted snapshots instead of guessing", () => {
    const bad = (mut: (s: Json) => void) => { const s = R("campaign_created"); mut(s); return () => readCampaignSnapshot(s); };
    expect(bad((s) => { s.schema = "dynasty.combat_v2.campaign.snapshot.e4"; })).toThrow(CampaignContractError);
    expect(bad((s) => { s.schema_revision = 0; })).toThrow(CampaignContractError);
    expect(bad((s) => { s.phase = "playoffs"; })).toThrow(/unknown campaign phase/);
    expect(bad((s) => { s.current_series = null; })).toThrow(/without an open series/);
    expect(bad((s) => { s.roster = null; })).toThrow(/roster/);
    const r = R("series_result_awaiting_settlement"); r.next = { kind: "play_series" };
    expect(() => readCampaignSnapshot(r)).toThrow(/settle_series/);
    const e = R("champion_ending"); e.ending = null;
    expect(() => readCampaignSnapshot(e)).toThrow(/ending/);
  });

  it("documents the shapes the API doc leaves out (verified live)", () => {
    // A run abandoned before any settlement serves roster: null (the backend's own sample agrees).
    expect(R("abandoned").roster).toBeNull();
    expect(R("abandoned_unsettled").roster).toBeNull();
    // Listing rows: standing is [wins, losses] and ending is the kind string.
    const row = readCampaignList(R("discovery_all")).campaigns.find((x) => x.status === "completed")!;
    expect(Array.isArray(row.standing.regular)).toBe(true);
    expect(typeof row.ending).toBe("string");
    // The rematch window: rematch_of lists series indices; rival.meetings carries the open meeting with a null score.
    const w = readCampaignSnapshot(R("rematch_window"));
    expect(w.current_series!.round).toBe("playoffs.semifinal");
    expect(w.current_series!.elimination_if_lost).toBe(true);
    expect(w.story.stakes!.rematch_of.every((x) => typeof x === "number")).toBe(true);
    expect(w.story.rival!.meetings.some((m) => m.score === null)).toBe(true);
    expect(w.story.rival!.meetings.some((m) => m.score !== null && m.result === "lost")).toBe(true);
  });

  it("a campaign series is the UX-6 series (revision 4, management gate) with its campaign block", () => {
    const s = readE2Snapshot(R("campaign_series_after_preparation"));
    expect(s.schema_revision).toBe(4);
    expect(isManaged(s)).toBe(true);
    const j = R("campaign_series_after_preparation");
    expect(j.campaign.series_index).toBe(2);
    expect(j.management.entry_scenario.key).toBe("campaign");
  });
});

describe("campaign actions are built from the server's offer only", () => {
  it("settle sends next.payload with the campaign seq; nothing outside series_result", () => {
    const c = readCampaignSnapshot(R("series_result_awaiting_settlement"));
    expect(settleRequest(c, "ux7-settle-x")).toEqual({ expected_seq: c.seq, action_id: "ux7-settle-x", kind: "settle_series", payload: c.next!.payload });
    expect(settleRequest(readCampaignSnapshot(R("campaign_created")), "x")).toBeNull();
    expect(settleRequest(readCampaignSnapshot(R("champion_ending")), "x")).toBeNull();
  });
  it("abandon uses the offered action and is unavailable once the run ended", () => {
    const c = readCampaignSnapshot(R("campaign_created"));
    expect(abandonRequest(c, "ux7-ab")).toEqual({ expected_seq: c.seq, action_id: "ux7-ab", kind: "abandon", payload: { confirm: "abandon" } });
    expect(abandonRequest(readCampaignSnapshot(R("champion_ending")), "x")).toBeNull();
  });
});

describe("LiveCampaignClient", () => {
  it("lists, reads, starts with the exact body, and settles with the identical body on retry", async () => {
    const res = R("series_result_awaiting_settlement");
    const b = scripted([{ body: R("discovery_single") }, { body: R("campaign_created") }, { body: { ...R("campaign_created"), created: true } }, { throws: true }, { body: { ...R("series_settled_transition"), duplicate: true } }]);
    const cl = new LiveCampaignClient({ fetchImpl: b.f });
    expect((await cl.list()).resume.reason).toBe("single");
    expect((await cl.get("wdc3_x")).phase).toBe("series");
    await cl.start("ux7-run-key-0001", "broad_mid_win", "refuse");
    expect(b.calls[2]).toMatchObject({ method: "POST", url: `${BASE}/campaigns`, body: { start_key: "ux7-run-key-0001", qualification_policy: "broad_mid_win", when_active_exists: "refuse" } });
    expect(Object.keys(b.calls[2].body).sort()).toEqual(["qualification_policy", "start_key", "when_active_exists"]);
    const req = settleRequest(readCampaignSnapshot(res), "ux7-settle-1")!;
    const lost = await fails(cl.act(res.campaign_id, req));
    expect(lost).toBeInstanceOf(CampaignError);
    expect(lost.code).toBe("NETWORK");
    expect(lost.retryable).toBe(true);
    const out = await cl.act(res.campaign_id, req);
    expect(out.duplicate).toBe(true);
    expect(b.calls[3].body).toEqual(b.calls[4].body); // the retry is byte-identical
    expect(Object.keys(b.calls[4].body).sort()).toEqual(["action_id", "expected_seq", "kind", "payload"]);
    expect(JSON.stringify(b.calls.map((c) => c.body))).not.toMatch(/score|result|ending|opponent|wins|placement/);
  });

  it("maps refusals: active run (with the listing), stale (with the fresh state), integrity and schema", async () => {
    const refused = S.refused_active_campaign_exists.response;
    const b = scripted([
      { status: 409, body: { detail: refused.detail } },
      { status: 409, body: { detail: { code: "STALE_SEQ", message: "expected_seq 0 but the campaign is at 3" } } }, { body: R("series_settled_transition") },
      { status: 409, body: R("refused_settle_before_series_completed") }, { body: R("campaign_in_series") },
      { status: 500, body: { detail: { code: "DYNASTY_CAMPAIGN_INTEGRITY", message: "replay failed" } } },
      { status: 503, body: { detail: { code: "DYNASTY_CAMPAIGN_SCHEMA_MISSING", message: "migrate" } } },
      { status: 403, body: { detail: "Owner authorization required" } },
    ]);
    const cl = new LiveCampaignClient({ fetchImpl: b.f });
    const a = await fails(cl.start("ux7-run-key-0002", "broad_mid_win", "refuse"));
    expect(a.code).toBe("ACTIVE_EXISTS");
    expect(a.listing?.campaigns.length).toBeGreaterThan(0);
    const c = readCampaignSnapshot(R("series_result_awaiting_settlement"));
    const st = await fails(cl.act(c.campaign_id, settleRequest(c, "x")!));
    expect(st.code).toBe("STALE");
    expect(st.fresh?.last_transition?.from_series).toBe(1);
    const nf = await fails(cl.act(c.campaign_id, settleRequest(c, "y")!));
    expect(nf.code).toBe("SERIES_NOT_FINISHED");
    expect(nf.fresh?.phase).toBe("series");
    expect((await fails(cl.get("x"))).code).toBe("INTEGRITY");
    expect((await fails(cl.list())).code).toBe("SCHEMA_MISSING");
    expect((await fails(cl.list())).code).toBe("AUTH");
  });
});

describe("CampaignSeriesTransport (the UX-6 series transport, pinned)", () => {
  it("resumes the pinned series by id (never standalone discovery), never creates, keeps its own store key", async () => {
    const snap = R("campaign_series_after_preparation");
    const store = memoryStore();
    const b = scripted([{ body: snap }]);
    const t = new CampaignSeriesTransport(snap.series_id, { store, fetchImpl: b.f });
    const env = await t.resume();
    expect(b.calls.map((c) => c.url)).toEqual([`${BASE}/series/${snap.series_id}`]);
    expect(env && "series" in env && env.series.series_id).toBe(snap.series_id);
    expect(store.get(CAMPAIGN_SERIES_STORE_KEY)).toBeTruthy();
    expect(store.get(LIVE_STORE_KEY)).toBeNull();
    await expect(t.create()).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    await t.abandon();
    expect(b.calls.length).toBe(1);
  });
});

describe("campaign presentation helpers pick, never decide", () => {
  it("story strips keep one beat per kind and the stakes/rematch beats when full", () => {
    const w = readCampaignSnapshot(R("rematch_window"));
    const kinds = stripBeats(w.story.beats).map((b) => b.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds.length).toBeLessThanOrEqual(4);
    expect(kinds).toEqual(expect.arrayContaining(["rematch", "stakes"]));
    for (const b of stripBeats(w.story.beats)) expect(w.story.beats.map((x) => x.text)).toContain(b.text);
  });
  it("the final round is read from the served format", () => {
    const c: CampaignSnapshot = readCampaignSnapshot(R("campaign_created"));
    expect(isFinalRound(c)).toBe(false);
    const f = R("campaign_created"); f.current_series.round = "worlds.final";
    expect(isFinalRound(readCampaignSnapshot(f))).toBe(true);
  });
});
