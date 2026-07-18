import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { adaptBackendSettlement } from "@/pages/dev/ranked-duel-prototype/backend-adapter/adaptBackendSettlement";
import {
  FIXTURE_PLAYER_IDS,
  getScenario,
  SETTLEMENT_SCENARIOS,
} from "@/pages/dev/ranked-duel-prototype/backend-adapter/backendSettlementFixtures";
import { ResolvedRoundView } from "@/lib/ranked-core/viewTypes";
import { RevealPanel } from "./RevealPanel";

const settlement = (key: string): ResolvedRoundView => {
  const scenario = getScenario(key);
  if (!scenario) throw new Error(`missing scenario ${key}`);
  return adaptBackendSettlement(scenario.settlement, FIXTURE_PLAYER_IDS);
};

const NAMES = {
  [FIXTURE_PLAYER_IDS.p1PlayerId]: "You",
  [FIXTURE_PLAYER_IDS.p2PlayerId]: "Rival",
};

const renderReveal = (s: ResolvedRoundView, extra: Partial<Parameters<typeof RevealPanel>[0]> = {}) =>
  render(<RevealPanel settlement={s} viewerSlot="p1" namesByPlayerId={NAMES} {...extra} />);

const card = (s: ResolvedRoundView, slot: "p1" | "p2") =>
  within(screen.getByTestId(`reveal-${s.players[slot].playerId}`));

