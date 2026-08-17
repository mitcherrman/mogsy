/**
 * The three focused base-stat modes: Base HP / Base AD / Base Armor Duel.
 *
 * WHAT THESE PIN, AND WHY EACH ONE IS LOAD-BEARING
 * ───────────────────────────────────────────────
 * The modes are presentation-only identities over a storage model that did not
 * change: they route and render as three games, and they RECORD as one game
 * (`higher-base-stat`) discriminated by `variant`. That split is efficient but
 * it has exactly two ways to go wrong, and both are silent:
 *
 *   * write the ROUTE slug to Supabase — the vote RPC raises `unknown league
 *     swipe game` and every vote is lost, while the game itself keeps playing;
 *   * resolve the wrong CATEGORY — the round is judged against a pool it was
 *     not drawn from, or judged as nothing at all.
 *
 * Neither surfaces as a crash, so they are pinned here rather than left to
 * manual play. The third property — that a tie is never dealt — is pinned
 * because a tie is precisely the round the canonical verifier refuses to judge,
 * which means dealing one costs the player a round that cannot score.
 */
import { describe, expect, it } from "vitest";
import {
  LEAGUE_SWIPE_GAMES,
  VISIBLE_LEAGUE_SWIPE_GAMES,
  getSwipeGame,
  makeFactualMatchup,
  modeForStoredRow,
  recordSlugFor,
  type FactualEntity,
} from "./api";
import {
  FOCUSED_STAT_GAMES,
  UNVERIFIABLE_STAT_VARIANTS,
  resolveFactualCategory,
} from "./factualCategories";

const FOCUSED = ["base-hp-duel", "base-ad-duel", "base-armor-duel"] as const;

const EXPECTED_CATEGORY: Record<string, string> = {
  "base-hp-duel": "champion-hp-duel",
  "base-ad-duel": "champion-ad-duel",
  "base-armor-duel": "champion-armor-duel",
};

const entity = (id: string, value: number): FactualEntity => ({
  id,
  label: id,
  value,
  asset_path: null,
});

describe("focused base-stat modes — registry", () => {
  it("exposes all three as playable knowledge games on the hub", () => {
    for (const slug of FOCUSED) {
      const game = getSwipeGame(slug);
      expect(game, slug).toBeDefined();
      expect(game!.mode).toBe("knowledge");
      expect(game!.entityType).toBe("champion");
      expect(game!.hiddenFromHub).toBeUndefined();
      expect(VISIBLE_LEAGUE_SWIPE_GAMES.map((g) => g.slug)).toContain(slug);
    }
  });

  it("names them the way the product does", () => {
    expect(getSwipeGame("base-hp-duel")!.title).toBe("Base HP Duel");
    expect(getSwipeGame("base-ad-duel")!.title).toBe("Base AD Duel");
    expect(getSwipeGame("base-armor-duel")!.title).toBe("Base Armor Duel");
  });

  it("records every focused mode under the existing Supabase game, not its route slug", () => {
    // The whole point of the storage decision. A route slug reaching the RPC
    // raises `unknown league swipe game` and silently drops the vote.
    for (const slug of FOCUSED) {
      expect(recordSlugFor(getSwipeGame(slug)!), slug).toBe("higher-base-stat");
    }
    // Modes that ARE their own Supabase game must keep writing under themselves.
    expect(recordSlugFor(getSwipeGame("item-cost-duel")!)).toBe("item-cost-duel");
    expect(recordSlugFor(getSwipeGame("favorite-champion")!)).toBe("favorite-champion");
  });

  it("keeps the mixed Stat Duel routable but off the hub", () => {
    const mixed = getSwipeGame("higher-base-stat");
    expect(mixed).toBeDefined();
    expect(mixed!.hiddenFromHub).toBe(true);
    expect(VISIBLE_LEAGUE_SWIPE_GAMES.map((g) => g.slug)).not.toContain("higher-base-stat");
  });

  it("declares no focused mode for a stat with no canonical evaluator", () => {
    // Base MR has no backend category (it ties on 39.2% of champion pairs), so
    // a focused mode for it could only ever deal unscoreable rounds.
    const variants = Object.values(FOCUSED_STAT_GAMES);
    for (const unverifiable of Object.keys(UNVERIFIABLE_STAT_VARIANTS)) {
      expect(variants, unverifiable).not.toContain(unverifiable);
    }
    expect(LEAGUE_SWIPE_GAMES.map((g) => g.statVariant)).not.toContain("magic_resist");
  });

  it("gives every focused mode a canonical category, and only stats it can deal", () => {
    for (const slug of FOCUSED) {
      const game = getSwipeGame(slug)!;
      expect(game.factualCategory, slug).toBe(EXPECTED_CATEGORY[slug]);
      expect(game.statVariant, slug).toBe(FOCUSED_STAT_GAMES[slug]);
    }
  });
});

