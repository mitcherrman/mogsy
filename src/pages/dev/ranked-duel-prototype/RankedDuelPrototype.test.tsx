import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, act, fireEvent } from "@testing-library/react";
import RankedDuelPrototype from "./RankedDuelPrototype";
import { PlayerPanel } from "./PlayerPanel";
import { MOCK_QUESTIONS, REVEAL_DELAY_MS, getDuelClass } from "./fixtures";

// Fake timers keep the 1s tick loop and reveal delay deterministic.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const startMatch = () => {
  render(<RankedDuelPrototype />);
  fireEvent.click(screen.getByRole("button", { name: /start mock match/i }));
};

const q0 = MOCK_QUESTIONS[0];
const correctChoice = q0.choices[q0.correctIndex];
const wrongChoice = q0.choices[(q0.correctIndex + 1) % q0.choices.length];

// Radix Tabs only mounts the active tab's content, so activate the player's
// dev-controls tab before querying inside it.
const activateTab = (p: "p1" | "p2") => {
  const trigger = screen.getByRole("tab", { name: new RegExp(`player ${p === "p1" ? 1 : 2}`, "i") });
  fireEvent.mouseDown(trigger);
  fireEvent.click(trigger);
};
const controls = (p: "p1" | "p2") => {
  activateTab(p);
  return within(screen.getByTestId(`${p}-controls`));
};

const advanceReveal = () =>
  act(() => {
    vi.advanceTimersByTime(REVEAL_DELAY_MS);
  });

/** Submit the CORRECT answer for both players for the current question. */
const bothCorrectRound = (questionIndex: number) => {
  const q = MOCK_QUESTIONS[questionIndex];
  const answer = q.choices[q.correctIndex];
  fireEvent.click(controls("p1").getAllByRole("button", { name: new RegExp(answer) })[0]);
  fireEvent.click(controls("p2").getAllByRole("button", { name: new RegExp(answer) })[0]);
  advanceReveal();
};

