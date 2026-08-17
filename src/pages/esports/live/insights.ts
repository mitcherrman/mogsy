/**
 * Match Insights presentation (LIVE1 Phase 4B2).
 *
 * The backend owns every NUMBER and every THRESHOLD; this file owns only the
 * words. Nothing here recomputes a fact, and nothing here invents one — a
 * missing insight becomes a missing row, never a filled-in guess.
 *
 * The vocabulary is deliberately narrow. "Led", "swung", "changed hands" and
 * "took" all describe things the telemetry recorded. There is no "comeback",
 * no "dominant", no "should win": those are claims about a match rather than
 * readings of it, and Phase 4B2 has no evidence that supports them.
 */
import type {
  GoldMomentum,
  InsightPlayer,
  InsightSide,
  LiveGameSummary,
  MatchInsightsResponse,
  ObjectiveTally,
  ObjectiveWindow,
  RoleGap,
} from "@/lib/live-esports/api";

import { clock, kgold, teamLabel } from "./lib";

/** A story sentence is suppressed when the fact it names happened this close
 * to the final frame — the closing sentence already says it, and repeating
 * it reads as two events rather than one. Presentation only. */
const STORY_TAIL_SECONDS = 60;

/** Below this many sentences the story is noise; show the cards instead. */
const STORY_MIN_SENTENCES = 2;

export type InsightRowKey =
  | "current"
  | "largest"
  | "swing"
  | "momentum"
  | "objectives"
  | "leader";

export type InsightRow = {
  key: InsightRowKey;
  /** Card heading, e.g. "Gold lead". */
  label: string;
  /** The headline fact, e.g. "KT +3.2k". */
  value: string;
  /** One supporting line, e.g. "at 18:42". */
  detail?: string;
  /** Which side the value belongs to, for the accent colour. */
  side?: InsightSide;
  /** Hover text spelling out how the number was derived. */
  title?: string;
};

/* ── small formatters ──────────────────────────────────────────────────────── */

/** "6m 20s" / "45s" — a span, never a clock time. */
export function durationLabel(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/** "once" / "twice" / "3 times" — English, not a bare integer. */
export function timesLabel(n: number): string {
  if (n === 1) return "once";
  if (n === 2) return "twice";
  return `${n} times`;
}

/**
 * The short handle a caster would say.
 *
 * `resolved_player_name` carries the canonical Leaguepedia form, which for
 * some players is "Lucid (Choi Yong-hyeok)" — correct on a profile row and
 * far too long for a 200px card. The parenthetical is the disambiguator, so
 * dropping it leaves exactly the handle.
 */
export function playerHandle(p: InsightPlayer | null | undefined): string | null {
  const full = p?.name || p?.summoner_name;
  if (!full) return null;
  const cut = full.indexOf(" (");
  return (cut > 0 ? full.slice(0, cut) : full).trim() || null;
}

/** The team code for a side, or null when the side itself is unknown. */
export function sideTeam(
  game: LiveGameSummary | null | undefined,
  side: InsightSide,
): string | null {
  if (!game || !side) return null;
  return teamLabel(side === "blue" ? game.teams.blue : game.teams.red);
}

/** "KT +3.2k" — a signed gold figure attributed to a team. */
export function goldFor(
  game: LiveGameSummary | null | undefined,
  side: InsightSide,
  gold: number,
): string {
  const team = sideTeam(game, side);
  return team ? `${team} +${kgold(gold)}` : `+${kgold(gold)}`;
}

export const ROLE_LABEL: Record<string, string> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  bottom: "Bot",
  support: "Support",
};

/**
 * Objectives in the order a caster would list them, each with its singular
 * and plural form and whether one of it is named on its own.
 *
 * "Baron" is an event; "1 tower" is a count. Saying "Baron" reads the way
 * people talk, while a bare "tower" reads like a truncation — so the named
 * objectives drop the "1" and the countable ones keep it.
 */
const OBJECTIVE_WORDS: Array<{
  key: keyof ObjectiveTally;
  one: string;
  many: string;
  bareWhenSingle: boolean;
}> = [
  { key: "barons", one: "Baron", many: "Barons", bareWhenSingle: true },
  { key: "dragons", one: "Dragon", many: "Dragons", bareWhenSingle: true },
  { key: "inhibitors", one: "Inhibitor", many: "Inhibitors", bareWhenSingle: true },
  { key: "towers", one: "tower", many: "towers", bareWhenSingle: false },
  { key: "kills", one: "kill", many: "kills", bareWhenSingle: false },
];

