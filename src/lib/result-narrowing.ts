/**
 * Narrowing helpers for result unions discriminated by a **boolean** field.
 *
 * The app compiles with `strictNullChecks` off (see `tsconfig.app.json`).
 * Under that setting TypeScript refuses to narrow a union by a boolean
 * discriminant, so the idiomatic guard
 *
 * ```ts
 * if (!result.ok) result.errors; // TS2339: 'errors' does not exist on '{ ok: true; … }'
 * ```
 *
 * does not work, even though the union is a perfectly well-formed
 * `{ ok: true; … } | { ok: false; … }`. (A *string* discriminant narrows fine
 * either way — this is specific to `true`/`false`.)
 *
 * These predicates encode the same invariant in a form the checker does
 * follow: user-defined type predicates narrow by assignability, which is
 * unaffected by `strictNullChecks`. They are not casts — the compiler still
 * verifies every property access against the branch it selected, in both
 * directions (`isFailure(r)` and `!isFailure(r)`).
 */

/** A union member's failure branch, i.e. the one carrying `ok: false`. */
type FailureBranch<T extends { ok: boolean }> = Extract<T, { ok: false }>;

/** Narrow an `{ ok: true; … } | { ok: false; … }` result to its failure branch. */
export const isFailure = <T extends { ok: boolean }>(result: T): result is FailureBranch<T> =>
  !result.ok;

/** A union member's inapplicable branch, i.e. the one carrying `applicable: false`. */
type InapplicableBranch<T extends { applicable: boolean }> = Extract<T, { applicable: false }>;

/**
 * Narrow an `{ applicable: true } & T | { applicable: false; reason }` section
 * to its inapplicable branch, where `reason` lives.
 */
export const isInapplicable = <T extends { applicable: boolean }>(
  section: T,
): section is InapplicableBranch<T> => !section.applicable;
