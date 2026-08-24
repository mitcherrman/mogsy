/**
 * COMPATIBILITY RE-EXPORT (ARENA1 Step 5).
 *
 * The Ranked round timeline's presentation model moved to
 * `@/lib/ranked-core/roundTimeline`. It is mode-neutral — the Tutorial already
 * projected a timeline through it and the Daily now does too — and a module
 * three modes depend on does not belong in one mode's page directory.
 *
 * Nothing about the derivation changed in the move. This file exists so every
 * historical `from "./roundTimeline"` / `from "@/pages/quiz-ranked/roundTimeline"`
 * import still resolves; NEW code imports from `lib/ranked-core` directly, and
 * `sharedLayer.boundary.test` forbids a mode outside this page from coming here.
 */
export * from "@/lib/ranked-core/roundTimeline";
