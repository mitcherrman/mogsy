/**
 * UX-4/UX-5 — `DynastySeriesTransport` over the live E2 series API
 * (`/api/admin/dynasty/v2`, backend commit b022b21a + revision 2 bb5bc111;
 * `DYNASTY_ENABLED` + `require_admin`). The mapping follows UX-3 handoff §6
 * and E2 API §7:
 *
 *   resume          GET  /series (owner-scoped discovery): single → GET /series/{id};
 *                   multiple → the owner chooses; none → nothing (the UI offers create).
 *                   The localStorage id is only a hint (marks the choice, finds a completed series).
 *   resumeSeries    GET  /series/{id}
 *   create          POST /series {start_key = requestId, qualification_policy, presets, when_unfinished_exists}
 *                   automatic entry sends "refuse" (409 UNFINISHED_SERIES_EXISTS → the choices);
 *                   an explicit "New series" sends "create" (E2 has no abandon route)
 *   lockLineup      action lock_lineup {game, champions}
 *   advance         action advance {game, machine_seq, steps: 1}   (one E1 transition)
 *   openObjective   action open_objective {game, encounter_id}
 *   answerQuestion  action answer_objective {game, encounter_id, question_id, option_id}
 *   settleObjective local: E2 graded, sealed and applied the Baron with the third answer, and
 *                   `current_game.objective_results` already carries all three answers' feedback
 *   choosePlan, decide  client-side until E3 (they never reach the server)
 *   rev, requestId  → expected_seq, action_id
 *
 * UX-6 — E3A management series (revision 3, backend bc928207; E3A API §2):
 *
 *   create             adds {management_rules, entry_scenario} (both or neither) when a scenario is set
 *   commitPreparation  action commit_preparation {activities}   (the whole plan, applied atomically)
 *   lockSquad          action lock_lineup {game, champions, players}   (`players` is required on E3A)
 *   chooseTactic       action choose_tactic {game, choice}   (`game` = the game just settled, from `next`)
 *   choosePlan, decide, lockLineup  refused on an E3A series: the server owns those steps there
 *
 * The client sends ids only: never a count, a correctness flag or an outcome.
 * A retried mutation resends the identical body (same action_id), which E2
 * answers with `duplicate: true` and never applies twice.
 */
import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";
import { readErrorBody } from "@/lib/dynasty/client";
import { BETWEEN_GAME_DECISIONS, TransportError, type BetweenGameDecisionId, type SeriesChoice, type SeriesEnvelope, type TransportErrorCode } from "./contracts";
import { E2_API, E2ContractError, isManaged, readE2SeriesList, readE2Snapshot, type E2ActionKind, type E2Lineup, type E2Preset, type E2QualificationPolicy, type E2SeriesList, type E2SeriesSnapshot } from "./e2contracts";
import { MANAGEMENT_RULES_E3A, type E3aActivity, type E3aScenario, type E3aTacticChoice } from "./e3acontracts";
import type { E1Role } from "./contracts";
import { emptyLocal, lineupChampions, mapE2ToEnvelope, type LiveLocal } from "./e2mapper";
import { memoryStore, type KeyValueStore } from "./fixtureServer";
import type { DynastySeriesTransport, Mutation, SeriesChoices } from "./transport";

export const LIVE_STORE_KEY = "mogzy.dynasty.ux4.live.v1";

/** Client-side presentation state for the series this browser played last (a hint, never the authority). */
interface Persisted { v: 1; seriesId: string; local: LiveLocal }

export interface LiveTransportOptions {
  store?: KeyValueStore;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  /** REQUIRED by E2 and an open owner decision; UX-3 used the narrow candidate. */
  qualificationPolicy?: E2QualificationPolicy;
  userPreset?: E2Preset;
  opponentPreset?: E2Preset;
  /** UX-6: create E3A management series with this entry scenario; null/absent creates e2 series */
  managementScenario?: E3aScenario | null;
  /** UX-7: where the per-series presentation state lives (campaign series keep their own key) */
  storeKey?: string;
}

