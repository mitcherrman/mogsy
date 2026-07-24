/**
 * Structural proposal payloads — champion onboarding through the review queue.
 *
 * Structural proposals (backend F3.12) reuse knowledge_proposed_updates with
 *   property = "structural:<kind>"  (kind: champion_identity | ability_create
 *   | role_tags) and carry their meaningful state as JSON in
 *   proposed_full_progression:
 *     { target: "structural", kind, champion, slot?, fields?, roles? }
 * current_value / proposed_value are both null for these rows.
 *
 * Everything here is defensive: a payload that cannot be fully understood
 * parses to { ok: false, reason } and the UI must BLOCK approval — never
 * guess at a production write.
 */

export const STRUCTURAL_PREFIX = "structural:";

export type StructuralKind = "champion_identity" | "ability_create" | "role_tags";

const KNOWN_KINDS: readonly StructuralKind[] = [
  "champion_identity",
  "ability_create",
  "role_tags",
];

/** Ability fields the backend contract supports, in display order. */
export const ABILITY_FIELD_ORDER = [
  "ability_name",
  "description",
  "cooldown",
  "cost",
  "range_text",
] as const;

/** Champion identity fields the backend contract supports, in display order. */
export const IDENTITY_FIELD_ORDER = [
  "title",
  "resource_type",
  "attack_type",
  "release_date",
] as const;

export const FIELD_LABELS: Record<string, string> = {
  ability_name: "Ability name",
  description: "Description",
  cooldown: "Cooldown",
  cost: "Resource cost",
  range_text: "Range",
  title: "Title",
  resource_type: "Resource type",
  attack_type: "Attack type",
  release_date: "Release date",
};

export const KIND_LABELS: Record<StructuralKind, string> = {
  champion_identity: "Champion identity",
  ability_create: "Ability creation",
  role_tags: "Role tags",
};

/** What approving this kind DOES to the database. */
export const KIND_EFFECTS: Record<StructuralKind, string> = {
  champion_identity:
    "Creates or updates the champion's identity record (champion_metadata). Only the listed fields change.",
  ability_create:
    "Creates a NEW ability row (champion_abilities). Refused if a row for this champion + slot already exists with different content — corrections go through the value pipeline instead.",
  role_tags:
    "Replaces the champion's full role/tag set (champion_tags) atomically.",
};

/** Table each kind writes, for the "record affected" line. */
export const KIND_TARGET_TABLE: Record<StructuralKind, string> = {
  champion_identity: "champion_metadata",
  ability_create: "champion_abilities",
  role_tags: "champion_tags",
};

export interface SkippedField {
  field: string;
  label: string;
  reason: string;
}

export interface StructuralPayload {
  kind: StructuralKind;
  champion: string;
  /** Q/W/E/R for ability_create; null otherwise. */
  slot: string | null;
  /** Non-empty supported fields, display order. */
  fields: { field: string; label: string; value: string }[];
  /** role_tags only. */
  roles: string[];
  /** Supported fields present in the payload but empty — the deterministic
   *  parser refused them; they need reviewer entry via the value pipeline. */
  skipped: SkippedField[];
  /** Raw payload for the collapsible debug view. */
  raw: unknown;
}

/* Both arms declare both keys (as optional-undefined) because this repo
 * compiles with strict:false, where TS does not narrow the union by `ok`. */
export type StructuralParse =
  | { ok: true; payload: StructuralPayload; reason?: undefined }
  | { ok: false; reason: string; payload?: undefined };

export function isStructuralProperty(property: string | null | undefined): boolean {
  return typeof property === "string" && property.startsWith(STRUCTURAL_PREFIX);
}

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const SKIP_REASON =
  "not deterministically parseable from wiki evidence — needs reviewer entry via the value pipeline after creation";

function collectFields(
  raw: Record<string, unknown>,
  order: readonly string[],
): { fields: StructuralPayload["fields"]; skipped: SkippedField[]; unknown: string[] } {
  const fields: StructuralPayload["fields"] = [];
  const skipped: SkippedField[] = [];
  const known = new Set(order);
  const unknown = Object.keys(raw).filter((k) => !known.has(k));
  for (const field of order) {
    if (!(field in raw)) continue;
    const label = FIELD_LABELS[field] ?? field;
    const value = asTrimmedString(raw[field]);
    if (value) fields.push({ field, label, value });
    else skipped.push({ field, label, reason: SKIP_REASON });
  }
  return { fields, skipped, unknown };
}

/**
 * Parse one structural proposal's payload. Fail-closed: any shape the
 * backend contract does not guarantee → { ok: false } and approval must be
 * disabled by the caller.
 */
