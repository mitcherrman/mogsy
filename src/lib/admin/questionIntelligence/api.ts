// ---------------------------------------------------------------------------
// QI1 — owner-only Question Intelligence (Railway read model).
//
//   GET /api/admin/question-intelligence
//
// READ ONLY and owner-gated, like the Daily user-history read. Admin ›
// Analytics reads Supabase analytics_events, which records no per-question
// fact; the per-question truth (frozen option order, settled outcome, the
// player's displayed pick) lives only in Railway, so this panel reads there.
//
// The parser follows dailyHistoryApi: an unknown `schema_version` is refused,
// unknown extra keys are ignored, and a number is accepted only if it is a
// finite number. The served / answered / outcome counts are required: a
// response missing one is refused as unreadable rather than drawn as 0. A
// malformed rate reads as "not recorded" (—), and an absent DREP1 split as
// "not reported".
// ---------------------------------------------------------------------------

import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";

export const QUESTION_INTELLIGENCE_SCHEMA_VERSION = 1;

export const QI_HOSTS = ["all", "daily", "ranked", "other"] as const;
export type QiHost = (typeof QI_HOSTS)[number];
export const QI_SORTS = ["served", "incorrect_rate", "timeout_rate", "correct_rate", "repeats", "ref"] as const;
export type QiSort = (typeof QI_SORTS)[number];
export const QI_COHORTS = ["product", "playtest", "all"] as const;
export type QiCohort = (typeof QI_COHORTS)[number];

export interface QiFilters {
  from: string;
  to: string;
  host: QiHost;
  stageKind: string;
  namespace: string;
  family: string;
  minServed: number;
  cohort: QiCohort;
  sort: QiSort;
  offset: number;
  limit: number;
}

export interface QiPosition {
  position: number;
  /** Exposures whose correct answer was displayed here. */
  shownCorrect: number;
  pickedCorrect: number;
  pickedWrong: number;
}

/**
 * DREP1 split of one ref's repeats, by the Daily child that served each one.
 * Only a repeat DREP1 promised to avoid is classified (the player met the ref
 * earlier in an official Daily Standard / Time Trial / Survival child):
 * `forced` = the ref was in that child's frozen avoid set (its family had no
 * unseen question left); `avoidable` = it was not, or the child froze no set;
 * `unclassified` = past the backend's snapshot read cap. `outsideScope` =
 * every other repeat (Ranked, other hosts, or first met outside official
 * Daily). `null` = the backend did not report the split (never zero).
 */
export interface QiDrep1Split {
  forced: number;
  avoidable: number;
  outsideScope: number;
  unclassified: number;
}

export interface QiDrep1Totals {
  forced: number;
  avoidableProtected: number;
  avoidableUnprotected: number;
  outsideScope: number;
  unclassified: number;
  snapshotsRead: number;
  childrenNeeded: number;
  readCap: number;
}

export interface QiQuestion {
  ref: string;
  namespace: string;
  family: string | null;
  modules: string[];
  prompt: string | null;
  served: number;
  answered: number;
  correct: number;
  incorrect: number;
  timeout: number;
  unsettled: number;
  players: number;
  rates: { correct: number | null; incorrect: number | null; timeout: number | null; answered: number | null };
  hosts: { daily: number; ranked: number; other: number };
  stageKinds: Record<string, number>;
  firstDay: string | null;
  lastDay: string | null;
  repeats: {
    repeatExposures: number;
    repeatPlayers: number;
    multiDayPlayers: number;
    maxDaysOnePlayer: number;
    lookbackDays: number;
    drep1: QiDrep1Split | null;
  };
  positions: {
    positionalExposures: number;
    nonPositionalExposures: number;
    undecoded: number;
    /** option count → exposures shown with that many options */
    optionCounts: Record<string, number>;
    byPosition: QiPosition[];
    wrongChoices: Array<{ label: string; count: number }>;
  };
}

export interface QiTotals {
  served: number;
  answered: number;
  correct: number;
  incorrect: number;
  timeout: number;
  unsettled: number;
  unattributed: number;
  questions: number;
  excludedTestMatches: number;
  repeats: {
    returningPlayers: number;
    repeatVsPreviousDays: number;
    repeatVsYesterday: number;
    lookbackDays: number;
    drep1: QiDrep1Totals | null;
  };
}

