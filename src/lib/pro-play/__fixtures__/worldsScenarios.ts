/**
 * Worlds 2026 v2 scenarios for tests and visual review (PW4-B).
 *
 * The base is the REAL production body of
 * `/api/live-esports/tournament/worlds-2026` captured 2026-10-13T00:09Z
 * (contract `tournament_context_v2`, phase `pre_event`, 46 matches, 19
 * participants, standings complete). Every other scenario writes SIMULATED
 * results onto a copy of it, shaped exactly as the PW4-A backend serves
 * them: completed / live states, game wins, outcomes, upstream placing teams
 * into later slots, and the summaries the backend derives (records, Swiss
 * status, eliminations, winners, phase). The results are invented for
 * testing; the structure (ids, cells, slot edges, times) is upstream's.
 */
import type {
  StageRecord,
  SwissRecordV2,
  TournamentMatchTeamV2,
  TournamentMatchV2,
  TournamentResponseV2,
} from "@/lib/pro-play/tournamentApi";

import PRE_EVENT from "./tournamentWorldsPreEvent.json";

export const WORLDS_PRE = PRE_EVENT as unknown as TournamentResponseV2;

export const clone = (d: TournamentResponseV2 = WORLDS_PRE): TournamentResponseV2 => JSON.parse(JSON.stringify(d));

/* ── match ids (upstream's) ─────────────────────────────────────────────── */

export const PI = {
  ubsf1: "115660588583171786", // C9 v KC, 15 Oct 18:00Z
  ubsf2: "115660588583040710", // FUR v MVK, 15 Oct 23:00Z
  ubf: "115660588583171790",
  lbsf: "115660588583171794",
  lbf: "115660588583171798",
  final: "116299649498303884",
} as const;

export const KO = {
  qf1: "115660540726095097",
  qf2: "115660540726095103",
  qf3: "115660540726095109",
  qf4: "115660540726095115",
  sf1: "115660540726095121",
  sf2: "115660540726095127",
  final: "115660540726095133",
} as const;

/* ── writers ────────────────────────────────────────────────────────────── */

function match(d: TournamentResponseV2, id: string): TournamentMatchV2 {
  const m = d.state.matches.find((x) => x.match_id === id);
  if (!m) throw new Error(`no match ${id}`);
  return m;
}

/** Upstream names a team in a slot (the slot's origin is kept). */
export function place(d: TournamentResponseV2, id: string, side: 0 | 1, code: string) {
  const p = d.context.participants.find((x) => x.code === code);
  if (!p) throw new Error(`no participant ${code}`);
  const t: TournamentMatchTeamV2 = match(d, id).teams[side];
  Object.assign(t, { code, team_key: p.team_key, upstream_name: p.name ?? p.team_key, tbd: false });
}

/** A finished series: `winner` side, with the loser's game wins. */
export function finish(d: TournamentResponseV2, id: string, winner: 0 | 1, loserWins: number) {
  const m = match(d, id);
  const need = m.best_of ? Math.ceil(m.best_of / 2) : 1;
  m.state = "completed";
  m.teams[winner].game_wins = need;
  m.teams[winner].outcome = "win";
  m.teams[1 - winner].game_wins = loserWins;
  m.teams[1 - winner].outcome = "loss";
  m.winner_code = m.teams[winner].code;
}

export function goLive(d: TournamentResponseV2, id: string, a: number, b: number) {
  const m = match(d, id);
  m.state = "live";
  m.teams[0].game_wins = a;
  m.teams[1].game_wins = b;
}

const winnerOf = (d: TournamentResponseV2, id: string) => match(d, id).winner_code as string;
const loserOf = (d: TournamentResponseV2, id: string) => {
  const m = match(d, id);
  return m.teams.find((t) => t.code !== m.winner_code)!.code as string;
};

