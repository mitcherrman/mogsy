/**
 * UX-4/UX-5 — e2 series snapshot → the UI's `SeriesEnvelope`. Pure: the same
 * snapshot and client state always give the same envelope.
 *
 * Every game number, grade and result comes from the e2 snapshot. The client
 * state (`LiveLocal`) holds only what E2 has no server concept for
 * (UX-3 handoff §6):
 *
 *  - `plan` and `decisions`: the series game plan and the between-game choice
 *    are client-side until E3 adds between-game actions. They select which
 *    legal lineup the draft pre-selects and gate the prep/backstage screens;
 *    the server never sees them.
 *  - `acked`: E2 grades, seals and applies the Baron in the same request as
 *    the third answer. Rev 2 returns that settled encounter, with all three
 *    answers' feedback and the grade, in `current_game.objective_results`.
 *    The UX-3 "graded → see the outcome" beat is presentation only: while the
 *    game's newest beat is that result's `objective_result` beat and the
 *    player has not opened it, the session reads `graded`; afterwards
 *    `settled`. The game snapshot is always shown exactly as served, and
 *    nothing is derived: every mark and count is the server's.
 *  - `pool`: the champion catalog from the last `lineup` phase, so champion
 *    names and classes survive into the game screens.
 */
import type {
  BetweenGameDecisionId, E1Effect, E1Objective, E1Role, E1Snapshot, FixtureChampion, FixtureLineup,
  ObjectiveQuestionView, ObjectiveSessionView, SeriesEnvelope, SeriesGameView, SeriesStatus, SeriesView,
} from "./contracts";
import type { E2Champion, E2Lineup, E2Objective, E2ObjectiveResult, E2Question, E2SeriesSnapshot } from "./e2contracts";

export const ROLES: E1Role[] = ["top", "jng", "mid", "bot", "sup"];

/**
 * The legal lineups the draft offers: the E1 qualification study's champion
 * sets (the same ids the UX-3 double used). A set is offered only when every
 * champion is in the server's `champion_pool`; the server still validates.
 */
export const LIVE_LINEUPS: { lineup_id: string; title: string; champions: string[] }[] = [
  { lineup_id: "early", title: "Early tempo (early champions)", champions: ["syn_c1_warlord", "syn_c1_stalker", "syn_c1_blade", "syn_c1_skirmisher", "syn_c1_hook"] },
  { lineup_id: "scaling", title: "Scaling (late champions)", champions: ["syn_c1_bastion", "syn_c1_spirit", "syn_c1_controller", "syn_c1_hypercarry", "syn_c1_lantern"] },
  { lineup_id: "balanced", title: "Balanced (flat champions)", champions: ["syn_c1_duelist", "syn_c1_juggernaut", "syn_c1_artillery", "syn_c1_longbow", "syn_c1_guardian"] },
];
export const CUSTOM_LINEUP = "custom";

export interface LiveLocal {
  plan: string | null;
  /** after game n → the decision taken before game n+1 */
  decisions: Record<number, BetweenGameDecisionId>;
  /** encounter ids whose outcome the player has opened (presentation only) */
  acked: string[];
  pool: E2Champion[];
}
export const emptyLocal = (): LiveLocal => ({ plan: null, decisions: {}, acked: [], pool: [] });

export const CONTENT_LABEL = "Real questions from the Mogzy bank, frozen per encounter and graded by the E2 server. The client never sees an answer before it locks one.";

const titleOf = (key: string) => `SYN ${key.replace(/^syn_c\d+_/, "").replace(/(^|_)(\w)/g, (_, s: string, c: string) => `${s ? " " : ""}${c.toUpperCase()}`)}`;

function champion(key: string, pool: E2Champion[]): FixtureChampion {
  const c = pool.find((x) => x.key === key);
  if (!c) {
    // Not in the cached catalog (an opponent pick, or a resume without a lineup read):
    // name from the key, no class or ratings rather than invented ones.
    return { key, name: titleOf(key), class: "", capabilities: [], damage: "", ratings: [] as unknown as [number, number, number] };
  }
  return { key, name: c.name, class: c.composition?.class ?? "", capabilities: c.composition?.capabilities ?? [], damage: c.composition?.damage ?? "", ratings: c.phase_ratings };
}

