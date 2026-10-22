/**
 * UX-7 — the live E3B campaign client and the campaign-pinned series transport.
 *
 *   list      GET  /campaigns?include_finished=   owner-scoped discovery (resume none | single | multiple)
 *   get       GET  /campaigns/{id}                verified replay
 *   start     POST /campaigns {start_key, qualification_policy, when_active_exists}
 *             automatic entry sends "refuse" (409 ACTIVE_CAMPAIGN_EXISTS -> the listing to pick from);
 *             an explicit "New run" sends "create". A retried start reuses its start_key: same campaign.
 *   settle    POST /campaigns/{id}/actions {expected_seq, action_id, kind: settle_series, payload: next.payload}
 *   abandon   POST /campaigns/{id}/actions {..., kind: abandon, payload: {confirm: "abandon"}}
 *
 * Retries follow E2: a lost response is resent with the IDENTICAL body (same
 * action_id), which the server answers `duplicate: true` and never applies twice.
 * The settle payload is the server's own `next.payload`; nothing is derived here.
 *
 * Gameplay inside each BO5 stays on the UX-6 series transport. `CampaignSeriesTransport`
 * is that transport pinned to the campaign's open series: its `resume` reads that
 * series (standalone discovery never lists campaign series), and it never creates
 * or abandons a series (the campaign owns both).
 */
import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";
import { readErrorBody } from "@/lib/dynasty/client";
import { TransportError, type SeriesEnvelope } from "./contracts";
import { CAMPAIGN_API, CampaignContractError, readCampaignList, readCampaignSnapshot, type CampaignList, type CampaignPolicy, type CampaignSnapshot } from "./campaignContracts";
import { LiveSeriesTransport, type LiveTransportOptions } from "./liveTransport";
import type { SeriesChoices } from "./transport";

export type CampaignErrorCode =
  | "NETWORK"
  | "AUTH"
  | "DISABLED"
  | "SCHEMA_MISSING"       // 503: the campaign migration is not applied
  | "ACTIVE_EXISTS"        // start refused: another run is active (`listing`)
  | "STALE"                // STALE_SEQ / WRONG_SERIES: another device moved on; re-read
  | "SERIES_NOT_FINISHED"  // settle too early: refresh
  | "OVER"                 // CAMPAIGN_OVER
  | "NOT_FOUND"
  | "REFUSED"              // any other 4xx refusal (message verbatim)
  | "INTEGRITY"            // 500 DYNASTY_CAMPAIGN_INTEGRITY: fails closed
  | "SERVER";

export class CampaignError extends Error {
  constructor(public code: CampaignErrorCode, message: string, public serverCode: string | null = null, public fresh?: CampaignSnapshot, public listing?: CampaignList) {
    super(message);
    this.name = "CampaignError";
  }
  get retryable() { return this.code === "NETWORK" || this.code === "SERVER"; }
}

function codeOf(status: number | null, code: string | null): CampaignErrorCode {
  if (status === null) return "NETWORK";
  if (code === "DYNASTY_DISABLED") return "DISABLED";
  if (status === 401 || status === 403) return "AUTH";
  if (code === "DYNASTY_CAMPAIGN_SCHEMA_MISSING") return "SCHEMA_MISSING";
  if (code === "ACTIVE_CAMPAIGN_EXISTS") return "ACTIVE_EXISTS";
  if (code === "STALE_SEQ" || code === "WRONG_SERIES") return "STALE";
  if (code === "SERIES_NOT_FINISHED") return "SERIES_NOT_FINISHED";
  if (code === "CAMPAIGN_OVER") return "OVER";
  if (code === "DYNASTY_CAMPAIGN_NOT_FOUND") return "NOT_FOUND";
  if (code === "DYNASTY_CAMPAIGN_INTEGRITY") return "INTEGRITY";
  if (status >= 400 && status < 500) return "REFUSED";
  return "SERVER";
}

export interface CampaignActionRequest { expected_seq: number; action_id: string; kind: "settle_series" | "abandon"; payload: Record<string, unknown> }

export class LiveCampaignClient {
  private fetchImpl: typeof fetch;
  private base: string;
  constructor(opts: { fetchImpl?: typeof fetch; baseUrl?: string } = {}) {
    this.fetchImpl = opts.fetchImpl ?? ((i, init) => fetch(i, init));
    this.base = `${(opts.baseUrl ?? ADMIN_API_BASE_URL).replace(/\/+$/, "")}${CAMPAIGN_API}`;
  }