/** Records as the backend tallies them: completed, mapped matches only. */
function stageRecords(d: TournamentResponseV2, stage: string): StageRecord[] {
  const tally = new Map<string, [number, number]>();
  for (const m of d.state.matches) {
    if (m.stage !== stage || m.state !== "completed" || !m.winner_code) continue;
    for (const t of m.teams) {
      const row = tally.get(t.code!) ?? [0, 0];
      row[t.code === m.winner_code ? 0 : 1] += 1;
      tally.set(t.code!, row);
    }
  }
  const order = new Map(d.context.participants.map((p, i) => [p.code, i] as const));
  return [...tally.entries()]
    .map(([code, [w, l]]) => ({
      code,
      team_key: d.context.participants.find((p) => p.code === code)!.team_key,
      wins: w,
      losses: l,
      played: w + l,
    }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || order.get(a.code)! - order.get(b.code)!);
}

function counts(d: TournamentResponseV2) {
  const ms = d.state.matches;
  d.state.counts = {
    matches: ms.length,
    completed: ms.filter((m) => m.state === "completed").length,
    live: ms.filter((m) => m.state === "live").length,
  };
}

function nextUpcoming(d: TournamentResponseV2) {
  const m = d.state.matches.find((x) => x.state === "upcoming");
  d.state.next_match_id = m ? m.match_id : null;
}

/* ── Play-In ────────────────────────────────────────────────────────────── */

/** 15 Oct, evening: C9 beat KC 3–1; FUR v MVK live at 1–1. */
export function playInDay1(): TournamentResponseV2 {
  const d = clone();
  finish(d, PI.ubsf1, 0, 1); // C9 3–1 KC
  place(d, PI.ubf, 1, "C9"); // winner of C9 v KC → Upper Final slot 2
  place(d, PI.lbsf, 1, "KC"); // loser → Lower Semifinal slot 2
  goLive(d, PI.ubsf2, 1, 1);
  d.state.phase = "play_in";
  d.state.calendar_stage = "play_in";
  d.state.play_in.records = stageRecords(d, "play_in");
  counts(d);
  nextUpcoming(d);
  return d;
}

/** The whole Play-In played: KC wins it from the lower bracket. */
export function playInResults(d: TournamentResponseV2 = clone()) {
  finish(d, PI.ubsf1, 0, 1); // C9 3–1 KC
  finish(d, PI.ubsf2, 0, 2); // FUR 3–2 MVK
  place(d, PI.ubf, 0, "FUR");
  place(d, PI.ubf, 1, "C9");
  place(d, PI.lbsf, 0, "MVK");
  place(d, PI.lbsf, 1, "KC");
  finish(d, PI.ubf, 1, 2); // C9 3–2 FUR
  finish(d, PI.lbsf, 1, 0); // KC 3–0 MVK
  place(d, PI.lbf, 0, "FUR");
  place(d, PI.lbf, 1, "KC");
  finish(d, PI.lbf, 1, 1); // KC 3–1 FUR
  place(d, PI.final, 0, "C9");
  place(d, PI.final, 1, "KC");
  finish(d, PI.final, 1, 2); // KC 3–2 C9
  d.state.play_in = {
    ...d.state.play_in,
    records: stageRecords(d, "play_in"),
    eliminated: ["MVK", "FUR", "C9"],
    winner_code: "KC",
  };
  return d;
}

/** Round 1 of Swiss as drawn (simulated draw, Tier 1 v 4 and 2 v 3). */
export const SWISS_R1: [string, string][] = [
  ["AL", "KC"],
  ["GEN", "IG"],
  ["G2", "DK"],
  ["TLAW", "CFO"],
  ["BLG", "MKOI"],
  ["HLE", "LYON"],
  ["TSW", "T1"],
  ["LOS", "TES"],
];

/** 19 Oct: the Play-In is certified done; Swiss Round 1 drawn; KC placed. */
export function betweenPlayInAndSwiss(): TournamentResponseV2 {
  const d = playInResults();
  const r1 = d.state.swiss.rounds["1"];
  SWISS_R1.forEach(([a, b], i) => {
    place(d, r1[i], 0, a);
    place(d, r1[i], 1, b);
  });
  d.state.phase = "between_stages";
  d.state.phase_detail = { completed_stage: "play_in", next_stage: "swiss" };
  d.state.calendar_stage = "between_stages";
  d.state.swiss.placed_codes = SWISS_R1.flat();
  d.state.knockout_teams = [];
  counts(d);
  nextUpcoming(d);
  return d;
}

/* ── Swiss ──────────────────────────────────────────────────────────────── */

/** A fixed strength order: the stronger side always wins (simulation only). */
const STRENGTH = ["GEN", "AL", "HLE", "BLG", "T1", "G2", "TES", "KC", "DK", "TSW", "IG", "MKOI", "TLAW", "LOS", "CFO", "LYON"];
const stronger = (a: string, b: string) => (STRENGTH.indexOf(a) <= STRENGTH.indexOf(b) ? 0 : 1);

/**
 * Plays Swiss rounds 1..`through` (`through` may be fractional: 3.5 plays half
 * of round 4 and puts its next match live). Pairs within each record pool,
 * as the format says; draws are simulated.
 */
export function swissThrough(through: number, d: TournamentResponseV2 = betweenPlayInAndSwiss()) {
  const rec = new Map<string, [number, number]>(SWISS_R1.flat().map((c) => [c, [0, 0]]));
  for (let r = 1; r <= Math.ceil(through); r++) {
    let ids = d.state.swiss.rounds[String(r)];
    let pairs: [string, string][];
    if (r === 1) pairs = SWISS_R1;
    else {
      const active = [...rec.entries()].filter(([, [w, l]]) => w < 3 && l < 3);
      const pools = new Map<string, string[]>();
      for (const [c, [w, l]] of active) pools.set(`${w}-${l}`, [...(pools.get(`${w}-${l}`) ?? []), c]);
      pairs = [];
      for (const key of [...pools.keys()].sort((a, b) => Number(b[0]) - Number(a[0]) || Number(a[2]) - Number(b[2]))) {
        const pool = pools.get(key)!.sort((a, b) => STRENGTH.indexOf(a) - STRENGTH.indexOf(b));
        while (pool.length >= 2) pairs.push([pool.shift()!, pool.pop()!]);
      }
      // Upstream lists a round's Bo3 (elimination / qualification) matches
      // where its standings put them; keep the pairing count to the cells.
      pairs = pairs.slice(0, ids.length);
      // A match that can advance or eliminate is a Bo3 cell upstream: give
      // those pairs the round's Bo3 ids, the rest its Bo1 ids.
      const bo = (id: string) => d.state.matches.find((x) => x.match_id === id)!.best_of ?? 1;
      const decider = (c: string) => rec.get(c)![0] === 2 || rec.get(c)![1] === 2;
      const bo3 = ids.filter((id) => bo(id) > 1);
      const bo1 = ids.filter((id) => bo(id) === 1);
      const ordered = pairs.map(([x]) => (decider(x) && bo3.length ? bo3.shift()! : bo1.shift() ?? bo3.shift()!));
      ids = ordered;
    }
    const playUpTo = r < through ? ids.length : Math.round((through - (r - 1)) * ids.length);
    pairs.forEach(([a, b], i) => {
      if (r > 1) {
        place(d, ids[i], 0, a);
        place(d, ids[i], 1, b);
      }
      if (i < playUpTo) {
        const w = stronger(a, b) as 0 | 1;
        const m = d.state.matches.find((x) => x.match_id === ids[i])!;
        finish(d, ids[i], w, m.best_of && m.best_of > 1 ? 1 : 0);
        rec.get(w === 0 ? a : b)![0] += 1;
        rec.get(w === 0 ? b : a)![1] += 1;
      } else if (i === playUpTo) {
        goLive(d, ids[i], 0, 0);
      }
    });
  }
  const records = stageRecords(d, "swiss");
  const order = new Map(d.context.participants.map((p, i) => [p.code, i] as const));
  const rows: SwissRecordV2[] = SWISS_R1.flat()
    .map((code) => {
      const r = records.find((x) => x.code === code) ?? { code, team_key: "", wins: 0, losses: 0, played: 0 };
      const team_key = d.context.participants.find((p) => p.code === code)!.team_key;
      const status: SwissRecordV2["status"] = r.wins >= 3 ? "advanced" : r.losses >= 3 ? "eliminated" : "active";
      return { code, team_key, wins: r.wins, losses: r.losses, played: r.wins + r.losses, status };
    })
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || order.get(a.code)! - order.get(b.code)!);
  d.state.swiss.records = rows;
  d.state.swiss_records = rows;
  d.state.swiss.placed_codes = SWISS_R1.flat();
  d.state.phase = "swiss";
  d.state.phase_detail = null;
  d.state.calendar_stage = "swiss";
  counts(d);
  nextUpcoming(d);
  return d;
}

