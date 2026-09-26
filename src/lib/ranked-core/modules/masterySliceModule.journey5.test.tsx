/**
 * JOURNEY5 — the FINAL Journey child reveals before the module completes, and
 * a Combat reveal carries the server's structured working.
 *
 * Through the production parser and the production `masterySliceModule`
 * viewport, on envelopes DERIVED from real J4 captures
 * (`lib/journey/__fixtures__/j5/finalWindow.ts` names each source snapshot).
 * Server time is pinned to each snapshot's own instant (skew 0).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import {
  pantheonStandardChild3RevealWithWorking, pantheonStandardFinalWindow,
  pantheonStandardFinalWindowStale, pantheonSurvivalFinalChild, PANTHEON_COMPONENT,
  type DerivedSnapshot,
} from "@/lib/journey/__fixtures__/j5/finalWindow";
import { masterySliceModule } from "./masterySliceModule";

type Snap = { label: string; at: string; envelope: Record<string, unknown> };
const J4 = resolve(process.cwd(), "src/lib/journey/__fixtures__/j4");
const realSnap = (file: string, label: string): Snap => {
  const s = (JSON.parse(readFileSync(join(J4, `${file}.json`), "utf8")) as Snap[]).find((x) => x.label === label);
  if (!s) throw new Error(`${file}: ${label}`);
  return s;
};

const Viewport = masterySliceModule.Viewport;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function view(s: Snap | DerivedSnapshot) {
  const round = readPublicRound(s.envelope);
  return (
    <QueryClientProvider client={queryClient}>
      <Viewport publicRound={round} segmentState={round.segmentState} selection={null}
        permissions={NO_INTERACTIONS} onSelect={() => {}}
        actions={{ submitChallenge: () => {}, busy: false, error: null }} skewMs={0} />
    </QueryClientProvider>
  );
}
/** A fresh mount at one snapshot (what a refresh would see). */
function show(s: Snap | DerivedSnapshot) {
  vi.setSystemTime(Date.parse(s.at));
  return render(view(s));
}
/** Child 5 open (real capture), then the server's final-window read — the live sequence. */
function playIntoFinalWindow(final: DerivedSnapshot) {
  const live = realSnap("pantheon.standard", "child4-live");
  vi.setSystemTime(Date.parse(live.at));
  const r = render(view(live));
  act(() => { vi.advanceTimersByTime(Date.parse(final.at) - Date.parse(live.at)); });
  vi.setSystemTime(Date.parse(final.at));
  r.rerender(view(final));
  return r;
}
const phase = () => screen.getByTestId("mastery-slice-challenge-phase");

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("JOURNEY5 — the final child's reveal (own_finished + own_revealing_card_index)", () => {
  it("child 5 CORRECT: answer → settle → the reveal is visible for the window → then completion, nothing after", () => {
    const final = pantheonStandardFinalWindow("correct");
    playIntoFinalWindow(final);
    // own_finished is true, yet the module shows child 5's reveal — not "complete".
    expect(phase()).toHaveAttribute("data-challenge-index", "4");
    expect(phase()).toHaveAttribute("data-revealing", "true");
    expect(screen.queryByTestId("mastery-slice-waiting")).toBeNull();
    const reveal = screen.getByTestId("mastery-inline-reveal");
    expect(reveal).toHaveAttribute("data-correct", "true");
    expect(within(reveal).getByTestId("mastery-reveal-answer")).toHaveTextContent("90");
    // Visible through (almost) the whole frozen window.
    act(() => { vi.advanceTimersByTime(1_700); });
    expect(phase()).toHaveAttribute("data-revealing", "true");
    // Then the module's completion. No extra child, no transition, no beat.
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.queryByTestId("mastery-slice-challenge-phase")).toBeNull();
    expect(screen.getByTestId("mastery-slice-waiting")).toBeInTheDocument();
    expect(screen.queryByTestId("journey-next-pending")).toBeNull();
    expect(screen.queryByTestId("journey-beat")).toBeNull();
    expect(screen.getByTestId("journey-step")).toHaveTextContent("Step 5 of 5");
  });

  it("child 5 INCORRECT: the reveal is visible, with the player's own pick and the served answer", () => {
    playIntoFinalWindow(pantheonStandardFinalWindow("incorrect"));
    expect(phase()).toHaveAttribute("data-revealing", "true");
    const reveal = screen.getByTestId("mastery-inline-reveal");
    expect(reveal).toHaveAttribute("data-correct", "false");
    expect(within(reveal).getByTestId("mastery-reveal-answer")).toHaveTextContent("90");
  });

  it("child 5 TIMED OUT: the reveal is still shown (player_answer null), with the correct answer", () => {
    const final = pantheonStandardFinalWindow("timeout");
    playIntoFinalWindow(final);
    expect(phase()).toHaveAttribute("data-challenge-index", "4");
    expect(phase()).toHaveAttribute("data-revealing", "true");
    const reveal = screen.getByTestId("mastery-inline-reveal");
    expect(reveal).toHaveAttribute("data-correct", "false");
    expect(within(reveal).getByTestId("mastery-reveal-answer")).toHaveTextContent("90");
    expect(screen.queryByTestId("mastery-slice-submit")).toBeNull();
  });

  it("a RECONNECT during the final window shows the reveal (fresh mount)", () => {
    show(pantheonStandardFinalWindow("correct"));
    expect(phase()).toHaveAttribute("data-challenge-index", "4");
    expect(phase()).toHaveAttribute("data-revealing", "true");
  });

  it("a fresh mount AFTER own_reveal_until does not replay it (B10)", () => {
    show(pantheonStandardFinalWindowStale());
    expect(screen.queryByTestId("mastery-slice-challenge-phase")).toBeNull();
    expect(screen.queryByTestId("mastery-inline-reveal")).toBeNull();
    expect(screen.getByTestId("mastery-slice-waiting")).toBeInTheDocument();
  });

  it("Survival: the Journey's LAST child (3 of 3) reveals in its final window too", () => {
    show(pantheonSurvivalFinalChild());
    expect(phase()).toHaveAttribute("data-challenge-index", "2");
    expect(phase()).toHaveAttribute("data-revealing", "true");
    expect(within(screen.getByTestId("mastery-inline-reveal")).getByTestId("mastery-reveal-answer"))
      .toHaveTextContent("75");
  });

  it("Survival strike 3 on the final child: no final hold is entered (the server names none)", () => {
    show(pantheonSurvivalFinalChild({ strikeOut: true }));
    expect(screen.queryByTestId("mastery-inline-reveal")).toBeNull();
  });
});

