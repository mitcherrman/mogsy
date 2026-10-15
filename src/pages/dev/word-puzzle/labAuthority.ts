/**
 * WP1 — the lab's STAND-IN SERVER for Glyph Press rounds. DEVELOPMENT ONLY.
 *
 * It plays the part the backend will play: it reads the frozen round fixture
 * (answers verified against the repo's wiki-stamped authorities, or marked
 * unverified), issues a round whose public content carries only the phrase's
 * structure and the given glyphs, keeps the canonical glyphs in a secret the
 * primitive never receives, answers soundings by extending the ledger, and
 * grades a locked response into a `GlyphPressReveal`.
 *
 * Nothing here is imported by the primitive, and the source test pins that.
 * Nothing here is secret from a browser's devtools either: the fixture ships
 * in the bundle. The backend owns secrecy; this owns the CONTRACT.
 *
 * INT1: the rounds are a PARAMETER, never an import, so this module can ship in
 * a production build without the answer bank. The DEV route hands it the
 * bundled fixture (`devRounds.ts`); the owner-only admin route hands it the
 * file the owner loads from their own disk.
 */
import type { GlyphPressLedger, GlyphPressPublic, GlyphPressResponse, GlyphPressReveal } from "@/lib/interaction-grammar/types";
import { GLYPH_PRESS_ALPHABET } from "@/lib/interaction-grammar/glyphPress";
import { applySounding, chooseGivens, fnv, gradeResponse, structureFromAnswer } from "@/lib/word-puzzle/authority";
import { getAbilityIconUrl, getChampionSquareIconUrl, type AbilitySlot } from "@/lib/combat-lab/abilityIcons";
import { resolveAssetUrl } from "@/hooks/useChampionAssets";

export interface FixtureRound {
  id: string;
  family: string;
  answer: string;
  prompt: string;
  categoryLabel: string;
  clue: { champion?: string; slot?: string; itemId?: number; caption: string | null; monogram?: string };
  verified: boolean;
  source: { label: string; url: string | null; revisionId: number | null } | null;
  note: string | null;
  traits: string[];
}

/** The round file's shape (`wordPuzzleRounds.json`). */
export interface WordPuzzleRoundFile {
  capturedAt: string;
  backend: { path: string; commit: string };
  rounds: readonly FixtureRound[];
}

export const SOUNDINGS_ALLOWED = 3;

export function findRound(rounds: readonly FixtureRound[], id: string): FixtureRound | null {
  return rounds.find((r) => r.id === id) ?? null;
}

export interface LabSecret {
  /** The canonical glyph per socket. */
  glyphs: readonly string[];
  /** Which sockets were given at the start. */
  givenAtStart: readonly (string | null)[];
  round: FixtureRound;
}

export interface LabRound {
  id: string;
  content: GlyphPressPublic;
  ledger: GlyphPressLedger;
  secret: LabSecret;
}

function clueMedia(r: FixtureRound): { src: string | null; alt: string } | null {
  const c = r.clue;
  if (c.itemId) return { src: resolveAssetUrl(`assets/items/${c.itemId}.png`), alt: "" };
  if (c.champion && c.slot === "icon") return { src: getChampionSquareIconUrl(c.champion), alt: "" };
  if (c.champion && c.slot) return { src: getAbilityIconUrl(c.champion, c.slot as AbilitySlot), alt: "" };
  return null;
}

export function buildLabRound(round: FixtureRound, seed: string): LabRound {
  const { structure, glyphs } = structureFromAnswer(round.answer);
  const givenAtStart = chooseGivens(glyphs, `${seed}:${round.id}`);
  const content: GlyphPressPublic = {
    prompt: round.prompt,
    categoryLabel: round.verified ? round.categoryLabel : `${round.categoryLabel} · dev-only`,
    clue: { media: clueMedia(round), caption: round.clue.caption, monogram: round.clue.monogram ?? round.categoryLabel.slice(0, 2) },
    structure,
    alphabet: GLYPH_PRESS_ALPHABET,
    soundingsAllowed: SOUNDINGS_ALLOWED,
    footnote: round.source
      ? `${round.source.label}${round.source.revisionId ? ` · revision ${round.source.revisionId}` : ""}`
      : "Unverified demonstration content — development only.",
  };
  return {
    id: round.id,
    content,
    ledger: { engraved: givenAtStart, soundings: [] },
    secret: { glyphs, givenAtStart, round },
  };
}

/** The server answers a sounding: the ledger grows; nothing else is disclosed. */
export function soundLabRound(secret: LabSecret, ledger: GlyphPressLedger, glyph: string): GlyphPressLedger {
  if (ledger.soundings.length >= SOUNDINGS_ALLOWED) return ledger;
  return applySounding(ledger, secret.glyphs, glyph);
}

/** The server's grader. */
export function gradeLabRound(secret: LabSecret, ledger: GlyphPressLedger, response: GlyphPressResponse): GlyphPressReveal {
  return gradeResponse({
    glyphs: secret.glyphs,
    ledger,
    response,
    answerText: secret.round.answer,
    givenAtStart: secret.givenAtStart,
    note: secret.round.note,
    source: secret.round.source ? { label: secret.round.source.label, url: secret.round.source.url } : null,
  });
}

/** A deterministic order through the rounds for a seed. */
export function roundOrder(rounds: readonly FixtureRound[], seed: string): FixtureRound[] {
  return [...rounds].sort((a, b) => fnv(`${seed}:${a.id}`) - fnv(`${seed}:${b.id}`));
}