export interface QuestionIntelligence {
  generatedAt: string;
  totals: QiTotals;
  questions: QiQuestion[];
  page: { offset: number; limit: number; total: number; nextOffset: number | null };
  limitations: string[];
}

export class QuestionIntelligenceParseError extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const count = (v: unknown): number => num(v) ?? 0;
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

function need<T>(value: T | null, what: string): T {
  if (value === null) throw new QuestionIntelligenceParseError(`Question Intelligence is missing ${what}`);
  return value;
}

/** The figures every row and the totals must carry; never defaulted to 0. */
function coreCounts(raw: Obj, where: string) {
  const req = (key: string) => need(num(raw[key]), `${where} ${key}`);
  return {
    served: req("served"), answered: req("answered"), correct: req("correct"),
    incorrect: req("incorrect"), timeout: req("timeout"),
  };
}

function countMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = num(v);
    if (n !== null) out[k] = n;
  }
  return out;
}

/** All-or-nothing: a split missing any count is "not recorded", not a partial figure. */
function readDrep1Split(raw: unknown): QiDrep1Split | null {
  if (!isObj(raw)) return null;
  const [forced, avoidable, outsideScope, unclassified] = [raw.forced, raw.avoidable, raw.outside_scope, raw.unclassified].map(num);
  if (forced === null || avoidable === null || outsideScope === null || unclassified === null) return null;
  return { forced, avoidable, outsideScope, unclassified };
}

function readDrep1Totals(raw: unknown): QiDrep1Totals | null {
  if (!isObj(raw)) return null;
  const v = [
    raw.forced, raw.avoidable_protected, raw.avoidable_unprotected, raw.outside_scope,
    raw.unclassified, raw.snapshots_read, raw.children_needed, raw.read_cap,
  ].map(num);
  if (v.some((n) => n === null)) return null;
  const [forced, avoidableProtected, avoidableUnprotected, outsideScope, unclassified, snapshotsRead, childrenNeeded, readCap] =
    v as number[];
  return { forced, avoidableProtected, avoidableUnprotected, outsideScope, unclassified, snapshotsRead, childrenNeeded, readCap };
}

function readQuestion(raw: unknown): QiQuestion {
  if (!isObj(raw)) throw new QuestionIntelligenceParseError("Question row is not an object");
  const rates = isObj(raw.rates) ? raw.rates : {};
  const hosts = isObj(raw.hosts) ? raw.hosts : {};
  const rep = isObj(raw.repeats) ? raw.repeats : {};
  const pos = isObj(raw.positions) ? raw.positions : {};
  return {
    ref: need(str(raw.ref), "a question ref"),
    namespace: str(raw.namespace) ?? "",
    family: str(raw.family),
    modules: Array.isArray(raw.modules) ? raw.modules.filter((m): m is string => typeof m === "string") : [],
    prompt: str(raw.prompt),
    ...coreCounts(raw, "a question's"),
    unsettled: count(raw.unsettled), players: count(raw.players),
    rates: { correct: num(rates.correct), incorrect: num(rates.incorrect), timeout: num(rates.timeout), answered: num(rates.answered) },
    hosts: { daily: count(hosts.daily), ranked: count(hosts.ranked), other: count(hosts.other) },
    stageKinds: countMap(raw.stage_kinds),
    firstDay: str(raw.first_day), lastDay: str(raw.last_day),
    repeats: {
      repeatExposures: count(rep.repeat_exposures), repeatPlayers: count(rep.repeat_players),
      multiDayPlayers: count(rep.multi_day_players), maxDaysOnePlayer: count(rep.max_days_one_player),
      lookbackDays: count(rep.lookback_days),
      drep1: readDrep1Split(rep.drep1),
    },
    positions: {
      positionalExposures: count(pos.positional_exposures),
      nonPositionalExposures: count(pos.non_positional_exposures),
      undecoded: count(pos.undecoded),
      optionCounts: countMap(pos.option_counts),
      byPosition: (Array.isArray(pos.by_position) ? pos.by_position : [])
        .filter(isObj)
        .map((p) => ({
          position: need(num(p.position), "an option position"),
          shownCorrect: count(p.shown_correct), pickedCorrect: count(p.picked_correct), pickedWrong: count(p.picked_wrong),
        })),
      wrongChoices: (Array.isArray(pos.wrong_choices) ? pos.wrong_choices : [])
        .filter(isObj)
        .flatMap((w) => (str(w.label) ? [{ label: str(w.label) as string, count: count(w.count) }] : [])),
    },
  };
}

