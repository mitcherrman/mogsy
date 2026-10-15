/**
 * WP1 — the AUTHORITY'S side of a Glyph Press round. This is what the backend
 * will own: how a display answer becomes a public structure, which glyphs it
 * gives away, how a sounding is answered, how a locked response is graded.
 *
 * The primitive never imports this module (its source test pins that). Only
 * a host — today the development lab, tomorrow a `glyph_press.v1` server —
 * calls it, and only the public halves of its results ever reach the client.
 */
import type {
  GlyphPressCell, GlyphPressCellResult, GlyphPressLedger, GlyphPressResponse, GlyphPressReveal, GlyphPressStructure,
} from "@/lib/interaction-grammar/types";
import { GLYPH_PRESS_ALPHABET } from "@/lib/interaction-grammar/glyphPress";

/**
 * One character as the press knows it: upper-cased, diacritics stripped, so
 * "é" and "E" are one glyph. Null for anything that is not a drum glyph.
 */
export function normalizeGlyph(ch: string): string | null {
  const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  return base.length === 1 && GLYPH_PRESS_ALPHABET.includes(base) ? base : null;
}

/** The canonical glyph string of an answer: its letters only, normalized. Used to compare spellings. */
export function normalizeAnswer(answer: string): string {
  return [...answer].map((c) => normalizeGlyph(c) ?? "").join("");
}

export interface AnswerStructure {
  /** The public structure: sockets, marks and gaps. */
  structure: GlyphPressStructure;
  /** SECRET. The canonical glyph of each socket. */
  glyphs: string[];
}

/**
 * A display answer ("Rabadon's Deathcap", "Command: Shockwave", "90 Caliber Net")
 * becomes sockets for its letters, engraved marks for everything else that is
 * not whitespace, and a gap for each run of whitespace.
 */
export function structureFromAnswer(answer: string): AnswerStructure {
  const cells: GlyphPressCell[] = [];
  const glyphs: string[] = [];
  let pendingGap = false;
  for (const ch of answer.trim()) {
    if (/\s/.test(ch)) { pendingGap = cells.length > 0; continue; }
    if (pendingGap) { cells.push({ kind: "gap" }); pendingGap = false; }
    const g = normalizeGlyph(ch);
    if (g) { cells.push({ kind: "glyph", index: glyphs.length }); glyphs.push(g); }
    else cells.push({ kind: "mark", text: ch });
  }
  if (!glyphs.length) throw new Error(`word puzzle: "${answer}" has no glyphs to set`);
  return { structure: { cells, glyphCount: glyphs.length }, glyphs };
}

/** A deterministic 32-bit hash (FNV-1a) for seeded choices. */
export function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * The glyphs a round gives away at the start: a seeded choice of distinct
 * letters, every instance engraved. `share` is the fraction of DISTINCT
 * letters opened (at least one, and never all of them).
 */
export function chooseGivens(glyphs: readonly string[], seed: string, share = 0.25): (string | null)[] {
  const distinct = [...new Set(glyphs)];
  if (distinct.length <= 1) return glyphs.map(() => null);
  const k = Math.min(distinct.length - 1, Math.max(1, Math.round(distinct.length * share)));
  const chosen = new Set([...distinct].sort((a, b) => fnv(`${seed}:${a}`) - fnv(`${seed}:${b}`)).slice(0, k));
  return glyphs.map((g) => (chosen.has(g) ? g : null));
}

/** The sockets a glyph occupies. The host discloses these as a sounding. */
export function soundGlyph(glyphs: readonly string[], glyph: string): number[] {
  const g = normalizeGlyph(glyph);
  if (!g) return [];
  const out: number[] = [];
  glyphs.forEach((x, i) => { if (x === g) out.push(i); });
  return out;
}

/** The ledger after a sounding: the glyph engraved wherever it sits, the sounding recorded. */
export function applySounding(ledger: GlyphPressLedger, glyphs: readonly string[], glyph: string): GlyphPressLedger {
  const g = normalizeGlyph(glyph);
  if (!g) throw new Error(`word puzzle: "${glyph}" is not a glyph`);
  if (ledger.soundings.some((s) => s.glyph === g)) return ledger;
  const hits = soundGlyph(glyphs, g);
  const engraved = ledger.engraved.map((e, i) => (hits.includes(i) ? g : e));
  return { engraved, soundings: [...ledger.soundings, { glyph: g, hits: hits.length }] };
}

export interface GradeInput {
  glyphs: readonly string[];
  /** The ledger at Lock: which sockets were given or sounded. */
  ledger: GlyphPressLedger;
  response: GlyphPressResponse;
  answerText: string;
  /** Which of the engraved sockets were given at the start (the rest were sounded). */
  givenAtStart: readonly (string | null)[];
  note?: string | null;
  source?: GlyphPressReveal["source"];
}

/** The grader: one result per socket, a verdict for the whole, every string formatted here. */
export function gradeResponse(input: GradeInput): GlyphPressReveal {
  const { glyphs, ledger, response, answerText, givenAtStart } = input;
  if (response.glyphs.length !== glyphs.length) throw new Error("word puzzle: the response has the wrong socket count");
  const results: GlyphPressCellResult[] = [];
  let right = 0;
  let open = 0;
  glyphs.forEach((canon, i) => {
    if (ledger.engraved[i] !== null) { results.push(givenAtStart[i] !== null ? "given" : "sounded"); return; }
    open += 1;
    const raw = response.glyphs[i];
    const g = raw ? normalizeGlyph(raw) : null;
    if (g === null) results.push("missing");
    else if (g === canon) { results.push("right"); right += 1; }
    else results.push("wrong");
  });
  const verdict: GlyphPressReveal["verdict"] = open === 0 || right === open ? "solved" : right === 0 ? "missed" : "partial";
  return {
    glyphs: [...glyphs],
    results,
    locked: response.glyphs.map((g) => (g ? normalizeGlyph(g) : null)),
    verdict,
    answerText,
    scoreText: open === 0 ? "Every glyph was given" : `${right} of ${open} ${open === 1 ? "glyph" : "glyphs"} set right`,
    note: input.note ?? null,
    source: input.source ?? null,
  };
}
