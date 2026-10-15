/**
 * INT1 — owner-loaded lab packs for the interaction-mode playtests.
 *
 * Rangefinder (GM-R1) and Glyph Press (WP1) grade in a stand-in server that
 * needs their answer-bearing fixture. A production bundle is public — any
 * lazy chunk can be fetched without signing in — so the owner-only admin route
 * cannot import those fixtures. Instead the owner picks the committed fixture
 * file from their own disk; it is parsed here, held in memory for the session,
 * and never uploaded, persisted or logged.
 *
 * Every field is validated because the lab trusts the shape: a wrong file is
 * refused with a reason, never half-loaded.
 */
import type { EligibleRangeRecord, RangeAuthorityCapture } from "@/lib/rangefinder/eligibility";
import { RANGEFINDER_MAX_UNITS, RANGEFINDER_MIN_UNITS, RANGEFINDER_STEP_UNITS } from "@/lib/rangefinder/eligibility";
import type { FixtureRound } from "@/pages/dev/word-puzzle/labAuthority";

/** Shown on every lab surface until a server grader is separately approved and tested. */
export const PROTOTYPE_LABEL = "Prototype • not server-authoritatively graded";

/** The committed fixture each lab expects the owner to load. */
export const LAB_PACK_FILES = {
  rangefinder: "src/lib/rangefinder/__fixtures__/rangeAuthorityCapture.json",
  "word-puzzle": "src/lib/word-puzzle/__fixtures__/wordPuzzleRounds.json",
} as const;
export type LabId = keyof typeof LAB_PACK_FILES;
export const isLabId = (s: string | undefined): s is LabId => s === "rangefinder" || s === "word-puzzle";

/** Far above either fixture (135 KB / 7 KB); refuses anything that is plainly not one. */
export const MAX_PACK_BYTES = 2 * 1024 * 1024;

export type PackResult<T> = { ok: true; pack: T } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 200): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
/** Sources may only point at the League Wiki over https. */
const isWikiUrl = (v: unknown): v is string => {
  if (!isStr(v, 400)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname === "wiki.leagueoflegends.com";
  } catch {
    return false;
  }
};

const SLOTS = new Set(["Q", "W", "E", "R"]);
const TARGETING = new Set(["Unit", "Location", "Direction"]);

function readRangeRecord(r: unknown, i: number): EligibleRangeRecord | string {
  const at = `eligible[${i}]`;
  if (!isObj(r)) return `${at} is not an object`;
  if (!isStr(r.champion, 40)) return `${at}.champion is missing`;
  if (!isStr(r.ability, 80)) return `${at}.ability is missing`;
  if (typeof r.slot !== "string" || !SLOTS.has(r.slot)) return `${at}.slot must be Q/W/E/R`;
  if (typeof r.targeting !== "string" || !TARGETING.has(r.targeting)) return `${at}.targeting is not Unit/Location/Direction`;
  const u = r.castRangeUnits;
  if (!isInt(u) || u < RANGEFINDER_MIN_UNITS || u > RANGEFINDER_MAX_UNITS || u % RANGEFINDER_STEP_UNITS !== 0) {
    return `${at}.castRangeUnits is off the ${RANGEFINDER_STEP_UNITS}-unit lattice [${RANGEFINDER_MIN_UNITS}, ${RANGEFINDER_MAX_UNITS}]`;
  }
  if (!isWikiUrl(r.sourceUrl)) return `${at}.sourceUrl is not a League Wiki https URL`;
  if (!isInt(r.revisionId) || r.revisionId <= 0) return `${at}.revisionId is not a positive integer`;
  return {
    champion: r.champion, slot: r.slot as EligibleRangeRecord["slot"], ability: r.ability,
    targeting: r.targeting as EligibleRangeRecord["targeting"], castRangeUnits: u,
    sourceUrl: r.sourceUrl, revisionId: r.revisionId,
  };
}

/** Validate a Rangefinder capture (`rangeAuthorityCapture.json`). */
export function readRangefinderPack(raw: unknown): PackResult<RangeAuthorityCapture> {
  if (!isObj(raw)) return { ok: false, error: "Not a JSON object." };
  if (!isStr(raw.capturedAt, 40)) return { ok: false, error: "Not a Rangefinder capture: no capturedAt." };
  if (!isObj(raw.source) || !isStr(raw.source.file, 200)) return { ok: false, error: "Not a Rangefinder capture: no source." };
  if (!Array.isArray(raw.eligible) || raw.eligible.length === 0) return { ok: false, error: "Not a Rangefinder capture: no eligible rounds." };
  const eligible: EligibleRangeRecord[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < raw.eligible.length; i++) {
    const r = readRangeRecord(raw.eligible[i], i);
    if (typeof r === "string") return { ok: false, error: r };
    const id = `${r.champion}:${r.slot}`;
    if (ids.has(id)) return { ok: false, error: `eligible[${i}] repeats ${id}` };
    ids.add(id);
    eligible.push(r);
  }
  return {
    ok: true,
    pack: {
      capturedAt: raw.capturedAt,
      source: {
        file: raw.source.file,
        repoCommit: typeof raw.source.repoCommit === "string" ? raw.source.repoCommit : null,
        authorityHost: typeof raw.source.authorityHost === "string" ? raw.source.authorityHost : "",
      },
      rules: Array.isArray(raw.rules) ? raw.rules.filter((x): x is string => typeof x === "string") : [],
      population: isInt(raw.population) ? raw.population : eligible.length,
      eligible,
      // The lab never reads the exclusions; they are not carried.
      excluded: [],
    },
  };
}

