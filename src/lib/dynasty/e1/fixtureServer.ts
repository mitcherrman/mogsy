/**
 * UX-3 — in-browser CONTRACT DOUBLE of the Dynasty BO5 authority.
 *
 * It stands where RUN-2 (series persistence), an E1 game route and E2B
 * (objective hosting) will stand. It never computes a game outcome: every
 * game frame it serves is a recorded backend snapshot from
 * `fixtures/ux3-bo5.json` (real E1 machine output, see the capture script).
 * What it does own, exactly as a server would, and only because no server
 * exists yet:
 *
 *  - the cursor into the recorded frames (one frame per `advance`);
 *  - revision checks, request-id idempotency and persistence (refresh/resume);
 *  - the series tally, derived from each recorded E1 `settlement` using E1's
 *    BO5 convention (first to three) — PENDING RUN-2;
 *  - objective question hosting per E2A §C8 — PENDING E2B. Questions are
 *    synthetic placeholders; the answer key stays inside this module and is
 *    never put on an envelope. The graded count selects which recorded E1
 *    continuation (captured for all four counts) the game follows.
 *
 * The UI must import only `DynastySeriesTransport`; nothing in the UI may
 * reach into this module's state.
 */
import rawFixture from "./fixtures/ux3-bo5.json";
import { decodeFrames } from "./frames";
import {
  BETWEEN_GAME_DECISIONS, TransportError,
  type BetweenGameDecisionId, type E1ObjectiveCategory, type E1Snapshot, type FixtureLineup,
  type ObjectiveSessionView, type SeriesEnvelope, type SeriesGameView, type SeriesStatus, type SeriesView,
  type TransportErrorCode,
} from "./contracts";
import type { DynastySeriesTransport, Mutation } from "./transport";

// ───────────────────────────────────────────── fixture

interface FixturePath { frames: Record<string, unknown>[]; encounter: { encounter_id: string; branches: Record<string, Record<string, unknown>[]> } | null }
export interface Bo5Fixture {
  schema: string;
  label: string;
  frame_codec: string;
  source: Record<string, string>;
  policy: { policy_id: string; catalog_id: string; status: string };
  series: { series_id: string; best_of: 5; wins_needed: 3; user: { team_id: string; name: string }; opponent: { team_id: string; name: string; lineup: FixtureLineup } };
  lineups: FixtureLineup[];
  games: { index: number; options: Record<string, FixturePath> }[];
}
export const BO5_FIXTURE = rawFixture as unknown as Bo5Fixture;

/** Synthetic placeholder questions (E2 pending). Real content: Ranked child-match public projection. */
const PLACEHOLDER_QUESTIONS: { id: string; prompt: string; options: string[]; correct: number }[] = [
  { id: "p1", prompt: "How many points does one Dynasty stage award in total?", options: ["5", "7", "9"], correct: 1 },
  { id: "p2", prompt: "How many points is the composition (team) contest worth?", options: ["1", "2", "3"], correct: 1 },
  { id: "p3", prompt: "Which stage always decides a game that was not closed out?", options: ["Early", "Mid", "Late"], correct: 2 },
  { id: "p4", prompt: "In a best-of-five, how many game wins take the series?", options: ["2", "3", "4"], correct: 1 },
  { id: "p5", prompt: "Which Early + Mid pair closes a game out at Mid?", options: ["Winning + Winning", "Even + Winning", "Kinda winning + Even"], correct: 0 },
  { id: "p6", prompt: "A higher contest rating…", options: ["guarantees the point", "raises the odds only", "has no effect"], correct: 1 },
  { id: "p7", prompt: "What carries from one stage into the next?", options: ["Extra points", "A bounded advantage", "Nothing"], correct: 1 },
];
/** TEST ONLY: the double's private key, so tests can play known answers. No UI module may import this. */
export function __placeholderAnswerForTests(prompt: string): number {
  const q = PLACEHOLDER_QUESTIONS.find((x) => x.prompt === prompt);
  if (!q) throw new Error(`unknown placeholder prompt: ${prompt}`);
  return q.correct;
}
const QUESTION_LABEL = "Synthetic placeholder questions served by the UX-3 contract double. E2 will serve real, server-graded questions from a Ranked child match.";