class HttpFailure extends Error {
  constructor(public status: number | null, public code: string | null, message: string, public body: unknown = null) { super(message); }
}

function errorCode(f: HttpFailure): TransportErrorCode {
  if (f.status === null) return "NETWORK";
  if (f.code === "DYNASTY_DISABLED") return "DISABLED";
  if (f.status === 401 || f.status === 403) return "AUTH";
  if (f.code === "STALE_SEQ" || f.code === "STALE_CHECKPOINT") return "STALE_REVISION";
  if (f.code === "UNFINISHED_SERIES_EXISTS") return "UNFINISHED_SERIES";
  if (f.code === "BAD_LINEUP") return "ILLEGAL_LINEUP";
  if (f.code === "WRONG_ENCOUNTER") return "ENCOUNTER_MISMATCH";
  if (f.code === "QUESTION_ALREADY_ANSWERED") return "ALREADY_ANSWERED";
  if (f.status === 409 || f.status === 422 || f.status === 404) return "NOT_ALLOWED";
  return "SERVER"; // 5xx incl. OBJECTIVE_CONTENT_UNAVAILABLE: retryable
}

function choicesOf(list: E2SeriesList, hint: string | null): SeriesChoice[] {
  return list.series.map((r) => ({
    series_id: r.series_id, phase: r.phase, rev: r.seq, wins: r.score.you, losses: r.score.opponent,
    games_started: r.games_started, policy: r.qualification_policy, updated_at: r.updated_at, hinted: r.series_id === hint,
    management: r.management_rules && r.entry_scenario ? { rules: r.management_rules, scenario: r.entry_scenario } : null,
  }));
}

export class LiveSeriesTransport implements DynastySeriesTransport {
  readonly kind = "live" as const;
  private store: KeyValueStore;
  private storeKey: string;
  private fetchImpl: typeof fetch;
  private base: string;
  private policy: E2QualificationPolicy;
  private userPreset: E2Preset;
  private opponentPreset: E2Preset;
  private scenario: E3aScenario | null;
  /** the newest e2 snapshot this client has seen */
  private last: E2SeriesSnapshot | null = null;

  constructor(opts: LiveTransportOptions = {}) {
    this.store = opts.store ?? memoryStore();
    this.storeKey = opts.storeKey ?? LIVE_STORE_KEY;
    this.fetchImpl = opts.fetchImpl ?? ((i, init) => fetch(i, init));
    this.base = `${(opts.baseUrl ?? ADMIN_API_BASE_URL).replace(/\/+$/, "")}${E2_API}`;
    this.policy = opts.qualificationPolicy ?? "narrow_early_mid_combo";
    this.userPreset = opts.userPreset ?? "balanced";
    this.opponentPreset = opts.opponentPreset ?? "balanced2";
    this.scenario = opts.managementScenario ?? null;
  }

  /** UX-6: the entry scenario for the NEXT created series (null: an e2 series). Existing series keep their pins. */
  setManagementScenario(scenario: E3aScenario | null) { this.scenario = scenario; }
  get managementScenario(): E3aScenario | null { return this.scenario; }

  // ── persistence (client-side presentation state only; the series lives on the server)
  private load(): Persisted | null {
    const raw = this.store.get(this.storeKey);
    if (!raw) return null;
    try {
      const p = JSON.parse(raw) as Persisted;
      if (p.v !== 1 || typeof p.seriesId !== "string") return null;
      const { plan, decisions, acked, pool } = { ...emptyLocal(), ...p.local }; // drops UX-4's encounter cache
      return { v: 1, seriesId: p.seriesId, local: { plan, decisions, acked, pool } };
    } catch { return null; }
  }
  private save(p: Persisted) { this.store.set(this.storeKey, JSON.stringify(p)); }
  private need(): Persisted {
    const p = this.load();
    if (!p) throw new TransportError("NOT_ALLOWED", "no series: create one first");
    return p;
  }
  /** The persisted state for `seriesId`: kept when it is the hinted series, fresh otherwise. */
  private adopt(seriesId: string): Persisted {
    const prev = this.load();
    if (prev?.seriesId === seriesId) return prev;
    this.last = null;
    return { v: 1, seriesId, local: emptyLocal() };
  }

