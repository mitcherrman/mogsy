/**
 * The PLAY seal, where the MALT lobby flow and PLAY1 meet.
 *
 * These two changes arrived from opposite directions and both survived the
 * integration, so the seam between them is the thing worth pinning:
 *
 *   MALT   the role carousel moves against LOCAL state, and the account is
 *          written exactly once — when the reader commits by pressing PLAY.
 *          `role_set` is limited to ten writes a minute, and browsing five
 *          mascots twice used to exhaust it.
 *   PLAY1  pressing PLAY does not navigate. It opens the match-entry record
 *          on the lobby, and the only navigation left in the flow is the
 *          handoff once the SERVER has a match.
 *
 * The rule that has to hold across both is the one MALT wrote as "a refusal
 * does not navigate". There is no navigation to withhold any more, so it is
 * the RECORD that is withheld: the queue join sends no role — the backend
 * reads the player's stored preference inside the join transaction — so
 * entering the record on a refused write would queue them as whoever they
 * used to be, with nothing on screen saying so.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sfx = vi.hoisted(() => ({ play: vi.fn() }));

/**
 * PLAY1's sound layer, stubbed to a spy.
 *
 * The real `usePlaySfx` reads the app's one sound-settings store, which
 * constructs the Supabase client — and the pinned jsdom gives that client no
 * working Storage, so importing it turns a clean suite into one carrying an
 * unhandled rejection (see `src/test/localStorageStub.ts`). The gate itself is
 * covered by `src/lib/audio/play-sfx.test.ts`; the spy is also what lets the
 * cases below count soundings.
 */
vi.mock("@/lib/audio/usePlaySfx", () => ({
  usePlaySfx: () => ({ play: sfx.play }),
}));

// The record polls the Ranked queue and reads the Academy roster the moment it
// opens. Neither is what these tests are about, and neither should reach a
// network from a hub test.
vi.mock("@/pages/quiz-ranked/useRankedQueue", () => ({
  useRankedQueue: () => ({
    state: "selecting_class", status: null, matchId: null, selectedClass: "tank",
    unavailableReason: null, error: null, canCancel: false,
    setSelectedClass: vi.fn(), join: vi.fn(), joinAs: vi.fn(),
    joinWithoutClass: vi.fn(), cancel: vi.fn(),
  }),
}));
vi.mock("@/hooks/useFriends", () => ({
  useFriends: () => ({ friends: [], loading: false }),
}));

import LeaguecraftHub from "./LeaguecraftHub";
import type { RankedState } from "@/lib/quiz/featured-mock";

afterEach(cleanup);
beforeEach(() => sfx.play.mockClear());

const PLACED: RankedState = {
  placementMatchesRemaining: 0,
  isPlaced: true,
  estimatedGain: 25,
  estimatedLoss: 15,
};

function renderHub(over: Partial<React.ComponentProps<typeof LeaguecraftHub>> = {}) {
  const onPlayRanked = vi.fn(() => true);
  const utils = render(
    <MemoryRouter>
      <LeaguecraftHub
        progress={{ rank_name: "Bronze", next_rank_name: "Silver", progress_percent: 10 }}
        ranked={PLACED}
        onPlayRanked={onPlayRanked}
        onCommitRole={() => true}
        onEnterMatch={() => {}}
        onPlayDailyChallenge={() => {}}
        playModes={{ ranked: true, daily: true, invite: true }}
        rankedRole="jungle"
        sets={[]}
        setsLoading={false}
        onSelectSet={() => {}}
        onRefreshSets={() => {}}
        history={null}
        historyLoading={false}
        historyError={null}
        {...over}
      />
    </MemoryRouter>,
  );
  return { ...utils, onPlayRanked };
}

const seal = () => screen.getByTestId("ranked-play-gem");

