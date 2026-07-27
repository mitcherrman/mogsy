import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StatCheckPage from "../StatCheckPage";
import { STAT_CHECK_FIXTURE_DECK } from "../fixtureDeck";
import { generateCategoryBoard } from "../statCheckEngine";
import type {
  MatchPrivateView,
  MatchPublicView,
  ResolvedRoundView,
} from "@/lib/stat-check-online/contracts";
import { synthesizeMatchState, toRoundResolution } from "./onlineMatchModel";
import type { OnlineMatchController } from "./useStatCheckMatch";

vi.mock("@/hooks/useChampionBaseStats", () => ({
  useChampionBaseStats: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: undefined }),
  getChampionSplash: () => null,
  getChampionIcon: () => null,
  resolveAssetUrl: () => null,
}));

const BOARD = generateCategoryBoard("online-test", 1);
const CARDS = STAT_CHECK_FIXTURE_DECK.slice(0, 6);
const OPP_CARDS = STAT_CHECK_FIXTURE_DECK.slice(6, 12);

function publicView(overrides: Partial<MatchPublicView> = {}): MatchPublicView {
  return {
    matchId: "scm_1",
    roomId: "scr_1",
    status: "active",
    phase: "selecting",
    round: 1,
    completedRounds: 0,
    itemChoicesCompleted: 1,
    boardCategoryIds: BOARD.map((category) => category.id),
    hintFamily: "health",
    drawPileCount: 12,
    seats: {
      p1: { seat: "p1", hp: 20, handCount: 6, discardCardIds: [], chosen: false, locked: false },
      p2: { seat: "p2", hp: 20, handCount: 6, discardCardIds: [], chosen: false, locked: false },
    },
    presence: {
      p1: { connected: true, reconnectDeadline: null },
      p2: { connected: true, reconnectDeadline: null },
    },
    outcome: null,
    endReason: null,
    latestResolvedRound: null,
    serverTime: "2026-07-25T12:00:00+00:00",
    ...overrides,
  };
}

function privateView(overrides: Partial<MatchPrivateView> = {}): MatchPrivateView {
  return {
    matchId: "scm_1",
    yourSeat: "p1",
    hand: CARDS.map((card) => ({ id: card.id, name: card.name, stats: { ...card.stats } })),
    inventory: { "long-sword": 0, "cloth-armor": 0, "ruby-crystal": 1, "mogzy-snack": 0 },
    pendingItemChoice: null,
    pendingLock: null,
    ...overrides,
  };
}

function resolvedView(): ResolvedRoundView {
  const lanes = BOARD.map((category, index) => {
    const p1Card = CARDS[index];
    const p2Card = OPP_CARDS[index];
    const p1Natural = category.getValue(p1Card);
    const p2Natural = category.getValue(p2Card);
    const p1Bonus = index === 0 ? 150 : 0;
    const p1Final = p1Natural + p1Bonus;
    const winner =
      p1Final === p2Natural
        ? ("tie" as const)
        : category.direction === "higher"
          ? p1Final > p2Natural
            ? ("p1" as const)
            : ("p2" as const)
          : p1Final < p2Natural
            ? ("p1" as const)
            : ("p2" as const),
      margin = 0.12;
    return {
      categoryId: category.id,
      p1Card: { id: p1Card.id, name: p1Card.name, stats: { ...p1Card.stats } },
      p2Card: { id: p2Card.id, name: p2Card.name, stats: { ...p2Card.stats } },
      p1Natural,
      p2Natural,
      p1Item: index === 0 ? "ruby-crystal" : null,
      p2Item: null,
      p1Bonus,
      p2Bonus: 0,
      p1Final,
      p2Final: p2Natural,
      winner,
      margin,
      decisive: false,
    };
  });
  const p1Wins = lanes.filter((lane) => lane.winner === "p1").length;
  const p2Wins = lanes.filter((lane) => lane.winner === "p2").length;
  return {
    roundNumber: 1,
    boardCategoryIds: BOARD.map((category) => category.id),
    hintFamily: "armor",
    results: lanes,
    damage: {
      p1Dealt: p1Wins > p2Wins ? 2 : 0,
      p2Dealt: p2Wins > p1Wins ? 2 : 0,
      boardWinner: p1Wins > p2Wins ? "p1" : p2Wins > p1Wins ? "p2" : "tie",
      p1CategoryWins: p1Wins,
      p2CategoryWins: p2Wins,
      p1DecisiveDamage: 0,
      p2DecisiveDamage: 0,
    },
    p1HpBefore: 20,
    p2HpBefore: 20,
    p1HpAfter: p2Wins > p1Wins ? 18 : 20,
    p2HpAfter: p1Wins > p2Wins ? 18 : 20,
  };
}

