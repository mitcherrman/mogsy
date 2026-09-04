/**
 * The Pro Play question PRESENTATION CONTRACT, as the backend serves it.
 *
 * Backend source of truth: `pro_authority/question_context.py` (Step 1), and
 * `docs/LIVE1_PRO_PLAY_AUTHORITY.md` for the reasoning. This file only types
 * and normalizes it; it derives nothing.
 *
 * THE PRODUCT RULE THIS TRANSPORTS
 * ────────────────────────────────
 * A Pro Play stem stays short — "Who has the higher win rate on Kennen:
 * Nuguri or Clear?" — and the context that a longer sentence would have
 * carried arrives as structured data instead: a category, compact scope
 * chips, a metric chip, a champion anchor, and one symmetric card per
 * compared subject. The UI must therefore never re-expand that into prose,
 * and never re-derive it from `question_text`.
 *
 * ANSWER SAFETY IS A RENDER RULE, NOT ONLY A SERVER RULE
 * ─────────────────────────────────────────────────────
 * `QuestionContext` is the ONLY thing a pre-answer surface may draw. It
 * contains no metric value, no sample size, no ordering and no answer — by
 * construction on the server. Nothing in the UI may compute a statistic from
 * it, and `ProPlayEvidence` (the reveal half) must never be mounted before
 * `result` exists.
 *
 * EVERYTHING IS OPTIONAL, ON PURPOSE
 * ──────────────────────────────────
 * The contract shipped additively: a session served before it existed, or a
 * backend rolled back behind it, simply has no `context`/`evidence` key. Every
 * type here is therefore nullable at its edges and every consumer degrades to
 * the plain text-only question that shipped before Step 1.
 */

/** One compact display chip. `label` is the only thing rendered. */
export type ProPlayTag = {
  id: string;
  /** "league" | "pro_play" | "tournament" | "year" | "patch" | "all_time" — open by design. */
  type: string;
  label: string;
  tooltip?: string | null;
  /** Server-assigned render order. Already sorted; never re-sort by name. */
  priority?: number;
};

export type ProPlayEditorialTag = {
  id: string;
  label: string;
  tooltip?: string | null;
};

export type ProPlayRelationship = {
  id: string;
  label: string;
  anchor_entity?: string;
  subject_entity?: string;
};

export type ProPlayMetricTag = {
  id: string;
  label: string;
  /** "count" | "rate" */
  kind?: string;
  tooltip?: string | null;
};

/**
 * A media handle. For a champion, `key` is the `/api/assets/champions`
 * manifest key (the champion's canonical name) — resolve it through the
 * existing `useChampionAssets` helpers and nothing else. For a player, team,
 * league or tournament, `key` is null until an ingestion pass fills it; the
 * SHAPE ships now so a renderer can branch without a later contract change.
 */
export type ProPlayMedia = {
  kind: string;
  key: string | null;
};

export type ProPlaySeasonSpan = {
  first: number | null;
  last: number | null;
  /** "2018–2022", "2023", or null when the scope holds no games. */
  label: string | null;
  tooltip?: string | null;
};

export type ProPlayRole = {
  id: string | null;
  label: string | null;
  tooltip?: string | null;
};

export type ProPlayTeamChip = {
  id: string | null;
  label: string;
  short: string | null;
  region?: string | null;
  seasons?: ProPlaySeasonSpan;
  media?: ProPlayMedia;
  tooltip?: string | null;
};

export type ProPlayLeagueChip = {
  id: string;
  label: string;
  media?: ProPlayMedia;
  tooltip?: string | null;
};

/**
 * One compared subject, or the question's anchor — the same shapes are used
 * for both, because a Team → Champion question's anchor IS a team card.
 *
 * The three kinds are a discriminated union on `kind`, but the union is
 * treated as OPEN: an unknown kind renders as a bare labelled card rather
 * than crashing, so a future entity kind cannot break a live session.
 */
