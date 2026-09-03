/**
 * Featured graphs — the answer to "what is there to look at?".
 *
 * An empty query builder is not content. These cards are the entry points
 * that make the surface worth opening: each one is a complete, valid selection
 * (focus + counterpart + mode + metric + scope) that lands on a real graph.
 *
 * Rules this list follows, and must keep following:
 *
 * - **Questions, never conclusions.** A card asks "Who defined Azir in pro
 *   play?"; it does not assert who. The graph is the only thing allowed to
 *   claim a fact, and a card written as a conclusion would go stale silently
 *   the next time the data moved.
 * - **Every value is canonical and verified.** Entity ids come from the
 *   discovery endpoints and scope values from `/api/graph1/scope-values` —
 *   `league: "LCK"` matches nothing, `"LoL Champions Korea"` matches.
 * - **Major-pro leads, broader pro is present.** Mogzy covers far more than
 *   the four major regions, and the last two cards exist so a reader can see
 *   that. They are not filler: dropping them would misrepresent the corpus.
 * - **No internal policy names.** `major: true` is the public spelling of the
 *   highlight; the words behind it never appear here or on screen.
 */
import type {
  Graph1CompareKind,
  Graph1FocusKind,
  Graph1MetricChoice,
  Graph1Mode,
} from "./builder";
import type { Graph1Scope } from "./scope";

export interface Graph1FeaturedCard {
  id: string;
  focus: Graph1FocusKind;
  compare: Graph1CompareKind;
  /** Canonical entity id: an lp_page, a team_key or a champion slug. */
  entityId: string;
  /** Display name for the card; the payload's own name wins once loaded. */
  entityLabel: string;
  mode: Graph1Mode;
  metric: Graph1MetricChoice;
  scope: Graph1Scope;
  title: string;
  /** Friendly name for the card's scope, e.g. "Worlds" for the canonical
   * "World Championship". Display only — `scope` carries the exact value. */
  scopeLabel?: string;
  /** One line on why this is worth opening. Never a claim about the result. */
  hook: string;
}

/**
 * The selection a focus kind lands on when nothing else says otherwise.
 *
 * This is default CONFIGURATION, not a product limitation: the builder can
 * reach every graphable entity, and these are simply the first thing a reader
 * sees. Derived from the featured list so a default can never name an entity
 * no card was verified against.
 */
export function defaultCardFor(
  focus: Graph1FocusKind,
  compare?: Graph1CompareKind,
): Graph1FeaturedCard | undefined {
  return FEATURED_GRAPHS.find(
    (c) =>
      c.focus === focus &&
      (compare === undefined || c.compare === compare) &&
      !c.scope.league &&
      !c.scope.major,
  );
}

/** Canonical league identities, named once so a typo cannot hide in a card. */
const WORLDS = "World Championship";
const MSI = "Mid-Season Invitational";
const LCK = "LoL Champions Korea";

const ALL: Graph1Scope = { major: false };

export const FEATURED_GRAPHS: Graph1FeaturedCard[] = [
  {
    id: "faker-champions",
    focus: "player",
    compare: "champions",
    entityId: "Faker",
    entityLabel: "Faker",
    mode: "picks",
    metric: "games",
    scope: ALL,
    title: "Faker's champion pool over time",
    hook: "Thirteen years of one career, drawn as a race.",
  },
  {
    id: "azir-players",
    focus: "champion",
    compare: "players",
    entityId: "azir",
    entityLabel: "Azir",
    mode: "picks",
    metric: "games",
    scope: ALL,
    title: "Who defined Azir in pro play?",
    hook: "Watch the mid laners trade the throne, game by game.",
  },
  {
    id: "t1-champions",
    focus: "team",
    compare: "champions",
    entityId: "T1",
    entityLabel: "T1",
    mode: "picks",
    metric: "games",
    scope: ALL,
    title: "T1's champion pool",
    hook: "Every champion the org has drafted since the rebrand.",
  },
  {
    id: "kaisa-teams",
    focus: "champion",
    compare: "teams",
    entityId: "kaisa",
    entityLabel: "Kai'Sa",
    mode: "picks",
    metric: "games",
    scope: ALL,
    title: "Which teams pick Kai'Sa most?",
    hook: "Whose champion is she, at org level?",
  },
  {
    id: "nautilus-bans",
    focus: "champion",
    compare: "teams",
    entityId: "nautilus",
    entityLabel: "Nautilus",
    mode: "bans",
    metric: "bans",
    scope: ALL,
    title: "Most-banned Nautilus teams",
    hook: "A million ban rows, and this is what they were afraid of.",
  },
  {
    id: "faker-worlds",
    focus: "player",
    compare: "champions",
    entityId: "Faker",
    entityLabel: "Faker",
    mode: "picks",
    metric: "games",
    scope: { major: false, league: WORLDS },
    scopeLabel: "Worlds",
    title: "Faker at Worlds",
    hook: "The same career, narrowed to the games everyone watched.",
  },
  {
    id: "azir-lck",
    focus: "champion",
    compare: "players",
    entityId: "azir",
    entityLabel: "Azir",
    mode: "picks",
    metric: "games",
    scope: { major: false, league: LCK },
    scopeLabel: "LCK",
    title: "Azir players in the LCK",
    hook: "One league, one champion — a different top ten.",
  },
  {
    id: "t1-msi",
    focus: "team",
    compare: "champions",
    entityId: "T1",
    entityLabel: "T1",
    mode: "picks",
    metric: "games",
    scope: { major: false, league: MSI },
    scopeLabel: "MSI",
    title: "T1 at MSI",
    hook: "What the org drafts when the stage is international.",
  },
  {
    id: "kaisa-major-teams",
    focus: "champion",
    compare: "teams",
    entityId: "kaisa",
    entityLabel: "Kai'Sa",
    mode: "picks",
    metric: "games",
    scope: { major: true },
    title: "Kai'Sa in major pro play",
    hook: "The major leagues and international events only.",
  },
  {
    id: "chovy-winrate",
    focus: "player",
    compare: "champions",
    entityId: "Chovy",
    entityLabel: "Chovy",
    mode: "picks",
    metric: "winrate",
    scope: { major: false, league: LCK },
    scopeLabel: "LCK",
    title: "Chovy's champions, ranked by win rate",
    hook: "A ratio rises and falls, so it ranks rather than races.",
  },
  // --- Broader professional play. Deliberately kept: Mogzy's corpus is not
  // four regions, and a featured surface that showed only majors would say
  // otherwise.
  {
    id: "gam-champions",
    focus: "team",
    compare: "champions",
    entityId: "GAM Esports",
    entityLabel: "GAM Esports",
    mode: "picks",
    metric: "games",
    scope: ALL,
    title: "GAM Esports' champion pool",
    hook: "Vietnam's most-decorated org, on the same footing as the majors.",
  },
  {
    id: "anubis-champions",
    focus: "team",
    compare: "champions",
    entityId: "Anubis Gaming",
    entityLabel: "Anubis Gaming",
    mode: "picks",
    metric: "games",
    scope: ALL,
    title: "Anubis Gaming's champion pool",
    hook: "Pro play well outside the majors — and still fully graphable.",
  },
];
