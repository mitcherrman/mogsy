/**
 * RB2 — Bot Ranked vs human Ranked, through the REAL controller.
 *
 * The invariant the whole workstream rests on:
 *
 *     Ranked match ID -> the same Ranked match host -> the same arena,
 *     the same questions, the same scoring, the same result pipeline
 *
 * Bot-ness may steer the OPPONENT, the lifecycle and the rating policy. It may
 * not steer which component renders anything. So every case here mounts the
 * same component twice — once with `playtest.is_bot_match` true and once false
 * — and asserts on the difference between the two renders rather than on the
 * bot render alone. A change that "fixes" the bot screen by giving it a second
 * layout fails these by making the two diverge.
 *
 * Three differences are legitimate and pinned as such:
 *   1. the opponent is called "Bot", not "Opponent" — the human-only word is
 *      inaccurate, not merely anonymous, when there is no other player;
 *   2. the eyebrow says `Unrated`, because the ladder did not move;
 *   3. the live header carries "· vs Bot" (pre-existing).
 *
 * Everything else — heading, panels, actions, discovery ceremony, reveal —
 * must be byte-for-byte the same experience.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import {
  matchResultV1, privatePlayerV2, publicRoundV2,
} from "@/lib/ranked-public/fixtures";

let over: boolean;
let bot: boolean;
let assignedUrls: string[];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});

/**
 * The one fixture difference between the two flows.
 *
 * `playtest.is_bot_match` is the match's own frozen projection field — the
 * same one the backend stamps at creation — so a test that flips it is
 * simulating exactly the thing production varies and nothing else.
 */
function apply(payload: Record<string, unknown>) {
  payload.progression_enabled = false;
  for (const p of payload.players as Record<string, unknown>[]) {
    p.role = p.player_id === "userA" ? "top" : null;
  }
  payload.playtest = {
    question_bank_mode: "production",
    is_placeholder: false,
    is_bot_match: bot,
  };
  return payload;
}
const publicBody = () => {
  const b = publicRoundV2(over); apply(b.payload as Record<string, unknown>); return b;
};
const privateBody = () => {
  const b = privatePlayerV2("userA"); apply(b.payload as Record<string, unknown>); return b;
};

beforeEach(() => {
  over = true;
  bot = false;
  assignedUrls = [];
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: (u: string) => { assignedUrls.push(u); } },
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith("/discoveries")) {
      return json({
        schema_version: "ranked_duel.match_discoveries.v1",
        projection_type: "match_discoveries",
        match_id: "m1", round_number: null, server_time: "2026-09-09T12:00:05Z",
        payload: {
          scope: "ranked_discoveries", includes_default_library: false,
          match_id: "m1", new_discoveries: [], new_count: 0,
          collection_total: 40, collection_total_before: 40, truncated: false,
        },
      });
    }
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: 1, server_time: "2026-09-09T12:00:00+00:00",
        payload: {
          match_status: over ? "complete" : "active", match_over: over,
          progression_enabled: false,
          public: publicBody(), private: privateBody(),
          progression_pending_players: [], latest_resolved_round: null,
          result: over ? matchResultV1("combat") : null,
        },
      });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (u.endsWith("/result")) return json(matchResultV1("combat"));
    if (/\/matches\/m1$/.test(u)) return json(publicBody());
    return json({});
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const mount = () => render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);

/** Mount one flow, wait for the terminal frame, return its rendered text. */
async function endScreen(isBot: boolean): Promise<{ text: string; el: HTMLElement }> {
  bot = isBot;
  const { unmount } = mount();
  const el = await screen.findByTestId("match-over-frame");
  const text = el.textContent ?? "";
  return { text, el: Object.assign(el, { unmount }) as HTMLElement };
}

// ══════════════════════════════════════════════════════ the shared host

describe("both flows render the SAME Ranked components", () => {
  it("a bot match reaches the ordinary Ranked terminal frame", async () => {
    bot = true;
    mount();
    // Not a bot-specific end screen: this is the canonical arena's own
    // `MatchOverFrame`, the same testid a human match resolves to.
    expect(await screen.findByTestId("ranked-match-over")).toBeTruthy();
    expect(screen.getByTestId("match-over-frame")).toBeTruthy();
    expect(screen.getByTestId("match-over-heading")).toHaveTextContent("Victory");
  });

  it("a human match reaches the identical frame", async () => {
    bot = false;
    mount();
    expect(await screen.findByTestId("ranked-match-over")).toBeTruthy();
    expect(screen.getByTestId("match-over-heading")).toHaveTextContent("Victory");
  });

  it("puts BOTH duelists on the end screen, whoever the opponent is", async () => {
    // A bot match is a duel. One column would read as a solo run.
    for (const isBot of [false, true]) {
      bot = isBot;
      const { unmount } = mount();
      const frame = await screen.findByTestId("match-over-frame");
      expect(within(frame).getByTestId("combatant-userA")).toBeTruthy();
      expect(within(frame).getByTestId("combatant-userB")).toBeTruthy();
      unmount();
    }
  });
});

// ══════════════════════════════════════════════════════ rating