/* ── Knockout ───────────────────────────────────────────────────────────── */

/** Swiss finished; the quarterfinal draw placed the eight qualifiers. */
export function betweenSwissAndKnockout(): TournamentResponseV2 {
  const d = swissThrough(5);
  const adv = d.state.swiss.records.filter((r) => r.status === "advanced").map((r) => r.code);
  const qf = [KO.qf1, KO.qf2, KO.qf3, KO.qf4];
  // Simulated draw: 1st v 8th, 4th v 5th, 2nd v 7th, 3rd v 6th of the list.
  const pairs: [number, number][] = [[0, 7], [3, 4], [1, 6], [2, 5]];
  pairs.forEach(([a, b], i) => {
    place(d, qf[i], 0, adv[a]);
    place(d, qf[i], 1, adv[b]);
  });
  d.state.phase = "between_stages";
  d.state.phase_detail = { completed_stage: "swiss", next_stage: "knockout" };
  d.state.calendar_stage = "between_stages";
  d.state.knockout_teams = adv;
  counts(d);
  nextUpcoming(d);
  return d;
}

/** 5 Nov: QF1 and QF2 played, QF3 live. */
export function knockoutMid(): TournamentResponseV2 {
  const d = betweenSwissAndKnockout();
  for (const id of [KO.qf1, KO.qf2]) {
    const m = d.state.matches.find((x) => x.match_id === id)!;
    finish(d, id, stronger(m.teams[0].code!, m.teams[1].code!) as 0 | 1, 2);
  }
  place(d, KO.sf1, 0, winnerOf(d, KO.qf1));
  place(d, KO.sf1, 1, winnerOf(d, KO.qf2));
  goLive(d, KO.qf3, 2, 1);
  d.state.phase = "knockout";
  d.state.phase_detail = null;
  d.state.calendar_stage = "knockout";
  d.state.knockout = {
    ...d.state.knockout,
    records: stageRecords(d, "knockout"),
    eliminated: [loserOf(d, KO.qf1), loserOf(d, KO.qf2)],
  };
  counts(d);
  nextUpcoming(d);
  return d;
}