export type ProPlaySubject = {
  kind: string;
  label: string;
  id?: string | null;
  tooltip?: string | null;
  media?: ProPlayMedia;
  /** player */
  role?: ProPlayRole;
  teams?: ProPlayTeamChip[];
  teams_total?: number;
  teams_shown?: number;
  /** team */
  short?: string | null;
  region?: string | null;
  leagues?: ProPlayLeagueChip[];
  leagues_total?: number;
  leagues_shown?: number;
  /** player + team */
  seasons?: ProPlaySeasonSpan;
};

export type ProPlayQuestionContext = {
  version?: number;
  relationship: ProPlayRelationship;
  editorial_tags: ProPlayEditorialTag[];
  scope_tags: ProPlayTag[];
  metric: ProPlayMetricTag;
  anchor: ProPlaySubject | null;
  subjects: ProPlaySubject[];
};

/**
 * One subject's numbers at reveal. Typed PER METRIC on the server — a win
 * rate carries the wins and games it stands on, a ban count carries the scope
 * size instead — so this is a union of optional fields rather than a fixed
 * row, and the renderer shows whichever are present.
 */
export type ProPlayEvidenceSubject = {
  label: string;
  display: string | null;
  games?: number | null;
  wins?: number | null;
  losses?: number | null;
  win_rate?: number | null;
  champion_share?: number | null;
  total_games_in_scope?: number | null;
  picks?: number | null;
  bans?: number | null;
  presence?: number | null;
  games_picked?: number | null;
  games_banned?: number | null;
  scope_games?: number | null;
};

export type ProPlayEvidence = {
  metric: ProPlayMetricTag;
  /** "pairwise" | "ranking" */
  form?: string;
  scope_label?: string | null;
  correct_label?: string | null;
  subjects: ProPlayEvidenceSubject[];
  authority?: {
    revision?: number | null;
    revisions?: Record<string, number> | null;
    metric_definition_version?: string | null;
    policy_version?: string | null;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Narrow a raw `question.context` blob, or return null.
 *
 * Deliberately shallow: it checks only what the renderer branches on
 * (a relationship label, a subjects array), and passes the rest through. A
 * server that adds a field must not need a frontend release, which is the
 * whole point of the additive contract — and a server that omits an optional
 * field must not blank the card.
 */
export function asQuestionContext(value: unknown): ProPlayQuestionContext | null {
  if (!isRecord(value)) return null;
  const relationship = value.relationship;
  const metric = value.metric;
  if (!isRecord(relationship) || typeof relationship.label !== "string") return null;
  if (!isRecord(metric) || typeof metric.label !== "string") return null;
  return {
    version: typeof value.version === "number" ? value.version : undefined,
    relationship: relationship as unknown as ProPlayRelationship,
    editorial_tags: asArray(value.editorial_tags) as ProPlayEditorialTag[],
    scope_tags: asArray(value.scope_tags) as ProPlayTag[],
    metric: metric as unknown as ProPlayMetricTag,
    anchor: isRecord(value.anchor) ? (value.anchor as unknown as ProPlaySubject) : null,
    subjects: asArray(value.subjects) as ProPlaySubject[],
  };
}

/** Narrow a raw `result.evidence` blob, or return null. */
export function asEvidence(value: unknown): ProPlayEvidence | null {
  if (!isRecord(value)) return null;
  const subjects = asArray(value.subjects) as ProPlayEvidenceSubject[];
  if (!subjects.length) return null;
  const metric = isRecord(value.metric)
    ? (value.metric as unknown as ProPlayMetricTag)
    : { id: "", label: "" };
  return {
    metric,
    form: typeof value.form === "string" ? value.form : undefined,
    scope_label: typeof value.scope_label === "string" ? value.scope_label : null,
    correct_label: typeof value.correct_label === "string" ? value.correct_label : null,
    subjects,
    authority: isRecord(value.authority)
      ? (value.authority as ProPlayEvidence["authority"])
      : undefined,
  };
}

/** The editorial tag id the backend uses for the current-events theme. */
export const RECENT_ESPORTS_TAG = "recent_esports";