describe("RankedDuelPrototype component", () => {
  it("shows setup then enters the duel with both players at level 1", () => {
    startMatch();
    expect(screen.getByTestId("question-prompt")).toHaveTextContent(q0.prompt);
    expect(screen.getAllByText("Lv 1")).toHaveLength(2);
  });

  it("keeps answer and ability choices out of the primary panels before reveal", () => {
    startMatch();

    // P1 submits an answer and locks an ability via the dev controls.
    fireEvent.click(controls("p1").getAllByRole("button", { name: new RegExp(correctChoice) })[0]);
    fireEvent.click(controls("p1").getByRole("button", { name: /bulwark/i }));
    fireEvent.click(controls("p1").getByRole("button", { name: /^lock ability$/i }));

    // Primary panel shows only neutral statuses — never the actual choices.
    const p1Status = within(screen.getByTestId("p1-status"));
    expect(p1Status.getByText(/submission complete/i)).toBeInTheDocument();
    expect(p1Status.queryByText(new RegExp(correctChoice))).toBeNull();
    expect(p1Status.queryByText(/bulwark/i)).toBeNull();
    expect(within(screen.getByTestId("p2-status")).getByText(/thinking/i)).toBeInTheDocument();
    expect(screen.queryByTestId("reveal-panel")).toBeNull();
  });

  it("reveals both players' answers and abilities together after both submit", () => {
    startMatch();

    fireEvent.click(controls("p1").getAllByRole("button", { name: new RegExp(correctChoice) })[0]);
    fireEvent.click(controls("p1").getByRole("button", { name: /bulwark/i }));
    fireEvent.click(controls("p1").getByRole("button", { name: /^lock ability$/i }));
    fireEvent.click(controls("p2").getAllByRole("button", { name: new RegExp(wrongChoice) })[0]);

    // Both answered -> awaiting_reveal immediately, then reveal after the delay.
    expect(screen.getByTestId("awaiting-reveal")).toBeInTheDocument();
    advanceReveal();

    const reveal = screen.getByTestId("reveal-panel");
    const p1 = within(within(reveal).getByTestId("reveal-p1"));
    const p2 = within(within(reveal).getByTestId("reveal-p2"));
    expect(p1.getByText("Correct")).toBeInTheDocument();
    expect(p1.getByText(new RegExp(correctChoice))).toBeInTheDocument();
    expect(p1.getByText(/bulwark/i)).toBeInTheDocument();
    expect(p2.getByText("Incorrect")).toBeInTheDocument();
    expect(p2.getByText(new RegExp(wrongChoice))).toBeInTheDocument();
    expect(screen.getByTestId("combat-log")).toBeInTheDocument();
  });

  it("shortens the timer by 5s on the first submission and expires unanswered players", () => {
    startMatch();
    expect(screen.getByTestId("timer-seconds")).toHaveTextContent("20s");

    fireEvent.click(controls("p1").getAllByRole("button", { name: new RegExp(correctChoice) })[0]);
    expect(screen.getByTestId("timer-seconds")).toHaveTextContent("15s");

    // Let the shortened timer run out; p2 never answers.
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    advanceReveal();
    expect(
      within(screen.getByTestId("reveal-p2")).getAllByText(/timed out/i).length,
    ).toBeGreaterThan(0);
  });

  it("dual level 2: choices stay hidden until both confirm, then reveal together", () => {
    startMatch();
    // Two both-correct rounds -> both players hit the level 2 threshold.
    bothCorrectRound(0);
    fireEvent.click(screen.getByRole("button", { name: /next round/i }));
    bothCorrectRound(1);
    fireEvent.click(screen.getByRole("button", { name: /next round/i }));

    // Progression stop: neutral statuses only, no picks visible.
    const panel = () => within(screen.getByTestId("progression-panel"));
    expect(panel().getAllByText(/choosing ability/i).length).toBeGreaterThan(0);

    // P1 chooses Taunt and confirms in the dev controls.
    activateTab("p1");
    const p1prog = within(screen.getByTestId("p1-progression-controls"));
    fireEvent.click(p1prog.getByRole("button", { name: /taunt/i }));
    fireEvent.click(p1prog.getByRole("button", { name: /confirm choice/i }));

    // P1's exact pick is NOT exposed in the primary duel UI while P2 chooses.
    expect(panel().queryByText(/taunt/i)).toBeNull();
    expect(within(screen.getByTestId("p1-status")).getByText(/ability chosen/i)).toBeInTheDocument();
    expect(within(screen.getByTestId("p1-abilities")).queryByText(/taunt/i)).toBeNull();
    expect(within(screen.getByTestId("p2-status")).getByText(/choosing ability/i)).toBeInTheDocument();
    expect(screen.queryByTestId("progression-reveal")).toBeNull();

    // P2 chooses Frost Ward and confirms -> shared reveal shows both picks.
    activateTab("p2");
    const p2prog = within(screen.getByTestId("p2-progression-controls"));
    fireEvent.click(p2prog.getByRole("button", { name: /frost ward/i }));
    fireEvent.click(p2prog.getByRole("button", { name: /confirm choice/i }));

    const reveal = within(screen.getByTestId("progression-reveal"));
    expect(reveal.getByText("Taunt")).toBeInTheDocument();
    expect(reveal.getByText("Frost Ward")).toBeInTheDocument();

    // Continue starts round 3 and the picks now appear in the panels.
    fireEvent.click(screen.getByRole("button", { name: /continue to next round/i }));
    expect(screen.getByTestId("question-prompt")).toBeInTheDocument();
    expect(within(screen.getByTestId("p1-abilities")).getByText(/taunt/i)).toBeInTheDocument();
    expect(within(screen.getByTestId("p2-abilities")).getByText(/frost ward/i)).toBeInTheDocument();
  });

  it("renders backend settlement detail in the reveal (base/final/shield/reduction/timer)", () => {
    startMatch();
    fireEvent.change(screen.getByTestId("settlement-scenario-select"), {
      target: { value: "shield-plus-reduction" },
    });
    fireEvent.click(screen.getByTestId("apply-settlement"));

    const reveal = within(screen.getByTestId("reveal-panel"));
    const p2 = within(within(reveal.getByTestId("reveal-p2")).getByTestId("settlement-detail"));
    expect(p2.getByText(/shield absorbed 8/i)).toBeInTheDocument();
    expect(p2.getByText(/damage reduced 7/i)).toBeInTheDocument();
    expect(p2.getByText(/final damage received 20/i)).toBeInTheDocument();
    expect(p2.getByText(/HP 90 → 70/i)).toBeInTheDocument();
    // Attacker side shows the dealt audit (base + bonus -> final) separately.
    const p1 = within(within(reveal.getByTestId("reveal-p1")).getByTestId("settlement-detail"));
    expect(p1.getByText(/base 30 \+5 bonus → final 35/i)).toBeInTheDocument();
    expect(screen.getByTestId("shared-next-timer")).toHaveTextContent(
      "Next round shared timer: 20s",
    );
  });

  it("maps a no-active-ability settlement to a safe display value", () => {
    startMatch();
    fireEvent.change(screen.getByTestId("settlement-scenario-select"), {
      target: { value: "no-ability" },
    });
    fireEvent.click(screen.getByTestId("apply-settlement"));
    const p1 = within(screen.getByTestId("reveal-p1"));
    expect(p1.getByText(/no active ability/i)).toBeInTheDocument();
  });

  it("setup marks the selected class accessibly (aria-pressed + Selected badge)", () => {
    render(<RankedDuelPrototype />);
    const pressed = screen
      .getAllByRole("button", { pressed: true })
      .filter((b) => b.textContent?.includes("Selected"));
    expect(pressed.length).toBe(2); // one selected class per player
    expect(screen.getAllByText(/starter active · lv1/i).length).toBeGreaterThan(0);
  });

  it("allows locking with no ability; the no-ability choice appears only at reveal", () => {
    startMatch();
    const p1 = controls("p1");
    // Locking with nothing selected is a deliberate, valid choice.
    fireEvent.click(p1.getByRole("button", { name: /lock in: no ability/i }));
    expect(within(screen.getByTestId("p1-status")).getByText(/ability locked/i)).toBeInTheDocument();
    // Pre-reveal, the PLAYER-FACING UI never says "no ability" anywhere
    // (the dev operator controls are exempt — they operate the prototype).
    const playerFacingHits = screen
      .queryAllByText(/no active ability selected/i)
      .filter((el) => !el.closest('[data-testid="operator-panel"]'));
    expect(playerFacingHits).toHaveLength(0);

    fireEvent.click(controls("p1").getAllByRole("button", { name: new RegExp(correctChoice) })[0]);
    fireEvent.click(controls("p2").getAllByRole("button", { name: new RegExp(wrongChoice) })[0]);
    advanceReveal();
    expect(
      within(screen.getByTestId("reveal-p1")).getByText(/no active ability selected/i),
    ).toBeInTheDocument();
  });

  it("shows exactly one shared next-round timer message with reduce wording", () => {
    startMatch();
    fireEvent.change(screen.getByTestId("settlement-scenario-select"), {
      target: { value: "timer-decreased" },
    });
    fireEvent.click(screen.getByTestId("apply-settlement"));
    const timers = screen.getAllByTestId("shared-next-timer");
    expect(timers).toHaveLength(1);
    expect(timers[0]).toHaveTextContent("Next round shared timer: 18s");
    expect(timers[0]).toHaveTextContent(/shared timer reduced by 2s/i);
    expect(timers[0]).toHaveTextContent(/both players use the same timer/i);
  });

  it("match-over offers a clearly labeled same-classes rematch", () => {
    startMatch();
    fireEvent.change(screen.getByTestId("settlement-scenario-select"), {
      target: { value: "match-over" },
    });
    fireEvent.click(screen.getByTestId("apply-settlement"));
    fireEvent.click(screen.getByRole("button", { name: /view match result/i }));
    expect(screen.getByRole("button", { name: /rematch — same classes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to setup/i })).toBeInTheDocument();
    expect(screen.getByTestId("final-round-summary")).toBeInTheDocument();
  });

  it("PlayerPanel at max level shows no level 4 target, both normals, and a locked Future slot", () => {
    const cls = getDuelClass("tank");
    render(
      <PlayerPanel
        player="p1"
        side="left"
        match={{
          classId: "tank",
          hp: 100,
          maxHp: cls.startingHp,
          xp: 120,
          level: 3,
          chosenLevelTwoAbilityId: cls.levelTwoChoices[0].id,
        }}
        round={{
          answerIndex: null,
          answeredAtRemaining: null,
          submissionOrder: null,
          timedOut: false,
          selectedAbilityId: null,
          abilityLocked: false,
        }}
      />,
    );
    expect(screen.getByTestId("p1-xp-label")).toHaveTextContent("Max level (prototype)");
    expect(screen.queryByText(/lv ?4/i)).toBeNull();
    const abilities = within(screen.getByTestId("p1-abilities"));
    expect(abilities.getByText(/bulwark · starter/i)).toBeInTheDocument();
    expect(abilities.queryByText(/passive/i)).toBeNull();
    expect(abilities.getByText(/taunt · lv2/i)).toBeInTheDocument();
    // chosen = Taunt, so Shield Slam is the auto-unlocked final normal.
    expect(abilities.getByText(/shield slam · lv3/i)).toBeInTheDocument();
    // Ultimate stays a permanently locked "Future" slot.
    expect(abilities.getByText(/unbreakable · future/i)).toBeInTheDocument();
    expect(abilities.queryByText(/· ultimate/i)).toBeNull();
  });
});