describe("focused base-stat modes — category resolution", () => {
  it("resolves each mode to its own canonical category", () => {
    for (const slug of FOCUSED) {
      expect(resolveFactualCategory(slug, FOCUSED_STAT_GAMES[slug]), slug).toBe(
        EXPECTED_CATEGORY[slug],
      );
    }
  });

  it("resolves a mode with no variant supplied to its own stat", () => {
    // The mode IS the stat, so it does not need to be told which one.
    expect(resolveFactualCategory("base-hp-duel", null)).toBe("champion-hp-duel");
    expect(resolveFactualCategory("base-armor-duel")).toBe("champion-armor-duel");
  });

  it("refuses to judge a focused round whose variant is not the mode's stat", () => {
    // A Base HP Duel round carrying `armor` is a bug upstream; judging it
    // against the HP pool would score the player on a question they were never
    // asked. Unjudged is the honest outcome.
    expect(resolveFactualCategory("base-hp-duel", "armor")).toBeNull();
    expect(resolveFactualCategory("base-ad-duel", "hp")).toBeNull();
  });

  it("never lets base MR reach a verifier through a focused mode", () => {
    for (const slug of FOCUSED) {
      expect(resolveFactualCategory(slug, "magic_resist"), slug).toBeNull();
    }
    // …nor through the mode it was historically dealt by.
    expect(resolveFactualCategory("higher-base-stat", "magic_resist")).toBeNull();
  });

  it("leaves stored rows recorded under higher-base-stat resolving exactly as before", () => {
    // Derive-on-read passes the SUPABASE slug, not the mode slug. Both paths
    // must land on the same category or a player's history flips its verdicts.
    for (const slug of FOCUSED) {
      const variant = FOCUSED_STAT_GAMES[slug];
      expect(resolveFactualCategory("higher-base-stat", variant), variant).toBe(
        resolveFactualCategory(slug, variant),
      );
    }
  });
});

describe("focused base-stat modes — reading stored rows back", () => {
  it("attributes a stored row to the mode that was played, not the row it landed in", () => {
    expect(modeForStoredRow("higher-base-stat", "hp")?.slug).toBe("base-hp-duel");
    expect(modeForStoredRow("higher-base-stat", "ad")?.slug).toBe("base-ad-duel");
    expect(modeForStoredRow("higher-base-stat", "armor")?.slug).toBe("base-armor-duel");
  });

  it("falls back to the recording game for variants no focused mode owns", () => {
    // Rows written by the mixed mode before the focused ones existed.
    expect(modeForStoredRow("higher-base-stat", "move_speed")?.slug).toBe("higher-base-stat");
    expect(modeForStoredRow("higher-base-stat", "magic_resist")?.slug).toBe("higher-base-stat");
    expect(modeForStoredRow("item-cost-duel", "cost")?.slug).toBe("item-cost-duel");
  });
});

describe("focused base-stat modes — the shared matchup builder", () => {
  it("never deals a tie", () => {
    // A pool where most pairs tie. Every dealt matchup must still be answerable.
    const pool = [
      entity("A", 600), entity("B", 600), entity("C", 600),
      entity("D", 600), entity("E", 650),
    ];
    for (let i = 0; i < 300; i++) {
      const m = makeFactualMatchup(pool, {
        prompt: "p", unit: " HP", variant: "hp", statLabel: "base health",
      });
      if (m === null) continue;          // exhausted retries; never a tied deal
      expect(m.left.value).not.toBe(m.right.value);
      expect(m.correctId).toBeDefined();
    }
  });

  it("declines rather than dealing an unanswerable pair when every pair ties", () => {
    // Refusing is the contract: a null matchup keeps the loop honest, whereas a
    // tied one would put a question on screen the verifier is bound to refuse.
    const allTied = [entity("A", 600), entity("B", 600), entity("C", 600)];
    expect(
      makeFactualMatchup(allTied, {
        prompt: "p", unit: " HP", variant: "hp", statLabel: "base health",
      }),
    ).toBeNull();
  });

  it("declines a pool too small to form a pair", () => {
    expect(makeFactualMatchup([], { prompt: "p", unit: "", variant: "hp", statLabel: "hp" })).toBeNull();
    expect(
      makeFactualMatchup([entity("A", 1)], { prompt: "p", unit: "", variant: "hp", statLabel: "hp" }),
    ).toBeNull();
  });

  it("marks the higher value correct and tags the round with the mode's stat", () => {
    const m = makeFactualMatchup([entity("Sion", 700), entity("Ahri", 590)], {
      prompt: "Which champion has more base health?",
      unit: " HP",
      variant: "hp",
      statLabel: "base health",
    })!;
    expect(m.correctId).toBe("Sion");
    // `context.stat` is what the vote RPC stores as the matchup variant and what
    // the resolver cross-checks — it must be the backend stat key.
    expect(m.context).toMatchObject({ stat: "hp" });
    expect(m.prompt).toBe("Which champion has more base health?");
    expect(m.valueUnit).toBe(" HP");
    expect(m.explanation).toContain("700");
    expect(m.explanation).toContain("590");
  });

  it("deals only the stat it was given, whatever else the pool could compare", () => {
    // The pool IS one stat — the mode cannot mix, because there is nothing else
    // in the entities to mix with. This is the structural reason a focused mode
    // cannot leak a second stat the way the mixed builder could.
    for (const [variant, label] of [["ad", "base attack damage"], ["armor", "base armor"]]) {
      for (let i = 0; i < 50; i++) {
        const m = makeFactualMatchup([entity("A", 60), entity("B", 55), entity("C", 70)], {
          prompt: "p", unit: " AD", variant, statLabel: label,
        })!;
        expect(m.context?.stat, variant).toBe(variant);
      }
    }
  });
});