export function parseStructuralPayload(
  property: string | null | undefined,
  payloadJson: string | null | undefined,
): StructuralParse {
  if (!isStructuralProperty(property)) {
    return { ok: false, reason: `not a structural property: ${property ?? "(none)"}` };
  }
  const kindFromProperty = (property as string).slice(STRUCTURAL_PREFIX.length);
  if (!payloadJson) {
    return { ok: false, reason: "structural payload is missing (proposed_full_progression is empty)" };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(payloadJson);
  } catch {
    return { ok: false, reason: "structural payload is not valid JSON" };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "structural payload is not an object" };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.target !== "structural") {
    return { ok: false, reason: `payload target is ${JSON.stringify(obj.target)}, expected "structural"` };
  }
  const kind = asTrimmedString(obj.kind) as StructuralKind;
  if (!KNOWN_KINDS.includes(kind)) {
    return { ok: false, reason: `unknown structural kind: ${JSON.stringify(obj.kind)}` };
  }
  if (kind !== kindFromProperty) {
    return { ok: false, reason: `payload kind "${kind}" does not match property "${property}"` };
  }
  const champion = asTrimmedString(obj.champion);
  if (!champion) {
    return { ok: false, reason: "payload has no champion name" };
  }

  if (kind === "role_tags") {
    const rolesRaw = obj.roles;
    if (!Array.isArray(rolesRaw) || rolesRaw.length === 0) {
      return { ok: false, reason: "role_tags payload has no roles list" };
    }
    const roles = rolesRaw.map(asTrimmedString);
    if (roles.some((r) => !r)) {
      return { ok: false, reason: "role_tags payload contains an empty role" };
    }
    return {
      ok: true,
      payload: { kind, champion, slot: null, fields: [], roles, skipped: [], raw },
    };
  }

  const fieldsRaw = obj.fields;
  if (typeof fieldsRaw !== "object" || fieldsRaw === null || Array.isArray(fieldsRaw)) {
    return { ok: false, reason: `${kind} payload has no fields object` };
  }

  if (kind === "ability_create") {
    const slot = asTrimmedString(obj.slot).toUpperCase();
    if (!/^[QWER]$/.test(slot)) {
      return { ok: false, reason: `ability_create payload has invalid slot: ${JSON.stringify(obj.slot)}` };
    }
    const { fields, skipped, unknown } = collectFields(
      fieldsRaw as Record<string, unknown>,
      ABILITY_FIELD_ORDER,
    );
    if (unknown.length > 0) {
      return { ok: false, reason: `ability_create payload has unsupported fields: ${unknown.join(", ")}` };
    }
    if (!fields.some((f) => f.field === "ability_name")) {
      return { ok: false, reason: "ability_create payload has no ability_name" };
    }
    return { ok: true, payload: { kind, champion, slot, fields, roles: [], skipped, raw } };
  }

  // champion_identity
  const { fields, skipped, unknown } = collectFields(
    fieldsRaw as Record<string, unknown>,
    IDENTITY_FIELD_ORDER,
  );
  if (unknown.length > 0) {
    return { ok: false, reason: `champion_identity payload has unsupported fields: ${unknown.join(", ")}` };
  }
  if (fields.length === 0) {
    return { ok: false, reason: "champion_identity payload has no supported fields" };
  }
  return { ok: true, payload: { kind, champion, slot: null, fields, roles: [], skipped, raw } };
}

/* ── Dry-run / apply plan (backend structural_writer response) ─────────── */

export type StructuralAction = "insert" | "upsert" | "replace" | "unchanged";

export const ACTION_LABELS: Record<string, { label: string; tone: "create" | "update" | "noop" }> = {
  insert: { label: "CREATE — a new row will be inserted", tone: "create" },
  upsert: { label: "UPDATE — existing metadata fields will change", tone: "update" },
  replace: { label: "REPLACE — the full role set will be replaced", tone: "update" },
  unchanged: { label: "NO-OP — production already matches this proposal", tone: "noop" },
};

export interface StructuralPlan {
  kind: string;
  champion: string;
  slot?: string | null;
  action: StructuralAction | string;
  /** Current DB state snapshot: row object, roles array, or null (absent). */
  before: unknown;
  fields?: Record<string, unknown>;
  roles?: unknown[];
  [k: string]: unknown;
}

/** Extract the structural plan from an approval response, or null. */
export function structuralPlanFrom(res: unknown): StructuralPlan | null {
  if (typeof res !== "object" || res === null) return null;
  const r = res as Record<string, unknown>;
  if (r.structural !== true) return null;
  const plan = (r.plan ?? r) as Record<string, unknown>;
  if (typeof plan.kind !== "string" || typeof plan.action !== "string") return null;
  return plan as unknown as StructuralPlan;
}
