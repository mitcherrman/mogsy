/**
 * RG2 — the universal quiz timeline node, as DATA.
 *
 * FILE NAME NOTE: this is `timelineNodeModel.ts`, not `quizTimelineNode.ts`,
 * because `QuizTimelineNode.tsx` sits beside it and macOS resolves the two as
 * the SAME file while Linux and the bundler do not. That divergence is the
 * exact shape of bug this repo has been bitten by before (a case-wrong asset
 * path is silently fine locally and a live 404 in production), so the two
 * names differ by more than a capital.
 *
 * One shape, fed by every mode. A Ranked round and a Daily card are different
 * objects with different lifecycles, and neither of those differences reaches
 * this type: what a node needs to draw itself is a position, a subject, a
 * difficulty, an outcome, and how much of each is actually known.
 *
 * MODE IS NOT A FIELD, ON PURPOSE
 * ───────────────────────────────
 * There is no `mode` here and no `roundNumber`/`cardSequence` pair. A node
 * whose renderer branched on which mode produced it would be two renderers
 * sharing a file. The one thing the modes genuinely differ on — how much of
 * the FUTURE each knows — is already expressible without naming them: a Ranked
 * future node simply has no `topic`, because its question has not been
 * generated; a Daily future node has one, because the plan is frozen. The
 * renderer draws what it is given.
 *
 * THREE INDEPENDENT CHANNELS
 * ──────────────────────────
 * The node design's whole claim is that a player reads three separate facts
 * off one small box, so they are three separate fields here and no one of them
 * is derived from another:
 *
 *     ┌──────────────┐
 *     │ GREEN / RED  │  <- `outcome`, only once resolved
 *     │   MAIN ICON  │  <- `topic.iconHint` or `topic.category`
 *     │   + BADGE    │  <- the badge says WHAT KIND of question it is
 *     │ bronze/silver│  <- `topic.tier`, only when authoritative
 *     └──────────────┘
 *
 * The badge exists because the main icon is deliberately AMBIGUOUS for the
 * champion-centric families. A portrait of Aatrox is the right main icon for
 * "what is Aatrox's base armour?" and for "what is the cooldown of Aatrox E?"
 * and for a scenario about Aatrox — and those are three different questions.
 * The badge is what separates them, and it is small because the champion is
 * still the thing you recognise first.
 */
import {
  asCategoryKey,
  asDifficultyTier,
  categoryArt,
  categoryIconUrl,
  categoryLabel,
  type CategoryGlyph,
  type CategoryKey,
  type DifficultyTier,
} from "@/lib/quiz/publicCategory";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";

/**
 * The backend's proven subject, verbatim (`ranked_public.review`).
 *
 * `icon` non-null means the backend verified that file on disk before freezing
 * the path — a case-wrong path is a live 404 on Linux and silently fine on
 * macOS, so this is the one claim the client must not make for itself. A
 * subject with a `key` and no `icon` is a NAMED entity whose art was not
 * proven; the name is still true and the picture falls back to the category.
 */
export interface TimelineIconHint {
  kind: string;
  key: string | null;
  icon: string | null;
}

/** What a question is about, as the wire states it. */
export interface TimelineTopic {
  category: CategoryKey;
  tier: DifficultyTier | null;
  iconHint: TimelineIconHint | null;
}

export type TimelineOutcome =
  | "correct"
  | "incorrect"
  | "both-correct"
  | "timed-out";

export type TimelineNodeState = "resolved" | "current" | "upcoming";

/**
 * A badge names the KIND of question, over the top of a subject portrait.
 *
 * `none` is the common case and is not a failure: when the main icon is the
 * category tile, the tile already says what kind of question it is, and a
 * badge on top of it would state the same fact twice.
 */
export type TimelineBadge =
  | "none"
  | "stat"
  | "combat"
  | "ability"
  | "cooldown"
  | "cost";

