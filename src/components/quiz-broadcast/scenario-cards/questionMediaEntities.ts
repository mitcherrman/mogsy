/**
 * Normalized question media entities (RA3-MEDIA-P4).
 *
 * `metadata.assets.subject` describes ONE card's worth of art — a champion, an
 * item row, an ability — because that is what the shipped
 * CombatCalculationScenarioCard draws. `metadata.assets.entities` is the wider
 * thing: every entity the question states as given, normalized and role-tagged,
 * emitted by `ranked_public.question_media`.
 *
 * This module is the single reader for that block. It exists so a future theme
 * can pick its own treatment — one splash, one icon, two champion icons, an
 * item strip, a mixed compact row — WITHOUT re-parsing raw metadata or
 * duplicating URL resolution. It resolves nothing itself: paths go through the
 * shipped `resolveQuizAssetUrl`, exactly as `classifySubject` and
 * `getCombatCooldownSubject` already do. No second asset source, no external
 * URL, no manifest lookup.
 *
 * Backward compatibility is the default: a payload with no `entities` key —
 * every payload frozen before this phase — returns `null`, and every existing
 * consumer reads `assets.subject` as before.
 *
 * RA5 adds `status` to item entities: what the premise says HAPPENED to the
 * thing (bought, sold, kept). It arrives on the same entities, from the same
 * declared premise fields, and is optional on every one of them — a payload
 * frozen before RA5 simply has none, and reads exactly as it did.
 */

import type { QuizQuestion } from "@/lib/quiz/api";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";

/**
 * Whose an entity is / where it stands in the premise. NOT a display
 * instruction — a renderer decides whether "target" means a second portrait, a
 * dimmed icon, or nothing at all.
 */
export type MediaEntityRole = "subject" | "attacker" | "target" | "context";

/**
 * What the premise says HAPPENED to an entity. Like `role`, a premise fact and
 * NOT a display instruction — a renderer decides whether "sold" means faded,
 * struck through, moved to a timeline, or dropped entirely.
 *
 * Only items carry one today; champions and abilities have no scenario field
 * stating a transaction. `undefined` means the premise stated none (or the
 * payload predates RA5), which is different from stating "current".
 */
export type MediaEntityStatus = "starting" | "current" | "retained" | "purchased" | "sold";

type BaseMediaEntity = {
  /** Canonical backend id (numeric for items, safe name for champions). */
  id?: string | number;
  name: string;
  role: MediaEntityRole;
  status?: MediaEntityStatus;
  /** Resolved absolute URL, or null when the backend verified no such file. */
  icon: string | null;
};

export type ChampionMediaEntity = BaseMediaEntity & {
  splash: string | null;
  loading: string | null;
  defaultSkin?: string | number;
};

export type ItemMediaEntity = BaseMediaEntity;

export type AbilityMediaEntity = BaseMediaEntity & {
  champion?: string;
  /** "Q" | "W" | "E" | "R" — canonical slot, never inferred from prompt text. */
  slot?: string;
};

/** Runes and summoner spells share the canonical id/name/icon shape. */
export type CollectibleMediaEntity = BaseMediaEntity;

export type QuestionMediaEntities = {
  champions: ChampionMediaEntity[];
  items: ItemMediaEntity[];
  abilities: AbilityMediaEntity[];
  runes: CollectibleMediaEntity[];
  summonerSpells: CollectibleMediaEntity[];
};

const ROLES: ReadonlySet<string> = new Set<MediaEntityRole>([
  "subject",
  "attacker",
  "target",
  "context",
]);

const STATUSES: ReadonlySet<string> = new Set<MediaEntityStatus>([
  "starting",
  "current",
  "retained",
  "purchased",
  "sold",
]);

function asRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function url(value: unknown): string | null {
  return resolveQuizAssetUrl(str(value)) ?? null;
}

