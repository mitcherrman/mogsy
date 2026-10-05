/**
 * The loader's state model (pure). The hook feeds it what the query cache says;
 * it decides which of the states in `types.ts` that is. Operational success and
 * Catch-Up coverage stay separate: a report that loaded with a failed patch is
 * `ready_incomplete`, never `failed`.
 */
import type { CatchUpAssembly } from "./assemble";
import type { CatchUpPlan } from "./plan";
import type { CatchUpLoadFailure, CatchUpLoaderState } from "./types";

export type IndexSnapshot = {
  /** The raw payload, once something loaded. */
  data: unknown;
  /** In error state with no data. */
  failed: boolean;
  errorMessage: string | null;
};

export type StateInput = {
  enabled: boolean;
  /** A baseline was given. */
  hasSince: boolean;
  index: IndexSnapshot;
  /** Null until the index has loaded (or when disabled/idle). */
  plan: CatchUpPlan | null;
  /** Null unless the plan is ok and reports were assembled. */
  assembly: CatchUpAssembly | null;
};

export function indexFailure(index: IndexSnapshot): CatchUpLoadFailure {
  return {
    code: "index_failed",
    detail: null,
    versions: [],
    message: index.errorMessage ?? "The patch list could not be loaded.",
  };
}

export function deriveCatchUpLoaderState({
  enabled,
  hasSince,
  index,
  plan,
  assembly,
}: StateInput): CatchUpLoaderState {
  if (!enabled) return { status: "disabled" };
  if (!hasSince) return { status: "idle" };
  if (index.data === undefined) {
    return index.failed ? { status: "failed", failure: indexFailure(index) } : { status: "loading_index" };
  }
  if (!plan) return { status: "loading_index" };
  if (plan.ok === false) return { status: "failed", failure: plan.failure };
  if (!assembly) return { status: "loading_reports", pending: plan.versions, settled: 0, total: plan.versions.length };
  if (assembly.failure) return { status: "failed", failure: assembly.failure };
  if (assembly.pending.length > 0) {
    const total = assembly.resources.length;
    return {
      status: "loading_reports",
      pending: assembly.pending,
      settled: total - assembly.pending.length,
      total,
    };
  }
  const { report } = assembly;
  if (!report) {
    // Unreachable: no pending and no failure always yields a report.
    return { status: "failed", failure: { code: "domain_error", detail: null, versions: [], message: "No report was produced." } };
  }
  return assembly.issues.length === 0 && report.coverage.complete
    ? { status: "ready_complete" }
    : { status: "ready_incomplete" };
}