export interface QuizTimelineNodeModel {
  /** 1-based position. A round number in Ranked, a plan slot in a Daily. */
  ordinal: number;
  state: TimelineNodeState;
  /**
   * `null` when nothing authoritative describes this position yet — a Ranked
   * future round, or a past round played before this client connected. NOT
   * "an ordinary question": silence is its own state and draws the neutral
   * token.
   */
  topic: TimelineTopic | null;
  /**
   * The viewer's settled verdict, or `null`. `null` on an unresolved node AND
   * on a resolved one whose settlement has aged out of a bounded ledger —
   * a real state, drawn as "resolved, no stripe" rather than guessed.
   */
  outcome: TimelineOutcome | null;
}

// ──────────────────────────────────────────────────────── subject and badge

export interface ResolvedNodeArt {
  /** The main icon's URL, or undefined when a drawn glyph is used instead. */
  src?: string;
  glyph?: CategoryGlyph;
  /** True when the picture is the backend's PROVEN entity art. */
  specific: boolean;
  badge: TimelineBadge;
  /** What a screen reader is told the node is about. */
  label: string;
}

/**
 * Which badge a category earns when the main icon is an ENTITY portrait.
 *
 * Only the champion-centric categories appear: they are the ones whose main
 * icon does not state the question's kind. `itemization` is absent even though
 * its subject is an item, because an item portrait already reads as an item
 * question — the RG2 design's own rule that a badge must add a fact rather
 * than repeat one.
 */
const ENTITY_BADGE: Partial<Record<CategoryKey, TimelineBadge>> = {
  "champion-stats": "stat",
  scenarios: "combat",
  abilities: "ability",
};

/**
 * Turn one node's topic into a picture, a badge and a sentence.
 *
 * Priority, and every step is something the DATA proves:
 *
 * 1. the backend's verified entity art (`iconHint.icon`) — for a champion
 *    subject this is the portrait the design asks for, and the badge says
 *    which kind of champion question it is;
 * 2. the category tile;
 * 3. a drawn category glyph;
 * 4. the neutral token.
 *
 * Nothing here reads a prompt, and nothing builds an asset path from a name.
 * A named subject whose art the backend could not verify keeps its NAME in the
 * label and falls to its category for the picture — which is exactly the
 * unverified guess the backend refused to make, refused again here.
 */
export function resolveNodeArt(topic: TimelineTopic | null): ResolvedNodeArt {
  if (!topic) {
    return { glyph: "unknown", specific: false, badge: "none",
      label: "not yet known" };
  }
  const art = categoryArt(topic.category);
  const hint = topic.iconHint;

  if (topic.category === "meta-reflex") {
    return { glyph: "meta-reflex", specific: true, badge: "none",
      label: "Meta Reflex" };
  }
  if (hint?.icon) {
    return {
      src: resolveQuizAssetUrl(hint.icon),
      specific: true,
      badge: ENTITY_BADGE[topic.category] ?? "none",
      // The entity's own name is the truest label there is; the category is
      // what it falls back to when the backend proved art but not a name.
      label: hint.key ?? categoryLabel(topic.category),
    };
  }
  const src = categoryIconUrl(topic.category);
  return {
    src,
    glyph: src ? undefined : art.glyph ?? "unknown",
    specific: false,
    // No portrait, so nothing to disambiguate: the tile IS the kind.
    badge: "none",
    label: hint?.key && hint.kind !== "category"
      // A named entity with unproven art. Say the name — it is proven — and
      // draw the category, which is all the picture can honestly claim.
      ? hint.key
      : categoryLabel(topic.category),
  };
}

/**
 * How many metal strips a tier draws.
 *
 * THREE LEVELS, AND NEVER MORE: one bronze, two silver, three gold. That is
 * the whole visible difficulty language, and it is capped on purpose — a
 * fourth line is a fourth thing for a player to learn, on a mark that has to
 * be countable at a glance beside eight others at 36px.
 *
 * `scenario` is therefore drawn as HARD. It is a real fourth tier in the
 * backend's scheduling (the Ranked format composes a hard peak at segment 6
 * and a scenario peak at segment 10, and `PoolSpec.tier` still distinguishes
 * them), and none of that changed to make this true — what changed is only
 * that the difficulty CHANNEL stops at three. Scenario-ness is carried by the
 * question's subject where it is worth carrying: a genuine scenario resolves
 * the `scenarios` category and its crossed-swords badge.
 *
 * `null` draws NOTHING. There is no default tier and no "unknown" strip: a
 * fabricated difficulty on a question whose tier this client was never told is
 * exactly the confident-and-wrong the design forbids, and an absent strip is
 * already legible as "not stated".
 */
