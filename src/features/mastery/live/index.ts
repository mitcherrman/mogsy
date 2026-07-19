/**
 * Live Mastery wiring (H1 / G7) — API client + live containers.
 *
 * Live mode talks to the backend Mastery API and never imports a fixture. The
 * fixture-driven prototype/harness remain under ../player and ../reviewer for
 * tests and local inspection.
 */
export * from "./api";
export { MasteryPlayerLive } from "./MasteryPlayerLive";
export { MasteryReviewerLive } from "./MasteryReviewerLive";