function lineupOf(id: string, title: string, l: E2Lineup, pool: E2Champion[], ratings: [number, number, number]): FixtureLineup {
  return { lineup_id: id, title, roles: [...ROLES], champions: ROLES.map((r) => champion(l[r], pool)), player_ratings: ratings };
}

/** The lineup id for a server lineup (by champions), or `custom`. */
export function lineupIdOf(l: E2Lineup | null | undefined): string | null {
  if (!l) return null;
  return LIVE_LINEUPS.find((x) => ROLES.every((r, i) => l[r] === x.champions[i]))?.lineup_id ?? CUSTOM_LINEUP;
}

export function lineupChampions(id: string): E2Lineup | null {
  const x = LIVE_LINEUPS.find((l) => l.lineup_id === id);
  return x ? (Object.fromEntries(ROLES.map((r, i) => [r, x.champions[i]])) as E2Lineup) : null;
}

function legalLineups(snap: E2SeriesSnapshot, pool: E2Champion[], ratings: [number, number, number]): FixtureLineup[] {
  const inPool = new Set(pool.map((c) => c.key));
  const out = LIVE_LINEUPS.filter((x) => !inPool.size || x.champions.every((k) => inPool.has(k)))
    .map((x) => lineupOf(x.lineup_id, x.title, lineupChampions(x.lineup_id)!, pool, ratings));
  // A lineup the server actually played that is not one of the sets (never sent by this client today).
  for (const g of snap.games) {
    if (lineupIdOf(g.lineup.you) === CUSTOM_LINEUP && !out.some((l) => l.lineup_id === CUSTOM_LINEUP)) out.push(lineupOf(CUSTOM_LINEUP, "Custom lineup", g.lineup.you, pool, ratings));
  }
  return out;
}

function status(snap: E2SeriesSnapshot, local: LiveLocal): SeriesStatus {
  if (snap.phase === "completed") return "complete";
  if (snap.phase === "game" || snap.phase === "objective") return "in_game";
  const n = snap.lineup!.game;
  if (n === 1) return local.plan ? "drafting" : "prep";
  return local.decisions[n - 1] ? "drafting" : "between_games";
}

function consumedEffects(snap: E2SeriesSnapshot, game: number): E1Effect[] {
  return snap.between_games.consumed.filter((c) => c.game === game).map((c) => ({
    effect_id: c.effect_id, channel: "persistent", kind: c.kind, for: c.for,
    role: (c.player_id?.split("-").pop() as E1Role | undefined) ?? null, player_id: c.player_id,
    value: c.value, duration_games: c.duration_games, status: "settled", note: c.note,
    evidence_type: "generated_in_run_event",
  }));
}

function toE1Objective(o: E2Objective): E1Objective {
  return {
    state: "awaiting_answer", encounter_id: o.encounter_id, event_id: o.event_id, title: o.title, stage: o.stage,
    answering: o.answering, encounter_kind: o.encounter_kind as E1Objective["encounter_kind"], question_count: o.question_count as 3,
    closeout_on_perfect: o.closeout_on_perfect, qualification: o.qualification, questions: null,
    action: { type: o.action.kind, encounter_id: o.encounter_id, fields: {} }, outcomes: o.outcomes,
  };
}

function questionView(q: E2Question): ObjectiveQuestionView {
  const texts = q.options?.map((o) => o.text) ?? null;
  if (q.state === "answered" && q.feedback) {
    const chosen = q.options ? q.options.findIndex((o) => o.option_id === q.feedback!.your_option_id) : -1;
    return { index: q.index, state: q.feedback.correct ? "revealed_correct" : "revealed_incorrect", prompt: q.prompt ?? null, options: texts, chosen: chosen >= 0 ? chosen : null };
  }
  if (q.state === "current") return { index: q.index, state: "answering", prompt: q.prompt ?? null, options: texts, chosen: null };
  return { index: q.index, state: "pending", prompt: null, options: null, chosen: null };
}

function liveSession(o: E2Objective): ObjectiveSessionView | null {
  if (o.state !== "in_progress" || !o.encounter) return null;
  const e = o.encounter;
  return {
    authority: "e2_objective", encounter_id: e.encounter_id, state: "in_progress", child_match_id: null,
    question_index: e.answered, questions: e.questions.map(questionView), graded: null, content_label: CONTENT_LABEL,
  };
}

