/**
 * GM-R1 — the lab's STAND-IN SERVER for Rangefinder rounds. DEVELOPMENT ONLY.
 *
 * It plays the part the backend will play: it reads the frozen authority
 * capture (verbatim CAST_RANGE facts, wiki-stamped), issues a round whose
 * stop tokens are opaque and per-round, keeps the canonical token in a
 * secret the primitive never receives, and grades a response into a
 * `RangefinderReveal`. Nothing here is imported by the primitive, and the
 * source test pins that.
 */
import capture from "@/lib/rangefinder/__fixtures__/rangeAuthorityCapture.json";
import type { EligibleRangeRecord, RangeAuthorityCapture } from "@/lib/rangefinder/eligibility";
import { RANGEFINDER_MAX_UNITS, RANGEFINDER_MIN_UNITS, RANGEFINDER_STEP_UNITS } from "@/lib/rangefinder/eligibility";
import type { RangefinderLens, RangefinderPublic, RangefinderResponse, RangefinderReveal } from "@/lib/interaction-grammar/types";
import { formatUnits } from "@/lib/interaction-grammar/rangefinder";
import { getAbilityIconUrl, getChampionSquareIconUrl } from "@/lib/combat-lab/abilityIcons";

export const RANGE_CAPTURE = capture as unknown as RangeAuthorityCapture;

/** The instrument's two optics. Presentation only; identical for every round. */
export const LAB_LENSES: readonly RangefinderLens[] = [
  { id: "field", label: "Field", maxUnits: 1500, ringEveryUnits: 100, labelEveryUnits: 500 },
  { id: "horizon", label: "Horizon", maxUnits: RANGEFINDER_MAX_UNITS, ringEveryUnits: 500, labelEveryUnits: 1000 },
];

export function roundId(r: EligibleRangeRecord): string {
  return `${r.champion.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${r.slot.toLowerCase()}`;
}

export function findRecord(id: string): EligibleRangeRecord | null {
  return RANGE_CAPTURE.eligible.find((r) => roundId(r) === id) ?? null;
}

/** A deterministic 32-bit hash (FNV-1a) for per-round token minting. */
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export interface LabSecret {
  canonicalToken: string;
  canonicalUnits: number;
  unitsByToken: ReadonlyMap<string, number>;
  record: EligibleRangeRecord;
}

export interface LabRound {
  id: string;
  content: RangefinderPublic;
  secret: LabSecret;
}

export function promptFor(r: EligibleRangeRecord): string {
  return `Set the target at the cast limit of ${r.ability}.`;
}

export function buildLabRound(record: EligibleRangeRecord, seed: string): LabRound {
  const id = roundId(record);
  const stops: { token: string; units: number }[] = [];
  const unitsByToken = new Map<string, number>();
  for (let u = RANGEFINDER_MIN_UNITS; u <= RANGEFINDER_MAX_UNITS; u += RANGEFINDER_STEP_UNITS) {
    const token = `rf_${fnv(`${seed}:${id}:${u}`).toString(36)}`;
    stops.push({ token, units: u });
    unitsByToken.set(token, u);
  }
  const canonical = stops.find((s) => s.units === record.castRangeUnits);
  if (!canonical) throw new Error(`lab: ${id} has no stop at ${record.castRangeUnits}`);
  const content: RangefinderPublic = {
    prompt: promptFor(record),
    measureLabel: "Rangefinder · Cast range",
    subject: {
      label: record.ability,
      sublabel: `${record.champion} · ${record.slot}`,
      slot: record.slot,
      media: { src: getAbilityIconUrl(record.champion, record.slot), alt: `${record.ability} (${record.champion} ${record.slot})` },
      originMedia: { src: getChampionSquareIconUrl(record.champion), alt: record.champion },
      monogram: record.slot,
    },
    field: { unitLabel: "units", stops, lenses: LAB_LENSES },
    footnote: `Cast range as the League Wiki publishes it · revision ${record.revisionId}`,
  };
  return { id, content, secret: { canonicalToken: canonical.token, canonicalUnits: record.castRangeUnits, unitsByToken, record } };
}

/** The server's grader: exact token equality. No tolerance exists anywhere. */
export function gradeLabRound(secret: LabSecret, response: RangefinderResponse): RangefinderReveal {
  const locked = secret.unitsByToken.get(response.stop);
  if (locked === undefined) throw new Error("lab: response names a stop this round never issued");
  const delta = locked - secret.canonicalUnits;
  const verdict: RangefinderReveal["verdict"] = delta === 0 ? "exact" : delta < 0 ? "short" : "long";
  return {
    lockedToken: response.stop,
    canonicalToken: secret.canonicalToken,
    verdict,
    measurement: { label: "Cast range", valueText: formatUnits(secret.canonicalUnits) },
    lockedText: formatUnits(locked),
    deltaText: delta === 0 ? null : `${delta > 0 ? "+" : "−"}${formatUnits(Math.abs(delta))} units`,
    note: `${secret.record.ability} is ${secret.record.targeting.toLowerCase()}-targeted.`,
    source: { label: "League Wiki · ability data template", url: secret.record.sourceUrl },
  };
}

/** A deterministic order through the pool for a seed. */
export function roundOrder(seed: string): EligibleRangeRecord[] {
  return [...RANGE_CAPTURE.eligible].sort((a, b) => fnv(`${seed}:${roundId(a)}`) - fnv(`${seed}:${roundId(b)}`));
}
