/**
 * Display-layer grouping for the Combat Lab's champion action tiles.
 *
 * A champion's runtime actions arrive from `/api/meta/combat-lab-actions` as a
 * flat list. For a champion like Aatrox that list is six near-identical tiles
 * (Q1/Q2/Q3 and each one's sweetspot) all wearing the same parent Q artwork,
 * which is genuinely hard to scan. This module arranges that flat list into
 * stages without touching it: every action keeps its own button, its own id and
 * its own click payload. Nothing here merges two actions, and nothing here
 * changes what is sent to the backend — it only decides which tiles sit on the
 * same row and which caption each one gets.
 *
 * Grouping is evidence-based. Two actions share a stage only when their *labels*
 * carry the same leading slot token (`Q1 - The Darkin Blade` / `Q1 Sweetspot`,
 * or `QQ …` / `QW …` / `QE …` which share the Q subject). A curated icon hint or
 * a coincidental shared id prefix is not enough: actions whose labels carry no
 * token (`Hijack Target`, `Basic Zap`, `Rend`) stay independent, exactly as they
 * render today. That deliberately errs toward under-grouping — an ungrouped
 * action is merely unhelpful, while a wrong group asserts a relationship the
 * runtime does not have.
 */
import { abilityVariantToken, inferActionAbilitySlot } from "@/lib/combat-lab/abilityIcons";
import type { CastableAbilitySlot } from "@/data/championAbilityIcons";

export type GroupableAction = {
  id: string;
  label?: string | null;
  name?: string | null;
};

export type ActionGroupMember<T extends GroupableAction> = {
  action: T;
  /** The action's own label, unchanged — titles and accessible names use this. */
  label: string;
  /** Key badge for the tile (`Q1`, `QQ`, `R`), or null when the label has none. */
  keyLabel: string | null;
  /** Short chip that tells this member apart from its siblings. */
  variantLabel: string;
  /** True for the group's plain, unmodified cast. */
  isBase: boolean;
};

export type ActionGroup<T extends GroupableAction> = {
  /** Stable React key. */
  key: string;
  /** Stage token rendered as the row header (`Q1`, `Q`); null when ungrouped. */
  token: string | null;
  /** Name every member shares, hoisted out of the tiles into the row header. */
  abilityName: string | null;
  /** Parent slot used for artwork and accent tone. */
  slot: CastableAbilitySlot | null;
  members: ActionGroupMember<T>[];
  /** True only for a real multi-member stage; singletons render standalone. */
  grouped: boolean;
};

/**
 * Stage a variant token belongs to.
 *
 *   `Q1` / `Q2` / `Q3` → their own stage (the digit *is* the stage)
 *   `QQ` / `QW` / `QE` → stage `Q` (the second key selects a sub-action)
 *   `Q`                → stage `Q`
 *
 * Anything else returns null, which keeps the action ungrouped.
 */
export function actionStageKey(token: string | null | undefined): string | null {
  if (!token) return null;
  if (/^[QWER]\d+$/.test(token)) return token;
  if (/^[QWER]{2,}$/.test(token)) return token[0];
  if (/^[QWER]$/.test(token)) return token;
  return null;
}

/** `"Q1 - The Darkin Blade"` → `"The Darkin Blade"`; `"Q1"` → `""`. */
function labelRemainder(label: string, token: string | null): string {
  if (!token) return label.trim();
  return label.slice(token.length).replace(/^\s*[-–—·:]\s*/, "").trim();
}

/** `"sweetspot"` → `"Sweetspot"`, `"empowered_cast"` → `"Empowered Cast"`. */
function humanizeIdSuffix(suffix: string): string {
  return suffix
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Index of the stage's base cast: the one member whose id is an underscore-
 * boundary prefix of every other member's id (`aatrox_q1` under
 * `aatrox_q1_sweetspot`). Returns -1 when no single member qualifies, which is
 * the normal case for sibling sub-actions like Hwei's `hwei_qq` / `hwei_qw`.
 */
function findBaseIndex(ids: string[]): number {
  let found = -1;
  for (let i = 0; i < ids.length; i++) {
    const stem = ids[i];
    const isBase = ids.every((other, j) => j === i || other.startsWith(`${stem}_`));
    if (!isBase) continue;
    if (found !== -1) return -1; // ambiguous — refuse to guess
    found = i;
  }
  return found;
}

/**
 * Arrange a champion's runtime actions into stages, preserving input order.
 *
 * Groups of one are returned with `grouped: false` so the caller can render them
 * exactly as it renders an ungroupable action — that is the fallback path, and
 * it is the path every champion without token-bearing labels takes.
 */
export function groupChampionActions<T extends GroupableAction>(
  actions: T[],
): ActionGroup<T>[] {
  type Bucket = { stage: string | null; items: { action: T; label: string; token: string | null }[] };
  const buckets: Bucket[] = [];
  const byStage = new Map<string, Bucket>();

  for (const action of actions) {
    const label = String(action.label || action.name || action.id);
    const token = abilityVariantToken(label);
    const stage = actionStageKey(token);
    if (stage) {
      let bucket = byStage.get(stage);
      if (!bucket) {
        bucket = { stage, items: [] };
        byStage.set(stage, bucket);
        buckets.push(bucket);
      }
      bucket.items.push({ action, label, token });
    } else {
      // No structural evidence of a stage — its own bucket, rendered standalone.
      buckets.push({ stage: null, items: [{ action, label, token }] });
    }
  }

  return buckets.map((bucket) => {
    const grouped = bucket.stage != null && bucket.items.length > 1;
    const slot =
      bucket.items
        .map((it) => inferActionAbilitySlot(it.action.id, it.label))
        .find((s): s is CastableAbilitySlot => !!s) ?? null;

    if (!grouped) {
      const only = bucket.items[0];
      return {
        key: only.action.id,
        token: null,
        abilityName: null,
        slot,
        grouped: false,
        members: [
          {
            action: only.action,
            label: only.label,
            keyLabel: only.token || slot || null,
            // Ungrouped tiles keep today's caption: the label minus its token.
            variantLabel: labelRemainder(only.label, only.token) || only.label,
            isBase: true,
          },
        ],
      };
    }

    const ids = bucket.items.map((it) => it.action.id);
    const baseIndex = findBaseIndex(ids);
    const baseStem = baseIndex >= 0 ? ids[baseIndex] : null;
    const abilityName =
      baseIndex >= 0
        ? labelRemainder(bucket.items[baseIndex].label, bucket.items[baseIndex].token) || null
        : null;

    const members: ActionGroupMember<T>[] = bucket.items.map((it, i) => {
      const isBase = i === baseIndex;
      const remainder = labelRemainder(it.label, it.token);
      let variantLabel: string;
      if (isBase) {
        variantLabel = "Normal";
      } else if (remainder && remainder !== abilityName) {
        variantLabel = remainder;
      } else if (baseStem && it.action.id.startsWith(`${baseStem}_`)) {
        variantLabel = humanizeIdSuffix(it.action.id.slice(baseStem.length + 1));
      } else {
        variantLabel = remainder || it.label;
      }
      return {
        action: it.action,
        label: it.label,
        keyLabel: it.token,
        variantLabel,
        isBase,
      };
    });

    return {
      key: `stage:${bucket.stage}`,
      token: bucket.stage,
      abilityName,
      slot,
      grouped: true,
      members,
    };
  });
}