/**
 * An entity without a name cannot be labeled, and an unlabeled icon in a
 * competitive question is worse than no icon — so it is dropped rather than
 * rendered anonymously. An unknown role degrades to "context" (present, but
 * claiming nothing about whose it is) instead of discarding the entity.
 *
 * An unrecognised status is DROPPED rather than degraded, because there is no
 * neutral status to degrade to: guessing "current" for a value this build does
 * not understand would assert a transaction the premise may not have stated.
 * Absent is the honest reading, and every treatment already handles it.
 */
function base(raw: Record<string, unknown>): BaseMediaEntity | null {
  const name = str(raw.name);
  if (!name) return null;
  const role = str(raw.role);
  const status = str(raw.status);
  return {
    ...(typeof raw.id === "string" || typeof raw.id === "number" ? { id: raw.id } : {}),
    name,
    role: role && ROLES.has(role) ? (role as MediaEntityRole) : "context",
    ...(status && STATUSES.has(status) ? { status: status as MediaEntityStatus } : {}),
    icon: url(raw.icon),
  };
}

function mapEntities<T>(value: unknown, build: (raw: Record<string, unknown>, b: BaseMediaEntity) => T): T[] {
  const out: T[] = [];
  for (const raw of asRecords(value)) {
    const b = base(raw);
    if (b) out.push(build(raw, b));
  }
  return out;
}

/**
 * Read the normalized entity collection off a question, or `null` when the
 * payload carries none (pre-RA3-MEDIA-P4 payloads, and any question whose media
 * the backend refused). Order is preserved exactly as transported: the backend
 * derives it from premise/role order, never from answer order.
 */
export function getQuestionMediaEntities(question: QuizQuestion): QuestionMediaEntities | null {
  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const assets = meta.assets as Record<string, unknown> | undefined;
  const raw = assets?.entities as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") return null;

  const entities: QuestionMediaEntities = {
    champions: mapEntities(raw.champions, (r, b) => ({
      ...b,
      splash: url(r.splash),
      loading: url(r.loading),
      ...(typeof r.default_skin === "string" || typeof r.default_skin === "number"
        ? { defaultSkin: r.default_skin }
        : {}),
    })),
    items: mapEntities(raw.items, (_r, b) => b),
    abilities: mapEntities(raw.abilities, (r, b) => ({
      ...b,
      ...(str(r.champion) ? { champion: str(r.champion)! } : {}),
      ...(str(r.slot) ? { slot: str(r.slot)! } : {}),
    })),
    runes: mapEntities(raw.runes, (_r, b) => b),
    summonerSpells: mapEntities(raw.summoner_spells, (_r, b) => b),
  };

  return Object.values(entities).some((list) => list.length > 0) ? entities : null;
}

/**
 * Every entity that has a usable icon, flattened in a stable presentation
 * order: champions, then the abilities they cast, then the items involved,
 * then runes and summoner spells. Convenience for compact icon strips; a
 * renderer wanting per-collection control reads the collections directly.
 */
export function flattenMediaEntityIcons(
  entities: QuestionMediaEntities | null | undefined,
): {
  key: string;
  kind: "champion" | "ability" | "item" | "rune" | "summoner_spell";
  name: string;
  role: MediaEntityRole;
  status?: MediaEntityStatus;
  icon: string;
}[] {
  if (!entities) return [];
  const groups = [
    ["champion", entities.champions],
    ["ability", entities.abilities],
    ["item", entities.items],
    ["rune", entities.runes],
    ["summoner_spell", entities.summonerSpells],
  ] as const;
  const out: ReturnType<typeof flattenMediaEntityIcons> = [];
  for (const [kind, list] of groups) {
    list.forEach((entity, index) => {
      if (!entity.icon) return;
      out.push({
        key: `${kind}-${entity.id ?? entity.name}-${index}`,
        kind,
        name: entity.name,
        role: entity.role,
        ...(entity.status ? { status: entity.status } : {}),
        icon: entity.icon,
      });
    });
  }
  return out;
}
