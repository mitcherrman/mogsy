/**
 * Reviewed parameter-rename rows (PH3-A §8). Riot renames properties far more
 * often than it repeats them (5 of the 8 continuity-holding SR pairs in
 * 26.10–26.19), so a few renames are linked by hand — and ONLY by hand.
 *
 * Each row is a verified LINK, not a synonym. It pins scope, entity, slot, group
 * title, both patches and the verbatim Riot raw strings of both lines. The
 * matcher re-checks every exact-key gate at runtime on top of that, so a row
 * whose strings drift (re-promotion, backend fix) or whose lines stop being
 * unique simply stops linking.
 *
 * Only the owner extends this list. Evidence standard for a new row (PH3-A §8.3):
 * same entity/scope/slot/group title; a rename not a coexistence; exactly one
 * line per key in its patch; exact canonical continuity; no occurrence of either
 * key in a report strictly between; AND a second authority (a Riot context
 * sentence, League Wiki ability history, or game data) — value continuity alone
 * never qualifies.
 *
 * Deliberately NOT here (PH3-A: plausible but unsafe, needs external authority):
 * Bel'Veth R, Poppy Q ×2, Qiyana Q, Xin Zhao P, Locke Q/W, LeBlanc R, Naafiri R,
 * Senna P, Quinn P/Q, Imperial Mandate (cross-section), Arena Redemption,
 * Arena Now You See Me.
 */
import type { VerifiedAlias } from "./types";

const APPROVAL =
  "Auditor-verified in PH3-A (3f3eec28); approved by the owner for V1 in the PH3-B implementation brief, 2026-10-04.";

export const VERIFIED_ALIASES: readonly VerifiedAlias[] = [
  {
    id: "sylas-q-26.12-26.15",
    scope: "sr.champions",
    entity: "Sylas",
    slot: "Q",
    group: "Q - Chain Lash",
    from: {
      patch: "26.12",
      property: "Initial Damage",
      before: "40 / 60 / 80 / 100 / 120 (+40% AP)",
      after: "40 / 65 / 90 / 115 / 140 (+45% AP)",
    },
    to: {
      patch: "26.15",
      property: "First Lash Damage",
      before: "40 / 65 / 90 / 115 / 140 (+45% Ability Power)",
      after: "40 / 60 / 80 / 100 / 120 (+40% Ability Power)",
    },
    evidence: [
      "Same entity, scope, slot and group title.",
      'A rename, not a coexistence: "Initial Damage" is absent from 26.15 and "First Lash Damage" is absent from 26.12.',
      "Exactly one Q line in each card.",
      "Continuity covers 6 numbers (5 ranks plus the ratio) under the closed `AP ≡ Ability Power` token rule.",
      'Second authority: Riot\'s 26.15 context reads "After his buff in 26.12 … pulling back the chains a tad", and the 26.12 card\'s only Q line is this one.',
    ],
    verifiedBy: "PH3-A continuity audit",
    verifiedOn: "2026-10-04",
    approval: APPROVAL,
  },
  {
    id: "mordekaiser-r-26.14-26.15",
    scope: "sr.champions",
    entity: "Mordekaiser",
    slot: "R",
    group: "R - Realm of Death",
    from: {
      patch: "26.14",
      property: "Stat Steal",
      before: "10%",
      after: "13%",
    },
    to: {
      patch: "26.15",
      property: "Stolen Stats",
      before: "13%",
      after: "10%",
    },
    evidence: [
      "Same entity, scope, slot and group title.",
      "A rename, not a coexistence.",
      'One R line in each card (the 26.15 R "Bugfix" line is mechanical).',
      "Continuity 13%.",
      'Second authority: Riot\'s 26.15 context says Riot "decided to instead revert the R buff entirely", and the entire 26.14 R buff is this one line.',
    ],
    verifiedBy: "PH3-A continuity audit",
    verifiedOn: "2026-10-04",
    approval: APPROVAL,
  },
];
