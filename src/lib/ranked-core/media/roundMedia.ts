/**
 * RFX1 Phase 2B1 — which images a Ranked round will draw, known BEFORE it is
 * drawn.
 *
 * `rankedRoundMedia(round)` walks the same public payload the arena renders
 * from, through the same pure selectors the renderer calls, and returns the
 * URLs the question surface will request. It never looks at the DOM, so it can
 * run the moment a payload is known: during round 1's server lead-in, during
 * round N's reveal (for N+1), and at the start of a Meta Reflex block (for all
 * five cards).
 *
 * THE ANTI-CHEAT RULE — PRE-REVEAL SELECTION ONLY
 *
 * A preload is a network request, and a network request is visible. So this
 * returns ONLY what the pre-reveal surface itself shows, computed exactly the
 * way the pre-reveal surface computes it:
 *
 *   * The cinematic card is `selectScenario(src, false, null)` — revealActive
 *     false, correctAnswer null — which is precisely what `HeroBand` renders
 *     before the settlement exists. Consequences:
 *       - a SPOILER subject classifies as `placeholder` and contributes
 *         nothing (its art only appears after the reveal);
 *       - the reveal-time champion UPGRADE (`deriveRevealSubject`, whose label
 *         can be the correct option) is never computed;
 *       - an item card's `missingComponent` (the build-path ANSWER, drawn only
 *         when revealed) is never read.
 *   * Every per-option image is included for ALL options or for none — the
 *     same all-or-nothing positional rule `questionViewFromPublicQuestion`
 *     applies — so no option is singled out by a request.
 *   * Meta Reflex: both sides of every card, which is what both players are
 *     shown anyway. Recognition art goes through the positional
 *     `/api/ranked/media/segment-card/…` route, whose URL names a side and
 *     never a subject.
 *   * Mastery: each challenge's band through the same `revealActive: false`
 *     path its surface hard-codes.
 *
 * Nothing here reads a settlement, `correctOptionIndex`, a private payload or
 * any answer-bearing field, and the tests pin that.
 */
import academyHall from "@/assets/ranked/academy-hall.jpg";
import itemShopkeeper from "@/assets/ranked/item-shopkeeper.png";
import spellcaster from "@/assets/ranked/Spellcaster.jpg";
import { selectScenario } from "@/components/quiz-broadcast/scenario-cards/classify";
import { flattenMediaEntityIcons } from "@/components/quiz-broadcast/scenario-cards/questionMediaEntities";
import type { ScenarioSelection } from "@/components/quiz-broadcast/scenario-cards/types";
import { ROLE_EMBLEM_SRC } from "@/components/ranked-arena/RoleEmblem";
import { getChampionSplash, type ChampionManifest } from "@/hooks/useChampionAssets";
import { resolveBandProfile } from "@/lib/question-surface/bandProfile";
import { resolveCompactDensity } from "@/lib/question-surface/compactDensity";
import { selectFamilyLayout } from "@/lib/question-surface/familyLayout";
import { JUNGLE_GRASS_BACKGROUND } from "@/lib/question-surface/jungleAtmosphere";
import { scenarioSourceForMasteryChallenge } from "@/lib/question-surface/masterySliceScenario";
import type { QuizQuestion } from "@/lib/quiz/api";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";
import type { RankedRole } from "@/lib/ranked-public/roles";
import { scenarioSourceFromPublicQuestion } from "../adapters/scenarioSource";
import { renderPathFor } from "../modules/MasterySliceChallengeSurface";

export interface RoundMedia {
  /**
   * What the question surface needs for a STABLE reveal: the band's subject
   * art, its atmosphere layer and every answer option's icon. Worth a short,
   * bounded wait before revealing.
   */
  critical: string[];
  /**
   * Drawn, but decorative: the desktop motif accent, role emblems. Requested
   * early, never waited on.
   */
  bestEffort: string[];
}

export interface RoundMediaOptions {
  /** The champion manifest, when already cached; only fallbacks need it. */
  manifest?: ChampionManifest | null;
  /**
   * Viewport width. The motif layer is `display:none` below 640px, so its
   * CSS background is never fetched there and must not be preloaded either.
   */
  viewportWidth?: number;
}