/** 14 Nov: the Final is played. */
export function worldsComplete(): TournamentResponseV2 {
  const d = betweenSwissAndKnockout();
  for (const id of [KO.qf1, KO.qf2, KO.qf3, KO.qf4]) {
    const m = d.state.matches.find((x) => x.match_id === id)!;
    finish(d, id, stronger(m.teams[0].code!, m.teams[1].code!) as 0 | 1, 1);
  }
  place(d, KO.sf1, 0, winnerOf(d, KO.qf1));
  place(d, KO.sf1, 1, winnerOf(d, KO.qf2));
  place(d, KO.sf2, 0, winnerOf(d, KO.qf3));
  place(d, KO.sf2, 1, winnerOf(d, KO.qf4));
  for (const id of [KO.sf1, KO.sf2]) {
    const m = d.state.matches.find((x) => x.match_id === id)!;
    finish(d, id, stronger(m.teams[0].code!, m.teams[1].code!) as 0 | 1, 2);
  }
  place(d, KO.final, 0, winnerOf(d, KO.sf1));
  place(d, KO.final, 1, winnerOf(d, KO.sf2));
  const f = d.state.matches.find((x) => x.match_id === KO.final)!;
  finish(d, KO.final, stronger(f.teams[0].code!, f.teams[1].code!) as 0 | 1, 2);
  const champion = winnerOf(d, KO.final);
  d.state.phase = "complete";
  d.state.phase_detail = null;
  d.state.calendar_stage = "post_event";
  d.state.knockout = {
    ...d.state.knockout,
    records: stageRecords(d, "knockout"),
    eliminated: [KO.qf1, KO.qf2, KO.qf3, KO.qf4, KO.sf1, KO.sf2, KO.final].map((id) => loserOf(d, id)),
    winner_code: champion,
    champion_code: champion,
  };
  counts(d);
  nextUpcoming(d);
  return d;
}

