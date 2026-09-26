/**
 * JOURNEY-PRES-V1 — the ONE visual object a Journey child's question is about.
 *
 * The board shows the whole game state and the tiny kit icons inside it; this
 * picks the single thing the CURRENT question asks about and names the art to
 * draw it large on the parchment: the ability whose cooldown or damage is
 * asked, the champion whose stat is asked, the item that is the premise's
 * subject, or both champions of a Matchup.
 *
 * WHERE THE CHOICE COMES FROM. Only the challenge's server-resolved,
 * pre-reveal `presentation` blob — the same blob the ordinary slice draws its
 * `ScenarioMediaBand` from — read through the SAME pure pre-reveal selector the
 * band and the round preloader use: `selectScenario(source, false, null)`.
 * `revealActive: false` and `correctAnswer: null` are hard-coded, so:
 *
 *   * a subject the server marks as a spoiler classifies as `placeholder` and
 *     yields NO focus media (its art is an answer until the reveal);
 *   * the reveal-time subject upgrade is never computed;
 *   * an item card's missing component (a build-path ANSWER) is never read.
 *
 * The input type is `Pick<…, "presentation" | "challengeIndex">`: this module
 * cannot see `answerOptions`, a reveal, a settlement or any private field, so
 * no answer can steer which object is drawn. The tests pin that.
 *
 * `null` whenever there is nothing honest to draw. Nothing here throws.
 */
import { selectScenario } from "@/components/quiz-broadcast/scenario-cards/classify";
import { scenarioSourceForMasteryChallenge } from "@/lib/question-surface/masterySliceScenario";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import type { MasterySliceChallengeView } from "@/lib/ranked-public/contracts";

/** One champion as the focus draws it. `art` is a splash/loading crop, else the icon. */
export interface FocusChampion {
  name: string;
  splash: string | null;
  icon: string | null;
}

export type JourneyFocusMedia =
  /** An ability is the subject (cooldown, cost, damage): its icon, its champion behind it. */
  | {
    kind: "ability";
    champion: FocusChampion;
    abilityIcon: string;
    abilitySlot: string | null;
    abilityName: string | null;
    abilityRank: number | null;
  }
  /** A champion is the subject (a base / level stat): the champion itself. */
  | { kind: "champion"; champion: FocusChampion; level: number | null; label: string | null }
  /** An item is the subject of the premise. */
  | { kind: "item"; name: string; icon: string }
  /** Both champions of a comparison, in the served A/B order. */
  | {
    kind: "matchup";
    a: FocusChampion;
    b: FocusChampion;
    abilitySlot: string | null;
    abilityNameA: string | null;
    abilityNameB: string | null;
    metricLabel: string | null;
  };

export type FocusMediaInput = Pick<MasterySliceChallengeView, "presentation" | "challengeIndex">;

const url = (path: string | null | undefined): string | null => resolveQuizAssetUrl(path ?? null) ?? null;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The focus object for one Journey child, or `null`. Pure; reads presentation only. */
export function journeyFocusMediaFor(challenge: FocusMediaInput): JourneyFocusMedia | null {
  let source;
  try {
    source = scenarioSourceForMasteryChallenge(challenge as MasterySliceChallengeView);
  } catch {
    return null;
  }
  if (!source) return null;
  let sel;
  try {
    // PRE-REVEAL, ALWAYS. See the module note.
    sel = selectScenario(source, false, null);
  } catch {
    return null;
  }

  if (sel.card === "matchup") {
    const m = sel.matchup;
    if (!text(m.championA) || !text(m.championB)) return null;
    return {
      kind: "matchup",
      a: { name: m.championA, splash: url(m.championASplash), icon: championIconOf(challenge, "a") },
      b: { name: m.championB, splash: url(m.championBSplash), icon: championIconOf(challenge, "b") },
      abilitySlot: text(m.abilitySlot),
      // Drawn as a pair or not at all — the matchup card's own rule.
      abilityNameA: text(m.abilityNameA) && text(m.abilityNameB) ? m.abilityNameA! : null,
      abilityNameB: text(m.abilityNameA) && text(m.abilityNameB) ? m.abilityNameB! : null,
      metricLabel: text(m.metricLabel),
    };
  }

  if (sel.card === "combat_calculation") {
    const c = sel.combat;
    if (!text(c.champion)) return null;
    const champion: FocusChampion = {
      name: c.champion, splash: url(c.championSplash), icon: url(c.championIcon),
    };
    const abilityIcon = url(c.abilityIcon);
    if (abilityIcon) {
      return {
        kind: "ability", champion, abilityIcon,
        abilitySlot: text(c.abilitySlot), abilityName: text(c.abilityName),
        abilityRank: int(c.abilityRank),
      };
    }
    return { kind: "champion", champion, level: int(c.level), label: text(c.badge) };
  }

  if (sel.card === "item_analysis") {
    const icon = url(sel.item.icon);
    return icon && text(sel.item.name) ? { kind: "item", name: sel.item.name, icon } : null;
  }

  if (sel.card === "champion_profile" && text(sel.champion)) {
    return { kind: "champion", champion: { name: sel.champion, splash: null, icon: null }, level: null, label: null };
  }

  return null;
}

/**
 * The matchup reader carries splashes but not icons; the served subject has
 * both side icons under fixed keys. Read directly, as the same pre-reveal
 * blob — a comparison names both champions in its prompt, so neither is an
 * answer.
 */
function championIconOf(challenge: FocusMediaInput, side: "a" | "b"): string | null {
  const subject = (challenge.presentation as { assets?: { subject?: Record<string, unknown> } } | null)
    ?.assets?.subject;
  return url(text(subject?.[`champion_${side}_icon`]));
}
