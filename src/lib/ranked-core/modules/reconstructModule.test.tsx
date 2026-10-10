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

// Wit's End: Negatron Cloak + Recurve Bow ×2 (real backend round under decoy
// rule v3, see fixtures). Its decoys are all MR / attack-speed pieces now.
const WE: ReconstructProbeRound = "witsEnd";
const BOW = "p3";
const CLOAK = "p1";
const COWL = "p0"; // a decoy (Spectre's Cowl)

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
/** R2: a tap adds one copy into the next empty socket. */
const add = (...ts: string[]) => { for (const t of ts) fireEvent.click(opt(t)); };
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

  it("every piece carries the SAME reuse limit, and none of it is on screen", () => {
    render(view(parse(reconstructState(WE)).segmentState, actions()));
    const pieces = screen.getAllByTestId(/^reconstruct-option-p\d$/);
    // Every name is just the label until a copy is placed: no "of 3", no "0/3".
    for (const el of pieces) expect(el.getAttribute("aria-label")).not.toMatch(/\d|\bof\b|used/);
    add(BOW, BOW);
    expect(opt(BOW)).toHaveAccessibleName("Recurve Bow, two placed");
    expect(screen.getByTestId(`reconstruct-usage-${BOW}`).textContent).toBe("×2");
    expect(screen.getByTestId("reconstruct-tray").textContent).not.toMatch(/\//);
  });

  it("R2 action count: three taps and Lock (R1 needed six actions and Lock)", () => {
    const acts = actions();
    render(view(parse(reconstructState(WE)).segmentState, acts));
    let actionsTaken = 0;
    for (const t of [BOW, BOW, CLOAK]) { fireEvent.click(opt(t)); actionsTaken += 1; }
    fireEvent.click(screen.getByTestId("reconstruct-lock"));
    expect(actionsTaken).toBe(3);
    expect(acts.submitChallenge).toHaveBeenCalledWith(0, { placement: [BOW, BOW, CLOAK] });
  });

  it("adds, revises and locks the build as `{placement}` at challenge 0", () => {
    const acts = actions();
    render(view(parse(reconstructState(WE)).segmentState, acts));
    add(COWL, BOW, CLOAK);
    expect(board()).toEqual([COWL, BOW, CLOAK]);
    // Revise: the decoy out (tap its socket), a second bow in (a repeated
    // token, by design) -- it fills the gap the decoy left.
    fireEvent.click(sock(0));
    add(BOW);
    expect(board()).toEqual([BOW, BOW, CLOAK]);
    expect(screen.getByTestId(`reconstruct-usage-${BOW}`).textContent).toBe("×2");
    fireEvent.click(screen.getByTestId("reconstruct-lock"));
    expect(acts.submitChallenge).toHaveBeenCalledTimes(1);
    expect(acts.submitChallenge).toHaveBeenCalledWith(0, { placement: [BOW, BOW, CLOAK] });
    expect(screen.getByTestId("reconstruct-phase")).toHaveAttribute("data-phase", "locked");
  });

  it("cannot double-submit while pending; a refused lock reopens with the board intact", async () => {
    let resolveIt: (v: boolean) => void = () => {};
    const acts = actions({ submitChallenge: vi.fn(() => new Promise<boolean>((r) => { resolveIt = r; })) });
    render(view(parse(reconstructState(WE)).segmentState, acts));
    add(BOW, BOW, CLOAK);
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
    fireEvent.click(opt(BOW));                    // Enter/Space: the native click
    fireEvent.click(opt(BOW));
    fireEvent.keyDown(opt(BOW), { key: "ArrowLeft" });
    fireEvent.keyDown(opt("p2"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(opt(CLOAK));
    fireEvent.click(opt(CLOAK));
    act(() => { sock(2).focus(); });
    fireEvent.keyDown(sock(2), { key: "Delete" });
    expect(board()).toEqual([BOW, BOW, null]);
    fireEvent.click(opt(CLOAK));
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

  it("a wrong build: the server's marks, the settled sockets and the breakdown", () => {
    document.documentElement.classList.add("reduce-motion");
    render(view(revealed("wrong"), actions()));
    const r = reconstructRound(WE).reveal_wrong;
    r.slot_correct.forEach((ok: boolean, i: number) => {
      expect(sock(i)).toHaveAttribute("data-mark", ok ? "right" : "wrong");
    });
    expect(board()).toEqual(r.settled_placement);
    expect(screen.getByTestId("reconstruct-verdict-text").textContent).toBe("2 of 3 parts right");
    // What the wrong pick was, from the server's own parts list: not a part.
    expect(screen.getByTestId("reconstruct-wrong-notes").textContent).toBe("Spectre's Cowl isn't part of it");
    expect(screen.getByTestId("reconstruct-pick-0").textContent).toContain("Spectre's Cowl");
    // R2 breakdown: each composite part teaches how it is built, every figure
    // the server's (frozen at generation), none computed here.
    const bow = screen.getByTestId(`reconstruct-evidence-${BOW}`);
    expect(within(bow).getByTestId(`reconstruct-evidence-qty-${BOW}`).textContent).toBe("×2");
    expect(within(bow).getByTestId(`reconstruct-evidence-value-${BOW}`).textContent).toBe("700 g each · 1400 g");
    expect(within(bow).getByTestId(`reconstruct-evidence-caption-${BOW}`).textContent).toBe("Built from");
    expect(screen.getByTestId(`reconstruct-children-${BOW}`).textContent).toBe("Dagger250 g");
    expect(within(bow).getByTestId(`reconstruct-evidence-join-${BOW}`).textContent).toBe("+ 450 g to combine");
    const cloak = screen.getByTestId(`reconstruct-evidence-${CLOAK}`);
    expect(within(cloak).getByTestId(`reconstruct-evidence-value-${CLOAK}`).textContent).toBe("850 g");
    expect(screen.getByTestId(`reconstruct-children-${CLOAK}`).textContent).toBe("Null-Magic Mantle400 g");
    expect(within(cloak).getByTestId(`reconstruct-evidence-note-${CLOAK}`).textContent).toBe("0/1 placed");
    // The closing equation: subtotal + combine = price, all server strings.
    expect(screen.getByTestId("reconstruct-evidence-total").textContent)
      .toBe("Parts2250 g+Combine550 g=Wit's End2800 g");
  });

  it("a basic component says so, with its own figure and nothing beneath it", () => {
    document.documentElement.classList.add("reduce-motion");
    render(view(revealed("wrong", "stormrazor"), actions()));
    // B. F. Sword (p4) is basic; Scout's Slingshot (p2) is built from Dagger x2.
    const bf = screen.getByTestId("reconstruct-evidence-p4");
    expect(within(bf).getByTestId("reconstruct-evidence-caption-p4").textContent).toBe("Basic component");
    expect(within(bf).getByTestId("reconstruct-evidence-value-p4").textContent).toBe("1300 g");
    expect(screen.queryByTestId("reconstruct-children-p4")).toBeNull();
    expect(screen.queryByTestId("reconstruct-evidence-join-p4")).toBeNull();
    expect(screen.getByTestId("reconstruct-children-p2").textContent).toBe("Dagger×2250 g");
    expect(screen.getByTestId("reconstruct-evidence-join-p2").textContent).toBe("+ 100 g to combine");
    expect(screen.getByTestId("reconstruct-evidence-total").textContent)
      .toBe("Parts2500 g+Combine700 g=Stormrazor3200 g");
  });

  it("a round frozen before R2 (no breakdown figures) still reveals, omitting what it lacks", () => {
    document.documentElement.classList.add("reduce-motion");
    const raw = JSON.parse(JSON.stringify(reconstructRound(WE).reveal_wrong));
    for (const p of raw.canonical_parts) {
      delete p.part_kind; delete p.combine_display; delete p.line_total_display;
      for (const s of p.sub_parts) delete s.value_display;
    }
    delete raw.target.base_display;
    render(view(parse(reconstructState(WE, { own_challenge_reveals: [raw] },
      reconstructRound(WE).wrong_placement)).segmentState, actions()));
    expect(screen.getByTestId(`reconstruct-children-${BOW}`).textContent).toBe("Dagger");
    expect(screen.queryByTestId(`reconstruct-evidence-join-${BOW}`)).toBeNull();
    expect(screen.getByTestId(`reconstruct-evidence-value-${BOW}`).textContent).toBe("700 g");
    expect(screen.getByTestId("reconstruct-evidence-total").textContent)
      .toBe("Parts+Combine550 g=Wit's End2800 g");
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
    expect(screen.queryByTestId(`reconstruct-evidence-note-${BOW}`)).toBeNull();
    expect(screen.getByTestId(`reconstruct-evidence-note-${CLOAK}`).textContent).toBe("0/1 placed");
  });

  it("a basic part says so; a four-socket recipe teaches all four parts", () => {
    document.documentElement.classList.add("reduce-motion");
    render(view(revealed("wrong", "fourSlot"), actions()));
    expect(screen.getAllByTestId(/^reconstruct-evidence-p\d$/)).toHaveLength(4);
    // Dagger (p5) is basic; Kindlegem (p1) is built from two parts.
    expect(screen.getByTestId("reconstruct-evidence-caption-p5").textContent).toBe("Basic component");
    expect(screen.getByTestId("reconstruct-children-p1").textContent).toBe("Glowing Mote250 gRuby Crystal400 g");
  });

  it("maps the server's reveal without grading: marks and settled sockets are passed through", () => {
    const raw = reconstructRound(WE).reveal_wrong;
    const parsed = parse(reconstructState(WE, { own_challenge_reveals: [raw] }, reconstructRound(WE).wrong_placement));
    const mapped = toReconstructReveal(parsed.segmentState!.ownChallengeReveals[0].reconstruct!);
    expect(mapped.slotCorrect).toEqual(raw.slot_correct);
    expect(mapped.settled).toEqual(raw.settled_placement);
    expect(mapped.evidence?.parts.map((p) => [p.token, p.quantity, p.valueDisplay, p.lineTotalDisplay]))
      .toEqual(raw.canonical_parts.map((p: Record<string, unknown>) =>
        [p.piece_id, p.quantity, p.value_display, p.line_total_display]));
  });

  it("node continuity: the sockets and the tray box keep their elements and size from open to reveal", () => {
    document.documentElement.classList.add("reduce-motion");
    const open = parse(reconstructState(WE)).segmentState;
    const { rerender } = render(view(open, actions()));
    const box = screen.getByTestId("reconstruct-tray-box");
    const sized = [box.className, box.getAttribute("style")];
    const slot0 = screen.getByTestId("reconstruct-slot-0");
    rerender(view(revealed("wrong"), actions()));
    expect(screen.getByTestId("reconstruct-tray-box")).toBe(box);
    expect([box.className, box.getAttribute("style")]).toEqual(sized);
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
    // Every figure in the breakdown is a server field passed through.
    expect(src).toMatch(/valueDisplay: part\.valueDisplay/);
    expect(src).toMatch(/lineTotalDisplay: part\.lineTotalDisplay/);
    expect(src).toMatch(/valueDisplay: s\.valueDisplay/);
    expect(src).toMatch(/valueDisplay: t\.baseDisplay/);
  });
  it("reads no opponent build", () => {
    expect(src).not.toMatch(/opponent_?submitted|opponentChoices|placements\[/);
  });
});
