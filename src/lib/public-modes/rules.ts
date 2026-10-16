/**
 * PGM1 — A MODE'S RULES, as a model the Rules panel renders.
 *
 * The content comes from the server's catalog entry and nothing else: what you
 * do (`summary`), how it is scored (`scoring.summary`), and the two facts every
 * public mode states — it never changes the Daily score or a Ranked rating.
 * A mode whose scoring the server has not published yet SAYS so; the panel
 * never fills the gap with a guess. Phase 2 adds mode-specific sections
 * (`extra`) as each mode's public launch lands, keyed by `rulesId`.
 */
import type { PublicModeEntry } from "./contracts";

export interface ModeRulesSection {
  heading: string;
  body: string;
}

export interface ModeRules {
  rulesId: string;
  title: string;
  sections: ModeRulesSection[];
}

export const SCORING_NOT_PUBLISHED = "Scoring is published when this mode opens to everyone.";

/**
 * PGM2 — `extra` defaults to the server's own sections for the mode
 * (`entry.rules`), so every caller renders the same accurate rules.
 */
export function buildModeRules(entry: PublicModeEntry,
                               extra: readonly ModeRulesSection[] = entry.rules ?? []): ModeRules {
  const effects: string[] = [];
  effects.push(entry.scoring.affectsDailyScore
    ? "Counts toward your Daily score." : "Never changes your Daily score.");
  effects.push(entry.scoring.affectsRankedRating
    ? "Counts toward your Ranked rating." : "Never changes your Ranked rating.");
  return {
    rulesId: entry.rulesId,
    title: `${entry.title} Rules`,
    sections: [
      { heading: "How to play", body: entry.summary },
      ...extra,
      { heading: "Scoring", body: entry.scoring.summary ?? SCORING_NOT_PUBLISHED },
      { heading: "Your standing", body: effects.join(" ") },
    ],
  };
}