export const TIER_STRIPS: Record<DifficultyTier, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  scenario: 3,
};

/** The most lines the difficulty channel may ever draw. */
export const MAX_TIER_STRIPS = 3;

export function tierStripCount(tier: DifficultyTier | null): number {
  return tier ? TIER_STRIPS[tier] : 0;
}

// ────────────────────────────────────────────────────────────── the label

const STATE_LABEL: Record<TimelineNodeState, string> = {
  resolved: "resolved",
  current: "current",
  upcoming: "upcoming",
};

const OUTCOME_LABEL: Record<TimelineOutcome, string> = {
  correct: "you answered correctly",
  "both-correct": "both correct",
  incorrect: "you answered incorrectly",
  "timed-out": "you ran out of time",
};

/**
 * What the label CALLS each tier — three words, matching the three metals.
 *
 * `scenario` reads "hard" because the drawing does. The phase's rule is that
 * the accessible name carries what the drawing carries, and a label announcing
 * a fourth difficulty a sighted reader cannot see would break that in the
 * direction that is hardest to notice. The raw tier is still on the node's
 * `data-tier` attribute for anyone inspecting or testing it.
 */
const TIER_LABEL: Record<DifficultyTier, string> = {
  easy: "easy",
  medium: "medium",
  hard: "hard",
  scenario: "hard",
};

const BADGE_LABEL: Record<TimelineBadge, string> = {
  none: "",
  stat: "champion stats",
  combat: "scenario",
  ability: "abilities",
  cooldown: "cooldowns",
  cost: "costs",
};

/**
 * The whole node in one sentence, in reading order: where, what, how hard,
 * how it went.
 *
 * It names ONLY what the node knows. A node with no topic says so rather than
 * describing itself as an ordinary question, and an unresolved node reports no
 * outcome. This is also where the difficulty becomes readable: the visible
 * design is metal strips on purpose, and a strip is not a word.
 */
export function nodeLabel(
  node: QuizTimelineNodeModel,
  { unit = "Round" }: { unit?: string } = {},
): string {
  const parts = [`${unit} ${node.ordinal}`, STATE_LABEL[node.state]];
  if (!node.topic) {
    parts.push("not yet known");
  } else {
    const art = resolveNodeArt(node.topic);
    const category = categoryLabel(node.topic.category);
    // "Aatrox, abilities" rather than "Aatrox" — the portrait alone does not
    // say which kind of Aatrox question this is, and neither should the label.
    parts.push(art.specific && art.label !== category
      ? `${art.label}, ${category}` : category);
    if (node.topic.tier) parts.push(TIER_LABEL[node.topic.tier]);
    const badge = BADGE_LABEL[art.badge];
    if (badge && badge !== category.toLowerCase()) parts.push(badge);
  }
  if (node.outcome) parts.push(OUTCOME_LABEL[node.outcome]);
  return parts.join(", ");
}

// ─────────────────────────────────────────────────────────── wire reading

/**
 * Read a `topic` block off the wire, or `null`.
 *
 * Tolerant by design and for the same reason the presentation reader is: this
 * block carries no secret and no combat value, so a malformed one must degrade
 * to a neutral node rather than break a live match. An unknown category key
 * degrades to `general`, an unknown tier to `null`.
 */
export function readTimelineTopic(value: unknown): TimelineTopic | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const hint = raw.icon_hint ?? raw.iconHint;
  return {
    category: asCategoryKey(raw.category),
    tier: asDifficultyTier(raw.tier),
    iconHint: readIconHint(hint),
  };
}

function readIconHint(value: unknown): TimelineIconHint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.kind !== "string" || !raw.kind) return null;
  return {
    kind: raw.kind,
    key: typeof raw.key === "string" && raw.key ? raw.key : null,
    icon: typeof raw.icon === "string" && raw.icon ? raw.icon : null,
  };
}
