/**
 * RA10 — presentation-only Ranked class identity.
 *
 * One local mapping from a backend classId to its visual identity: the
 * canonical mascot portrait (from the shared Mogzy art registry — no new
 * character art is invented here) and a restrained accent used for the
 * portrait ring and class tag. Combat semantics, HP, abilities and every
 * gameplay value stay untouched — this file only answers "what does this
 * class look like".
 *
 * Unknown classIds (bot personas, future classes) fail soft: no portrait,
 * neutral accent, monogram fallback — the panel keeps its geometry.
 */
import {
  MOGZY_CLASS_ASSETS,
  isMogzyClassCharacter,
} from "@/components/mascot/mascot-assets";

export interface ClassIdentity {
  /** Portrait asset path, or null when the class has no canonical art. */
  portrait: string | null;
  /** Accent for rings/tags — solid form. */
  accent: string;
  /** Accent at low alpha for fills/backdrops. */
  accentSoft: string;
}

/** Restrained per-class accents drawn from the existing academy palette:
 * brass for the bulwark, arcane cyan for the mage, sage for the marksman. */
const CLASS_ACCENTS: Record<string, { accent: string; accentSoft: string }> = {
  tank: { accent: "#d5b66f", accentSoft: "rgba(213,182,111,0.16)" },
  mage: { accent: "#7fd6ef", accentSoft: "rgba(127,214,239,0.14)" },
  marksman: { accent: "#8fd0a0", accentSoft: "rgba(143,208,160,0.14)" },
};

const NEUTRAL: ClassIdentity = {
  portrait: null,
  accent: "rgba(233,220,190,0.55)",
  accentSoft: "rgba(233,220,190,0.10)",
};

/** Visual identity for a backend classId; case-insensitive, fails soft. */
export function classIdentityFor(classId: string | undefined): ClassIdentity {
  const key = (classId ?? "").toLowerCase();
  const accents = CLASS_ACCENTS[key];
  if (!accents) return NEUTRAL;
  return {
    portrait: isMogzyClassCharacter(key) ? MOGZY_CLASS_ASSETS[key] : null,
    ...accents,
  };
}