describe("JOURNEY5 — structured Combat working on the reveal", () => {
  it("the final child's reveal draws the server's working as the primary reveal; the prose stays secondary", () => {
    playIntoFinalWindow(pantheonStandardFinalWindow("correct"));
    const w = screen.getByTestId("journey-combat-working");
    expect(w).toHaveTextContent(
      "Formula (E rank 1): 55 + 100% attack damage (81.4745) + 150% bonus attack damage (10)");
    expect(within(w).getByTestId("journey-combat-working-raw")).toHaveTextContent("151.4745");
    expect(within(w).getByTestId("journey-combat-working-armor")).toHaveTextContent("68.872");
    expect(w.querySelector("[data-step='penetration']")).toHaveTextContent("No penetration");
    expect(within(w).getByTestId("journey-combat-working-effective")).toHaveTextContent("68.872");
    expect(within(w).getByTestId("journey-combat-working-multiplier")).toHaveTextContent("0.5922");
    expect(within(w).getByTestId("journey-combat-working-final")).toHaveTextContent("89.6978");
    expect(within(w).getByTestId("journey-combat-working-answer")).toHaveTextContent("90");
    // Stated armor: no recall note.
    expect(within(w).queryByTestId("journey-combat-working-armor-source")).toBeNull();
    // The served prose is still there, as secondary text.
    expect(screen.getByTestId("mastery-reveal-explanation-secondary")).toBeInTheDocument();
    expect(screen.getByTestId("mastery-reveal-explanation")).toHaveTextContent("89.698 damage, which rounds to 90");
  });

  it("a RECALLED armor: the working shows the value actually used and the step that taught it", () => {
    show(pantheonStandardChild3RevealWithWorking());
    expect(phase()).toHaveAttribute("data-revealing", "true");
    const w = screen.getByTestId("journey-combat-working");
    expect(within(w).getByTestId("journey-combat-working-armor")).toHaveTextContent("50.08");
    expect(within(w).getByTestId("journey-combat-working-armor-source")).toHaveTextContent("(recalled from step 1)");
    expect(w.querySelector("[data-step='armor']")).toHaveTextContent("→ Leona armor 50.08 (recalled from step 1)");
    expect(within(w).getByTestId("journey-combat-working-answer")).toHaveTextContent("83");
  });

  it("no combat_working on the wire → today's prose-only reveal, unchanged (real capture)", () => {
    show(realSnap("pantheon.standard", "child2-reveal"));
    expect(phase()).toHaveAttribute("data-revealing", "true");
    expect(screen.queryByTestId("journey-combat-working")).toBeNull();
    expect(screen.queryByTestId("mastery-reveal-explanation-secondary")).toBeNull();
    expect(screen.getByTestId("mastery-reveal-explanation")).toHaveTextContent("82.534 damage, which rounds to 83");
  });

  it("a MALFORMED combat_working drops only the working: the match keeps rendering the prose reveal", () => {
    const s = pantheonStandardChild3RevealWithWorking();
    const seg = s.envelope.payload.segment_state;
    seg.own_challenge_reveals[2].combat_working.surprise = 1;
    show(s);
    expect(phase()).toHaveAttribute("data-revealing", "true");
    expect(screen.queryByTestId("journey-combat-working")).toBeNull();
    expect(screen.getByTestId("mastery-reveal-explanation")).toHaveTextContent("82.534 damage, which rounds to 83");
  });

  it("a live (unrevealed) Combat child never draws a working", () => {
    show(realSnap("pantheon.standard", "child4-live"));
    expect(phase()).not.toHaveAttribute("data-revealing");
    expect(screen.queryByTestId("journey-combat-working")).toBeNull();
    expect(screen.getByTestId("mastery-slice-submit")).toBeInTheDocument();
  });
});