// ───────────────────────────────────────────── persisted state

interface ObjectiveSession { encounterId: string; childId: string; questionIds: string[]; answers: (number | null)[]; index: number; graded: number | null; settled: boolean }
interface Cursor { game: number; lineup: string; branch: number | null; frame: number }
interface ServerState {
  v: 1;
  seriesId: string;
  rev: number;
  status: SeriesStatus;
  plan: string | null;
  currentGame: number | null;
  currentLineup: string | null;
  games: SeriesGameView[];
  cursor: Cursor | null;
  objective: ObjectiveSession | null;
  requests: [string, string][]; // [requestId, signature]
}

export interface KeyValueStore { get(k: string): string | null; set(k: string, v: string): void; remove(k: string): void }
export const memoryStore = (): KeyValueStore => { const m = new Map<string, string>(); return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) }; };
export const browserStore = (): KeyValueStore => ({
  get: (k) => { try { return window.localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* private mode: state lives for the tab only */ } },
  remove: (k) => { try { window.localStorage.removeItem(k); } catch { /* ignore */ } },
});
export const STORE_KEY = "mogzy.dynasty.ux3.contract-double.v1";

type Method = "create" | "choosePlan" | "lockLineup" | "advance" | "openObjective" | "answerQuestion" | "settleObjective" | "decide" | "resume";
export interface FaultPlan { method: Method; when: "before" | "after"; code?: TransportErrorCode; times?: number }

export interface FixtureServerOptions { store?: KeyValueStore; delayMs?: number; fixture?: Bo5Fixture }