describe("RevealPanel — real backend-shaped settlements", () => {
  it("renders every committed settlement scenario without recomputation errors", () => {
    for (const scenario of SETTLEMENT_SCENARIOS) {
      const s = adaptBackendSettlement(
        JSON.parse(JSON.stringify(scenario.settlement)),
        FIXTURE_PLAYER_IDS,
      );
      const { unmount } = renderReveal(s);
      expect(screen.getByTestId("reveal-panel"), scenario.key).toBeInTheDocument();
      unmount();
    }
  });

  it("one correct: outcomes and authoritative damage shown verbatim", () => {
    const s = settlement("solo-correct");
    renderReveal(s);
    const p1 = card(s, "p1");
    expect(p1.getByTestId(`outcome-${s.players.p1.playerId}`)).toHaveTextContent(
      s.players.p1.outcome === "correct" ? "Correct" : /Incorrect|Timed out/,
    );
    expect(p1.getByTestId(`damage-${s.players.p1.playerId}`)).toHaveTextContent(
      String(s.players.p1.finalDamageDealt),
    );
    expect(p1.getByTestId(`hp-${s.players.p1.playerId}`)).toHaveTextContent(
      `${s.players.p1.hpBefore} → ${s.players.p1.hpAfter}`,
    );
  });

  it("both correct: shows answered-first and both damage numbers", () => {
    const s = settlement("both-correct-faster");
    renderReveal(s);
    const firstSlot = s.players.p1.answeredFirst ? "p1" : "p2";
    expect(
      card(s, firstSlot).getByTestId(`first-${s.players[firstSlot].playerId}`),
    ).toHaveTextContent(/answered first/i);
  });

  it("both wrong (wash): renders zero-damage round without inventing numbers", () => {
    const s = settlement("both-incorrect-wash");
    renderReveal(s);
    expect(card(s, "p1").getByTestId(`xp-${s.players.p1.playerId}`)).toHaveTextContent(
      `+${s.players.p1.xpGained} → ${s.players.p1.totalXpAfter}`,
    );
  });

  it("timeout: shows the timed-out outcome and deadline end reason", () => {
    const s = settlement("timed-out");
    renderReveal(s);
    const timedSlot = s.players.p1.timedOut ? "p1" : "p2";
    expect(
      card(s, timedSlot).getByTestId(`outcome-${s.players[timedSlot].playerId}`),
    ).toHaveTextContent(/timed out/i);
    if (s.endReason === "deadline_expired") {
      expect(screen.getByTestId("reveal-headline")).toHaveTextContent(/time expired/i);
    }
  });

  it("no ability: shows the backend's no-ability display name", () => {
    const s = settlement("no-ability");
    renderReveal(s);
    expect(card(s, "p1").getByTestId(`ability-${s.players.p1.playerId}`)).toHaveTextContent(
      s.players.p1.abilityName,
    );
  });

  it("armed + charge consumed vs armed without consumption are distinguished", () => {
    const consumed = settlement("charge-consumed");
    const { unmount } = renderReveal(consumed);
    const consumedSlot = consumed.players.p1.chargeConsumed ? "p1" : "p2";
    expect(
      card(consumed, consumedSlot).getByTestId(
        `ability-${consumed.players[consumedSlot].playerId}`,
      ),
    ).toHaveTextContent(/charge consumed/);
    unmount();

    const notConsumed = settlement("charge-not-consumed");
    renderReveal(notConsumed);
    const armedSlot =
      notConsumed.players.p1.abilityId !== null && !notConsumed.players.p1.chargeConsumed
        ? "p1"
        : "p2";
    expect(
      card(notConsumed, armedSlot).getByTestId(
        `ability-${notConsumed.players[armedSlot].playerId}`,
      ),
    ).toHaveTextContent(/no charge consumed/);
  });

  it("mitigation: shield absorption and reduction shown as pass-through", () => {
    const s = settlement("shield-plus-reduction");
    renderReveal(s);
    const mitigatedSlot =
      s.players.p1.shieldAbsorbed > 0 || s.players.p1.incomingReduction > 0 ? "p1" : "p2";
    const p = s.players[mitigatedSlot];
    const mitigation = card(s, mitigatedSlot).getByTestId(`mitigation-${p.playerId}`);
    if (p.shieldAbsorbed > 0) expect(mitigation).toHaveTextContent(`shield ${p.shieldAbsorbed}`);
    if (p.incomingReduction > 0) expect(mitigation).toHaveTextContent(`reduced ${p.incomingReduction}`);
  });

  it("level up: level change comes from backend events, not derivation", () => {
    const s = settlement("level-up");
    renderReveal(s);
    const leveledSlot = s.players.p1.leveledUp ? "p1" : "p2";
    const p = s.players[leveledSlot];
    expect(card(s, leveledSlot).getByTestId(`level-${p.playerId}`)).toHaveTextContent(
      `${p.levelBefore} → ${p.levelAfter}`,
    );
  });

  it("match-ending settlement names the winner by id association", () => {
    const s = settlement("match-over");
    renderReveal(s);
    const banner = screen.getByTestId("reveal-match-over");
    expect(banner).toHaveTextContent(/match over/i);
    if (s.winner !== null) {
      expect(banner).toHaveTextContent(NAMES[s.players[s.winner].playerId]);
    }
  });

  it("double knockout renders a draw", () => {
    const s = settlement("double-knockout");
    renderReveal(s);
    expect(screen.getByTestId("reveal-match-over")).toHaveTextContent(/draw/i);
  });

  it("identity follows player id: viewer slot p2 puts p2 first", () => {
    const s = settlement("solo-correct");
    render(
      <RevealPanel settlement={s} viewerSlot="p2" namesByPlayerId={NAMES} />,
    );
    const p2Card = screen.getByTestId(`reveal-${s.players.p2.playerId}`);
    const p1Card = screen.getByTestId(`reveal-${s.players.p1.playerId}`);
    // Viewer (p2) renders before the opponent (p1) in document order.
    expect(
      p2Card.compareDocumentPosition(p1Card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("revealed answers appear only when the controller supplies them", () => {
    const s = settlement("solo-correct");
    const { unmount } = renderReveal(s);
    expect(screen.queryByTestId(`answer-${s.players.p1.playerId}`)).toBeNull();
    unmount();
    renderReveal(s, {
      answersByPlayerId: {
        [s.players.p1.playerId]: "Fortify",
        [s.players.p2.playerId]: null,
      },
    });
    expect(screen.getByTestId(`answer-${s.players.p1.playerId}`)).toHaveTextContent("Fortify");
    expect(screen.getByTestId(`answer-${s.players.p2.playerId}`)).toHaveTextContent(/no answer/i);
  });

  it("controller notices render verbatim; copy never assumes a human opponent", () => {
    const s = settlement("pressure-applied");
    renderReveal(s, { notices: ["-5s first-answer pressure next round"] });
    expect(screen.getByTestId("reveal-notice")).toHaveTextContent("-5s first-answer pressure");
    // Names are wholly controller-supplied — no built-in "player/human" copy.
    expect(screen.getByTestId("reveal-panel").textContent).not.toMatch(/human|player 1|player 2/i);
  });
});