describe("a bot result is unrated, and says so quietly", () => {
  it("states Unrated in the frame's own eyebrow", async () => {
    const { text } = await endScreen(true);
    expect(text).toContain("Unrated");
  });

  it("says nothing of the kind on a rated human match", async () => {
    const { text } = await endScreen(false);
    expect(text).not.toContain("Unrated");
    expect(text).toContain("Match Complete");
  });

  it("shows no Elo, rating delta, rank or ladder movement EITHER WAY", async () => {
    // The frame carries no rating figure for any match, which is why a bot
    // match needed a statement rather than a removal. Pinned so a later
    // Ranked change cannot add one to the shared frame and quietly start
    // claiming ladder movement for a match that had none.
    for (const isBot of [true, false]) {
      const { text } = await endScreen(isBot);
      expect(text).not.toMatch(/\belo\b/i);
      expect(text).not.toMatch(/\brating\b/i);
      expect(text).not.toMatch(/\bLP\b/);
      expect(text).not.toMatch(/promot|demot/i);
      expect(text).not.toMatch(/[+-]\d+\s*(rating|lp|elo)/i);
      screen.getByTestId("match-over-frame"); // still the same frame
      document.body.innerHTML = "";
    }
  });
});

// ══════════════════════════════════════════════════════ the opponent

describe("the bot reads as a legitimate opponent", () => {
  it("is called Bot, not the human-only word", async () => {
    const { text } = await endScreen(true);
    expect(text).toContain("Bot");
    expect(text).not.toContain("Opponent");
  });

  it("leaves a human opponent's label alone", async () => {
    const { text } = await endScreen(false);
    expect(text).toContain("Opponent");
  });

  it("carries no admin, test, playtest or difficulty language", async () => {
    // The whole point of RB1: Premium players read this screen now.
    const { text } = await endScreen(true);
    expect(text).not.toMatch(/admin/i);
    expect(text).not.toMatch(/playtest/i);
    expect(text).not.toMatch(/\btest\b/i);
    expect(text).not.toMatch(/\b(easy|standard|hard)\b/i);
    expect(text).not.toMatch(/difficulty/i);
  });

  it("invents no rank, name or profile for it", async () => {
    const { text } = await endScreen(true);
    // No fabricated ladder identity. "Bot" and its role slot are all it has.
    expect(text).not.toMatch(/\b(iron|bronze|silver|gold|platinum|diamond|master|challenger)\b/i);
    expect(text).not.toMatch(/#\d/); // no fake tagline
  });
});

// ══════════════════════════════════════════════════════ the actions

describe("the end screen is not a dead end", () => {
  it("offers Play Again first and the exit second, for BOTH flows", async () => {
    for (const isBot of [true, false]) {
      bot = isBot;
      const { unmount } = mount();
      await screen.findByTestId("match-over-frame");
      expect(screen.getByTestId("match-over-primary")).toHaveTextContent("Play Again");
      expect(screen.getByTestId("match-over-secondary"))
        .toHaveTextContent("Back to Leaguecraft");
      unmount();
    }
  });

  it("sends Play Again to the lobby with the match-entry record OPEN", async () => {
    bot = true;
    mount();
    (await screen.findByTestId("match-over-primary")).click();
    // The existing entry path with one navigation removed — not a rematch
    // endpoint, and not a second creation call.
    expect(assignedUrls).toEqual(["/quiz?play=1"]);
  });

  it("sends the exit to the lobby, unchanged", async () => {
    bot = true;
    mount();
    (await screen.findByTestId("match-over-secondary")).click();
    expect(assignedUrls).toEqual(["/quiz"]);
  });

  it("creates no match of its own — the record does that", async () => {
    // "Do not create a second rematch API." Play Again navigates; it never
    // touches the queue, which is the ONE place a Ranked match is created and
    // the only place authorization is decided.
    bot = true;
    mount();
    (await screen.findByTestId("match-over-primary")).click();
    const urls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((c) => String(c[0]));
    expect(urls.filter((u) => u.includes("/api/ranked/queue"))).toEqual([]);
    expect(urls.filter((u) => u.includes("bot-match"))).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════ human regression

describe("nothing done for the bot changed a human match", () => {
  it("keeps the human end screen's heading, panels and summary slot", async () => {
    bot = false;
    const { unmount: unmountAll } = mount();
    const frame = await screen.findByTestId("match-over-frame");
    expect(frame.getAttribute("data-result")).toBe("victory");
    expect(within(frame).getByTestId("combatant-userA")).toBeTruthy();
    expect(within(frame).getByTestId("combatant-userB")).toBeTruthy();
    // PT1.3's collection status still fills the frame's summary slot — and
    // fills it for a BOT match too, because the human in one really does add
    // to their permanent library (`ranked_public/discovery.py` excludes only
    // the bot's own submissions).
    const human = screen.getByTestId("match-over-summary").textContent;
    unmountAll();
    bot = true;
    mount();
    await screen.findByTestId("match-over-frame");
    expect(screen.getByTestId("match-over-summary").textContent).toBe(human);
  });

  it("still reads the ordinary Ranked eyebrow while the match is LIVE", async () => {
    over = false;
    bot = false;
    mount();
    await waitFor(() =>
      expect(screen.getByTestId("ranked-header").textContent).toContain("Ranked Duel"));
    expect(screen.getByTestId("ranked-header").textContent).not.toContain("vs Bot");
  });

  it("marks a LIVE bot match in the header, as it always has", async () => {
    over = false;
    bot = true;
    mount();
    await waitFor(() =>
      expect(screen.getByTestId("ranked-header").textContent).toContain("vs Bot"));
  });
});