function h32(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class FixtureSeriesServer implements DynastySeriesTransport {
  readonly kind = "fixture" as const;
  private store: KeyValueStore;
  private delayMs: number;
  private fx: Bo5Fixture;
  private cache = new Map<string, E1Snapshot[]>();
  private faults: FaultPlan[] = [];
  /** test/diagnostic counter: how many answers were graded (duplicate-grading guard) */
  gradedAnswers = 0;

  constructor(opts: FixtureServerOptions = {}) {
    this.store = opts.store ?? memoryStore();
    this.delayMs = opts.delayMs ?? 0;
    this.fx = opts.fixture ?? BO5_FIXTURE;
  }

  /** Inject a one-shot (or N-shot) fault. `after` applies the action, then loses the response. */
  inject(f: FaultPlan) { this.faults.push({ times: 1, code: "NETWORK", ...f }); }

  // ── frames
  private path(game: number, lineup: string): FixturePath {
    const p = this.fx.games.find((g) => g.index === game)?.options[lineup];
    if (!p) throw new TransportError("ILLEGAL_LINEUP", `no recorded game ${game} for lineup ${lineup}`);
    return p;
  }
  private frames(c: Pick<Cursor, "game" | "lineup" | "branch">): E1Snapshot[] {
    const key = `${c.game}|${c.lineup}|${c.branch ?? "-"}`;
    let f = this.cache.get(key);
    if (!f) {
      const p = this.path(c.game, c.lineup);
      if (c.branch === null) f = decodeFrames(p.frames);
      else {
        if (!p.encounter) throw new TransportError("UNSUPPORTED_OBJECTIVE", "no recorded encounter on this path");
        const base = this.frames({ ...c, branch: null });
        f = decodeFrames(p.encounter.branches[String(c.branch)], base[base.length - 1]);
      }
      this.cache.set(key, f);
    }
    return f;
  }
  private snap(st: ServerState): E1Snapshot | null {
    if (!st.cursor) return null;
    return this.frames(st.cursor)[st.cursor.frame];
  }

  // ── persistence
  private load(): ServerState | null {
    const raw = this.store.get(STORE_KEY);
    if (!raw) return null;
    try {
      const st = JSON.parse(raw) as ServerState;
      return st.v === 1 && st.seriesId === this.fx.series.series_id ? st : null;
    } catch { return null; }
  }
  private save(st: ServerState) { this.store.set(STORE_KEY, JSON.stringify(st)); }

  // ── views
  private seriesView(st: ServerState): SeriesView {
    return {
      authority: "pending_run2_series", series_id: st.seriesId, rev: st.rev, status: st.status, best_of: 5, wins_needed: 3,
      wins: st.games.filter((g) => g.winner === "you").length, losses: st.games.filter((g) => g.winner === "opponent").length,
      current_game: st.currentGame, current_lineup: st.currentLineup, games: clone(st.games),
      winner: st.status === "complete" ? (st.games.filter((g) => g.winner === "you").length >= 3 ? "you" : "opponent") : null,
      team: { ...this.fx.series.user }, opponent: clone(this.fx.series.opponent),
      legal_lineups: st.status === "complete" ? [] : clone(this.fx.lineups), plan: st.plan, policy: { ...this.fx.policy },
    };
  }
  private objectiveView(st: ServerState): ObjectiveSessionView | null {
    const o = st.objective;
    if (!o) return null;
    const done = o.graded !== null;
    return {
      authority: "pending_e2_objective", encounter_id: o.encounterId,
      state: o.settled ? "settled" : done ? "graded" : "in_progress",
      child_match_id: o.childId, question_index: o.index,
      questions: o.questionIds.map((id, i) => {
        const q = PLACEHOLDER_QUESTIONS.find((x) => x.id === id)!;
        const answered = o.answers[i];
        const visible = i <= o.index;
        return {
          index: i,
          state: answered !== null ? (answered === q.correct ? "revealed_correct" : "revealed_incorrect") : i === o.index && !done ? "answering" : "pending",
          prompt: visible ? q.prompt : null, options: visible ? [...q.options] : null, chosen: answered,
        };
      }),
      graded: done ? { correct_count: o.graded!, category: this.categoryFor(st, o.graded!) } : null,
      content_label: QUESTION_LABEL,
    };
  }
  private categoryFor(st: ServerState, count: number): E1ObjectiveCategory {
    // From the recorded E1 prompt's own outcome table, never hard-coded here.
    const base = this.frames({ ...st.cursor!, branch: null });
    const prompt = base[base.length - 1].objective!;
    return prompt.outcomes.find((x) => x.correct_count === count)!.category;
  }
  private envelope(st: ServerState): SeriesEnvelope {
    return { series: this.seriesView(st), game: clone(this.snap(st)), objective: this.objectiveView(st) };
  }

  // ── request plumbing
  private async call(method: Method, m: Partial<Mutation> | null, sig: string, apply: (st: ServerState) => ServerState | void, opts: { create?: boolean } = {}): Promise<SeriesEnvelope> {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const fault = this.faults.find((f) => f.method === method);
    const consume = () => { if (fault) { fault.times = (fault.times ?? 1) - 1; if (fault.times <= 0) this.faults.splice(this.faults.indexOf(fault), 1); } };
    if (fault?.when === "before") { consume(); throw new TransportError(fault.code ?? "NETWORK", `injected ${fault.code ?? "NETWORK"} before ${method}`); }
    let st = this.load();
    if (!st) {
      if (!opts.create) throw new TransportError("NOT_ALLOWED", "no series: create one first");
      st = this.fresh();
    }
    if (m?.requestId) {
      const seen = st.requests.find(([id]) => id === m.requestId);
      if (seen) {
        if (seen[1] !== `${method}|${sig}`) throw new TransportError("NOT_ALLOWED", "request id reused for a different action", this.envelope(st));
        return this.envelope(st); // exact replay: never re-applied
      }
    }
    if (m && typeof m.rev === "number" && m.rev !== st.rev) throw new TransportError("STALE_REVISION", `stale revision ${m.rev} (current ${st.rev})`, this.envelope(st));
    const next = clone(st);
    try { apply(next); } catch (e) { if (e instanceof TransportError && !e.fresh) e.fresh = this.envelope(st); throw e; }
    next.rev += 1;
    if (m?.requestId) next.requests = [...next.requests.slice(-63), [m.requestId, `${method}|${sig}`]];
    this.save(next);
    if (fault?.when === "after") { consume(); throw new TransportError(fault.code ?? "NETWORK", `injected ${fault.code ?? "NETWORK"} after ${method} (applied, response lost)`); }
    return this.envelope(next);
  }
  private fresh(): ServerState {
    return { v: 1, seriesId: this.fx.series.series_id, rev: 0, status: "prep", plan: null, currentGame: 1, currentLineup: null, games: [], cursor: null, objective: null, requests: [] };
  }
  private legal(id: string) { if (!this.fx.lineups.some((l) => l.lineup_id === id)) throw new TransportError("ILLEGAL_LINEUP", `lineup ${id} is not legal`); }
  private need(st: ServerState, s: SeriesStatus) { if (st.status !== s) throw new TransportError("NOT_ALLOWED", `series is ${st.status}, not ${s}`); }

  /** Record a settled game into the series tally (E1 settlement is the only input). */
  private settleIntoSeries(st: ServerState) {
    const s = this.snap(st)!;
    if (s.phase !== "settled" || !s.settlement) return;
    if (st.games.some((g) => g.index === st.cursor!.game)) return;
    const obj = s.events.find((e) => e.outcome.correct_count !== null);
    st.games.push({
      index: st.cursor!.game, lineup_id: st.cursor!.lineup, winner: s.settlement.winner, how: s.settlement.how, after_stage: s.settlement.after_stage,
      points: s.stages.map((x) => x.you_points), labels: s.stages.map((x) => x.outcome_label),
      objective: obj ? { correct_count: obj.outcome.correct_count!, category: obj.outcome.category! } : null,
      pending_consequences: clone(s.consequences.pending), decision: null,
    });
    const w = st.games.filter((g) => g.winner === "you").length, l = st.games.length - w;
    if (w >= 3 || l >= 3) { st.status = "complete"; st.currentGame = null; }
    else { st.status = "between_games"; st.currentGame = st.cursor!.game + 1; }
    st.objective = null;
  }

  // ── API
  async resume(): Promise<SeriesEnvelope | null> {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const fault = this.faults.find((f) => f.method === "resume");
    if (fault) { fault.times = (fault.times ?? 1) - 1; if (fault.times <= 0) this.faults.splice(this.faults.indexOf(fault), 1); throw new TransportError(fault.code ?? "NETWORK", "injected fault on resume"); }
    const st = this.load();
    return st ? this.envelope(st) : null;
  }
  /** The double holds one series per browser, so there is nothing to choose between. */
  async resumeSeries(seriesId: string): Promise<SeriesEnvelope> {
    const env = await this.resume();
    if (!env || env.series.series_id !== seriesId) throw new TransportError("NOT_ALLOWED", `no series ${seriesId}`);
    return env;
  }
  create(m: Omit<Mutation, "rev">) { return this.call("create", m, "", () => undefined, { create: true }); }
  choosePlan(m: Mutation, lineupId: string) {
    return this.call("choosePlan", m, lineupId, (st) => { this.need(st, "prep"); this.legal(lineupId); st.plan = lineupId; st.status = "drafting"; });
  }
  lockLineup(m: Mutation, lineupId: string) {
    return this.call("lockLineup", m, lineupId, (st) => {
      this.need(st, "drafting"); this.legal(lineupId);
      st.currentLineup = lineupId; st.cursor = { game: st.currentGame!, lineup: lineupId, branch: null, frame: 0 }; st.objective = null; st.status = "in_game";
    });
  }
  advance(m: Mutation, expectedSeq: number) {
    return this.call("advance", m, String(expectedSeq), (st) => {
      this.need(st, "in_game");
      const s = this.snap(st)!;
      if (s.seq !== expectedSeq) throw new TransportError("STALE_REVISION", `expected seq ${expectedSeq}, game is at ${s.seq}`);
      if (!s.next.can_advance) throw new TransportError("NOT_ALLOWED", s.next.needs ? `game needs ${s.next.needs}` : "game is settled");
      const list = this.frames(st.cursor!);
      if (st.cursor!.frame + 1 >= list.length) throw new TransportError("SERVER", "recorded path ended before settlement");
      st.cursor!.frame += 1;
      this.settleIntoSeries(st);
    });
  }
  openObjective(m: Mutation, encounterId: string) {
    return this.call("openObjective", m, encounterId, (st) => {
      this.need(st, "in_game");
      const s = this.snap(st)!;
      if (s.phase !== "awaiting_objective" || !s.objective) throw new TransportError("NOT_ALLOWED", "no objective is pending");
      if (s.objective.encounter_id !== encounterId) throw new TransportError("ENCOUNTER_MISMATCH", "not the pending encounter");
      if (s.objective.encounter_kind !== "baron_three_question" || !this.path(st.cursor!.game, st.cursor!.lineup).encounter) {
        throw new TransportError("UNSUPPORTED_OBJECTIVE", `objective kind ${s.objective.encounter_kind} has no host`);
      }
      if (st.objective?.encounterId === encounterId) return; // idempotent open: same child, same questions
      const ids = [...PLACEHOLDER_QUESTIONS].sort((a, b) => h32(`${encounterId}|${a.id}`) - h32(`${encounterId}|${b.id}`)).slice(0, 3).map((q) => q.id);
      st.objective = { encounterId, childId: `child-${h32(`dynasty-objective|${encounterId}`).toString(16)}`, questionIds: ids, answers: [null, null, null], index: 0, graded: null, settled: false };
    });
  }
  answerQuestion(m: Mutation, encounterId: string, index: number, option: number) {
    return this.call("answerQuestion", m, `${encounterId}|${index}|${option}`, (st) => {
      const o = st.objective;
      if (!o || o.encounterId !== encounterId) throw new TransportError("ENCOUNTER_MISMATCH", "no open session for this encounter");
      if (o.graded !== null || o.answers[index] !== null && o.answers[index] !== undefined) throw new TransportError("ALREADY_ANSWERED", `question ${index + 1} is already locked`);
      if (index !== o.index) throw new TransportError("NOT_ALLOWED", `question ${index + 1} is not open`);
      const q = PLACEHOLDER_QUESTIONS.find((x) => x.id === o.questionIds[index])!;
      if (!Number.isInteger(option) || option < 0 || option >= q.options.length) throw new TransportError("NOT_ALLOWED", "no such option");
      o.answers[index] = option;
      this.gradedAnswers += 1;
      o.index += 1;
      if (o.index >= 3) o.graded = o.answers.filter((a, i) => a === PLACEHOLDER_QUESTIONS.find((x) => x.id === o.questionIds[i])!.correct).length;
    });
  }
  settleObjective(m: Mutation, encounterId: string) {
    return this.call("settleObjective", m, encounterId, (st) => {
      const o = st.objective;
      if (!o || o.encounterId !== encounterId) throw new TransportError("ENCOUNTER_MISMATCH", "no open session for this encounter");
      if (o.graded === null) throw new TransportError("NOT_ALLOWED", "the encounter is not graded yet");
      if (o.settled) return;
      st.cursor = { ...st.cursor!, branch: o.graded, frame: 0 };
      o.settled = true;
      this.settleIntoSeries(st);
    });
  }
  decide(m: Mutation, decision: BetweenGameDecisionId, lineupId: string) {
    return this.call("decide", m, `${decision}|${lineupId}`, (st) => {
      this.need(st, "between_games"); this.legal(lineupId);
      const d = BETWEEN_GAME_DECISIONS.find((x) => x.id === decision);
      if (!d) throw new TransportError("NOT_ALLOWED", "unknown decision");
      if (!d.authoritative) throw new TransportError("NOT_ALLOWED", `${d.title} needs the E3 state engine`);
      if (decision === "keep_plan" && lineupId !== st.plan) throw new TransportError("NOT_ALLOWED", "keep_plan keeps the current plan");
      st.games[st.games.length - 1].decision = decision;
      st.plan = lineupId; st.status = "drafting";
    });
  }
  /** UX-6: E3A management is a live-series feature; the recorded E1 double has no management state. */
  async commitPreparation(): Promise<SeriesEnvelope> { throw new TransportError("NOT_ALLOWED", "management needs a live E3A series"); }
  async lockSquad(): Promise<SeriesEnvelope> { throw new TransportError("NOT_ALLOWED", "management needs a live E3A series"); }
  async chooseTactic(): Promise<SeriesEnvelope> { throw new TransportError("NOT_ALLOWED", "management needs a live E3A series"); }
  async abandon() { this.store.remove(STORE_KEY); }
}
