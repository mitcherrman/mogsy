/**
 * PA2B — the `assembly.v1` renderer and its one adapter, driven by REAL server
 * snapshots (the backend wire capture), through PAV1's unchanged primitive.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import roster from "@/lib/ranked-public/__fixtures__/assemblyRosterLockServerCapture.json";
import draft from "@/lib/ranked-public/__fixtures__/assemblyDraftMemoryServerCapture.json";
import { ASSEMBLY_SLOT_ORDER } from "@/lib/pro-play-assembly/capture";
import {
  ASSEMBLY_LANE_ORDER, readPrivatePlayer, type PrivatePlayerView,
} from "@/lib/ranked-public/contracts";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import { assemblyModule } from "./assemblyModule";
import { placementFromAssignment } from "./assemblyAdapter";
import type { ModuleSegmentActions } from "./types";

type Capture = typeof roster;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function mount(view: PrivatePlayerView, submit: ModuleSegmentActions["submitChallenge"]) {
  const Viewport = assemblyModule.Viewport;
  const actions: ModuleSegmentActions = { submitChallenge: submit, busy: false, error: null };
  return render(
    <Viewport publicRound={view} selection={null} permissions={NO_INTERACTIONS} onSelect={() => {}}
      segmentState={view.segmentState ?? null} actions={actions} skewMs={0} />,
  );
}

/** Seat a card by tapping it, then tapping a well (PAV1's tap-then-tap path). */
function seat(token: string, lane: string) {
  fireEvent.click(screen.getByTestId(`pa-card-${token}`));
  fireEvent.click(screen.getByTestId(`pa-well-${lane}`));
}

/** An open segment whose challenge window is already open (no wake gate). */
function openView(cap: Capture): PrivatePlayerView {
  const body = clone(cap.private_open);
  const st = body.payload.segment_state as Record<string, unknown>;
  st.challenge_started_at = "2000-01-01T00:00:00+00:00";
  return readPrivatePlayer(body);
}

describe.each([["roster_lock", roster], ["draft_memory", draft as unknown as Capture]])(
  "assembly renderer — %s", (family, cap) => {
    const dealt = cap.private_open.payload.segment_state.challenges.challenges[0].cards.map((c) => c.token);

    it("opens an empty board inside the real renderer and refuses an incomplete Lock", () => {
      const submit = vi.fn(() => Promise.resolve(true));
      mount(openView(cap), submit);
      expect(screen.getByTestId("assembly-phase").getAttribute("data-phase")).toBe("open");
      expect(screen.getByTestId("assembly-phase").getAttribute("data-family")).toBe(family);
      seat(dealt[0], "top");
      seat(dealt[1], "jungle");
      fireEvent.click(screen.getByTestId("pa-lock"));
      expect(submit).not.toHaveBeenCalled();
    });

    it("a full board locks ONCE, as a lane-ordered placement, however often Lock is pressed", async () => {
      let resolve!: (ok: boolean) => void;
      const submit = vi.fn(() => new Promise<boolean>((r) => { resolve = r; }));
      mount(openView(cap), submit);
      // Seated in a scrambled order: the wire order is the LANE order, not the order seated.
      const board: Record<string, string> = {
        support: dealt[4], mid: dealt[2], top: dealt[0], adc: dealt[3], jungle: dealt[1],
      };
      for (const [lane, token] of Object.entries(board)) seat(token, lane);
      const lock = screen.getByTestId("pa-lock");
      fireEvent.click(lock);
      fireEvent.click(lock);
      fireEvent.click(lock);
      expect(submit).toHaveBeenCalledTimes(1);
      expect(submit).toHaveBeenCalledWith(0, { placement: ASSEMBLY_LANE_ORDER.map((l) => board[l]) });
      expect(screen.getByTestId("assembly-phase").getAttribute("data-phase")).toBe("locked");
      await act(async () => { resolve(true); });
      fireEvent.click(lock);
      expect(submit).toHaveBeenCalledTimes(1);
    });

    it("a refused Lock stores nothing and reopens the board for a retry", async () => {
      const submit = vi.fn(() => Promise.resolve(false));
      mount(openView(cap), submit);
      ASSEMBLY_LANE_ORDER.forEach((lane, i) => seat(dealt[i], lane));
      await act(async () => { fireEvent.click(screen.getByTestId("pa-lock")); });
      expect(screen.getByTestId("assembly-phase").getAttribute("data-phase")).toBe("open");
      await act(async () => { fireEvent.click(screen.getByTestId("pa-lock")); });
      expect(submit).toHaveBeenCalledTimes(2);
    });

    it("a reload after the lock, before settlement, shows the echoed board locked", () => {
      const body = clone(cap.private_locked);
      (body.payload.segment_state as Record<string, unknown>).own_challenge_reveals = [];
      mount(readPrivatePlayer(body), vi.fn());
      expect(screen.getByTestId("assembly-phase").getAttribute("data-phase")).toBe("locked");
      ASSEMBLY_LANE_ORDER.forEach((lane, i) => {
        expect(screen.getByTestId(`pa-well-${lane}`).getAttribute("data-token"))
          .toBe(cap.meta.submitted_placement_segment_1[i]);
      });
    });

    it("a reload after the reveal shows the server's marks on the board the player saw", () => {
      mount(readPrivatePlayer(cap.private_locked), vi.fn());
      expect(screen.getByTestId("assembly-phase").getAttribute("data-phase")).toBe("revealed");
      expect(assemblyModule.ownsResultReveal?.(readPrivatePlayer(cap.private_locked).segmentState ?? null))
        .toBe(true);
    });
  });

describe("assembly adapter", () => {
  const dealt = ["pa_a", "pa_b", "pa_c", "pa_d", "pa_e", "pa_f"];

  it("speaks PAV1's slot vocabulary exactly (lane order, `adc` for Bot)", () => {
    expect([...ASSEMBLY_LANE_ORDER]).toEqual([...ASSEMBLY_SLOT_ORDER]);
  });

  it("maps an assignment to a placement in lane order, never by label or insertion order", () => {
    expect(placementFromAssignment(
      { support: "pa_e", top: "pa_a", adc: "pa_d", jungle: "pa_b", mid: "pa_c" }, dealt))
      .toEqual(["pa_a", "pa_b", "pa_c", "pa_d", "pa_e"]);
  });

  it("refuses an incomplete, duplicated or foreign board (nothing is sent)", () => {
    const full = { top: "pa_a", jungle: "pa_b", mid: "pa_c", adc: "pa_d", support: "pa_e" };
    expect(placementFromAssignment({ ...full, support: null }, dealt)).toBeNull();
    expect(placementFromAssignment({ ...full, support: "pa_a" }, dealt)).toBeNull();
    expect(placementFromAssignment({ ...full, support: "pa_zzz" }, dealt)).toBeNull();
    const { support: _s, ...four } = full;
    expect(placementFromAssignment(four, dealt)).toBeNull();
  });

  it("source: grades nothing and imports no answer-bearing lab capture", () => {
    const src = (f: string) => readFileSync(resolve(__dirname, f), "utf8");
    for (const f of ["assemblyAdapter.ts", "assemblyModule.tsx"]) {
      const code = src(f);
      expect(code).not.toMatch(/pa1AssemblyCapture|labAuthority|__fixtures__/);
      // No placed token is ever compared with a canonical one.
      expect(code).not.toMatch(/===\s*\w*\.?canonical|canonical\w*\s*\[[^\]]+\]\s*===/);
    }
  });
});