/** "Baron · 2 towers · 3 kills" — what one side took, or null if nothing. */
export function tallyPhrase(tally: ObjectiveTally | null | undefined): string | null {
  if (!tally) return null;
  const parts: string[] = [];
  for (const { key, one, many, bareWhenSingle } of OBJECTIVE_WORDS) {
    const n = tally[key] ?? 0;
    if (n <= 0) continue;
    if (n === 1) parts.push(bareWhenSingle ? one : `1 ${one}`);
    else parts.push(`${n} ${many}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/** The window the viewer sees by default: the widest one the backend sent. */
export function primaryWindow(
  data: MatchInsightsResponse | null | undefined,
): ObjectiveWindow | null {
  const windows = (data?.objectives ?? []).filter((w) => w.usable);
  if (!windows.length) return null;
  return windows.reduce((a, b) => (b.window_seconds > a.window_seconds ? b : a));
}

export function momentumFor(
  data: MatchInsightsResponse | null | undefined,
  seconds: number,
): GoldMomentum | null {
  return (data?.gold?.momentum ?? []).find((m) => m.window_seconds === seconds) ?? null;
}

/** The widest momentum window available — a short game may only have a narrow one. */
export function primaryMomentum(
  data: MatchInsightsResponse | null | undefined,
): GoldMomentum | null {
  const all = data?.gold?.momentum ?? [];
  if (!all.length) return null;
  return all.reduce((a, b) => (b.window_seconds > a.window_seconds ? b : a));
}

/** "Last 5m" / "Last 3m" — window sizes are always whole minutes here. */
export function windowLabel(seconds: number): string {
  return seconds % 60 === 0 ? `Last ${seconds / 60}m` : `Last ${seconds}s`;
}

/* ── the cards ─────────────────────────────────────────────────────────────── */

/**
 * Four to six scannable facts, in the order someone reads a match: where it
 * stands, where it has been, what just moved it, and who is carrying it.
 *
 * A row is omitted entirely rather than rendered empty. A game with no gold
 * history produces no rows, and the caller shows why instead.
 */
export function insightRows(
  data: MatchInsightsResponse | null | undefined,
  game: LiveGameSummary | null | undefined,
): InsightRow[] {
  const rows: InsightRow[] = [];
  if (!data) return rows;
  const live = !data.final;

  /* 1 — where it stands right now */
  const current = data.gold?.current_lead;
  if (current) {
    rows.push({
      key: "current",
      label: live ? "Gold lead" : "Final gold lead",
      value: current.even
        ? "Gold is even"
        : goldFor(game, current.side, current.gold),
      side: current.even ? null : current.side,
      detail: current.even
        ? `Within ${kgold(data.definitions.min_lead_gold)}`
        : undefined,
      title: `Team gold difference at the latest stored frame. Leads under ${data.definitions.min_lead_gold} gold are reported as even.`,
    });
  }

  /* 2 — the high-water marks */
  const peaks = data.gold?.largest_lead;
  const bluePeak = peaks?.blue?.meaningful ? peaks.blue : null;
  const redPeak = peaks?.red?.meaningful ? peaks.red : null;
  const topPeak =
    bluePeak && redPeak
      ? bluePeak.gold >= redPeak.gold
        ? { side: "blue" as const, peak: bluePeak }
        : { side: "red" as const, peak: redPeak }
      : bluePeak
        ? { side: "blue" as const, peak: bluePeak }
        : redPeak
          ? { side: "red" as const, peak: redPeak }
          : null;
  if (topPeak) {
    const other = topPeak.side === "blue" ? redPeak : bluePeak;
    const otherSide = topPeak.side === "blue" ? "red" : "blue";
    rows.push({
      key: "largest",
      label: "Largest lead",
      value: goldFor(game, topPeak.side, topPeak.peak.gold),
      side: topPeak.side,
      // Both sides only appear when BOTH held a lead worth naming; a game
      // one team led wire to wire says so by having nothing to add.
      detail: other
        ? `at ${clock(topPeak.peak.t)} · ${goldFor(game, otherSide, other.gold)} at ${clock(other.t)}`
        : `at ${clock(topPeak.peak.t)}`,
      title:
        "The largest team gold difference reached at any stored frame, timed from the first frame of the game.",
    });
  }

  /* 3 — the biggest bounded move */
  const swing = data.gold?.biggest_swing;
  if (swing) {
    rows.push({
      key: "swing",
      label: "Biggest swing",
      value: goldFor(game, swing.side, swing.gold),
      side: swing.side,
      detail: `over ${durationLabel(swing.duration_seconds)} · ${clock(swing.from_t)}–${clock(swing.to_t)}`,
      title: `The largest movement of the gold difference across any interval of ${Math.round(
        data.definitions.swing_window_seconds / 60,
      )} minutes or less, reported only above ${data.definitions.min_swing_gold} gold.`,
    });
  }

  /* 4 — which way it is moving */
  const momentum = primaryMomentum(data);
  if (momentum) {
    rows.push({
      key: "momentum",
      label: windowLabel(momentum.window_seconds),
      value: momentum.even
        ? "Gold held level"
        : goldFor(game, momentum.side, momentum.gold),
      side: momentum.even ? null : momentum.side,
      detail: momentum.partial
        ? `only ${durationLabel(momentum.covered_seconds)} of telemetry`
        : undefined,
      title:
        "Change in the gold DIFFERENCE over this window — not gold earned, which both teams do constantly.",
    });
  }

  /* 5 — what actually happened in that window */
  const window = primaryWindow(data);
  if (window) {
    const blue = tallyPhrase(window.blue);
    const red = tallyPhrase(window.red);
    const label = `${windowLabel(window.window_seconds)} objectives`;
    if (!blue && !red) {
      rows.push({
        key: "objectives",
        label,
        value: "Nothing taken",
        title: "No tracked objective or kill was recorded in this window.",
      });
    } else {
      const lines = [
        blue ? `${sideTeam(game, "blue")} ${blue}` : null,
        red ? `${sideTeam(game, "red")} ${red}` : null,
      ].filter(Boolean) as string[];
      rows.push({
        key: "objectives",
        label,
        value: lines[0],
        detail: lines[1],
        side: blue && !red ? "blue" : red && !blue ? "red" : null,
        title: `Objectives and kills observed between frames in the last ${
          window.window_seconds / 60
        } minutes of telemetry.`,
      });
    }
  }

  /* 6 — who is carrying it */
  const leader = data.players?.top_gold;
  const handle = playerHandle(leader);
  if (leader && handle && leader.total_gold != null) {
    rows.push({
      key: "leader",
      label: "Gold leader",
      value: `${handle} — ${kgold(leader.total_gold)}`,
      side: leader.side,
      // The second line is a DIFFERENT statement — the widest lane matchup,
      // which is often a different player from the overall gold leader. The
      // tooltip has to say so, because the two lines sit in one card.
      detail: roleGapDetail(data),
      title:
        "Top line: the highest total gold of any player at the latest stored frame. Second line: the widest same-role gold gap, using upstream's published roles — often a different player.",
    });
  }
  return rows;
}

/**
 * "Bot +6.7k vs Jiwoo" — the widest same-role gap, or the reason there is none.
 *
 * Roles come from upstream's own `participantMetadata.role`, and the backend
 * only compares a lane when exactly one player per side holds it. When that
 * fails the viewer is told why rather than shown a matchup we cannot stand
 * behind.
 */
export function roleGapDetail(
  data: MatchInsightsResponse | null | undefined,
): string | undefined {
  const players = data?.players;
  if (!players) return undefined;
  const gap = players.biggest_role_gap;
  if (!gap || !gap.side) {
    return players.role_mapping_complete
      ? undefined
      : "Lane matchups unavailable — roles not published for every player";
  }
  return roleGapText(gap) ?? undefined;
}

/** "Bot +6.7k vs Jiwoo" — the leading player's lane, gap, and opponent. */
export function roleGapText(gap: RoleGap | null | undefined): string | null {
  if (!gap || !gap.side) return null;
  const ahead = gap.side === "blue" ? gap.blue : gap.red;
  const behind = gap.side === "blue" ? gap.red : gap.blue;
  const aheadName = playerHandle(ahead);
  const behindName = playerHandle(behind);
  const role = ROLE_LABEL[gap.role] ?? gap.role;
  if (!aheadName) return null;
  const head = `${role} ${aheadName} +${kgold(gap.gold)}`;
  return behindName ? `${head} vs ${behindName}` : head;
}

/* ── the game story ────────────────────────────────────────────────────────── */

/**
 * The match in two to four sentences, assembled from the same facts the cards
 * show — never generated, never rephrased by a model, and never claiming
 * anything the telemetry did not record.
 *
 * The rules, in the order the sentences appear:
 *
 *  1. PEAK — the largest lead either side held, and when. Suppressed when
 *     that peak IS the ending (within a minute of the last frame, or the same
 *     frame the swing closed on), because the closing sentence already says
 *     it and saying it twice invents a second event.
 *  2. LEAD CHANGES — how many times the lead genuinely changed hands, using
 *     the backend's hysteresis rule. "Changed hands" is the strongest word
 *     used; "comeback" is deliberately absent (Phase 4B2 has no threshold
 *     for it).
 *  3. SWING — the largest bounded move of the gold difference, with the
 *     interval that produced it.
 *  4. CLOSE — where the game finished, or stands right now.
 *
 * Fewer than two sentences means the game has nothing to tell yet, and the
 * caller renders nothing rather than a one-line "story".
 */
export function buildStory(
  data: MatchInsightsResponse | null | undefined,
  game: LiveGameSummary | null | undefined,
): string[] {
  if (!data || !data.gold?.current_lead) return [];
  const sentences: string[] = [];
  const elapsed = data.coverage?.elapsed_seconds ?? null;
  const swing = data.gold.biggest_swing;

  /* 1 — peak */
  const peaks = data.gold.largest_lead;
  const candidates = (["blue", "red"] as const)
    .map((side) => ({ side, peak: peaks?.[side] }))
    .filter((c) => c.peak?.meaningful)
    .map((c) => ({ side: c.side, peak: c.peak! }))
    .sort((a, b) => b.peak.gold - a.peak.gold);
  const lead = candidates[0];
  const isEnding =
    !!lead &&
    ((elapsed != null && elapsed - lead.peak.t <= STORY_TAIL_SECONDS) ||
      (!!swing && swing.to_t === lead.peak.t));
  if (lead && !isEnding) {
    const second = candidates[1];
    const head = `${sideTeam(game, lead.side)} led by ${kgold(lead.peak.gold)} at ${clock(lead.peak.t)}`;
    sentences.push(
      second
        ? `${head}, after ${sideTeam(game, second.side)} had been ${kgold(second.peak.gold)} up at ${clock(second.peak.t)}.`
        : `${head}.`,
    );
  }

  /* 2 — lead changes */
  const changes = data.gold.lead_changes ?? [];
  if (changes.length) {
    sentences.push(`The lead changed hands ${timesLabel(changes.length)}.`);
  }

  /* 3 — swing */
  if (swing) {
    sentences.push(
      `${sideTeam(game, swing.side)} swung ${kgold(swing.gold)} their way between ${clock(
        swing.from_t,
      )} and ${clock(swing.to_t)}.`,
    );
  }

  /* 4 — close */
  const current = data.gold.current_lead;
  if (current.even) {
    sentences.push(data.final ? "It finished level on gold." : "Gold is level right now.");
  } else {
    const team = sideTeam(game, current.side);
    sentences.push(
      data.final
        ? `${team} finished ${kgold(current.gold)} ahead.`
        : `${team} are ${kgold(current.gold)} ahead right now.`,
    );
  }

  return sentences.length >= STORY_MIN_SENTENCES ? sentences : [];
}

/**
 * Why the insight panel is empty, in the viewer's terms.
 *
 * A game the feed never published telemetry for is a different situation
 * from one that has only just started, and neither is an error.
 */
export function emptyInsightReason(
  data: MatchInsightsResponse | null | undefined,
): string | null {
  if (!data) return null;
  const samples = data.coverage?.gold_samples ?? 0;
  if (samples === 0) {
    return "No gold telemetry was published for this game.";
  }
  if (samples < 2) {
    return "Only one frame of telemetry so far — insights need a history to compare against.";
  }
  return null;
}
