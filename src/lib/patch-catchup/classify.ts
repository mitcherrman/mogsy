/**
 * Value-state classification of a proven chain (PH3-A §11), as plain
 * mathematics over exact decimals. It states what the VALUES did; it never
 * claims intent ("reverted", "undone") and never a direction (buff/nerf).
 *
 * Notation. A chain of `n ≥ 2` steps has values `v0 … vn`: `v0` is the value
 * before the first step (Riot's `before`), `vk` the value after step k, and
 * `vm = v(n−1)` the value just before the final step. All arithmetic is per
 * numeric component (a rank array has one component per rank).
 *
 * Precedence (first match wins):
 *  1. `returns_to_start_value` — `canonical(vn) === canonical(v0)`. Needs no
 *     comparability.
 *  2. `net_unavailable / incomparable_shape` — the templates of the values
 *     differ (rank count, `%`, ratio basis, level range, qualifiers…), so
 *     per-component arithmetic is not allowed. Endpoints stay verbatim.
 *  3. `multi_step_non_monotonic` — before the final step some component changed
 *     direction (`v0 … vm` is not monotone). Only the net endpoints are stated.
 *  4. Per moved component, with `d0 = vm − v0` and `dn = vn − v0`:
 *       continued: sign(dn) = sign(d0) and |dn| > |d0|
 *       partial:   sign(dn) = sign(d0) and |dn| < |d0|, dn ≠ 0
 *       over:      sign(dn) = −sign(d0), both ≠ 0
 *     Any other behaviour (a component that starts moving only in the last step,
 *     returns exactly while others do not, or does not move in the last step) is
 *     `net_unavailable / mixed_components`, as is any disagreement of classes.
 *       all continued → `changed`
 *       all partial   → `partially_returns_toward_start`
 *       all over      → `moves_beyond_start`
 *
 * PH3-A names: exact_undo = returns_to_start_value, continued = changed,
 * partial_undo = partially_returns_toward_start, over_revert = moves_beyond_start,
 * net_only = net_unavailable (+ the new multi_step_non_monotonic split).
 *
 * Percent components are percentage points, never relative percent.
 */
import type {
  ChainValueState,
  NetComponent,
  NetUnavailableReason,
  ValueFact,
} from "./types";
import {
  absDecimal,
  compareDecimals,
  decimalSign,
  formatDecimal,
  parseDecimal,
  subtractDecimals,
  type Decimal,
} from "./value";

export type ChainClassification = {
  valueState: ChainValueState;
  netUnavailableReason: NetUnavailableReason | null;
  /** Exact per-component start/end/delta, or null when no state could be derived. */
  components: NetComponent[] | null;
};

const unavailable = (reason: NetUnavailableReason): ChainClassification => ({
  valueState: "net_unavailable",
  netUnavailableReason: reason,
  components: null,
});

type ComponentClass = "continued" | "partial" | "over" | "ignored" | "mixed";

function classifyComponent(d0: Decimal, dn: Decimal): ComponentClass {
  const s0 = decimalSign(d0);
  const sn = decimalSign(dn);
  if (s0 === 0 && sn === 0) return "ignored";
  // Starts moving only in the last step, or returns exactly while others do not.
  if (s0 === 0 || sn === 0) return "mixed";
  if (s0 !== sn) return "over";
  const cmp = compareDecimals(absDecimal(dn), absDecimal(d0));
  if (cmp > 0) return "continued";
  if (cmp < 0) return "partial";
  return "mixed";
}

/**
 * Classify the value path `values = [v0, v1, …, vn]` (so `values.length ≥ 3`
 * for a chain of two or more steps).
 */
export function classifyChainValues(values: readonly ValueFact[]): ChainClassification {
  const first = values[0];
  const last = values[values.length - 1];

  const componentsOf = (): NetComponent[] =>
    first.numbers.map((start, i) => ({
      start,
      end: last.numbers[i],
      delta: formatDecimal(subtractDecimals(parseDecimal(last.numbers[i]), parseDecimal(start))),
    }));

  if (first.canonical === last.canonical) {
    return { valueState: "returns_to_start_value", netUnavailableReason: null, components: componentsOf() };
  }

  const count = first.numbers.length;
  const comparable =
    count > 0 &&
    values.every((v) => v.template === first.template && v.numbers.length === count);
  if (!comparable) return unavailable("incomparable_shape");

  const series = values.map((v) => v.numbers.map(parseDecimal));
  const vm = series[series.length - 2];
  const v0 = series[0];
  const vn = series[series.length - 1];

  // 3. Direction change anywhere before the final step.
  for (let i = 0; i < count; i++) {
    let up = false;
    let down = false;
    for (let j = 1; j <= series.length - 2; j++) {
      const sign = decimalSign(subtractDecimals(series[j][i], series[j - 1][i]));
      if (sign > 0) up = true;
      if (sign < 0) down = true;
    }
    if (up && down) {
      return { valueState: "multi_step_non_monotonic", netUnavailableReason: null, components: componentsOf() };
    }
  }

  // 4. Unanimous per-component class relative to the chain start.
  const classes = new Set<ComponentClass>();
  for (let i = 0; i < count; i++) {
    const cls = classifyComponent(subtractDecimals(vm[i], v0[i]), subtractDecimals(vn[i], v0[i]));
    if (cls !== "ignored") classes.add(cls);
  }
  if (classes.size !== 1 || classes.has("mixed")) return unavailable("mixed_components");

  const [only] = [...classes];
  const valueState: ChainValueState =
    only === "continued"
      ? "changed"
      : only === "partial"
        ? "partially_returns_toward_start"
        : "moves_beyond_start";
  return { valueState, netUnavailableReason: null, components: componentsOf() };
}