describe("PLAY commits the role, then opens the record", () => {
  it("asks the host to commit before anything opens", async () => {
    const { onPlayRanked } = renderHub();
    expect(screen.queryByTestId("play-scroll")).toBeNull();

    fireEvent.click(seal());

    expect(onPlayRanked).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
  });

  it("waits for an ASYNC commit before opening", async () => {
    // The real host writes the role over the network. The record must not
    // appear while that write is still in flight.
    let release: (ok: boolean) => void = () => {};
    const onPlayRanked = vi.fn(
      () => new Promise<boolean>((resolve) => { release = resolve; }),
    );
    renderHub({ onPlayRanked });

    fireEvent.click(seal());
    expect(onPlayRanked).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("play-scroll")).toBeNull();

    release(true);
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
  });

  it("does NOT open the record when the commit is refused", async () => {
    // An active match, a live queue entry, a rate limit. The host surfaces its
    // own notice; the lobby's job is simply not to carry the reader onward.
    const onPlayRanked = vi.fn(() => false);
    renderHub({ onPlayRanked });

    fireEvent.click(seal());

    expect(onPlayRanked).toHaveBeenCalledTimes(1);
    // Given a tick to be sure nothing opens late.
    await Promise.resolve();
    expect(screen.queryByTestId("play-scroll")).toBeNull();
  });

  it("does not open on a refused ASYNC commit either", async () => {
    const onPlayRanked = vi.fn(async () => false);
    renderHub({ onPlayRanked });
    fireEvent.click(seal());
    await waitFor(() => expect(onPlayRanked).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByTestId("play-scroll")).toBeNull();
  });

  it("holds the seal still while the commit is in flight", () => {
    // The seal is the one commit point, so a second press must not start a
    // second write and a second record.
    renderHub({ playDisabled: true });
    expect(seal()).toBeDisabled();
  });

  it("opens straight away when the route asked for it, with no commit", async () => {
    // Arriving from a matchless `/quiz/ranked`. Nothing was chosen on this
    // lobby, so there is nothing to write — and re-committing on mount would
    // be a role write the reader never asked for.
    const { onPlayRanked } = renderHub({ playScrollOpenOnMount: true });
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    expect(onPlayRanked).not.toHaveBeenCalled();
  });
});


/* ────────────────────────────────────────────────────────────────────────────
 * PLAY1 SOUND — the hub's one cue.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("the PLAY seal's sound", () => {
  const cues = () => sfx.play.mock.calls.flat();

  it("sounds the record unrolling exactly once", async () => {
    renderHub();
    fireEvent.click(seal());
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    expect(cues()).toEqual(["scrollOpen"]);
  });

  it("stays silent while an async gate is still resolving", async () => {
    let release: (ok: boolean) => void = () => {};
    renderHub({
      onPlayRanked: vi.fn(() => new Promise<boolean>((r) => { release = r; })),
    });
    fireEvent.click(seal());
    // Nothing has been decided, so nothing may be announced.
    expect(cues()).toEqual([]);
    release(true);
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    expect(cues()).toEqual(["scrollOpen"]);
  });

  /**
   * A WITHHELD OPEN IS SILENT — no unroll, and no refusal cue either.
   *
   * `onPlayRanked` no longer writes anything: the role commit moved onto the
   * record's Ranked clause. The only thing it withholds for is a write already
   * in flight from a previous press, and nothing is put on screen for that. A
   * negative cue with no visible refusal beside it is the interface making a
   * noise about its own internals.
   */
  it("says nothing at all when the open is withheld", async () => {
    renderHub({ onPlayRanked: vi.fn(() => false) });
    fireEvent.click(seal());
    await Promise.resolve();
    expect(cues()).toEqual([]);
    expect(screen.queryByTestId("play-scroll")).toBeNull();
  });

  it("makes no sound when the ROUTE opened the record for us", async () => {
    // Arriving from a matchless `/quiz/ranked`. Nothing was pressed on this
    // lobby, so there is no action to sound — the record simply is open.
    renderHub({ playScrollOpenOnMount: true });
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    expect(cues()).toEqual([]);
  });
});
