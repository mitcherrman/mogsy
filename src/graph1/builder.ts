/**
 * The user-facing GRAPH1 graph builder.
 *
 * A reader picks a FOCUS (a player, a team, a champion) and what to COMPARE
 * it against; this module turns that into the backend family key. Family ids
 * (`player-champions`, `champion-teams:<slug>:bans`) are an implementation
 * detail and never reach the screen or the URL.
 *
 * Only the four canonical combinations exist, and they are enumerated rather
 * than derived, so the UI cannot compose a key the backend has no family for:
 *
 *     Player   -> Champions      player-champions:<lp_page>
 *     Team     -> Champions      team-champions:<team_key>
 *     Champion -> Players        champion-players:<slug>
 *     Champion -> Teams          champion-teams:<slug>[:bans]
 *
 * Metric validity is enumerated the same way. The frontend offers only what a
 * combination supports, but it never *decides* anything: a ratio's denominator
 * and its coverage gate live in the backend, and a refusal (409) is the final
 * word — see `ProPlayGraphs`. This list exists so a user is not handed a
 * control whose only outcome is an error.
 */
import { parseFamilyDatasetKey } from "./contract";

export type Graph1FocusKind = "player" | "team" | "champion";
export type Graph1CompareKind = "champions" | "players" | "teams";
/** Champion -> Teams is the one combination with two event sets. */
export type Graph1Mode = "picks" | "bans";

/** Public metric ids. Deliberately NOT the backend's (`win_rate`, …). */
export type Graph1MetricChoice =
  | "games"
  | "wins"
  | "bans"
  | "winrate"
  | "share"
  | "banrate";

/** How a metric is drawn. A ratio is not monotonic, so it cannot be raced. */
export type Graph1VizKind = "race" | "board";

export interface Graph1MetricOption {
  id: Graph1MetricChoice;
  label: string;
  viz: Graph1VizKind;
  /** Backend `?metric=` value. Absent for race metrics, which ride in the
   * race payload and need no parameter. */
  apiMetric?: "win_rate" | "share" | "ban_rate";
  hint: string;
}

const METRICS: Record<Graph1MetricChoice, Omit<Graph1MetricOption, "label">> = {
  games: { id: "games", viz: "race", hint: "Cumulative games, animated over time." },
  wins: { id: "wins", viz: "race", hint: "Cumulative wins, animated over time." },
  bans: { id: "bans", viz: "race", hint: "Cumulative bans, animated over time." },
  winrate: {
    id: "winrate",
    viz: "board",
    apiMetric: "win_rate",
    hint: "Wins as a share of games played, ranked.",
  },
  share: {
    id: "share",
    viz: "board",
    apiMetric: "share",
    hint: "Share of the games in this scope, ranked.",
  },
  banrate: {
    id: "banrate",
    viz: "board",
    apiMetric: "ban_rate",
    hint: "Bans as a share of the games in this scope, ranked.",
  },
};

export interface Graph1Combination {
  focus: Graph1FocusKind;
  compare: Graph1CompareKind;
  familyId: string;
  /** What the reader is choosing when they pick a focus entity. */
  focusLabel: string;
  /** What the bars are. */
  compareLabel: string;
  /** Menu wording for this counterpart. */
  compareOption: string;
  /** Present only where the backend has two event sets. */
  modes?: Graph1Mode[];
}

/** Every combination the backend actually has. Order drives the menus. */
export const COMBINATIONS: Graph1Combination[] = [
  {
    focus: "player",
    compare: "champions",
    familyId: "player-champions",
    focusLabel: "Player",
    compareLabel: "Champions",
    compareOption: "Champions they play",
  },
  {
    focus: "team",
    compare: "champions",
    familyId: "team-champions",
    focusLabel: "Team",
    compareLabel: "Champions",
    compareOption: "Champions they play",
  },
  {
    focus: "champion",
    compare: "players",
    familyId: "champion-players",
    focusLabel: "Champion",
    compareLabel: "Players",
    compareOption: "Players who play it",
  },
  {
    focus: "champion",
    compare: "teams",
    familyId: "champion-teams",
    focusLabel: "Champion",
    compareLabel: "Teams",
    compareOption: "Teams that play it",
    modes: ["picks", "bans"],
  },
];

export function combinationsFor(focus: Graph1FocusKind): Graph1Combination[] {
  return COMBINATIONS.filter((c) => c.focus === focus);
}

export function findCombination(
  focus: Graph1FocusKind,
  compare: Graph1CompareKind,
): Graph1Combination | undefined {
  return COMBINATIONS.find((c) => c.focus === focus && c.compare === compare);
}

/** The counterpart a focus lands on when the reader has not chosen one. */
export function defaultCompare(focus: Graph1FocusKind): Graph1CompareKind {
  return combinationsFor(focus)[0].compare;
}

// ---------------------------------------------------------------------------
// metrics

/**
 * The metrics a combination supports.
 *
 * Bans are their own event set: a banned champion was never played, so "wins"
 * and "win rate" are not merely unavailable there, they are undefined — the
 * backend refuses both with a 409 and this list agrees with it.
 */