/* ── degraded sources ───────────────────────────────────────────────────── */

/** The first schedule page only: QF2–4, both SFs and the Final are missing. */
export function partialSchedule(): TournamentResponseV2 {
  const d = clone();
  const missing = [KO.qf2, KO.qf3, KO.qf4, KO.sf1, KO.sf2, KO.final];
  d.state.matches = d.state.matches.filter((m) => !missing.includes(m.match_id as never));
  d.state.coverage = {
    ...d.state.coverage,
    pages_read: 1,
    page_failure: { page: "newer", error: "timeout" },
    found_matches: 40,
    complete: false,
    missing_match_ids: missing,
  };
  d.sources = { ...d.sources, schedule: { ...d.sources!.schedule!, pages_read: 1, page_failure: { page: "newer" } } };
  d.state.warnings = [{ kind: "schedule_incomplete", missing: 6 }];
  counts(d);
  return d;
}

/** Standings did not answer: no cells, slots or rounds; nothing derived. */
export function standingsUnavailable(d: TournamentResponseV2 = playInDay1()): TournamentResponseV2 {
  for (const m of d.state.matches) {
    m.bracket = null;
    m.swiss_round = null;
    for (const t of m.teams) t.slot = null;
  }
  const scheduleOrder = (stage: string) => d.state.matches.filter((m) => m.stage === stage).map((m) => m.match_id);
  d.state.play_in = { ...d.state.play_in, bracket_authority: "unavailable", match_ids: scheduleOrder("play_in"), eliminated: [], winner_code: null };
  d.state.knockout = {
    ...d.state.knockout,
    bracket_authority: "unavailable",
    match_ids: scheduleOrder("knockout"),
    eliminated: [],
    winner_code: null,
    champion_code: null,
  };
  d.state.swiss.rounds = {};
  d.state.coverage = { ...d.state.coverage, basis: "unverified", complete: null, expected_matches: null, missing_match_ids: [], unlisted_match_ids: [] };
  d.sources = { ...d.sources, standings: { ok: false, stale: false, fetched_at: null } };
  d.state.warnings = [{ kind: "standings_unavailable" }];
  return d;
}

/** A recent copy served while upstream is down. */
export function staleSchedule(d: TournamentResponseV2 = clone()): TournamentResponseV2 {
  d.stale = true;
  d.source_ok = false;
  d.fetched_at = "2026-10-13T00:01:00.000+00:00";
  d.sources = {
    schedule: { ...d.sources!.schedule!, ok: false, stale: true, fetched_at: "2026-10-13T00:01:00.000+00:00" },
    standings: { ...d.sources!.standings!, ok: false, stale: true, fetched_at: "2026-10-13T00:01:00.000+00:00" },
  };
  return d;
}

/** No schedule at all (upstream down, nothing recent). */
export function unknownPhase(): TournamentResponseV2 {
  const d = clone();
  d.source_ok = false;
  d.stale = false;
  d.fetched_at = null;
  d.sources = {
    schedule: { ok: false, stale: false, fetched_at: null, pages_read: 0, page_failure: { page: "first" } },
    standings: { ok: true, stale: false, fetched_at: "2026-10-13T00:09:40.785+00:00" },
  };
  d.state = {
    ...d.state,
    phase: "unknown",
    phase_basis: "no_schedule",
    phase_detail: null,
    next_match_id: null,
    matches: [],
    counts: { matches: 0, completed: 0, live: 0 },
    play_in: { ...d.state.play_in, records: [] },
    knockout: { ...d.state.knockout, records: [] },
    coverage: { ...d.state.coverage, pages_read: 0, found_matches: 0, complete: false, missing_match_ids: [...d.state.play_in.match_ids] },
    warnings: [{ kind: "schedule_incomplete", missing: 46 }],
  };
  return d;
}
