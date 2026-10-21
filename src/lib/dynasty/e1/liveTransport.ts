/**
 * UX-4 — `DynastySeriesTransport` over the live E2 series API
 * (`/api/admin/dynasty/v2`, backend commit b022b21a; `DYNASTY_ENABLED` +
 * `require_admin`). The mapping follows UX-3 handoff §6:
 *
 *   create          POST /series {start_key = requestId, qualification_policy, presets}
 *   resume          GET  /series/{id}  (the id is kept client-side; E2 has no "my series" read)
 *   lockLineup      action lock_lineup {game, champions}
 *   advance         action advance {game, machine_seq, steps: 1}   (one E1 transition)
 *   openObjective   action open_objective {game, encounter_id}
 *   answerQuestion  action answer_objective {game, encounter_id, question_id, option_id}
 *   settleObjective a READ: E2 settles on the third answer; this acknowledges it
 *   choosePlan, decide  client-side until E3 (they never reach the server)
 *   rev, requestId  → expected_seq, action_id
 *
 * The client sends ids only: never a count, a correctness flag or an outcome.
 * A retried mutation resends the identical body (same action_id), which E2
 * answers with `duplicate: true` and never applies twice.
 */
import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";
import { readErrorBody } from "@/lib/dynasty/client";
import { BETWEEN_GAME_DECISIONS, TransportError, type BetweenGameDecisionId, type SeriesEnvelope, type TransportErrorCode } from "./contracts";
import { E2_API, E2ContractError, readE2Snapshot, type E2ActionKind, type E2Preset, type E2QualificationPolicy, type E2SeriesSnapshot } from "./e2contracts";
import { emptyLocal, lineupChampions, mapE2ToEnvelope, type LiveLocal } from "./e2mapper";
import { memoryStore, type KeyValueStore } from "./fixtureServer";
import type { DynastySeriesTransport, Mutation } from "./transport";

export const LIVE_STORE_KEY = "mogzy.dynasty.ux4.live.v1";

interface Persisted { v: 1; seriesId: string; local: LiveLocal }

export interface LiveTransportOptions {
  store?: KeyValueStore;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  /** REQUIRED by E2 and an open owner decision; UX-3 used the narrow candidate. */
  qualificationPolicy?: E2QualificationPolicy;
  userPreset?: E2Preset;
  opponentPreset?: E2Preset;
}

class HttpFailure extends Error {
  constructor(public status: number | null, public code: string | null, message: string) { super(message); }
}

function errorCode(f: HttpFailure): TransportErrorCode {
  if (f.status === null) return "NETWORK";
  if (f.code === "DYNASTY_DISABLED") return "DISABLED";
  if (f.status === 401 || f.status === 403) return "AUTH";
  if (f.code === "STALE_SEQ" || f.code === "STALE_CHECKPOINT") return "STALE_REVISION";
  if (f.code === "BAD_LINEUP") return "ILLEGAL_LINEUP";
  if (f.code === "WRONG_ENCOUNTER") return "ENCOUNTER_MISMATCH";
  if (f.code === "QUESTION_ALREADY_ANSWERED") return "ALREADY_ANSWERED";
  if (f.status === 409 || f.status === 422 || f.status === 404) return "NOT_ALLOWED";
  return "SERVER"; // 5xx incl. OBJECTIVE_CONTENT_UNAVAILABLE: retryable
}

export class LiveSeriesTransport implements DynastySeriesTransport {
  readonly kind = "live" as const;
  private store: KeyValueStore;
  private fetchImpl: typeof fetch;
  private base: string;
  private policy: E2QualificationPolicy;
  private userPreset: E2Preset;
  private opponentPreset: E2Preset;
  /** the newest e2 snapshot this client has seen */
  private last: E2SeriesSnapshot | null = null;

  constructor(opts: LiveTransportOptions = {}) {
    this.store = opts.store ?? memoryStore();
    this.fetchImpl = opts.fetchImpl ?? ((i, init) => fetch(i, init));
    this.base = `${(opts.baseUrl ?? ADMIN_API_BASE_URL).replace(/\/+$/, "")}${E2_API}`;
    this.policy = opts.qualificationPolicy ?? "narrow_early_mid_combo";
    this.userPreset = opts.userPreset ?? "balanced";
    this.opponentPreset = opts.opponentPreset ?? "balanced2";
  }

  // ── persistence (client-side presentation state only; the series lives on the server)
  private load(): Persisted | null {
    const raw = this.store.get(LIVE_STORE_KEY);
    if (!raw) return null;
    try { const p = JSON.parse(raw) as Persisted; return p.v === 1 && typeof p.seriesId === "string" ? { ...p, local: { ...emptyLocal(), ...p.local } } : null; } catch { return null; }
  }
  private save(p: Persisted) { this.store.set(LIVE_STORE_KEY, JSON.stringify(p)); }
  private need(): Persisted {
    const p = this.load();
    if (!p) throw new TransportError("NOT_ALLOWED", "no series: create one first");
    return p;
  }