/**
 * Motif → the CSS background images `QuestionMotifLayer` paints
 * (`src/index.css`, `.question-motif-layer[data-motif-art=…]`). A test asserts
 * every path here still appears in the stylesheet.
 */
export const MOTIF_ART_URLS: Readonly<Record<string, readonly string[]>> = {
  // RFX1 2B2 — the 704w WebP `index.css` now paints (139 KB, was 1.2 MB).
  champion_studies: ["/assets/ranked/question-accents/champ-combat-704w.webp"],
  combat_workings: ["/assets/ranked/question-accents/champ-combat-704w.webp"],
  rift_field_guide: [
    "/assets/ranked/question-accents/minion.png",
    "/assets/ranked/question-accents/tower.png",
    "/assets/ranked/question-accents/rift-vines-top.svg",
  ],
  items_economy: ["/assets/ranked/question-accents/amptome.png"],
  runes_summoner_arts: ["/assets/ranked/question-accents/electrocute.png"],
};

/** Below this width the motif layer is not displayed (index.css). */
const MOTIF_MIN_VIEWPORT = 640;

class UrlSet {
  private readonly seen = new Set<string>();
  readonly list: string[] = [];
  add(url: string | null | undefined) {
    if (!url || this.seen.has(url)) return;
    this.seen.add(url);
    this.list.push(url);
  }
}

/**
 * The cinematic card's URLs for a PRE-REVEAL selection. Mirrors the card
 * components one for one; see the module note for what is deliberately absent.
 */
function cinematicUrls(
  sel: ScenarioSelection, manifest: ChampionManifest | null | undefined, out: UrlSet,
): void {
  switch (sel.card) {
    case "combat_calculation": {
      const c = sel.combat;
      out.add(c.championSplash || getChampionSplash(manifest, c.champion));
      out.add(c.abilityIcon);
      for (const item of c.itemIcons) out.add(item.icon);
      for (const e of flattenMediaEntityIcons(c.entities)) out.add(e.icon);
      return;
    }
    case "matchup": {
      const m = sel.matchup;
      out.add(m.championASplash || getChampionSplash(manifest, m.championA));
      out.add(m.championBSplash || getChampionSplash(manifest, m.championB));
      out.add(m.abilityIcon);
      return;
    }
    case "summoner_spell": {
      out.add(spellcaster);
      out.add(sel.spell.spellIcon);
      for (const s of sel.spell.sources ?? []) out.add(s.icon);
      return;
    }
    case "item_analysis": {
      const item = sel.item;
      out.add(item.icon);
      // `missingComponent` is the build-path ANSWER and is only drawn after
      // the reveal: never read here.
      if (item.knownComponents.length > 0) {
        for (const k of item.knownComponents) out.add(k.icon);
      } else {
        out.add(itemShopkeeper);
      }
      return;
    }
    case "environment": {
      out.add(sel.environment.icon);
      out.add(sel.environment.kind === "jungle_pet" ? JUNGLE_GRASS_BACKGROUND : academyHall);
      return;
    }
    case "champion_profile":
      out.add(getChampionSplash(manifest, sel.champion));
      return;
    case "collectible":
      out.add(sel.iconUrl);
      return;
    case "placeholder":
    case "empty":
      return;
  }
}

/** The quiz/mastery band: family, compact or cinematic, as the surface picks. */
function bandUrls(
  src: QuizQuestion | null, category: string | null | undefined,
  manifest: ChampionManifest | null | undefined, out: UrlSet,
): void {
  const family = selectFamilyLayout(src);
  const profile = resolveBandProfile(src, "band", family);
  if (profile === "family" && family) {
    if (family.kind === "combat") {
      out.add(family.attacker.icon);
      out.add(family.target.icon);
      out.add(family.ability?.icon);
      out.add(family.targetItems[0]?.icon);
    } else {
      for (const g of family.groups) for (const e of g.entries) out.add(e.item.icon);
      out.add(family.champion?.icon);
    }
    return;
  }
  if (profile === "compact") {
    const density = resolveCompactDensity(category);
    if (density === "context") out.add(academyHall);
    else if (density === "jungle") out.add(JUNGLE_GRASS_BACKGROUND);
    return;
  }
  if (profile === "cinematic" && src) {
    cinematicUrls(selectScenario(src, false, null), manifest, out);
  }
}