function controller(overrides: Partial<OnlineMatchController> = {}): OnlineMatchController {
  return {
    status: "playing",
    live: synthesizeMatchState(publicView(), privateView(), []),
    liveKey: 1,
    resolutionEvent: null,
    yourSeat: "p1",
    youChosen: false,
    youLocked: false,
    opponentChosen: false,
    opponentLocked: false,
    opponentConnected: true,
    opponentReconnectDeadline: null,
    result: null,
    errorCode: null,
    submitLock: vi.fn().mockResolvedValue(true),
    submitItemChoice: vi.fn().mockResolvedValue(true),
    concede: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("online match model", () => {
  it("conceals the opening board and carries only the one-family hint", () => {
    const state = synthesizeMatchState(
      publicView({ phase: "item-choice-opening", boardCategoryIds: [], itemChoicesCompleted: 0 }),
      privateView({ inventory: { "long-sword": 0, "cloth-armor": 0, "ruby-crystal": 0, "mogzy-snack": 0 } }),
      [],
    );
    expect(state.phase).toBe("item-choice");
    expect(state.currentCategories.every((category) => category.id.startsWith("concealed-"))).toBe(true);
    expect(state.currentCategories[0].family).toBe("health");
    expect(state.roundHistory).toHaveLength(0);
  });

  it("orients seats to the viewer, including for seat p2", () => {
    const resolution = toRoundResolution(resolvedView(), "p2");
    // For seat p2, the server's p2 values are "player" values.
    expect(resolution.results[0].playerCard.id).toBe(OPP_CARDS[0].id);
    expect(resolution.results[0].botItem).toBe("ruby-crystal");
    const asP1 = toRoundResolution(resolvedView(), "p1");
    expect(asP1.results[0].playerItem).toBe("ruby-crystal");
    expect(asP1.results[0].playerValue).toBe(asP1.results[0].playerNaturalValue + asP1.results[0].playerBonus);
    for (const [mine, theirs] of [[asP1, resolution]] as const) {
      expect(mine.damage.player).toBe(theirs.damage.bot);
      expect(mine.damage.bot).toBe(theirs.damage.player);
    }
  });

  it("represents opponent hand and pool as opaque placeholders", () => {
    const state = synthesizeMatchState(publicView(), privateView(), []);
    expect(state.botHand).toHaveLength(6);
    expect(new Set(state.botHand.map((card) => card.name))).toEqual(new Set(["Concealed"]));
    expect(state.drawPile).toHaveLength(12);
    expect(state.playerHand.map((card) => card.id)).toEqual(CARDS.map((card) => card.id));
  });
});

describe("StatCheckPage online driver", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    act(() => vi.runOnlyPendingTimers());
    vi.useRealTimers();
  });

  it("shows the opening item choice with hidden board and submits the pick to the server", () => {
    const online = controller({
      live: synthesizeMatchState(
        publicView({ phase: "item-choice-opening", boardCategoryIds: [], itemChoicesCompleted: 0 }),
        privateView({ inventory: { "long-sword": 0, "cloth-armor": 0, "ruby-crystal": 0, "mogzy-snack": 0 } }),
        [],
      ),
    });
    const { container } = render(<StatCheckPage online={online} />);
    expect(container.querySelectorAll('[data-testid^="stat-check-marker-"]')).toHaveLength(0);
    expect(screen.getAllByTestId(/^stat-check-hidden-category-/)).toHaveLength(3);
    expect(screen.getByText(/Round 1 Intel/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("stat-check-item-option-ruby-crystal"));
    fireEvent.click(screen.getByTestId("stat-check-item-confirm"));
    expect(online.submitItemChoice).toHaveBeenCalledWith("ruby-crystal");
  });

  it("freezes the choice panel while waiting for the opponent", () => {
    const online = controller({
      youChosen: true,
      live: synthesizeMatchState(
        publicView({ phase: "item-choice-opening", boardCategoryIds: [], itemChoicesCompleted: 0 }),
        privateView(),
        [],
      ),
    });
    render(<StatCheckPage online={online} />);
    expect(screen.getByTestId("stat-check-item-confirm")).toBeDisabled();
    expect(screen.getByTestId("stat-check-item-confirm")).toHaveTextContent(/Waiting for opponent/i);
    expect(screen.getByTestId("sc-online-opponent-status")).toHaveAttribute("data-opponent-chosen", "false");
  });

  it("submits the round lock to the server and never resolves locally", () => {
    const online = controller();
    const { container } = render(<StatCheckPage online={online} />);
    const lanes = Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="stat-check-lane-"]'));
    for (let index = 0; index < 3; index++) {
      fireEvent.click(screen.getByTestId("stat-check-hand-0"));
      fireEvent.click(lanes[index]);
      act(() => vi.advanceTimersByTime(3_000));
    }
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    expect(online.submitLock).toHaveBeenCalledTimes(1);
    const [assignments, equipped] = (online.submitLock as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(Object.values(assignments).filter(Boolean)).toHaveLength(3);
    expect(equipped).toBeNull();
    // No local resolution: the board stays pre-reveal.
    expect(screen.queryByText(/You win|Opponent wins|Lane tied/i)).toBeNull();
  });

  it("shows the disconnect banner and submits an explicit concede", () => {
    const online = controller({ opponentConnected: false, opponentReconnectDeadline: "2026-07-25T12:01:00+00:00" });
    render(<StatCheckPage online={online} />);
    expect(screen.getByTestId("sc-online-disconnected")).toHaveTextContent(/reconnect/i);
    fireEvent.click(screen.getByTestId("sc-online-concede"));
    expect(online.concede).toHaveBeenCalledTimes(1);
  });

  it("adopts a non-combat terminal state (concede/forfeit) immediately", () => {
    const online = controller();
    const { rerender } = render(<StatCheckPage online={online} />);
    const over = synthesizeMatchState(
      publicView({ phase: "match-over", status: "complete", outcome: "p1", endReason: "Opponent conceded." }),
      privateView(),
      [],
    );
    rerender(<StatCheckPage online={{ ...online, live: over, liveKey: 2, status: "complete" }} />);
    expect(screen.getByTestId("stat-check-match-over")).toHaveTextContent(/Victory/i);
    expect(screen.getByTestId("stat-check-match-over")).toHaveTextContent(/Opponent conceded/i);
    expect(screen.getByText(/Leave match/i)).toBeInTheDocument();
  });

  it("plays the existing reveal from a server resolution event and shows the opponent only then", () => {
    const online = controller();
    const { container, rerender } = render(<StatCheckPage online={online} />);
    const lanes = Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="stat-check-lane-"]'));
    for (let index = 0; index < 3; index++) {
      fireEvent.click(screen.getByTestId("stat-check-hand-0"));
      fireEvent.click(lanes[index]);
      act(() => vi.advanceTimersByTime(3_000));
    }
    fireEvent.click(screen.getByTestId("stat-check-lock"));

    // Opponent identity is absent pre-reveal.
    for (const card of OPP_CARDS) {
      expect(container.textContent).not.toContain(card.name);
    }

    const resolution = toRoundResolution(resolvedView(), "p1");
    rerender(
      <StatCheckPage
        online={{ ...online, youLocked: true, resolutionEvent: { key: 1, resolution } }}
      />,
    );
    act(() => vi.advanceTimersByTime(45_000));
    // Each fixed plaque has finished its staged blink and rests on +1/+0; the
    // written outcome stays available to screen readers.
    expect(screen.getAllByText(/You win|Opponent wins|Lane tied/i).length).toBeGreaterThanOrEqual(3);
    expect(container.textContent).toContain(OPP_CARDS[0].name);
    // The server-side item bonus still lands on the champion card.
    expect(screen.getByTestId("stat-check-reveal-item-player")).toHaveTextContent(/\+150/);
  });
});