export function parseQuestionIntelligence(json: unknown): QuestionIntelligence {
  if (!isObj(json)) throw new QuestionIntelligenceParseError("Question Intelligence response is not an object");
  if (json.schema_version !== QUESTION_INTELLIGENCE_SCHEMA_VERSION) {
    throw new QuestionIntelligenceParseError(`Question Intelligence schema ${String(json.schema_version)} is not supported`);
  }
  if (!Array.isArray(json.questions)) throw new QuestionIntelligenceParseError("Question Intelligence has no questions list");
  const t = isObj(json.totals) ? json.totals : {};
  const tr = isObj(t.repeats) ? t.repeats : {};
  const page = isObj(json.page) ? json.page : {};
  return {
    generatedAt: str(json.generated_at) ?? "",
    totals: {
      ...coreCounts(t, "the total"), unsettled: count(t.unsettled),
      unattributed: count(t.unattributed), questions: count(t.questions),
      excludedTestMatches: count(t.excluded_test_matches),
      repeats: {
        returningPlayers: count(tr.returning_players), repeatVsPreviousDays: count(tr.repeat_vs_previous_days),
        repeatVsYesterday: count(tr.repeat_vs_yesterday), lookbackDays: count(tr.lookback_days),
        drep1: readDrep1Totals(tr.drep1),
      },
    },
    questions: json.questions.map(readQuestion),
    page: {
      offset: count(page.offset), limit: count(page.limit), total: count(page.total),
      nextOffset: num(page.next_offset),
    },
    limitations: Array.isArray(json.limitations) ? json.limitations.filter((l): l is string => typeof l === "string") : [],
  };
}

/** The query string the endpoint expects. Empty text filters are omitted. */
export function questionIntelligenceQuery(f: QiFilters): URLSearchParams {
  const q = new URLSearchParams({
    from: f.from, to: f.to, host: f.host, cohort: f.cohort, sort: f.sort,
    min_served: String(f.minServed), offset: String(f.offset), limit: String(f.limit),
  });
  if (f.stageKind.trim()) q.set("stage_kind", f.stageKind.trim());
  if (f.namespace.trim()) q.set("namespace", f.namespace.trim());
  if (f.family.trim()) q.set("family", f.family.trim());
  return q;
}

/** Why a read failed, kept apart so "no questions" is never what an error looks like. */
export class QuestionIntelligenceReadError extends Error {
  constructor(public kind: "denied" | "unavailable" | "invalid" | "refused", message: string) {
    super(message);
  }
}

export async function fetchQuestionIntelligence(filters: QiFilters, signal?: AbortSignal): Promise<QuestionIntelligence> {
  const url = `${ADMIN_API_BASE_URL}/api/admin/question-intelligence?${questionIntelligenceQuery(filters)}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: await buildAdminHeaders(url), signal, cache: "no-store" });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new QuestionIntelligenceReadError("unavailable", "The Question Intelligence service could not be reached.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new QuestionIntelligenceReadError("denied", "Owner access to Question Intelligence was refused.");
  }
  if (response.status === 422) {
    let message = "Those filters were refused.";
    try {
      const body = (await response.json()) as { detail?: { message?: unknown } };
      if (typeof body?.detail?.message === "string") message = body.detail.message;
    } catch {
      /* keep the generic message */
    }
    throw new QuestionIntelligenceReadError("refused", message);
  }
  if (!response.ok) {
    throw new QuestionIntelligenceReadError("unavailable", `The Question Intelligence service answered ${response.status}.`);
  }
  try {
    return parseQuestionIntelligence(await response.json());
  } catch (error) {
    throw new QuestionIntelligenceReadError("invalid", error instanceof Error ? error.message : "Question Intelligence was unreadable.");
  }
}