const ROUND_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readRound(r: unknown, i: number): FixtureRound | string {
  const at = `rounds[${i}]`;
  if (!isObj(r)) return `${at} is not an object`;
  if (typeof r.id !== "string" || r.id.length > 60 || !ROUND_ID.test(r.id)) return `${at}.id is not a slug`;
  if (!isStr(r.family, 30)) return `${at}.family is missing`;
  if (!isStr(r.answer, 60) || !/[A-Za-z]/.test(r.answer)) return `${at}.answer has no letters`;
  if (!isStr(r.prompt, 160)) return `${at}.prompt is missing`;
  if (!isStr(r.categoryLabel, 30)) return `${at}.categoryLabel is missing`;
  if (typeof r.verified !== "boolean") return `${at}.verified is not a boolean`;
  const c = r.clue;
  if (!isObj(c)) return `${at}.clue is missing`;
  if (c.caption !== null && c.caption !== undefined && !isStr(c.caption, 80)) return `${at}.clue.caption is invalid`;
  if (c.champion !== undefined && !isStr(c.champion, 40)) return `${at}.clue.champion is invalid`;
  if (c.slot !== undefined && !(typeof c.slot === "string" && (SLOTS.has(c.slot) || c.slot === "icon"))) return `${at}.clue.slot is invalid`;
  if (c.itemId !== undefined && !(isInt(c.itemId) && c.itemId > 0)) return `${at}.clue.itemId is invalid`;
  if (c.monogram !== undefined && !isStr(c.monogram, 3)) return `${at}.clue.monogram is invalid`;
  let source: FixtureRound["source"] = null;
  if (r.source !== null) {
    const s = r.source;
    if (!isObj(s) || !isStr(s.label, 120)) return `${at}.source is invalid`;
    if (s.url !== null && !isWikiUrl(s.url)) return `${at}.source.url is not a League Wiki https URL`;
    if (s.revisionId !== null && !(isInt(s.revisionId) && s.revisionId > 0)) return `${at}.source.revisionId is invalid`;
    source = { label: s.label, url: (s.url as string | null), revisionId: (s.revisionId as number | null) };
  }
  if (r.verified && !source) return `${at} claims verified with no source`;
  if (r.note !== null && !isStr(r.note, 240)) return `${at}.note is invalid`;
  const traits = Array.isArray(r.traits) ? r.traits.filter((t): t is string => typeof t === "string") : [];
  return {
    id: r.id, family: r.family, answer: r.answer, prompt: r.prompt, categoryLabel: r.categoryLabel,
    clue: {
      champion: c.champion as string | undefined, slot: c.slot as string | undefined,
      itemId: c.itemId as number | undefined, caption: (c.caption as string | null | undefined) ?? null,
      monogram: c.monogram as string | undefined,
    },
    verified: r.verified, source, note: (r.note as string | null), traits,
  };
}

/** Validate a Glyph Press round file (`wordPuzzleRounds.json`). */
export function readWordPuzzlePack(raw: unknown): PackResult<readonly FixtureRound[]> {
  if (!isObj(raw)) return { ok: false, error: "Not a JSON object." };
  if (!Array.isArray(raw.rounds) || raw.rounds.length === 0) return { ok: false, error: "Not a Word Puzzle round file: no rounds." };
  const rounds: FixtureRound[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < raw.rounds.length; i++) {
    const r = readRound(raw.rounds[i], i);
    if (typeof r === "string") return { ok: false, error: r };
    if (ids.has(r.id)) return { ok: false, error: `rounds[${i}] repeats id ${r.id}` };
    ids.add(r.id);
    rounds.push(r);
  }
  return { ok: true, pack: rounds };
}

function readText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(r.error);
    r.readAsText(file);
  });
}

/** Read and validate a file the owner picked. Nothing leaves the browser. */
export async function readPackFile<T>(file: File, read: (raw: unknown) => PackResult<T>): Promise<PackResult<T>> {
  if (file.size > MAX_PACK_BYTES) return { ok: false, error: `File is ${Math.round(file.size / 1024)} KB; a lab pack is under ${MAX_PACK_BYTES / 1024 / 1024} MB.` };
  let raw: unknown;
  try {
    raw = JSON.parse(await readText(file));
  } catch {
    return { ok: false, error: "File is not valid JSON." };
  }
  return read(raw);
}
