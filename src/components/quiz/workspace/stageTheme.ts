/**
 * HUB6.1 — each Daily stage's visual identity in History.
 *
 * One glyph and one printed ink per stage kind, so a stage is recognised
 * before its name is read — and never by colour alone: every use pairs the
 * ink with the glyph and the stage's own name (`stageKindLabel`).
 *
 * The inks are printed depths, not lit ones, so they hold on parchment the
 * way the sheet's other inks do. Two are the sheet's existing tokens — the
 * Daily's brass and Survival's rubric — and Review takes the jade the
 * question rings already use for a correct answer. The rest sit at the same
 * depth: sapphire (Standard), amber (Time Trial), violet (Weak Areas).
 */
import {
  CalendarDays,
  Crosshair,
  RotateCcw,
  Shield,
  Swords,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";

export interface StageTone {
  icon: LucideIcon;
  /** Marks, glyphs and the stage's name. */
  ink: string;
  /** Washes behind the stage's own surfaces. */
  tint: string;
  /** Borders of the stage's own surfaces. */
  edge: string;
}

function tone(icon: LucideIcon, rgb: string, ink?: string): StageTone {
  return { icon, ink: ink ?? `rgb(${rgb})`, tint: `rgba(${rgb}, 0.1)`, edge: `rgba(${rgb}, 0.42)` };
}

export const DAILY_TONE: StageTone = tone(CalendarDays, "138, 106, 44", LEAGUECRAFT_INK.brass);

const TONES: Readonly<Record<string, StageTone>> = {
  standard: tone(Swords, "29, 79, 138"),
  time_trial: tone(Timer, "154, 82, 8"),
  survival: tone(Shield, "122, 40, 32", LEAGUECRAFT_INK.rubric),
  weak_areas: tone(Crosshair, "90, 58, 142"),
  review: tone(RotateCcw, "31, 92, 60"),
};

/** A kind this client does not know yet borrows the Daily's tone and glyph
 *  rather than a wrong stage's. */
export function stageTone(kind: string): StageTone {
  return TONES[kind] ?? DAILY_TONE;
}

/** Outcome marks, shared by every stage visual: the question rings' jade and
 *  rubric, and the sheet's rule for an answer that never came. */
export const OUTCOME_INK = {
  correct: "rgb(31, 92, 60)",
  incorrect: LEAGUECRAFT_INK.rubric,
  timeout: "rgba(96, 68, 28, 0.55)",
} as const;