/**
 * Two-way damage: the server is the only place that decides who dealt what, so
 * these drive the page from a hand-built authoritative resolution rather than
 * from the local engine. The presentation must consume those figures exactly.
 */
describe("StatCheckPage centre damage presentation (server-authoritative)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    act(() => vi.runOnlyPendingTimers());
    vi.useRealTimers();
  });

  /** p1 wins the board 2-1 with one decisive lane; p2 retaliates decisively. */
  function twoWayResolvedView(): ResolvedRoundView {
    const base = resolvedView();
    return {
      ...base,
      results: base.results.map((lane, index) => ({
        ...lane,
        winner: index === 2 ? ("p2" as const) : ("p1" as const),
        decisive: index === 0 || index === 2,
      })),
      damage: {
        p1Dealt: 3, // board 2 + one decisive
        p2Dealt: 1, // decisive retaliation only
        boardWinner: "p1",
        p1CategoryWins: 2,
        p2CategoryWins: 1,
        p1DecisiveDamage: 1,
        p2DecisiveDamage: 1,
      },
      p1HpBefore: 20,
      p2HpBefore: 20,
      p1HpAfter: 19,
      p2HpAfter: 17,
    };
  }

  function playRound(view: ResolvedRoundView) {
    const online = controller();
    const rendered = render(<StatCheckPage online={online} />);
    const lanes = Array.from(rendered.container.querySelectorAll<HTMLElement>('[data-testid^="stat-check-lane-"]'));
    for (let index = 0; index < 3; index++) {
      fireEvent.click(screen.getByTestId("stat-check-hand-0"));
      fireEvent.click(lanes[index]);
      act(() => vi.advanceTimersByTime(3_000));
    }
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    const resolution = toRoundResolution(view, "p1");
    rendered.rerender(
      <StatCheckPage online={{ ...online, youLocked: true, resolutionEvent: { key: 1, resolution } }} />,
    );
    return { ...rendered, online, resolution };
  }

  /** Walk the reveal in small steps, recording every damage state observed. */
  function observeDamage(stepMs = 120, totalMs = 45_000) {
    const seen: Array<{
      side: string;
      kind: string;
      sweep: string;
      stage: string;
      shown: string;
      playerHp: string;
      botHp: string;
    }> = [];
    for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
      act(() => vi.advanceTimersByTime(stepMs));
      const node = screen.queryByTestId("stat-check-damage-reveal");
      if (!node) continue;
      seen.push({
        side: node.getAttribute("data-damage-side") ?? "",
        kind: node.getAttribute("data-damage-kind") ?? "",
        sweep: node.getAttribute("data-damage-sweep") ?? "",
        stage: node.getAttribute("data-damage-stage") ?? "",
        shown: node.getAttribute("data-damage-shown") ?? "",
        playerHp: screen.getByTestId("stat-check-player-hp").textContent ?? "",
        botHp: screen.getByTestId("stat-check-bot-hp").textContent ?? "",
      });
    }
    return seen;
  }

  it("resolves both directions sequentially, board winner first", () => {
    playRound(twoWayResolvedView());
    const seen = observeDamage();

    // Never both at once, and the board winner (the player here) leads.
    const sideOrder = seen.map((entry) => entry.side).filter((side, index, all) => side !== all[index - 1]);
    expect(sideOrder).toEqual(["player", "bot"]);

    const playerStrike = seen.filter((entry) => entry.side === "player");
    const retaliation = seen.filter((entry) => entry.side === "bot");
    expect(playerStrike.at(-1)!.shown).toBe("3");
    expect(retaliation.at(-1)!.shown).toBe("1");
    // Retaliation is lane-bonus-only: it never claims a board result it didn't
    // earn, and it is headed COUNTER rather than WINNER.
    expect(retaliation.map((entry) => entry.stage)).not.toContain("board");
    expect(retaliation.map((entry) => entry.stage)).toContain("lane-3");
    expect(retaliation.map((entry) => entry.kind)).not.toContain("winner");
    expect(playerStrike.map((entry) => entry.kind)).toContain("winner");
  });

  it("drains each bar only at its own impact, never the other side's", () => {
    playRound(twoWayResolvedView());
    const seen = observeDamage();

    // While the player is striking, only the opponent's bar may move.
    for (const entry of seen.filter((item) => item.side === "player")) {
      expect(entry.playerHp).toMatch(/^20 \//);
      const expectedBotHp = ["health", "settled"].includes(entry.stage) ? /^17 \// : /^20 \//;
      expect(entry.botHp, `bot hp at player:${entry.stage}`).toMatch(expectedBotHp);
    }
    // The opponent's retaliation then reduces the player, leaving the bot's
    // already-applied loss in place.
    for (const entry of seen.filter((item) => item.side === "bot")) {
      expect(entry.botHp).toMatch(/^17 \//);
      const expectedPlayerHp = ["health", "settled"].includes(entry.stage) ? /^19 \// : /^20 \//;
      expect(entry.playerHp, `player hp at bot:${entry.stage}`).toMatch(expectedPlayerHp);
    }

    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByTestId("stat-check-player-hp")).toHaveTextContent("19 / 20 HP");
    expect(screen.getByTestId("stat-check-bot-hp")).toHaveTextContent("17 / 20 HP");
  });

  it("opens on the server's board result and runs the lanes up to its total", () => {
    const { resolution } = playRound(twoWayResolvedView());
    const seen = observeDamage().filter((entry) => entry.side === "player");
    const byStage = new Map(seen.map((entry) => [entry.stage, entry.shown]));
    expect(byStage.get("enter")).toBe("0");
    // 2 of 3 lanes is a board win, not a sweep: the board result is 2.
    expect(byStage.get("board")).toBe("2");
    expect(seen.every((entry) => entry.sweep === "false")).toBe(true);
    // All three lanes are told, in board order, and the last lands the total.
    expect(byStage.get("lane-1")).toBeDefined();
    expect(byStage.get("lane-2")).toBeDefined();
    expect(byStage.get("lane-3")).toBe(String(resolution.damage.player));
    expect(byStage.get("total")).toBe(String(resolution.damage.player));
  });

  it("shows no presentation at all when the server reports a damage-free round", () => {
    const base = resolvedView();
    playRound({
      ...base,
      results: base.results.map((lane, index) => ({
        ...lane,
        winner: index === 0 ? ("p1" as const) : index === 1 ? ("p2" as const) : ("tie" as const),
        decisive: false,
      })),
      damage: {
        p1Dealt: 0,
        p2Dealt: 0,
        boardWinner: "tie",
        p1CategoryWins: 1,
        p2CategoryWins: 1,
        p1DecisiveDamage: 0,
        p2DecisiveDamage: 0,
      },
      p1HpBefore: 20,
      p2HpBefore: 20,
      p1HpAfter: 20,
      p2HpAfter: 20,
    });
    expect(observeDamage()).toEqual([]);
    expect(screen.getByTestId("stat-check-player-hp")).toHaveTextContent("20 / 20 HP");
    expect(screen.getByTestId("stat-check-bot-hp")).toHaveTextContent("20 / 20 HP");
    expect(screen.getByTestId("stat-check-next-round")).toBeInTheDocument();
  });

  it("adopting a recovery snapshot mid-presentation applies the damage once", () => {
    const online = controller();
    const { container, rerender } = render(<StatCheckPage online={online} />);
    const lanes = Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="stat-check-lane-"]'));
    for (let index = 0; index < 3; index++) {
      fireEvent.click(screen.getByTestId("stat-check-hand-0"));
      fireEvent.click(lanes[index]);
      act(() => vi.advanceTimersByTime(3_000));
    }
    fireEvent.click(screen.getByTestId("stat-check-lock"));
    const resolution = toRoundResolution(twoWayResolvedView(), "p1");
    rerender(<StatCheckPage online={{ ...online, youLocked: true, resolutionEvent: { key: 1, resolution } }} />);

    // Interrupt partway through the centre presentation.
    act(() => vi.advanceTimersByTime(30_000));

    // A reconnect delivers the authoritative post-round snapshot. The stale
    // presentation must not replay, and the health must land exactly once on
    // the server's totals — not be reduced a second time.
    const recovered = synthesizeMatchState(
      publicView({
        phase: "selecting",
        round: 2,
        completedRounds: 1,
        seats: {
          p1: { seat: "p1", hp: 19, handCount: 6, discardCardIds: [], chosen: false, locked: false },
          p2: { seat: "p2", hp: 17, handCount: 6, discardCardIds: [], chosen: false, locked: false },
        },
      }),
      privateView(),
      [],
    );
    rerender(
      <StatCheckPage
        online={{ ...online, live: recovered, liveKey: 9, resolutionEvent: { key: 1, resolution } }}
      />,
    );
    act(() => vi.advanceTimersByTime(5_000));

    expect(screen.queryByTestId("stat-check-damage-reveal")).toBeNull();
    expect(screen.getByTestId("stat-check-player-hp")).toHaveTextContent("19 / 20 HP");
    expect(screen.getByTestId("stat-check-bot-hp")).toHaveTextContent("17 / 20 HP");
  });
});
