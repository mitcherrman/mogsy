/**
 * COMPATIBILITY RE-EXPORT (MISC-W2C / F04).
 *
 * The post-match discoveries loader moved to
 * `@/lib/ranked-core/flow/useMatchDiscoveries`. It is mode-neutral — Ranked's
 * terminal frame and the Daily's result screens both read the same
 * participant-gated, terminal-only endpoint — and the Daily may not import from
 * Ranked's page directory (`DailyOnCanonicalArena.boundary.test`).
 *
 * Nothing about the loader's contract changed in the move. This file keeps
 * the historical `./useMatchDiscoveries` import in `QuizRankedMatch` resolving;
 * NEW code imports from `lib/ranked-core` directly.
 */
export * from "@/lib/ranked-core/flow/useMatchDiscoveries";
