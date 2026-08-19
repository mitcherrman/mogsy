/**
 * Canonical League role identity for Ranked (R1) — the ONE frontend definition.
 *
 * The five values, their labels, and the type all live here so the vocabulary
 * cannot drift between the picker, the queue copy, the arena, and history.
 * Mirrors `ranked_public/roles.py` on the backend exactly, including the wire
 * spelling (lowercase, `adc` not `bot`).
 *
 * What a role IS
 * ──────────────
 * A League specialization — Top, Jungle, Mid, ADC, Support. It is ACCOUNT
 * identity, orthogonal to competitive rank and orthogonal to the legacy
 * Tank/Mage/Marksman combat class.
 *
 * What a role is NOT
 * ──────────────────
 * It is NOT a combat class and is NOT derived from one. There is deliberately
 * no mapping in this module — or anywhere else in the client — between a role
 * and a class, in either direction. The queue still sends no class at all
 * (the backend applies its own compatibility default); a reader looking for
 * "which class does Jungle map to" must find nothing, because there is
 * nothing.
 *
 * Role also has NO effect on which questions are served. That is QUIZ1's, and
 * nothing here reaches it.
 */

export type RankedRole = "top" | "jungle" | "mid" | "adc" | "support";

/** Ordered for display: the five roles in lane order, top to support. */
export const RANKED_ROLES: readonly RankedRole[] = [
  "top", "jungle", "mid", "adc", "support",
] as const;

/**
 * Player-facing text. ALWAYS rendered — a role is never communicated by
 * colour, icon, mascot or silhouette alone (accessibility contract). These
 * are real League roles and are never renamed to fantasy classes.
 */
export const RANKED_ROLE_LABELS: Record<RankedRole, string> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  adc: "ADC",
  support: "Support",
};

/** One short line per role for the picker. Identity only — no gameplay claim,
 * because in R1 the role changes nothing about how a match plays. */
export const RANKED_ROLE_BLURBS: Record<RankedRole, string> = {
  top: "The solo lane.",
  jungle: "The map roamer.",
  mid: "The centre lane.",
  adc: "The bot-lane carry.",
  support: "The bot-lane partner.",
};

export function isRankedRole(value: unknown): value is RankedRole {
  return typeof value === "string" && (RANKED_ROLES as readonly string[]).includes(value);
}

/**
 * Label for a value off the wire. Returns null for null/absent (an account
 * that has never chosen, or a match that predates roles) and for anything
 * unrecognised — a role this client does not know is shown as no role, never
 * guessed and never back-filled from a class.
 */
export function rankedRoleLabel(value: unknown): string | null {
  return isRankedRole(value) ? RANKED_ROLE_LABELS[value] : null;
}