export function metricsFor(
  combination: Graph1Combination,
  mode: Graph1Mode = "picks",
): Graph1MetricOption[] {
  if (combination.compare === "teams" && mode === "bans") {
    return [
      { ...METRICS.bans, label: "Bans" },
      { ...METRICS.banrate, label: "Ban rate" },
    ];
  }
  // "Picks" reads better than "Games" wherever a team's draft is the unit.
  const countLabel =
    combination.compare === "teams" || combination.focus === "team"
      ? "Picks"
      : "Games";
  const shareLabel =
    combination.compare === "champions" ? "Champion share" : "Share";
  return [
    { ...METRICS.games, label: countLabel },
    { ...METRICS.wins, label: "Wins" },
    { ...METRICS.winrate, label: "Win rate" },
    { ...METRICS.share, label: shareLabel },
  ];
}

export function metricOption(
  combination: Graph1Combination,
  mode: Graph1Mode,
  metric: Graph1MetricChoice,
): Graph1MetricOption | undefined {
  return metricsFor(combination, mode).find((m) => m.id === metric);
}

/** The metric a combination lands on. Always the leading count metric. */
export function defaultMetric(
  combination: Graph1Combination,
  mode: Graph1Mode = "picks",
): Graph1MetricChoice {
  return metricsFor(combination, mode)[0].id;
}

// ---------------------------------------------------------------------------
// keys

/**
 * The backend dataset key for a builder selection.
 *
 * `champion-teams` carries its mode in the key because bans are a different
 * event set; every other family's key is `<family>:<entity>`. The backend
 * parses the mode off the LAST separator, which is why a champion slug can
 * never be mistaken for one.
 */
export function datasetKeyFor(
  combination: Graph1Combination,
  entityId: string,
  mode: Graph1Mode = "picks",
): string {
  const base = `${combination.familyId}:${entityId}`;
  return combination.compare === "teams" && mode === "bans"
    ? `${base}:bans`
    : base;
}

/**
 * Recover a builder selection from a dataset key.
 *
 * This is what keeps pre-Phase-F deep links working: a `?d=` key from the
 * operator page seeds the builder instead of being rejected. Returns null for
 * a legacy fixed race or a stat family, neither of which the builder models.
 */
export function selectionFromDatasetKey(key: string | undefined): {
  combination: Graph1Combination;
  entityId: string;
  mode: Graph1Mode;
} | null {
  const parsed = parseFamilyDatasetKey(key);
  if (!parsed) return null;
  const combination = COMBINATIONS.find((c) => c.familyId === parsed.familyId);
  if (!combination) return null;
  // `parseFamilyDatasetKey` splits on the FIRST separator, so a bans key
  // arrives here as entityId "kaisa:bans". Split the mode off the LAST one,
  // exactly as the backend does.
  let entityId = parsed.entityId;
  let mode: Graph1Mode = "picks";
  if (combination.modes) {
    const at = entityId.lastIndexOf(":");
    if (at > 0 && entityId.slice(at + 1) === "bans") {
      mode = "bans";
      entityId = entityId.slice(0, at);
    }
  }
  return entityId ? { combination, entityId, mode } : null;
}

// ---------------------------------------------------------------------------
// titles

/**
 * The graph's title, written for a reader.
 *
 * Backend titles are precise and technical ("Kai'Sa — teams by professional
 * games — win rate"); these are the same fact in the words a person would
 * use. Neither ever names a family id.
 *
 * `focusName` is the entity's display name once a payload has arrived, and the
 * raw id before that — so the heading is right immediately and gets prettier,
 * rather than appearing late.
 */
export function graphTitle(
  combination: Graph1Combination,
  focusName: string,
  metric: Graph1MetricChoice,
  mode: Graph1Mode = "picks",
): string {
  const who = possessive(focusName);
  switch (metric) {
    case "winrate":
      switch (combination.compare) {
        case "champions":
          return `${who} Best Champions by Win Rate`;
        // Attributive, not possessive: it is the highest Azir win rate, not
        // the highest Azir's win rate.
        case "players":
          return `Highest ${focusName} Win Rate`;
        case "teams":
          return `Teams With the Highest ${focusName} Win Rate`;
      }
      break;
    case "share":
      switch (combination.compare) {
        case "champions":
          return `${who} Champion Share`;
        case "players":
          return `Players With the Biggest Share of ${focusName} Games`;
        case "teams":
          return `Teams With the Biggest Share of ${focusName} Games`;
      }
      break;
    case "banrate":
      return `Teams That Ban ${focusName} Most Often`;
    case "bans":
      return `Teams Banning ${focusName}`;
    default:
      break;
  }
  // Count metrics — games/picks/wins.
  switch (combination.compare) {
    case "champions":
      return metric === "wins"
        ? `${who} Most Winning Champions`
        : combination.focus === "team"
          ? `${who} Champion Pool`
          : `${who} Most-Played Champions`;
    case "players":
      return metric === "wins"
        ? `${who} Most Winning Pro Players`
        : `${who} Most-Played Pro Players`;
    case "teams":
      return metric === "wins"
        ? `Teams Winning With ${focusName}`
        : `Teams Picking ${focusName}`;
  }
  return focusName;
}

/** "Faker" -> "Faker's"; "Kai'Sa" -> "Kai'Sa's"; "Gen.G" -> "Gen.G's". */
function possessive(name: string): string {
  if (!name) return name;
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}
