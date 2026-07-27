import { describe, expect, it } from "vitest";
import {
  DEFAULT_STAT_CHECK_IDENTITIES,
  damageIdentityHeader,
  statCheckIdentities,
} from "./damageIdentity";
import { damageRevealPlan } from "./damageReveal";
import { calculateRoundDamage, type CategoryResult, type Side } from "./statCheckEngine";

function lane(winner: Side | "tie", decisive: boolean): CategoryResult {
  return { winner, decisive } as CategoryResult;
}

function round(results: CategoryResult[]) {
  return { results, damage: calculateRoundDamage(results) };
}

/** Player takes the board; the bot still counters from a decisive lane 3. */
const TWO_WAY = round([lane("player", true), lane("player", false), lane("bot", true)]);
/** Bot takes the board outright, nothing back. */
const BOT_BOARD_WIN = round([lane("bot", true), lane("bot", false), lane("bot", false)]);
const PLAIN_BOARD_WIN = round([lane("player", false), lane("player", false), lane("bot", false)]);

const BOT_PLAY = DEFAULT_STAT_CHECK_IDENTITIES;
const MULTIPLAYER = statCheckIdentities({
  player: { name: "mogsyfan", avatarUrl: "https://cdn.example/avatars/mogsyfan.png" },
  bot: { name: "Faker2010", avatarUrl: "https://cdn.example/avatars/faker2010.png" },
});

describe("identity resolution", () => {
  it("defaults bot play to You and Bot with no avatar source invented", () => {
    expect(BOT_PLAY.player).toEqual({ name: "You", avatarUrl: null });
    expect(BOT_PLAY.bot).toEqual({ name: "Bot", avatarUrl: null });
  });

  it("takes real display names and avatars when the room supplies them", () => {
    expect(MULTIPLAYER.bot.name).toBe("Faker2010");
    expect(MULTIPLAYER.bot.avatarUrl).toBe("https://cdn.example/avatars/faker2010.png");
  });

  it("falls back rather than rendering an empty header", () => {
    // A reconnect mid-handshake, or a fixture with no seat data yet.
    const partial = statCheckIdentities({ player: { name: "   " }, bot: null });
    expect(partial.player.name).toBe("You");
    expect(partial.bot.name).toBe("Bot");
    expect(partial.player.avatarUrl).toBeNull();
  });

  it("treats a missing avatar as null so the shared fallback glyph renders", () => {
    const named = statCheckIdentities({ bot: { name: "Faker2010" } });
    expect(named.bot).toEqual({ name: "Faker2010", avatarUrl: null });
  });
});

describe("damage header identity", () => {
  it("names the bot as the round winner in bot play", () => {
    const step = damageRevealPlan(BOT_BOARD_WIN.damage, BOT_BOARD_WIN.results)[0];
    expect(damageIdentityHeader(step, BOT_PLAY)).toEqual({
      label: "WINNER",
      side: "bot",
      name: "Bot",
      avatarUrl: null,
    });
  });

  it("names the actual username and avatar in multiplayer", () => {
    const step = damageRevealPlan(BOT_BOARD_WIN.damage, BOT_BOARD_WIN.results)[0];
    expect(damageIdentityHeader(step, MULTIPLAYER)).toEqual({
      label: "WINNER",
      side: "bot",
      name: "Faker2010",
      avatarUrl: "https://cdn.example/avatars/faker2010.png",
    });
  });

  it("names the local player as the round winner when they win the board", () => {
    const step = damageRevealPlan(PLAIN_BOARD_WIN.damage, PLAIN_BOARD_WIN.results)[0];
    const header = damageIdentityHeader(step, MULTIPLAYER);
    expect(header.label).toBe("WINNER");
    expect(header.name).toBe("mogsyfan");
  });

  it("heads a retaliation COUNTER, never WINNER", () => {
    const [winner, counter] = damageRevealPlan(TWO_WAY.damage, TWO_WAY.results);
    expect(damageIdentityHeader(winner, MULTIPLAYER).label).toBe("WINNER");
    const counterHeader = damageIdentityHeader(counter, MULTIPLAYER);
    expect(counterHeader.label).toBe("COUNTER");
    expect(counterHeader.side).toBe("bot");
    expect(counterHeader.name).toBe("Faker2010");
  });

  it("heads both sides of a tied board COUNTER, so neither claims the round", () => {
    const tied = round([lane("player", true), lane("bot", true), lane("tie", false)]);
    const plan = damageRevealPlan(tied.damage, tied.results);
    expect(plan.map((step) => damageIdentityHeader(step, MULTIPLAYER).label)).toEqual(["COUNTER", "COUNTER"]);
  });

  it("gives a zero-damage side no presentation to head at all", () => {
    // The loser of a plain board win deals nothing, so there is no step and
    // therefore no identity shown for them.
    const plan = damageRevealPlan(PLAIN_BOARD_WIN.damage, PLAIN_BOARD_WIN.results);
    expect(plan).toHaveLength(1);
    expect(plan.map((step) => step.side)).not.toContain("bot");
  });
});