  // ── http
  private async http(method: "GET" | "POST", path: string, body?: unknown): Promise<E2SeriesSnapshot> {
    const url = `${this.base}${path}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, { method, headers: { ...(await buildAdminHeaders(url)), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new HttpFailure(null, null, "Could not reach the Dynasty backend.");
    }
    let json: unknown = null;
    try { json = await res.json(); } catch { json = null; }
    if (!res.ok) { const { code, message } = readErrorBody(res.status, json); throw new HttpFailure(res.status, code, message); }
    try { return readE2Snapshot(json); } catch (e) { throw new HttpFailure(500, "INVALID_RESPONSE", e instanceof E2ContractError ? e.message : "unreadable response"); }
  }

  /** Keep the cache in step with the server: remember the champion pool and every open encounter. */
  private absorb(p: Persisted, snap: E2SeriesSnapshot): SeriesEnvelope {
    if (!this.last || this.last.series_id !== snap.series_id || snap.seq >= this.last.seq) this.last = snap;
    if (snap.lineup?.champion_pool?.length) p.local.pool = snap.lineup.champion_pool;
    const o = snap.current_game?.objective;
    if (o) p.local.encounters[o.encounter_id] = { objective: o, sent: p.local.encounters[o.encounter_id]?.sent ?? {} };
    // Bound the cache: encounters of earlier games are no longer shown.
    const keep = new Set((snap.games.find((g) => g.game === snap.current_game?.game_index)?.objectives ?? []).map((x) => x.encounter_id));
    if (o) keep.add(o.encounter_id);
    for (const id of Object.keys(p.local.encounters)) if (!keep.has(id)) delete p.local.encounters[id];
    this.save(p);
    return mapE2ToEnvelope(snap, p.local);
  }

  private async fresh(p: Persisted): Promise<SeriesEnvelope | undefined> {
    try { return this.absorb(p, await this.http("GET", `/series/${encodeURIComponent(p.seriesId)}`)); } catch { return undefined; }
  }

  private async fail(e: unknown, p: Persisted | null): Promise<never> {
    if (e instanceof TransportError) throw e;
    const f = e instanceof HttpFailure ? e : new HttpFailure(null, null, String(e));
    const code = errorCode(f);
    // Any refused action means this client is out of date: carry the server's current state.
    const withFresh = p && f.status !== null && f.status >= 400 && f.status < 500 && code !== "AUTH" && code !== "DISABLED";
    throw new TransportError(code, f.code ? `${f.code}: ${f.message}` : f.message, withFresh ? await this.fresh(p!) : undefined);
  }

  private async act(m: Mutation, kind: E2ActionKind, payload: Record<string, unknown>, before?: (p: Persisted) => void): Promise<SeriesEnvelope> {
    const p = this.need();
    before?.(p);
    this.save(p);
    try {
      const snap = await this.http("POST", `/series/${encodeURIComponent(p.seriesId)}/actions`, { expected_seq: m.rev, action_id: m.requestId, kind, payload });
      return this.absorb(p, snap);
    } catch (e) { return this.fail(e, p); }
  }

  /** The client-only steps still quote the series rev, like every mutation. */
  private local(m: Mutation, apply: (p: Persisted, snap: E2SeriesSnapshot) => void): SeriesEnvelope {
    const p = this.need();
    const snap = this.last;
    if (!snap) throw new TransportError("NOT_ALLOWED", "series not loaded");
    if (m.rev !== snap.seq) throw new TransportError("STALE_REVISION", `stale revision ${m.rev} (current ${snap.seq})`, mapE2ToEnvelope(snap, p.local));
    apply(p, snap);
    this.save(p);
    return mapE2ToEnvelope(snap, p.local);
  }

  private game(): number {
    const s = this.last;
    const g = s?.phase === "lineup" ? s.lineup?.game : s?.current_game?.game_index;
    if (!g) throw new TransportError("NOT_ALLOWED", "no game in progress");
    return g;
  }

  // ── API
  async resume(): Promise<SeriesEnvelope | null> {
    const p = this.load();
    if (!p) return null;
    try {
      return this.absorb(p, await this.http("GET", `/series/${encodeURIComponent(p.seriesId)}`));
    } catch (e) {
      if (e instanceof HttpFailure && e.code === "DYNASTY_SERIES_NOT_FOUND") { this.store.remove(LIVE_STORE_KEY); return null; }
      return this.fail(e, null);
    }
  }

  async create(m: Omit<Mutation, "rev">): Promise<SeriesEnvelope> {
    try {
      // start_key = the request id: a retried create resumes the same series instead of starting a second one.
      const snap = await this.http("POST", "/series", { start_key: m.requestId, qualification_policy: this.policy, user_preset: this.userPreset, opponent_preset: this.opponentPreset });
      const prev = this.load();
      const p: Persisted = prev?.seriesId === snap.series_id ? prev : { v: 1, seriesId: snap.series_id, local: emptyLocal() };
      this.last = null;
      return this.absorb(p, snap);
    } catch (e) { return this.fail(e, null); }
  }

  async choosePlan(m: Mutation, lineupId: string): Promise<SeriesEnvelope> {
    return this.local(m, (p, snap) => {
      if (snap.phase !== "lineup" || snap.lineup?.game !== 1 || p.local.plan) throw new TransportError("NOT_ALLOWED", "the game plan is set before game 1");
      if (!lineupChampions(lineupId)) throw new TransportError("ILLEGAL_LINEUP", `lineup ${lineupId} is not legal`);
      p.local.plan = lineupId;
    });
  }

  async lockLineup(m: Mutation, lineupId: string): Promise<SeriesEnvelope> {
    const champions = lineupChampions(lineupId);
    if (!champions) throw new TransportError("ILLEGAL_LINEUP", `lineup ${lineupId} is not legal`);
    if (this.last?.phase !== "lineup") throw new TransportError("NOT_ALLOWED", "not drafting");
    return this.act(m, "lock_lineup", { game: this.game(), champions });
  }

  async advance(m: Mutation, expectedSeq: number): Promise<SeriesEnvelope> {
    return this.act(m, "advance", { game: this.game(), machine_seq: expectedSeq, steps: 1 });
  }

  async openObjective(m: Mutation, encounterId: string): Promise<SeriesEnvelope> {
    return this.act(m, "open_objective", { game: this.game(), encounter_id: encounterId });
  }

  async answerQuestion(m: Mutation, encounterId: string, index: number, option: number): Promise<SeriesEnvelope> {
    const enc = this.last?.current_game?.objective?.encounter;
    if (!enc || enc.encounter_id !== encounterId) throw new TransportError("ENCOUNTER_MISMATCH", "no open session for this encounter");
    const q = enc.questions[index];
    if (!q || q.state !== "current" || index !== enc.answered) throw new TransportError(q?.state === "answered" ? "ALREADY_ANSWERED" : "NOT_ALLOWED", `question ${index + 1} is not open`);
    const opt = q.options?.[option];
    if (!opt) throw new TransportError("NOT_ALLOWED", "no such option");
    return this.act(m, "answer_objective", { game: this.game(), encounter_id: encounterId, question_id: q.question_id, option_id: opt.option_id }, (p) => {
      const c = p.local.encounters[encounterId];
      if (c) c.sent[q.question_id] = opt.option_id;
    });
  }

  async settleObjective(m: Mutation, encounterId: string): Promise<SeriesEnvelope> {
    const p = this.need();
    if (this.last && m.rev !== this.last.seq) throw new TransportError("STALE_REVISION", `stale revision ${m.rev} (current ${this.last.seq})`, mapE2ToEnvelope(this.last, p.local));
    try {
      const snap = await this.http("GET", `/series/${encodeURIComponent(p.seriesId)}`);
      const settled = snap.games.some((g) => g.objectives.some((o) => o.encounter_id === encounterId && o.state === "settled"));
      if (!settled) throw new TransportError("NOT_ALLOWED", "the encounter is not graded yet", this.absorb(p, snap));
      if (!p.local.acked.includes(encounterId)) p.local.acked = [...p.local.acked.slice(-15), encounterId];
      return this.absorb(p, snap);
    } catch (e) { return this.fail(e, p); }
  }

  async decide(m: Mutation, decision: BetweenGameDecisionId, lineupId: string): Promise<SeriesEnvelope> {
    return this.local(m, (p, snap) => {
      const after = snap.phase === "lineup" ? (snap.lineup?.game ?? 1) - 1 : 0;
      if (after < 1 || p.local.decisions[after]) throw new TransportError("NOT_ALLOWED", "not between games");
      if (!lineupChampions(lineupId)) throw new TransportError("ILLEGAL_LINEUP", `lineup ${lineupId} is not legal`);
      const d = BETWEEN_GAME_DECISIONS.find((x) => x.id === decision);
      if (!d) throw new TransportError("NOT_ALLOWED", "unknown decision");
      if (!d.authoritative) throw new TransportError("NOT_ALLOWED", `${d.title} needs the E3 state engine`);
      if (decision === "keep_plan" && lineupId !== p.local.plan) throw new TransportError("NOT_ALLOWED", "keep_plan keeps the current plan");
      p.local.decisions[after] = decision;
      p.local.plan = lineupId;
    });
  }

  /** Forget the series on this client. E2 has no delete: the server keeps it, a new create starts another. */
  async abandon(): Promise<void> { this.store.remove(LIVE_STORE_KEY); this.last = null; }
}
