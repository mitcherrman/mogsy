/**
 * LAYER 2 — proven parameter chains (PH3-A §9, §11, §13). An optional overlay
 * on the Riot lines; it never removes or alters one.
 *
 * Identity first, values second. Two lines are one parameter only when they
 * share the exact structural key (scope + entity + slot AND group + property,
 * cosmetic folds only), or are the two lines of a reviewed alias row. Value
 * continuity (`later.before == earlier.after`) is a GATE on a link; it never
 * establishes identity. `mogzy_property` and `mogzy_entity_ref` may veto a link
 * and never create one.
 *
 * Fail-closed at identity level: if an identity has two or more in-range
 * occurrences and ANY occurrence is ambiguous, ineligible or breaks an adjacent
 * link, the identity gets NO chain at all in the range. Fragments are never
 * presented as "net since X".
 */
import { normalizeAbilitySlot } from "@/lib/patch-reports/report-structure";
import { classifyChainValues } from "./classify";
import { continuityKeyString, groupKeyString } from "./keys";
import { comparePatchVersions } from "./patch-range";
import type {
  AliasResolution,
  CatchUpParameterChain,
  CatchUpRiotLine,
  CatchUpStep,
  ChainLinkBasis,
  ContinuityRefusal,
  ContinuityRefusalReason,
  ContinuityScope,
  PatchContinuityKey,
  UnclassifiedIdentity,
  VerifiedAlias,
} from "./types";
import { canonicalLabel, canonicalValue, valueFact } from "./value";

export type LinkInput = {
  /** Every Riot line in the range (chronological). */
  lines: readonly CatchUpRiotLine[];
  /** Loaded patches in the range, oldest first. */
  includedPatches: readonly string[];
  /** `[i]`: `includedPatches[i]` → `[i+1]` is provably consecutive. */
  adjacencyVerified: readonly boolean[];
  aliases: readonly VerifiedAlias[];
};

export type LinkOutcome = {
  chains: CatchUpParameterChain[];
  unclassified: UnclassifiedIdentity[];
  refusals: ContinuityRefusal[];
  aliases: AliasResolution[];
};

type KeyedLine = CatchUpRiotLine & { key: PatchContinuityKey };

const hasKey = (line: CatchUpRiotLine): line is KeyedLine => line.key !== null;

/** Whether every consecutive pair of included patches from `a` to `b` is verified. */
function contiguousBetween(
  adjacencyVerified: readonly boolean[],
  aOrdinal: number,
  bOrdinal: number,
): boolean {
  for (let i = aOrdinal; i < bOrdinal; i++) if (adjacencyVerified[i] !== true) return false;
  return true;
}

