/**
 * Public surface of the Mastery Set frontend transport contracts (G5.2A).
 *
 * This package only validates and preserves backend-authoritative values. It
 * contains no game formulas, no correctness logic, no ID generation, and no
 * network/Supabase access. See the accompanying tests for the guarantees.
 */

export * from "./common";
export * from "./ids";
export * from "./hiddenInfoGuard";
export * from "./stateView";
export * from "./transitionView";
export * from "./playerQuestion";
export * from "./playerReveal";
export * from "./session";
export * from "./review";
export * from "./envelopes";
export * from "./parsers";
