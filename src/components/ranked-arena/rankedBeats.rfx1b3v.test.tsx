/**
 * RFX1 Phase 2B3 VISUAL IMPLEMENTATION — the four presentation surfaces.
 *
 * The timing, the replay protection and the substitution rules are pinned by
 * `QuizRankedMatch.rfx1b3.test.tsx` and `specialTransition.test.ts` and are
 * NOT re-asserted here. What this file covers is the thing those suites
 * cannot see: what the beats actually SAY and DRAW, and the two ways that has
 * gone wrong before — copy that talks about the client instead of the duel,
 * and an animation that comes to rest invisible.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RankedEntryIntro } from "./RankedEntryIntro";
import { RankedFinalRoundWarning } from "./RankedFinalRoundWarning";
import { RankedMatchOutro, outroResultKey } from "./RankedMatchOutro";
import { MetaReflexSting, STING_MS, metaReflexSubline } from "./MetaReflexSting";
import type { MatchOutroView } from "@/lib/ranked-core/flow/matchOutro";

const LOADING_WORDS = [/preparing/i, /loading/i, /entering/i, /please wait/i, /connecting/i];

describe("RFX1 2B3 visual — the Ranked Duel intro", () => {
  it("names both duelists, their roles and their role mascots", () => {
    render(<RankedEntryIntro phase="ready" matchLength={10}
      player={{ name: "Mitchell", roleId: "mid" }}
      opponent={{ name: "Rivalmogz", roleId: "top" }} />);
    expect(screen.getByTestId("entry-intro-name-player").textContent).toBe("Mitchell");
    expect(screen.getByTestId("entry-intro-role-player").textContent).toBe("Mid");
    expect(screen.getByTestId("entry-intro-name-opponent").textContent).toBe("Rivalmogz");
    expect(screen.getByTestId("entry-intro-role-opponent").textContent).toBe("Top");
    // The LC1 art contract: the role LABEL ships with the mascot, always.
    expect(screen.getByTestId("entry-intro-mascot-player")).toBeInTheDocument();
    expect(screen.getByTestId("entry-intro-mascot-opponent")).toBeInTheDocument();
  });

  it("makes RANKED DUEL the title, not a 10px eyebrow", () => {
    render(<RankedEntryIntro phase="ready" matchLength={10} />);
    const title = screen.getByTestId("entry-intro-title");
    expect(title.textContent).toBe("Ranked Duel");
    expect(title.tagName).toBe("H2");
    // The shared major-beat vocabulary, which is what carries the scale.
    expect(title.className).toContain("ranked-beat__title");
    expect(title.className).toContain("ranked-title");
  });

  it("falls back for an unnamed opponent WITHOUT inventing one", () => {
    render(<RankedEntryIntro phase="match-unresolved" />);
    expect(screen.getByTestId("entry-intro-name-player").textContent).toBe("You");
    expect(screen.getByTestId("entry-intro-name-opponent").textContent).toBe("Opponent");
    // No role frozen yet: the neutral crest, never a guessed mascot.
    expect(screen.getByTestId("entry-intro-neutral-player")).toBeInTheDocument();
    expect(screen.getByTestId("entry-intro-neutral-opponent")).toBeInTheDocument();
    expect(screen.getByTestId("entry-intro-role-player").textContent).toBe("Duelist");
  });

  it("titles a bot match an Academy Duel", () => {
    render(<RankedEntryIntro phase="ready" isBotMatch
      opponent={{ name: "Bot", roleId: "top" }} />);
    expect(screen.getByTestId("entry-intro-title").textContent).toBe("Academy Duel");
  });

  it("prints ROUND 1 OF N from the real match length, and omits it when there is none", () => {
    const { rerender } = render(<RankedEntryIntro phase="ready" matchLength={7} />);
    expect(screen.getByTestId("entry-intro-round").textContent).toBe("Round 1 of 7");
    // An hp match, and every deployment predating RP1, carries a null length
    // and cannot say how long the match is. Omitted, never guessed.
    rerender(<RankedEntryIntro phase="ready" matchLength={null} />);
    expect(screen.queryByTestId("entry-intro-round")).toBeNull();
  });

  it("carries NO loading language once the seats are known", () => {
    for (const phase of ["preparing", "ready"] as const) {
      const { unmount } = render(<RankedEntryIntro phase={phase} matchLength={10}
        player={{ name: "Mitchell", roleId: "mid" }}
        opponent={{ name: "Rivalmogz", roleId: "top" }} />);
      const text = screen.getByTestId("ranked-entry-intro").textContent ?? "";
      for (const word of LOADING_WORDS) expect(text).not.toMatch(word);
      expect(screen.queryByTestId("entry-intro-status")).toBeNull();
      unmount();
    }
  });

  it("keeps ONE honest sentence for the state that has no names yet", () => {
    render(<RankedEntryIntro phase="match-unresolved" />);
    const status = screen.getByTestId("entry-intro-status");
    expect(status.textContent).toBe("Seating the duelists…");
    // Announced, because it is the only thing that changes while it is up.
    expect(status).toHaveAttribute("role", "status");
  });

  it("truncates a long display name instead of letting it move the VS", () => {
    render(<RankedEntryIntro phase="ready" matchLength={10}
      player={{ name: "A".repeat(64), roleId: "mid" }}
      opponent={{ name: "Rivalmogz", roleId: "top" }} />);
    const name = screen.getByTestId("entry-intro-name-player");
    expect(name.className).toContain("ranked-entry-intro__name");
    // The board is a three-track grid with a FIXED centre track; the name's
    // own rule is ellipsis. Both are in `index.css`, asserted there.
    expect(name.textContent).toHaveLength(64);
  });

  it("is a MAJOR beat and carries a scrim rather than a question-sized panel", () => {
    render(<RankedEntryIntro phase="ready" />);
    const card = screen.getByTestId("ranked-entry-intro");
    expect(card.className).toContain("ranked-beat--major");
    // The 2B2 card wore `.ranked-panel` — the same chrome as the question
    // card — which is what made the major beat look minor.
    expect(card.className).not.toContain("ranked-panel");
    expect(card.querySelector(".ranked-beat__scrim")).not.toBeNull();
  });
});

describe("RFX1 2B3 visual — the Meta Reflex warning", () => {
  it("publishes the coordinator's window to CSS so the ANIMATION lasts as long as the ELEMENT", () => {
    render(<MetaReflexSting variant="beat" durationMs={1800} cardCount={5} />);
    const sting = screen.getByTestId("mr-sting");
    expect(sting).toHaveAttribute("data-sting-ms", "1800");
    // THE DEFECT THIS FIXES: the keyframes were hardcoded at 720ms with
    // fill-mode `both`, so a 1800ms beat spent ~1080ms at `opacity: 0`.
    expect(sting.style.getPropertyValue("--mr-sting-ms")).toBe("1800ms");
  });

  it("defaults to the sting's own duration, so the Daily is unchanged", () => {
    render(<MetaReflexSting />);
    const sting = screen.getByTestId("mr-sting");
    expect(sting).toHaveAttribute("data-sting-ms", String(STING_MS));
    expect(sting.style.getPropertyValue("--mr-sting-ms")).toBe(`${STING_MS}ms`);
  });

  it("keeps the existing wordmark and stays non-blocking", () => {
    render(<MetaReflexSting variant="beat" durationMs={1800} cardCount={5} />);
    const sting = screen.getByTestId("mr-sting");
    expect(sting.querySelector(".mr-sting__word--left")).toHaveTextContent("Meta");
    expect(sting.querySelector(".mr-sting__word--right")).toHaveTextContent("Reflex");
    expect(sting.querySelector(".mr-sting__mark")).not.toBeNull();
    // The card underneath must stay clickable for the whole beat.
    expect(sting.className).toContain("pointer-events-none");
    expect(sting).toHaveAttribute("aria-hidden");
    // No mascots on a medium beat — that is the rule that separates the two
    // intensities with no other cue.
    expect(sting.querySelector("img")).toBeNull();
  });

  it("derives the sub-line from the block's OWN card count", () => {
    expect(metaReflexSubline(5)).toBe("FIVE CARDS · THINK FAST");
    expect(metaReflexSubline(4)).toBe("FOUR CARDS · THINK FAST");
    expect(metaReflexSubline(1)).toBe("ONE CARD · THINK FAST");
    expect(metaReflexSubline(12)).toBe("12 CARDS · THINK FAST");
    // A block that publishes no usable count says nothing rather than "FIVE".
    expect(metaReflexSubline(null)).toBeNull();
    expect(metaReflexSubline(0)).toBeNull();
  });

  it("renders the sub-line only when the count is real", () => {
    const { rerender } = render(<MetaReflexSting variant="beat" durationMs={1800} cardCount={5} />);
    expect(screen.getByTestId("mr-sting-subline").textContent)
      .toBe("FIVE CARDS · THINK FAST");
    rerender(<MetaReflexSting variant="beat" durationMs={1800} cardCount={null} />);
    expect(screen.queryByTestId("mr-sting-subline")).toBeNull();
  });

  it("marks reduced motion without changing the duration", () => {
    render(<MetaReflexSting variant="beat" durationMs={1800} cardCount={5} reducedMotion />);
    const sting = screen.getByTestId("mr-sting");
    expect(sting).toHaveAttribute("data-reduced-motion", "true");
    // Reduced motion changes the ANIMATION, never the pacing.
    expect(sting).toHaveAttribute("data-sting-ms", "1800");
    expect(screen.getByTestId("mr-sting-subline")).toBeInTheDocument();
  });

  it("leaves the DAILY's sting untouched: the original band, no scrim, no sub-line", () => {
    // The Daily calls `<MetaReflexSting />` with no props at all. This phase
    // must not restage a mode it was not asked to touch — so the medium-beat
    // treatment is opt-in and the default is byte-for-byte what shipped.
    render(<MetaReflexSting />);
    const sting = screen.getByTestId("mr-sting");
    expect(sting).toHaveAttribute("data-sting-variant", "sting");
    expect(sting.className).toContain("h-16");
    expect(sting.className).toContain("inset-x-0");
    expect(sting.className).toContain("top-0");
    expect(sting.querySelector(".mr-sting__scrim")).toBeNull();
    expect(sting.querySelector(".mr-sting__band")).toBeNull();
    expect(screen.queryByTestId("mr-sting-subline")).toBeNull();
    // The wordmark is the same in both variants — only the staging differs.
    expect(sting.querySelector(".mr-sting__word--left")).toHaveTextContent("Meta");
    expect(sting.querySelector(".mr-sting__word--right")).toHaveTextContent("Reflex");
  });

  it("stages the RANKED beat centred, scrimmed and captioned", () => {
    render(<MetaReflexSting variant="beat" durationMs={1800} cardCount={5} />);
    const sting = screen.getByTestId("mr-sting");
    expect(sting).toHaveAttribute("data-sting-variant", "beat");
    expect(sting.className).toContain("inset-0");
    expect(sting.className).not.toContain("h-16");
    expect(sting.querySelector(".mr-sting__scrim")).not.toBeNull();
    expect(screen.getByTestId("mr-sting-subline")).toBeInTheDocument();
  });
});

describe("RFX1 2B3 visual — the Final Round warning", () => {
  it("renders the authoritative score, passed through", () => {
    render(<RankedFinalRoundWarning id="r10" visibleMs={1300}
      viewerScore={24} opponentScore={22} />);
    expect(screen.getByTestId("final-round-score-viewer").textContent).toBe("24");
    expect(screen.getByTestId("final-round-score-opponent").textContent).toBe("22");
  });

  it("renders a score of ZERO rather than treating it as absent", () => {
    render(<RankedFinalRoundWarning id="r10" visibleMs={1300}
      viewerScore={0} opponentScore={0} />);
    expect(screen.getByTestId("final-round-score-viewer").textContent).toBe("0");
    expect(screen.getByTestId("final-round-score-opponent").textContent).toBe("0");
  });

  it("OMITS the score on a match that has none, rather than inventing 0 - 0", () => {
    render(<RankedFinalRoundWarning id="r10" visibleMs={1300}
      viewerScore={null} opponentScore={null} />);
    expect(screen.queryByTestId("final-round-score")).toBeNull();
    expect(screen.getByTestId("ranked-final-round-warning").textContent)
      .toContain("Final Round");
  });

  it("drops GET READY and is a MEDIUM beat with no mascots", () => {
    render(<RankedFinalRoundWarning id="r10" visibleMs={1300}
      viewerScore={24} opponentScore={22} />);
    const beat = screen.getByTestId("ranked-final-round-warning");
    expect(beat.textContent).not.toMatch(/get ready/i);
    expect(beat.className).toContain("ranked-beat--medium");
    expect(beat.className).not.toContain("ranked-beat--major");
    expect(beat.querySelector("img")).toBeNull();
    expect(beat.querySelector(".ranked-beat__scrim")).not.toBeNull();
    // The plate, not a `font-mono` debug box.
    expect(beat.querySelector(".ranked-final-round__plate")).not.toBeNull();
  });

  it("publishes its identity and duration for measurement", () => {
    render(<RankedFinalRoundWarning id="quiz.1#10" visibleMs={1300}
      viewerScore={24} opponentScore={22} reducedMotion />);
    const beat = screen.getByTestId("ranked-final-round-warning");
    expect(beat).toHaveAttribute("data-warning-id", "quiz.1#10");
    expect(beat).toHaveAttribute("data-warning-ms", "1300");
    expect(beat).toHaveAttribute("data-reduced-motion", "true");
  });
});

const outro = (over: Partial<MatchOutroView> = {}): MatchOutroView => ({
  id: "m1:outro", matchId: "m1", result: "win", terminalReason: "combat",
  viewerScore: 24, opponentScore: 15, viewerLabel: "Mitchell",
  opponentLabel: "Rivalmogz", viewerRole: "mid", opponentRole: "top",
  finalRoundNumber: 10, ratingDelta: 18, ...over,
});

describe("RFX1 2B3 visual — the match outro", () => {
  it("renders the authoritative outcome and final score", () => {
    render(<RankedMatchOutro outro={outro()} />);
    expect(screen.getByTestId("match-outro-heading").textContent).toBe("Duel Complete");
    expect(screen.getByTestId("match-outro-result").textContent).toBe("Victory");
    expect(screen.getByTestId("match-outro-score-viewer").textContent).toBe("24");
    expect(screen.getByTestId("match-outro-score-opponent").textContent).toBe("15");
  });

  it("takes the result WORD from the backend, never from comparing two scores", () => {
    // A loss whose scores would read as a win if anyone compared them.
    render(<RankedMatchOutro outro={outro({ result: "loss", viewerScore: 24, opponentScore: 15 })} />);
    expect(screen.getByTestId("match-outro-result").textContent).toBe("Defeat");
    expect(screen.getByTestId("ranked-match-outro"))
      .toHaveAttribute("data-match-outro-result", "loss");
  });

  it("maps every flow result to the end screen's own vocabulary", () => {
    expect(outroResultKey("win")).toBe("victory");
    expect(outroResultKey("loss")).toBe("defeat");
    expect(outroResultKey("draw")).toBe("draw");
    for (const [result, word] of [
      ["win", "Victory"], ["loss", "Defeat"], ["draw", "Draw"],
    ] as const) {
      const { unmount } = render(<RankedMatchOutro outro={outro({ result })} />);
      expect(screen.getByTestId("match-outro-result").textContent).toBe(word);
      unmount();
    }
  });

  it("brings BOTH role mascots back, on the intro's centre axis", () => {
    render(<RankedMatchOutro outro={outro()} />);
    const board = screen.getByTestId("ranked-match-outro")
      .querySelector(".ranked-match-outro__board")!;
    expect(within(board as HTMLElement).getByTestId("match-outro-mascot-player"))
      .toBeInTheDocument();
    expect(within(board as HTMLElement).getByTestId("match-outro-mascot-opponent"))
      .toBeInTheDocument();
    // THE BOOKEND: the score sits between them, where the intro's VS was.
    const order = Array.from(board.children).map((el) =>
      el.getAttribute("data-testid") ?? el.className);
    expect(order[0]).toBe("match-outro-seat-player");
    expect(order[1]).toBe("match-outro-score");
    expect(order[2]).toBe("match-outro-seat-opponent");
  });

  it("draws the neutral crest for a seat whose role the match never froze", () => {
    render(<RankedMatchOutro outro={outro({ viewerRole: null, opponentRole: null })} />);
    expect(screen.getByTestId("match-outro-neutral-player")).toBeInTheDocument();
    expect(screen.getByTestId("match-outro-neutral-opponent")).toBeInTheDocument();
  });

  it("does NOT duplicate the end screen's analytics", () => {
    const text = (() => {
      render(<RankedMatchOutro outro={outro()} />);
      return screen.getByTestId("ranked-match-outro").textContent ?? "";
    })();
    // The end screen owns all of these, 1200 ms later and far larger.
    expect(text).not.toMatch(/rating/i);
    expect(text).not.toMatch(/module/i);
    expect(text).not.toMatch(/accuracy/i);
    expect(text).not.toMatch(/\+18/);
    // And it does not reuse the end screen's own eyebrow verbatim.
    expect(text).not.toMatch(/match complete/i);
  });

  it("says so on a forfeit rather than announcing an unexplained victory", () => {
    const { rerender } = render(<RankedMatchOutro outro={outro({ terminalReason: "forfeit" })} />);
    expect(screen.getByTestId("match-outro-forfeit").textContent).toBe("Opponent forfeit");
    rerender(<RankedMatchOutro outro={outro({ terminalReason: "combat" })} />);
    expect(screen.queryByTestId("match-outro-forfeit")).toBeNull();
  });

  it("omits the score on a match that committed none", () => {
    render(<RankedMatchOutro outro={outro({ viewerScore: null, opponentScore: null })} />);
    expect(screen.queryByTestId("match-outro-score")).toBeNull();
    expect(screen.getByTestId("match-outro-result").textContent).toBe("Victory");
  });

  it("is a MAJOR beat, and marks reduced motion", () => {
    render(<RankedMatchOutro outro={outro()} reducedMotion />);
    const beat = screen.getByTestId("ranked-match-outro");
    expect(beat.className).toContain("ranked-beat--major");
    expect(beat).toHaveAttribute("data-reduced-motion", "true");
    expect(beat).toHaveAttribute("data-match-outro-id", "m1:outro");
    // Every word still present: reduced motion changes the animation only.
    expect(beat.textContent).toContain("Duel Complete");
    expect(beat.textContent).toContain("Victory");
    expect(screen.getByTestId("match-outro-score")).toBeInTheDocument();
  });

  it("truncates nothing into the score's track when a name is long", () => {
    // The outro board prints no names at all — the mascots and the score are
    // the whole composition — so a long display name cannot reach it.
    render(<RankedMatchOutro outro={outro({ viewerLabel: "A".repeat(64) })} />);
    expect(screen.getByTestId("ranked-match-outro").textContent).not.toContain("AAAA");
  });
});