/** Rev 2: a settled encounter exactly as the server sealed it (all three answers' feedback + the grade). */
function resultSession(r: E2ObjectiveResult, graded: boolean): ObjectiveSessionView {
  return {
    authority: "e2_objective", encounter_id: r.encounter_id, state: graded ? "graded" : "settled", child_match_id: null,
    question_index: r.questions.length, questions: r.questions.map(questionView),
    graded: { correct_count: r.grade.correct_count, category: r.grade.category }, content_label: CONTENT_LABEL,
    result_event_id: r.event_instance_id,
  };
}

export function mapE2ToEnvelope(snap: E2SeriesSnapshot, local: LiveLocal): SeriesEnvelope {
  const pool = snap.lineup?.champion_pool ?? local.pool;
  const ratings = snap.teams.you.players[0]?.phase_ratings ?? [0, 0, 0];
  const st = status(snap, local);
  const settledGames = snap.games.filter((g) => g.settled);
  const games: SeriesGameView[] = settledGames.map((g) => {
    const obj = g.objectives.find((o) => o.state === "settled" && o.correct_count !== null);
    return {
      index: g.game, lineup_id: lineupIdOf(g.lineup.you) ?? CUSTOM_LINEUP, winner: g.winner!, how: g.how!, after_stage: g.after_stage!,
      points: g.stages.map((x) => x.you_points), labels: g.stages.map((x) => x.outcome_label),
      objective: obj ? { correct_count: obj.correct_count!, category: obj.category! } : null,
      pending_consequences: consumedEffects(snap, g.game), decision: local.decisions[g.game] ?? null,
    };
  });
  const playing = snap.current_game ? snap.games.find((g) => g.game === snap.current_game!.game_index) : undefined;
  const currentGame = snap.phase === "completed" ? null : snap.phase === "lineup" ? snap.lineup!.game : snap.current_game!.game_index;
  const oppLineup = snap.lineup?.opponent ?? snap.games[0]?.lineup.opponent ?? null;

  const series: SeriesView = {
    authority: "e2_series", series_id: snap.series_id, rev: snap.seq, status: st,
    best_of: 5, wins_needed: 3, wins: snap.score.you, losses: snap.score.opponent,
    current_game: currentGame,
    current_lineup: st === "in_game" ? lineupIdOf(playing?.lineup.you) : null,
    games, winner: snap.result?.winner ?? null,
    team: { team_id: snap.teams.you.team_id, name: snap.teams.you.name },
    opponent: {
      team_id: snap.teams.opponent.team_id, name: snap.teams.opponent.name,
      lineup: oppLineup ? lineupOf(snap.teams.opponent.preset, snap.teams.opponent.preset_title, oppLineup, pool, snap.teams.opponent.players[0]?.phase_ratings ?? [0, 0, 0])
        : { lineup_id: snap.teams.opponent.preset, title: snap.teams.opponent.preset_title, roles: [...ROLES], champions: [], player_ratings: [0, 0, 0] },
    },
    legal_lineups: legalLineups(snap, pool, ratings), plan: local.plan,
    policy: { policy_id: snap.pins.qualification_policy ?? "unknown", catalog_id: snap.pins.event_catalog_id ?? "unknown", status: "candidate: owner decision pending" },
  };

  // ── game + objective
  const raw = snap.current_game;
  let game: E1Snapshot | null = null;
  let objective: ObjectiveSessionView | null = null;
  if (raw) {
    const { game_index: _gi, ...rest } = raw;
    game = { ...rest, objective: raw.objective ? toE1Objective(raw.objective) : null } as E1Snapshot;
    if (raw.objective) {
      objective = liveSession(raw.objective);
    } else {
      // Rev 2: the most recent settled encounter of this game. Rev 1 has none, and the outcome shows directly.
      const r = raw.objective_results?.[raw.objective_results.length - 1];
      if (r) {
        // "graded" only on that result's own beat and until opened; once the game moved on it is just settled.
        const top = raw.beats[raw.beats.length - 1];
        const onResult = top?.beat === "objective_result" && top.seq === r.result_beat_seq;
        objective = resultSession(r, onResult && !local.acked.includes(r.encounter_id));
      }
    }
  }
  return { series, game, objective };
}
