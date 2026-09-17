/**
 * RQ1 — question roles on POST-MATCH review, from frozen review data only.
 *
 * Shared by the results screen's module timeline and the workspace review
 * card, so both surfaces agree on what a reviewed round may show. Nothing here
 * consults the current champion-role authority: a historical match shows the
 * roles frozen when its round was created.
 */
import type { ReviewRound } from "./contracts";
import type { RankedRole } from "./roles";

/**
 * RQ1 — the roles ONE reviewed round's module row may honestly show, from the
 * FROZEN review data only (never the current champion-role authority).
 *
 * * A quiz round is one question: its frozen `topic.roles`.
 * * A Mastery Slice is several challenges. The module row shows a role set
 *   only when EVERY challenge froze the same set; if they differ, the row
 *   shows none rather than an arbitrary pick or a misleading union, and the
 *   per-challenge rows carry the exact sets. With no challenge detail at all,
 *   the segment's frozen union (`topic.roles`) is the best available fact.
 * * Meta Reflex freezes no roles, so its topic has none.
 */
export function reviewRoundRoles(round: ReviewRound): RankedRole[] | undefined {
  if (round.kind === "mastery_slice" && round.masteryChallenges?.length) {
    const sets = round.masteryChallenges.map((c) => (c.roles ?? []).join("|"));
    const shared = sets.every((s) => s === sets[0]) ? round.masteryChallenges[0].roles : undefined;
    return shared?.length ? [...shared] : undefined;
  }
  const roles = round.topic?.roles;
  return roles?.length ? [...roles] : undefined;
}

/** True when a Mastery Slice's challenges froze DIFFERENT role sets. */
export function masteryChallengeRolesDiffer(round: ReviewRound): boolean {
  const cs = round.masteryChallenges ?? [];
  const sets = new Set(cs.map((c) => (c.roles ?? []).join("|")));
  return sets.size > 1;
}