  private async request(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    const url = `${this.base}${path}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, { method, headers: { ...(await buildAdminHeaders(url)), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new CampaignError("NETWORK", "Could not reach the Dynasty backend.");
    }
    let json: unknown = null;
    try { json = await res.json(); } catch { json = null; }
    if (!res.ok) {
      const { code, message } = readErrorBody(res.status, json);
      const kind = codeOf(res.status, code);
      let listing: CampaignList | undefined;
      if (kind === "ACTIVE_EXISTS") { try { listing = readCampaignList((json as { detail?: { active?: unknown } }).detail?.active); } catch { /* re-read below */ } }
      throw new CampaignError(kind, code ? `${code}: ${message}` : message, code, undefined, listing);
    }
    return json;
  }
  private snap(json: unknown): CampaignSnapshot {
    try { return readCampaignSnapshot(json); } catch (e) { throw new CampaignError("SERVER", e instanceof CampaignContractError ? `INVALID_RESPONSE: ${e.message}` : "unreadable response", "INVALID_RESPONSE"); }
  }

  async list(includeFinished = false): Promise<CampaignList> {
    const json = await this.request("GET", `/campaigns?include_finished=${includeFinished ? "true" : "false"}`);
    try { return readCampaignList(json); } catch (e) { throw new CampaignError("SERVER", e instanceof CampaignContractError ? `INVALID_RESPONSE: ${e.message}` : "unreadable response", "INVALID_RESPONSE"); }
  }

  async get(campaignId: string): Promise<CampaignSnapshot> {
    return this.snap(await this.request("GET", `/campaigns/${encodeURIComponent(campaignId)}`));
  }

  async start(startKey: string, policy: CampaignPolicy, when: "refuse" | "create"): Promise<CampaignSnapshot> {
    return this.snap(await this.request("POST", "/campaigns", { start_key: startKey, qualification_policy: policy, when_active_exists: when }));
  }

  /**
   * One campaign action. A refusal that means "this client is behind" carries the
   * server's current snapshot in `fresh` (STALE / SERIES_NOT_FINISHED / OVER / any 409).
   */
  async act(campaignId: string, req: CampaignActionRequest): Promise<CampaignSnapshot> {
    try {
      return this.snap(await this.request("POST", `/campaigns/${encodeURIComponent(campaignId)}/actions`, req));
    } catch (e) {
      if (e instanceof CampaignError && ["STALE", "SERIES_NOT_FINISHED", "OVER", "REFUSED"].includes(e.code)) {
        try { e.fresh = await this.get(campaignId); } catch { /* keep the refusal; the caller re-reads */ }
      }
      throw e;
    }
  }
}

/** A settle request, built only from the server's `next` (never from local progression). */
export function settleRequest(c: CampaignSnapshot, actionId: string): CampaignActionRequest | null {
  if (c.phase !== "series_result" || c.next?.kind !== "settle_series" || !c.next.payload) return null;
  return { expected_seq: c.seq, action_id: actionId, kind: "settle_series", payload: { ...c.next.payload } };
}
/** The abandon request, built from the server's own offered action. */
export function abandonRequest(c: CampaignSnapshot, actionId: string): CampaignActionRequest | null {
  const a = c.actions.find((x) => x.kind === "abandon");
  return a ? { expected_seq: c.seq, action_id: actionId, kind: "abandon", payload: { ...a.payload } } : null;
}

export const CAMPAIGN_SERIES_STORE_KEY = "mogzy.dynasty.ux7.series.v1";

/** The UX-6 series transport, pinned to one campaign series. */
export class CampaignSeriesTransport extends LiveSeriesTransport {
  constructor(public readonly seriesId: string, opts: LiveTransportOptions = {}) {
    super({ ...opts, storeKey: CAMPAIGN_SERIES_STORE_KEY, managementScenario: null });
  }
  /** Standalone discovery never lists campaign series: read the pinned one. */
  override async resume(): Promise<SeriesEnvelope | SeriesChoices | null> { return this.resumeSeries(this.seriesId); }
  /** The campaign opens its series; a client never creates one (`campaign:` keys are reserved). */
  override async create(): Promise<SeriesEnvelope> { throw new TransportError("NOT_ALLOWED", "campaign series are opened by the campaign"); }
  /** Leaving a campaign series keeps it: the campaign decides when it ends (settle or abandon). */
  override async abandon(): Promise<void> { /* nothing to forget: the campaign re-reads the series */ }
}