/** Pair-level veto gates shared by exact links and alias rows (rules 8–10). */
function vetoOf(earlier: CatchUpRiotLine, later: CatchUpRiotLine): ContinuityRefusalReason | null {
  const refA = earlier.card.mogzy_entity_ref;
  const refB = later.card.mogzy_entity_ref;
  if (refA && refB && refA !== refB) return "entity_ref_conflict";
  const propA = earlier.change.mogzy_property;
  const propB = later.change.mogzy_property;
  if (propA && propB && propA !== propB) return "mogzy_property_conflict";
  if (canonicalValue(later.change.before_raw) !== canonicalValue(earlier.change.after_raw)) {
    return "before_mismatch";
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Alias rows                                                                 */
/* -------------------------------------------------------------------------- */

type ResolvedAlias = {
  alias: VerifiedAlias;
  fromKey: string;
  toKey: string;
  resolution: AliasResolution;
  /** Set when the row linked exactly one pair of lines. */
  pair: { from: KeyedLine; to: KeyedLine } | null;
  refusalLines: string[];
};

function keyOfAlias(alias: VerifiedAlias, property: string): string {
  return continuityKeyString({
    scope: alias.scope,
    entity: canonicalLabel(alias.entity),
    slot: normalizeAbilitySlot(alias.slot),
    group: canonicalLabel(alias.group),
    property: canonicalLabel(property),
  });
}

function resolveAlias(
  alias: VerifiedAlias,
  input: LinkInput,
  keyed: readonly KeyedLine[],
): ResolvedAlias {
  const fromKey = keyOfAlias(alias, alias.from.property);
  const toKey = keyOfAlias(alias, alias.to.property);
  const ordinalOf = (patch: string) =>
    input.includedPatches.findIndex((p) => comparePatchVersions(p, patch) === 0);
  const fromOrdinal = ordinalOf(alias.from.patch);
  const toOrdinal = ordinalOf(alias.to.patch);

  const base = { alias, fromKey, toKey, pair: null, refusalLines: [] as string[] };
  if (fromOrdinal === -1 || toOrdinal === -1) {
    return { ...base, resolution: { aliasId: alias.id, status: "inactive_out_of_range" } };
  }
  const refuse = (reason: ContinuityRefusalReason, lineIds: string[] = []): ResolvedAlias => ({
    ...base,
    refusalLines: lineIds,
    resolution: { aliasId: alias.id, status: "refused", reason },
  });

  const fromLines = keyed.filter(
    (l) => l.patchOrdinal === fromOrdinal && continuityKeyString(l.key) === fromKey,
  );
  const toLines = keyed.filter(
    (l) => l.patchOrdinal === toOrdinal && continuityKeyString(l.key) === toKey,
  );
  const ids = [...fromLines, ...toLines].map((l) => l.id);

  // Exactly one line pair, matching every pinned raw string verbatim.
  if (fromLines.length !== 1 || toLines.length !== 1) return refuse("alias_row_unresolved", ids);
  const [from] = fromLines;
  const [to] = toLines;
  if (
    from.change.before_raw !== alias.from.before ||
    from.change.after_raw !== alias.from.after ||
    to.change.before_raw !== alias.to.before ||
    to.change.after_raw !== alias.to.after
  ) {
    return refuse("alias_row_unresolved", ids);
  }
  // Both lines must individually be chain candidates (numeric, eligible, not a no-op).
  for (const line of [from, to]) {
    if (line.eligibility.status === "refused") return refuse(line.eligibility.reason, ids);
  }
  // A rename, not a coexistence; and no occurrence of either key strictly between.
  for (const line of keyed) {
    const text = continuityKeyString(line.key);
    if (text !== fromKey && text !== toKey) continue;
    if (line.patchOrdinal === toOrdinal && text === fromKey) return refuse("alias_evidence_failed", ids);
    if (line.patchOrdinal === fromOrdinal && text === toKey) return refuse("alias_evidence_failed", ids);
    if (line.patchOrdinal > fromOrdinal && line.patchOrdinal < toOrdinal) {
      return refuse("alias_evidence_failed", ids);
    }
  }
  if (!contiguousBetween(input.adjacencyVerified, fromOrdinal, toOrdinal)) {
    return refuse("contiguity_unverifiable", ids);
  }
  const veto = vetoOf(from, to);
  if (veto) return refuse(veto, ids);

  return { ...base, pair: { from, to }, resolution: { aliasId: alias.id, status: "linked" } };
}

/* -------------------------------------------------------------------------- */
/* Identity groups                                                            */
/* -------------------------------------------------------------------------- */

class UnionFind {
  private readonly parent = new Map<string, string>();
  find(x: string): string {
    let root = this.parent.get(x) ?? x;
    if (root !== x) {
      root = this.find(root);
      this.parent.set(x, root);
    }
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/* -------------------------------------------------------------------------- */
/* Linking                                                                    */
/* -------------------------------------------------------------------------- */

export function linkContinuity(input: LinkInput): LinkOutcome {
  const keyed = input.lines.filter(hasKey);
  const refusals: ContinuityRefusal[] = [];
  const unclassified: UnclassifiedIdentity[] = [];
  const chains: CatchUpParameterChain[] = [];

  /* 1. Alias rows. */
  const resolvedAliases = input.aliases.map((alias) => resolveAlias(alias, input, keyed));
  const aliasPairByFrom = new Map<string, { to: KeyedLine; aliasId: string }>();
  const aliasReasonByLine = new Map<string, { reason: ContinuityRefusalReason; aliasId: string }>();
  const groups = new UnionFind();
  for (const resolved of resolvedAliases) {
    const { status, reason } = resolved.resolution;
    if (status === "inactive_out_of_range") continue;
    groups.union(resolved.fromKey, resolved.toKey);
    if (status === "linked" && resolved.pair) {
      aliasPairByFrom.set(resolved.pair.from.id, {
        to: resolved.pair.to,
        aliasId: resolved.alias.id,
      });
    } else if (reason) {
      refusals.push({ reason, lineIds: resolved.refusalLines, aliasId: resolved.alias.id });
      for (const id of resolved.refusalLines) {
        aliasReasonByLine.set(id, { reason, aliasId: resolved.alias.id });
      }
    }
  }

  /* 2. Identity groups: exact keys, merged only across active alias rows. */
  const byRoot = new Map<string, KeyedLine[]>();
  for (const line of keyed) {
    const root = groups.find(continuityKeyString(line.key));
    const bucket = byRoot.get(root);
    if (bucket) bucket.push(line);
    else byRoot.set(root, [line]);
  }

  /* Mechanical lines per (patch, entity, slot, group), for `concurrentMechanical`. */
  const mechanical = new Set<string>();
  for (const line of keyed) {
    if (line.change.change_kind === "mechanical") {
      mechanical.add(`${line.patchOrdinal}|${groupKeyString(line.key)}`);
    }
  }

  for (const occurrences of byRoot.values()) {
    if (occurrences.length < 2) continue;
    const sorted = [...occurrences].sort((a, b) => a.order - b.order);
    const identity = continuityKeyString(sorted[0].key);
    const lineIds = sorted.map((l) => l.id);
    const fail = (reason: ContinuityRefusalReason, involved: string[] = lineIds) => {
      unclassified.push({ identity, entityKey: sorted[0].entityKey, reason, lineIds });
      refusals.push({ reason, lineIds: involved });
      for (const line of sorted) line.identityRefusal = reason;
    };

    // Any occurrence that is not a clean candidate poisons the identity.
    const poisoned = sorted.find((l) => l.eligibility.status !== "candidate");
    if (poisoned && poisoned.eligibility.status === "refused") {
      fail(poisoned.eligibility.reason, [poisoned.id]);
      continue;
    }

    // Adjacent pairs.
    const linkBasis: ChainLinkBasis[] = [];
    let failure: { reason: ContinuityRefusalReason; involved: string[] } | null = null;
    for (let i = 0; i + 1 < sorted.length && !failure; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const pair = [a.id, b.id];
      if (a.patchOrdinal === b.patchOrdinal) {
        failure = { reason: "key_ambiguous_in_patch", involved: pair };
      } else if (continuityKeyString(a.key) === continuityKeyString(b.key)) {
        if (!contiguousBetween(input.adjacencyVerified, a.patchOrdinal, b.patchOrdinal)) {
          failure = { reason: "contiguity_unverifiable", involved: pair };
        } else {
          const veto = vetoOf(a, b);
          if (veto) failure = { reason: veto, involved: pair };
          else linkBasis.push({ kind: "exact_key" });
        }
      } else {
        const alias = aliasPairByFrom.get(a.id);
        if (alias && alias.to.id === b.id) {
          linkBasis.push({ kind: "approved_alias", aliasId: alias.aliasId });
        } else {
          const refused = aliasReasonByLine.get(a.id) ?? aliasReasonByLine.get(b.id);
          failure = { reason: refused?.reason ?? "alias_evidence_failed", involved: pair };
        }
      }
    }
    if (failure) {
      fail(failure.reason, failure.involved);
      continue;
    }

    /* A proven chain. */
    const steps: CatchUpStep[] = sorted.map((line, i) => {
      const before = valueFact(line.change.before_raw);
      const after = valueFact(line.change.after_raw);
      // Unreachable: every occurrence passed `candidate`, which requires both values eligible.
      if (!before || !after) throw new Error(`catch-up: line ${line.id} lost value eligibility`);
      return {
        patch: line.patch,
        line,
        change: line.change,
        target: line.target,
        key: line.key,
        before,
        after,
        linkFromPrevious: i === 0 ? null : linkBasis[i - 1],
      };
    });

    const values = [steps[0].before, ...steps.map((s) => s.after)];
    const classification = classifyChainValues(values);
    const first = steps[0];
    const last = steps[steps.length - 1];
    const keys: PatchContinuityKey[] = [];
    for (const step of steps) {
      if (!keys.some((k) => continuityKeyString(k) === continuityKeyString(step.key))) {
        keys.push(step.key);
      }
    }
    const chain: CatchUpParameterChain = {
      id: `chain:${identity}`,
      identity,
      scope: first.key.scope as ContinuityScope,
      entityKey: first.line.entityKey,
      entityName: first.line.entityName,
      keys,
      identityProvenance: linkBasis.some((b) => b.kind === "approved_alias") ? "approved_alias" : "exact",
      linkBasis,
      steps,
      valueState: classification.valueState,
      netUnavailableReason: classification.netUnavailableReason,
      net: {
        startPatch: first.patch,
        endPatch: last.patch,
        startRaw: first.before.raw,
        endRaw: last.after.raw,
        components: classification.components,
      },
      concurrentMechanical: steps.some((step) =>
        mechanical.has(`${step.line.patchOrdinal}|${groupKeyString(step.key)}`),
      ),
    };
    for (const step of steps) step.line.chainId = chain.id;
    chains.push(chain);
  }

  chains.sort((a, b) => a.steps[0].line.order - b.steps[0].line.order || (a.id < b.id ? -1 : 1));
  unclassified.sort((a, b) => (a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0));
  return {
    chains,
    unclassified,
    refusals,
    aliases: resolvedAliases.map((r) => r.resolution),
  };
}
