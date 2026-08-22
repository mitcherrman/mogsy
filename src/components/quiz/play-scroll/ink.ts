/**
 * PLAY1 — the ink the match-entry scroll writes in.
 *
 * The same palette the lobby's parchment columns use. It USED to be a
 * hand-copied second set of hexes; MALT moved the values to
 * `@/components/quiz/leaguecraft-ink`, which is now the one place a parchment
 * tone is stated. This alias stays so the scroll's own files keep reading in
 * the vocabulary they were written in.
 *
 * Do not lighten a value: every one is derived against the parchment at its
 * darkest point under text — rgb(209,187,158) — which caps ink luminance at
 * 0.0747 for 4.5:1. See the derivation note in the shared module.
 */
export { LEAGUECRAFT_INK as PLAY_INK } from "@/components/quiz/leaguecraft-ink";