  // ── http
  private async request(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    const url = `${this.base}${path}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, { method, headers: { ...(await buildAdminHeaders(url)), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new HttpFailure(null, null, "Could not reach the Dynasty backend.");
    }
    let json: unknown = null;
    try { json = await res.json(); } catch { json = null; }
    if (!res.ok) { const { code, message } = readErrorBody(res.status, json); throw new HttpFailure(res.status, code, message, json); }
    return json;
  }
  private async http(method: "GET" | "POST", path: string, body?: unknown): Promise<E2SeriesSnapshot> {
    const json = await this.request(method, path, body);
    try { return readE2Snapshot(json); } catch (e) { throw new HttpFailure(500, "INVALID_RESPONSE", e instanceof E2ContractError ? e.message : "unreadable response"); }
  }
  private async list(): Promise<E2SeriesList> {
    const json = await this.request("GET", "/series");
    try { return readE2SeriesList(json); } catch (e) { throw new HttpFailure(500, "INVALID_RESPONSE", e instanceof E2ContractError ? e.message : "unreadable response"); }
  }

  /** Keep the client in step with the server: remember the newest snapshot and the champion pool. */
  private absorb(p: Persisted, snap: E2SeriesSnapshot): SeriesEnvelope {
    if (!this.last || this.last.series_id !== snap.series_id || snap.seq >= this.last.seq) this.last = snap;
    if (snap.lineup?.champion_pool?.length) p.local.pool = snap.lineup.champion_pool;
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
    if (code === "UNFINISHED_SERIES") {
      // The refused create carries the discovery listing: the owner resumes one of those instead.
      let choices: SeriesChoice[] = [];
      try { choices = choicesOf(readE2SeriesList((f.body as { detail?: { unfinished?: unknown } } | null)?.detail?.unfinished), this.load()?.seriesId ?? null); } catch { /* listing unreadable: the picker re-reads it */ }
      throw new TransportError(code, `${f.code}: ${f.message}`, undefined, choices);
    }
    // Any refused action means this client is out of date: carry the server's current state.
    const withFresh = p && f.status !== null && f.status >= 400 && f.status < 500 && code !== "AUTH" && code !== "DISABLED";
    throw new TransportError(code, f.code ? `${f.code}: ${f.message}` : f.message, withFresh ? await this.fresh(p!) : undefined);
  }

  private async act(m: Mutation, kind: E2ActionKind, payload: Record<string, unknown>): Promise<SeriesEnvelope> {
    const p = this.need();
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
  async resume(): Promise<SeriesEnvelope | SeriesChoices | null> {
    const hint = this.load();
    let list: E2SeriesList;
    try { list = await this.list(); } catch (e) { return this.fail(e, null); }
    if (list.resume.reason === "single") return this.resumeSeries(list.resume.series_id!);
    if (list.resume.reason === "multiple") return { choices: choicesOf(list, hint?.seriesId ?? null) };
    // Nothing unfinished. The hinted series may be completed (show its result) or gone.
    if (!hint) return null;
    try {
      const snap = await this.http("GET", `/series/${encodeURIComponent(hint.seriesId)}`);
      if (snap.status !== "completed") { this.store.remove(this.storeKey); return null; } // listing is the authority for unfinished series
      return this.absorb(hint, snap);
    } catch (e) {
      if (e instanceof HttpFailure && e.code === "DYNASTY_SERIES_NOT_FOUND") { this.store.remove(this.storeKey); return null; }
      return this.fail(e, null);
    }
  }

  async resumeSeries(seriesId: string): Promise<SeriesEnvelope> {
    try {
      const snap = await this.http("GET", `/series/${encodeURIComponent(seriesId)}`);
      return this.absorb(this.adopt(snap.series_id), snap);
    } catch (e) { return this.fail(e, null); }
  }

  async create(m: Omit<Mutation, "rev">, when: "refuse" | "create" = "refuse"): Promise<SeriesEnvelope> {
    try {
      // start_key = the request id: a retried create resumes the same series instead of starting a second one.
      const management = this.scenario ? { management_rules: MANAGEMENT_RULES_E3A, entry_scenario: this.scenario } : {};
      const snap = await this.http("POST", "/series", { start_key: m.requestId, qualification_policy: this.policy, user_preset: this.userPreset, opponent_preset: this.opponentPreset, when_unfinished_exists: when, ...management });
      return this.absorb(this.adopt(snap.series_id), snap);
    } catch (e) { return this.fail(e, null); }
  }

  /** E3A owns preparation, lineup players and between-game decisions: the client-side stand-ins are refused there. */
  private notManaged(what: string) {
    if (this.last && isManaged(this.last)) throw new TransportError("NOT_ALLOWED", `${what} is a server action on an E3A series`);
  }

  async choosePlan(m: Mutation, lineupId: string): Promise<SeriesEnvelope> {
    this.notManaged("the game plan");
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
    this.notManaged("a lineup without squad players"); // E3A API §5.8: never drop `players`
    return this.act(m, "lock_lineup", { game: this.game(), champions });
  }

  async lockSquad(m: Mutation, champions: E2Lineup, players: Record<E1Role, string>): Promise<SeriesEnvelope> {
    const s = this.last;
    if (!s || !isManaged(s)) throw new TransportError("NOT_ALLOWED", "squad players need an E3A series");
    // The game being drafted (or, if this client is behind, the one after the shown game): the server refuses a wrong phase itself.
    const game = s.lineup?.game ?? (s.current_game?.game_index ?? 0) + 1;
    return this.act(m, "lock_lineup", { game, champions: { ...champions }, players: { ...players } });
  }

  // No client-side phase check for the two E3A decisions: the server refuses a wrong phase (WRONG_PHASE /
  // WRONG_GAME, with its own readable message and the fresh state), and an identical retry must reach it.
  async commitPreparation(m: Mutation, activities: E3aActivity[]): Promise<SeriesEnvelope> {
    // Exactly the fields each activity takes (anything else is BAD_PREPARATION); the server checks eligibility and budget.
    return this.act(m, "commit_preparation", { activities: activities.map((a) => ({ ...a })) });
  }

  async chooseTactic(m: Mutation, game: number, choice: E3aTacticChoice): Promise<SeriesEnvelope> {
    return this.act(m, "choose_tactic", { game, choice });
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
    return this.act(m, "answer_objective", { game: this.game(), encounter_id: encounterId, question_id: q.question_id, option_id: opt.option_id });
  }

  /** Local: open the outcome of an encounter the server already settled (no request; presentation only). */
  async settleObjective(m: Mutation, encounterId: string): Promise<SeriesEnvelope> {
    return this.local(m, (p, snap) => {
      if (!snap.current_game?.objective_results?.some((r) => r.encounter_id === encounterId)) throw new TransportError("NOT_ALLOWED", "the encounter is not graded yet");
      if (!p.local.acked.includes(encounterId)) p.local.acked = [...p.local.acked.slice(-15), encounterId];
    });
  }

  async decide(m: Mutation, decision: BetweenGameDecisionId, lineupId: string): Promise<SeriesEnvelope> {
    this.notManaged("the between-game decision");
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

  /** Forget the series on this client. E2 has no abandon route: the server keeps it and discovery lists it again. */
  async abandon(): Promise<void> { this.store.remove(this.storeKey); this.last = null; }
}