describe("JOURNEY5 — the Combat premise's ability_component", () => {
  it("is stated, verbatim, in the question sentence beside the slot and rank — not as a target chip", () => {
    show(pantheonStandardChild3RevealWithWorking());
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      `How much physical damage, after armor, does Pantheon's Aegis Assault (E, rank 1, ${PANTHEON_COMPONENT}) deal to Leona?`);
    expect(within(screen.getByTestId("journey-combat-target")).queryByText(PANTHEON_COMPONENT)).toBeNull();
    expect(screen.queryByTestId("journey-combat-ability_component")).toBeNull();
  });
});

describe("JOURNEY5-LIVE — the lead-in before child 1 opens", () => {
  for (const [file, count] of [["pantheon.standard", 5], ["pantheon.survival", 3]] as const) {
    it(`${file}: reads 'Step 1 of ${count} is opening…', never 'Mastery Slice complete'`, () => {
      show(realSnap(file, "child0-leadin"));
      expect(screen.queryByTestId("mastery-slice-waiting")).toBeNull();
      expect(screen.getByTestId("journey-next-pending")).toHaveTextContent(`Step 1 of ${count} is opening…`);
    });
  }

  it("even if a lead-in snapshot claims own_finished (the old counter quirk), it is not 'complete'", () => {
    const s = structuredClone(realSnap("pantheon.standard", "child0-leadin"));
    const seg = (s.envelope.payload as { segment_state: Record<string, unknown> }).segment_state;
    seg.own_finished = true;
    show(s);
    expect(screen.queryByTestId("mastery-slice-waiting")).toBeNull();
    expect(screen.getByTestId("journey-next-pending")).toHaveTextContent("Step 1 of 5 is opening…");
  });
});

/* ── JOURNEY5-LIVE — a BLOCK-clocked one-child Review re-ask ───────────────── */
describe("JOURNEY5-LIVE — Daily Review's block-clocked re-ask is not answerable before started_at", () => {
  const J3 = resolve(process.cwd(), "src/lib/journey/__fixtures__/j3");
  const reask = (): Snap => (JSON.parse(readFileSync(join(J3, "review.reask.json"), "utf8")) as Snap[])
    .find((x) => x.label === "reask-live")!;
  function mountWith(s: Snap, at: number, submitChallenge: (i: number, c: unknown) => unknown) {
    vi.setSystemTime(at);
    const round = readPublicRound(s.envelope);
    const ui = () => (
      <QueryClientProvider client={queryClient}>
        <Viewport publicRound={round} segmentState={round.segmentState} selection={null}
          permissions={NO_INTERACTIONS} onSelect={() => {}}
          actions={{ submitChallenge: submitChallenge as never, busy: false, error: null }} skewMs={0} />
      </QueryClientProvider>
    );
    const r = render(ui());
    return { rerender: () => r.rerender(ui()), round };
  }
  const pick = () => act(() => { screen.getAllByRole("radio")[1].click(); });
  const submit = () => act(() => { screen.getByTestId("mastery-submit-button").click(); });

  it("rendered during the lead-in: the child is shown but inert, and no submission is sent until it opens", async () => {
    const s = reask();
    const startedAt = Date.parse((s.envelope.payload as { active_round: { started_at: string } }).active_round.started_at);
    const sent: unknown[] = [];
    const { round } = mountWith(s, startedAt - 2000, (i, c) => { sent.push([i, c]); return Promise.resolve(true); });
    expect(round.segmentState!.cardTimerMs).toBeNull();
    const phase = screen.getByTestId("mastery-slice-challenge-phase");
    expect(phase).toHaveAttribute("data-not-open", "true");
    expect(phase).toHaveAttribute("inert");
    expect(screen.getByTestId("journey-board")).toBeInTheDocument();
    pick();
    submit();
    expect(sent).toEqual([]);
    // The server's started_at arrives: one wake, input opens, the answer goes.
    await act(async () => { vi.advanceTimersByTime(2100); });
    expect(screen.getByTestId("mastery-slice-challenge-phase")).not.toHaveAttribute("data-not-open");
    expect(screen.getByTestId("mastery-slice-challenge-phase")).not.toHaveAttribute("inert");
    pick();
    submit();
    expect(sent).toHaveLength(1);
  });

  it("a refused submit (409 RANKED_CARD_NOT_OPEN → false) leaves the child answerable; a second submit goes through", async () => {
    const s = reask();
    const results = [false, true];
    const sent: unknown[] = [];
    mountWith(s, Date.parse(s.at), (i, c) => { sent.push([i, c]); return Promise.resolve(results.shift()!); });
    pick();
    submit();
    expect(sent).toHaveLength(1);
    await act(async () => { await Promise.resolve(); });
    // Not stuck on "Submitting…": the button is live again.
    expect(screen.getByTestId("mastery-submit-button")).not.toBeDisabled();
    pick();
    submit();
    expect(sent).toHaveLength(2);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("mastery-submit-button")).toBeDisabled();
  });
});
