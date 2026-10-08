import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readPublicRound } from "@/lib/ranked-public/contracts";
import type { SegmentStateView } from "@/lib/ranked-public/contracts";
import {
  publicRoundV2, reconstructChallengeReveal, reconstructRound, reconstructSegmentMeta,
  reconstructState, type ReconstructProbeRound,
} from "@/lib/ranked-public/fixtures";
import { withInlineOrderForgeReveal } from "@/lib/ranked-core/orderForgeLockReveal";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import { getModuleRenderer, rendererForSegment } from "./registry";
import { reconstructModule, toReconstructReveal } from "./reconstructModule";
import type { ModuleSegmentActions } from "./types";

// Wit's End: Negatron Cloak + Recurve Bow ×2 (real backend round, see fixtures).
const WE: ReconstructProbeRound = "witsEnd";
const BOW = "p3";
const CLOAK = "p5";
const CODEX = "p1"; // a decoy

function parse(rawState: unknown) {
  const body = publicRoundV2();
  (body.payload as Record<string, unknown>).segment = reconstructSegmentMeta();
  (body.payload as Record<string, unknown>).segment_state = rawState;
  return readPublicRound(body);
}

function actions(over: Partial<ModuleSegmentActions> = {}): ModuleSegmentActions {
  return { submitChallenge: vi.fn(), busy: false, error: null, ...over };
}

function view(state: SegmentStateView | null, acts: ModuleSegmentActions) {
  return (
    <reconstructModule.Viewport publicRound={readPublicRound(publicRoundV2())}
      selection={null} permissions={NO_INTERACTIONS} onSelect={vi.fn()}
      segmentState={state} actions={acts} skewMs={0} />
  );
}

const opt = (t: string) => screen.getByTestId(`reconstruct-option-${t}`);
const sock = (i: number) => screen.getByTestId(`reconstruct-socket-${i}`);
const place = (t: string, slot: number) => { fireEvent.click(opt(t)); fireEvent.click(sock(slot)); };
const board = () => [0, 1, 2].map((i) => sock(i).getAttribute("data-token"));

afterEach(() => {
  document.documentElement.classList.remove("reduce-motion");
  vi.useRealTimers();
});

describe("reconstruct module renderer — identity", () => {
  it("registers reconstruct v1, owning its submission and asking no quiz question", () => {
    expect(getModuleRenderer("reconstruct")).toBe(reconstructModule);
    expect(reconstructModule.ownsSubmission).toBe(true);
    expect(reconstructModule.projectQuestion(readPublicRound(publicRoundV2()))).toBeNull();
    expect(rendererForSegment(parse(reconstructState(WE)).segment)).toBe(reconstructModule);
  });

  it("owns the result reveal only once its OWN reveal is on the board", () => {
    const open = parse(reconstructState(WE)).segmentState;
    expect(reconstructModule.ownsResultReveal!(open)).toBe(false);
    const revealed = parse(reconstructState(WE, {
      own_challenge_reveals: [reconstructChallengeReveal(WE, "wrong")] },
    reconstructRound(WE).wrong_placement)).segmentState;
    expect(reconstructModule.ownsResultReveal!(revealed)).toBe(true);
  });
});