function decorativeUrls(
  motif: string | null | undefined, roles: readonly RankedRole[] | null | undefined,
  viewportWidth: number | undefined, out: UrlSet,
): void {
  const wide = viewportWidth === undefined || viewportWidth >= MOTIF_MIN_VIEWPORT;
  if (motif && wide) for (const u of MOTIF_ART_URLS[motif] ?? []) out.add(u);
  for (const r of roles ?? []) out.add(ROLE_EMBLEM_SRC[r]);
}

/**
 * The images the question surface will draw for `round`, pre-reveal.
 *
 * Covers every Ranked module the arena renders:
 *   * `quiz` — band (family / compact / cinematic) + option icons + motif;
 *   * Meta Reflex (`meta_reflex` block) — both sides of ALL five cards;
 *   * legacy Item Cost Duel (`item_cost` block) — both sides of every challenge;
 *   * Mastery slice (`mastery_slice` block) — every challenge's band + motif.
 */
export function rankedRoundMedia(
  round: PublicRoundView | null | undefined, opts: RoundMediaOptions = {},
): RoundMedia {
  const critical = new UrlSet();
  const bestEffort = new UrlSet();
  if (!round) return { critical: [], bestEffort: [] };
  const { manifest, viewportWidth } = opts;

  const block = round.segmentState?.block ?? null;
  if (block?.contract === "meta_reflex") {
    for (const card of block.cards) {
      if (card.kind === "recognition") {
        critical.add(resolveQuizAssetUrl(card.left.mediaUrl));
        critical.add(resolveQuizAssetUrl(card.right.mediaUrl));
      } else {
        critical.add(resolveQuizAssetUrl(card.left.media));
        critical.add(resolveQuizAssetUrl(card.right.media));
      }
    }
  } else if (block?.contract === "item_cost") {
    for (const ch of block.challenges) {
      critical.add(resolveQuizAssetUrl(ch.left.assetPath));
      critical.add(resolveQuizAssetUrl(ch.right.assetPath));
    }
  } else if (block?.contract === "mastery_slice") {
    for (const ch of block.challenges) {
      if (renderPathFor(ch) === "prose") {
        // Prose renders through the arena surface with no scenario source:
        // the compact band for its family.
        bandUrls(null, ch.questionFamily, manifest, critical);
      } else {
        // Structural renders `ScenarioMediaBand` with revealActive=false and
        // correctAnswer=null hard-coded, only when a source exists.
        const src = scenarioSourceForMasteryChallenge(ch);
        if (src) cinematicUrls(selectScenario(src, false, null), manifest, critical);
      }
      decorativeUrls(ch.motif ?? null, ch.roles ?? null, viewportWidth, bestEffort);
    }
  } else if (round.question) {
    const q = round.question;
    bandUrls(scenarioSourceFromPublicQuestion(q), q.category, manifest, critical);
    // All-or-nothing, positionally — the same rule the renderer applies.
    const media = q.optionMedia;
    if (Array.isArray(media) && media.length === q.options.length) {
      for (const m of media) critical.add(resolveQuizAssetUrl(m?.icon));
    }
    decorativeUrls(q.topic?.motif ?? null, q.topic?.roles ?? null, viewportWidth, bestEffort);
  }

  const crit = critical.list;
  return { critical: crit, bestEffort: bestEffort.list.filter((u) => !crit.includes(u)) };
}

/** A stable identity for "this round's content", for effect dependencies. */
export function roundMediaKey(round: PublicRoundView | null | undefined): string | null {
  if (!round) return null;
  const n = round.activeRound?.roundNumber ?? round.segmentState?.segmentNumber ?? null;
  return n === null ? null : `${round.matchId}:${n}:${round.question?.questionId ?? round.segment?.moduleId ?? ""}`;
}