describe("reconstruct module renderer — open → placed → revised → locked", () => {
  it("shows the target, empty sockets and the six-piece tray with no answer on screen", () => {
    const { container } = render(view(parse(reconstructState(WE)).segmentState, actions()));
    expect(screen.getByTestId("reconstruct-target").textContent).toContain("Wit's End");
    expect(board()).toEqual([null, null, null]);
    expect(screen.getAllByTestId(/^reconstruct-option-p\d$/)).toHaveLength(6);
    expect(container.textContent).not.toMatch(/\d+ g\b/);
    expect(container.textContent).not.toMatch(/×2/);
    expect(screen.getByTestId("reconstruct-lock")).toBeDisabled();
  });

  it("every piece carries the SAME reuse limit, so the tray cannot hint the doubled part", () => {
    render(view(parse(reconstructState(WE)).segmentState, actions()));
    for (const el of screen.getAllByTestId(/^reconstruct-option-p\d$/)) {
      expect(el.getAttribute("aria-label")).toMatch(/used 0 of 3$/);
    }
  });

  it("places, revises and locks the build as `{placement}` at challenge 0", () => {
    const acts = actions();
    render(view(parse(reconstructState(WE)).segmentState, acts));
    place(CODEX, 0);
    place(BOW, 1);
    place(CLOAK, 2);
    expect(board()).toEqual([CODEX, BOW, CLOAK]);
    // Revise: the decoy out, a second bow in (a repeated token, by design).
    place(BOW, 0);
    expect(board()).toEqual([BOW, BOW, CLOAK]);
    expect(screen.getByTestId(`reconstruct-usage-${BOW}`).textContent).toBe("2/3");
    fireEvent.click(screen.getByTestId("reconstruct-lock"));
    expect(acts.submitChallenge).toHaveBeenCalledTimes(1);
    expect(acts.submitChallenge).toHaveBeenCalledWith(0, { placement: [BOW, BOW, CLOAK] });
    expect(screen.getByTestId("reconstruct-phase")).toHaveAttribute("data-phase", "locked");
  });

  it("cannot double-submit while pending; a refused lock reopens with the board intact", async () => {
    let resolveIt: (v: boolean) => void = () => {};
    const acts = actions({ submitChallenge: vi.fn(() => new Promise<boolean>((r) => { resolveIt = r; })) });
    render(view(parse(reconstructState(WE)).segmentState, acts));
    place(BOW, 0); place(BOW, 1); place(CLOAK, 2);
    fireEvent.click(screen.getByTestId("reconstruct-lock"));
    expect(screen.queryByTestId("reconstruct-lock")).toBeNull();
    await act(async () => { resolveIt(false); });
    expect(screen.getByTestId("reconstruct-phase")).toHaveAttribute("data-phase", "open");
    expect(board()).toEqual([BOW, BOW, CLOAK]);
    fireEvent.click(screen.getByTestId("reconstruct-lock"));
    expect(acts.submitChallenge).toHaveBeenCalledTimes(2);
  });

  it("a refreshed page shows the server's echoed build, locked", () => {
    const echoed = reconstructRound(WE).wrong_placement;
    render(view(parse(reconstructState(WE, {}, echoed)).segmentState, actions()));
    expect(screen.getByTestId("reconstruct-phase")).toHaveAttribute("data-phase", "locked");
    expect(board()).toEqual(echoed);
    expect(screen.queryByTestId("reconstruct-lock")).toBeNull();
  });

  it("is inert until the server's open instant", () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    render(view(parse(reconstructState(WE, { challenge_started_at: later })).segmentState, actions()));
    const phase = screen.getByTestId("reconstruct-phase");
    expect(phase).toHaveAttribute("data-not-open", "true");
    expect(phase.hasAttribute("inert")).toBe(true);
  });

  it("the keyboard alone fills and locks a board", () => {
    const acts = actions();
    render(view(parse(reconstructState(WE)).segmentState, acts));
    // Native buttons: Enter/Space are their click. Arrows rove within a group.
    opt("p0").focus();
    fireEvent.keyDown(opt("p0"), { key: "ArrowRight" });
    fireEvent.keyDown(opt("p1"), { key: "ArrowRight" });
    fireEvent.keyDown(opt("p2"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(opt(BOW));
    fireEvent.click(opt(BOW)); fireEvent.click(sock(0));
    fireEvent.click(opt(BOW)); fireEvent.click(sock(1));
    fireEvent.click(opt(CLOAK)); fireEvent.click(sock(2));
    fireEvent.keyDown(sock(2), { key: "Delete" });
    expect(board()).toEqual([BOW, BOW, null]);
    fireEvent.click(opt(CLOAK)); fireEvent.click(sock(2));
    fireEvent.click(screen.getByTestId("reconstruct-lock"));
    expect(acts.submitChallenge).toHaveBeenCalledWith(0, { placement: [BOW, BOW, CLOAK] });
  });

  it("never renders the opponent's progress as anything but a count", () => {
    const { container } = render(view(parse(reconstructState(WE, {
      opponent_challenges_completed: 1, opponent_finished: true }, reconstructRound(WE).wrong_placement))
      .segmentState, actions()));
    expect(screen.getByTestId("reconstruct-opponent-progress").textContent).toBe("Both players have locked in.");
    expect(container.textContent).not.toMatch(/opponent.*(Recurve|Cloak)/i);
  });
});

describe("reconstruct module renderer — reveal", () => {
  function revealed(which: "wrong" | "right", round: ReconstructProbeRound = WE) {
    const r = reconstructRound(round);
    return parse(reconstructState(round, {
      own_challenge_reveals: [reconstructChallengeReveal(round, which)] },
    which === "wrong" ? r.wrong_placement : r.right_placement)).segmentState;
  }

  it("a wrong build: the server's marks, the settled sockets and the teaching recipe", () => {
    document.documentElement.classList.add("reduce-motion");
    render(view(revealed("wrong"), actions()));
    const r = reconstructRound(WE).reveal_wrong;
    r.slot_correct.forEach((ok: boolean, i: number) => {
      expect(sock(i)).toHaveAttribute("data-mark", ok ? "right" : "wrong");
    });
    expect(board()).toEqual(r.settled_placement);
    expect(screen.getByTestId("reconstruct-verdict-text").textContent).toBe("2 of 3 parts right");
    // What the wrong pick was, from the server's own parts list: not a part.
    expect(screen.getByTestId("reconstruct-wrong-notes").textContent).toBe("Fiendish Codex isn't part of it");
    expect(screen.getByTestId("reconstruct-pick-1").textContent).toContain("Fiendish Codex");
    // The recipe panel: Recurve Bow ×2, its own recipe beneath, and the
    // server's figures verbatim — one bow was placed, so "1/2 placed".
    const bow = screen.getByTestId(`reconstruct-evidence-${BOW}`);
    expect(within(bow).getByTestId(`reconstruct-evidence-qty-${BOW}`).textContent).toBe("×2");
    expect(bow.textContent).toContain("700 g");
    expect(bow.textContent).toContain("1/2 placed");
    expect(screen.getByTestId(`reconstruct-children-${BOW}`).textContent).toContain("Dagger");
    expect(screen.getByTestId(`reconstruct-children-${CLOAK}`).textContent).toContain("Null-Magic Mantle");
    expect(screen.getByTestId("reconstruct-evidence-total").textContent).toContain("2800 g");
    expect(screen.getByTestId("reconstruct-evidence-total").textContent).toContain("550 g to combine");
  });

  it("a right build: every mark right, nothing settles, no 'placed' shortfall", () => {
    document.documentElement.classList.add("reduce-motion");
    render(view(revealed("right"), actions()));
    expect(screen.getByTestId("reconstruct-verdict-text").textContent).toBe("Every part right");
    expect(screen.getByTestId("reconstruct-wrong-notes").textContent).toBe("");
    for (const i of [0, 1, 2]) expect(sock(i)).toHaveAttribute("data-mark", "right");
    expect(screen.queryByText(/placed$/)).toBeNull();
  });

  it("a copy too many is named as such, not as a stranger", () => {
    document.documentElement.classList.add("reduce-motion");
    const raw = reconstructRound(WE).reveal_right;
    const tooMany = { ...raw, placement: [BOW, BOW, BOW], is_correct: false,
      slot_correct: [true, true, false], settled_placement: [BOW, BOW, CLOAK] };
    render(view(parse(reconstructState(WE, { own_challenge_reveals: [tooMany] }, [BOW, BOW, BOW])).segmentState,
      actions()));
    expect(screen.getByTestId("reconstruct-wrong-notes").textContent).toBe("One Recurve Bow too many");
    // Both bows were right; the Cloak is the part that went missing.
    expect(screen.getByTestId(`reconstruct-evidence-${BOW}`).textContent).not.toMatch(/placed/);
    expect(screen.getByTestId(`reconstruct-evidence-${CLOAK}`).textContent).toContain("0/1 placed");
  });

  it("a basic part says so; a four-socket recipe teaches all four parts", () => {
    document.documentElement.classList.add("reduce-motion");
    render(view(revealed("wrong", "fourSlot"), actions()));
    expect(screen.getAllByTestId(/^reconstruct-evidence-p\d$/)).toHaveLength(4);
    expect(screen.getByTestId("reconstruct-children-p3")).toHaveAttribute("data-basic", "true");
  });

  it("maps the server's reveal without grading: marks and settled sockets are passed through", () => {
    const raw = reconstructRound(WE).reveal_wrong;
    const parsed = parse(reconstructState(WE, { own_challenge_reveals: [raw] }, reconstructRound(WE).wrong_placement));
    const mapped = toReconstructReveal(parsed.segmentState!.ownChallengeReveals[0].reconstruct!);
    expect(mapped.slotCorrect).toEqual(raw.slot_correct);
    expect(mapped.settled).toEqual(raw.settled_placement);
    expect(mapped.evidence?.parts).toEqual(raw.canonical_parts.map((p: { piece_id: string; quantity: number }) =>
      ({ token: p.piece_id, quantity: p.quantity })));
  });

  it("node continuity: the sockets and the tray box keep their elements and size from open to reveal", () => {
    document.documentElement.classList.add("reduce-motion");
    const open = parse(reconstructState(WE)).segmentState;
    const { rerender } = render(view(open, actions()));
    const box = screen.getByTestId("reconstruct-tray-box");
    const minHeight = box.style.minHeight;
    const slot0 = screen.getByTestId("reconstruct-slot-0");
    rerender(view(revealed("wrong"), actions()));
    expect(screen.getByTestId("reconstruct-tray-box")).toBe(box);
    expect(box.style.minHeight).toBe(minHeight);
    expect(screen.getByTestId("reconstruct-slot-0")).toBe(slot0);
    expect(within(box).getByTestId("reconstruct-evidence")).toBeInTheDocument();
  });

  it("the bot-lock inline reveal attaches to a reconstruct segment only with its own block", () => {
    const state = parse(reconstructState(WE, {}, reconstructRound(WE).wrong_placement)).segmentState!;
    const withRc = parse(reconstructState(WE, {
      own_challenge_reveals: [reconstructChallengeReveal(WE, "wrong")] },
    reconstructRound(WE).wrong_placement)).segmentState!.ownChallengeReveals[0];
    const lock = { matchId: "m", segmentNumber: state.segmentNumber, reveal: withRc };
    expect(withInlineOrderForgeReveal(state, lock, "m")!.ownChallengeReveals).toEqual([withRc]);
    const foreign = { ...lock, reveal: { ...withRc, reconstruct: null, orderForge: null } };
    expect(withInlineOrderForgeReveal(state, foreign, "m")).toBe(state);
    expect(withInlineOrderForgeReveal(state, { ...lock, segmentNumber: 99 }, "m")).toBe(state);
  });
});

describe("reconstruct module renderer — source contract", () => {
  const src = readFileSync(resolve(__dirname, "reconstructModule.tsx"), "utf8");
  it("grades nothing and sums no gold: no grader import, no arithmetic on values", () => {
    expect(src).not.toMatch(/gradeAssembly|grade_assembly/);
    expect(src).not.toMatch(/parseInt|parseFloat|Number\(/);
  });
  it("reads no opponent build", () => {
    expect(src).not.toMatch(/opponent_?submitted|opponentChoices|placements\[/);
  });
});
