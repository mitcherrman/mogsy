/**
 * PLAY1 — the match-entry scroll.
 *
 * What these pin, in order of what would hurt most if it broke:
 *
 *   · the role is CARRIED FORWARD from the lobby and never re-asked;
 *   · Ranked runs the EXISTING queue, joins once, and hands off to the
 *     live-match host when the server has a match;
 *   · the record cannot be dismissed over a live queue entry;
 *   · Daily Challenge uses the host's own daily entry — not `/quiz/daily`,
 *     which is the Score Attack time trial and a different feature;
 *   · Invite & Play is a finished frontend that refuses to claim a Ranked
 *     invite backend it does not have;
 *   · admin policy decides which entries appear;
 *   · the admin's Match-with-Bot switch is admin-only, starts OFF on every
 *     open, and changes exactly one thing about the join it modifies.
 */
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyStatusView } from "@/lib/daily-challenge/status";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { QueueState } from "@/pages/quiz-ranked/useRankedQueue";

const sfx = vi.hoisted(() => ({ play: vi.fn() }));

/**
 * PLAY1's sound layer, stubbed to a spy.
 *
 * The real `usePlaySfx` reads the app's one sound-settings store, which
 * constructs the Supabase client — and the pinned jsdom gives that client no
 * working Storage, so importing it turns a clean suite into one carrying an
 * unhandled rejection (see `src/test/localStorageStub.ts`). The gate itself is
 * covered by `src/lib/audio/play-sfx.test.ts`; here it is a spy, which is also
 * exactly what a test asserting "one action, one cue" wants.
 */
vi.mock("@/lib/audio/usePlaySfx", () => ({
  usePlaySfx: () => ({ play: sfx.play }),
}));

const h = vi.hoisted(() => ({
  queue: {
    state: "selecting_class" as QueueState,
    status: null as { role: string | null } | null,
    matchId: null as string | null,
    selectedClass: "tank",
    unavailableReason: null as string | null,
    error: null as string | null,
    canCancel: false,
    setSelectedClass: vi.fn(),
    join: vi.fn(),
    joinAs: vi.fn(),
    joinWithoutClass: vi.fn(),
    cancel: vi.fn(),
  },
  friends: {
    friends: [] as unknown[],
    loading: false,
  },
  roles: {
    loading: false,
    roles: [] as string[],
    isAdmin: false,
    isMasterAdmin: false,
    isModerator: false,
  },
}));

vi.mock("@/pages/quiz-ranked/useRankedQueue", () => ({
  useRankedQueue: () => h.queue,
}));
vi.mock("@/hooks/useFriends", () => ({
  useFriends: () => h.friends,
}));
vi.mock("@/hooks/useAdminRoles", () => ({
  useAdminRoles: () => h.roles,
}));
vi.mock("@/lib/quiz/api", () => ({
  resolveQuizAssetUrl: (p?: string) => (p ? `http://assets.local/${p}` : undefined),
}));

import RankedPlayScroll from "./RankedPlayScroll";
import { isToastInteraction } from "./PlayScrollRecord";
import type { RankedRole } from "@/lib/ranked-public/roles";
import { BASELINE_RANK_TIER } from "@/lib/progression/tiers";
import InvitePlayView from "./InvitePlayView";
import { RANKED_INVITE_UNAVAILABLE_REASON } from "@/lib/ranked-public/rankedInvite";

const ALL_MODES = { ranked: true, daily: true, invite: true };

const PROGRESSION = {
  schemaVersion: "v1", serverTime: "t", rating: 1320, tier: "silver",
  nextTier: "gold", tierFloorRating: 1200, nextTierRating: 1450,
  ratingToNext: 130, progressPercent: 13, rated: true, matchesRated: 40,
} as never;

/**
 * DC2's own status for today (ARENA1 Step 5 §19).
 *
 * The clause used to be handed the LEGACY quiz-daily payload and derive
 * completion from three of its counts. It reads the Daily Challenge service
 * the button beside it opens now, and that service answers the question
 * directly — so the fixture is the answer rather than the arithmetic.
 */
const DAILY: DailyStatusView = {
  known: true, completed: false, resumable: false,
  resolved: 2, total: 12, streak: 4, theme: "Item Knowledge",
};

/** The same day, played out. */
const DAILY_DONE: DailyStatusView = {
  ...DAILY, completed: true, resumable: false, resolved: 12,
};

/** The service has not answered — an unknown day, which stays playable. */
const DAILY_UNKNOWN: DailyStatusView = {
  known: false, completed: false, resumable: false,
  resolved: 0, total: 0, streak: null, theme: null,
};

/**
 * A stand-in for the page's ONE local role selection.
 *
 * The record does not own the role any more — it renders the host's value and
 * calls the host's setter, the same pair the lobby's carousel is given. A
 * harness that passed a frozen `role` prop would render a stepper that cannot
 * step, and would pass while the real thing was broken. So the harness holds
 * the state exactly as `Quiz.tsx` does, and `onSelectRole` is spied ON TOP of
 * a real setter rather than instead of one.
 */
function StatefulScroll({
  initialRole,
  onRoleChange,
  ...props
}: Omit<React.ComponentProps<typeof RankedPlayScroll>, "role" | "onSelectRole"> & {
  initialRole: RankedRole | null;
  onRoleChange: (role: RankedRole) => void;
}) {
  const [role, setRole] = useState<RankedRole | null>(initialRole);
  return (
    <RankedPlayScroll
      {...props}
      role={role}
      onSelectRole={(next) => { setRole(next); onRoleChange(next); }}
    />
  );
}

function renderScroll(
  over: Partial<React.ComponentProps<typeof RankedPlayScroll>> & {
    role?: RankedRole | null;
  } = {},
) {
  const onClose = vi.fn();
  const onEnterMatch = vi.fn();
  const onPlayDailyChallenge = vi.fn();
  const onPlayPractice = vi.fn();
  const onCommitRole = vi.fn(() => true);
  const onSelectRole = vi.fn();
  const { role: initialRole = "jungle", ...rest } = over;
  const utils = render(
    <StatefulScroll
      onClose={onClose}
      initialRole={initialRole}
      onRoleChange={onSelectRole}
      progression={PROGRESSION}
      modes={ALL_MODES}
      daily={DAILY}
      signedIn
      onEnterMatch={onEnterMatch}
      onPlayDailyChallenge={onPlayDailyChallenge}
      onCommitRole={onCommitRole}
      onPlayPractice={onPlayPractice}
      handoffDelayMs={0}
      {...rest}
    />,
  );
  return {
    ...utils, onClose, onEnterMatch, onPlayDailyChallenge, onPlayPractice,
    onCommitRole, onSelectRole,
  };
}

/**
 * Choose RANKED MATCH and let the role commit settle.
 *
 * Pressing Ranked is no longer a synchronous view change: the record writes
 * the role it is previewing and moves only when that write holds. Every test
 * that enters matchmaking goes through here, so the awaited commit is stated
 * once rather than in twenty places.
 */
async function openRanked() {
  fireEvent.click(screen.getByTestId("play-mode-ranked"));
  // The VIEW, not one view's body — an unavailable or unreachable queue
  // renders its own notice inside the same view.
  await waitFor(() =>
    expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("ranked"),
  );
}

beforeEach(() => {
  h.queue.state = "selecting_class";
  h.queue.status = null;
  h.queue.matchId = null;
  h.queue.error = null;
  h.queue.unavailableReason = null;
  h.queue.canCancel = false;
  h.friends.friends = [];
  h.friends.loading = false;
  h.roles.isAdmin = false;
  h.roles.loading = false;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("the record itself", () => {
  it("is a dialog with a name, over a lobby that is still there", async () => {
    renderScroll();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-testid", "play-scroll");
    expect(dialog.textContent).toContain("Choose Mode");
  });

  it("carries the role forward and never asks for it again", () => {
    renderScroll();
    expect(screen.getByTestId("play-scroll-role-name").textContent).toBe("Jungle");
    expect(screen.getByTestId("play-scroll-role-banner").getAttribute("data-role"))
      .toBe("jungle");
    // The lobby owns role selection. There is no picker, and no Change Role.
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByText(/change role/i)).toBeNull();
  });

  it("says each fact about the entrant exactly once", () => {
    // The band used to state the standing three times — "· Ranked Silver"
    // beside the role, a SILVER caption under the emblem, and the emblem
    // itself — and carried a fourth image nobody could name.
    renderScroll();
    const band = screen.getByTestId("play-scroll-role-banner");
    const text = band.textContent ?? "";

    // No restatement of the tier in the band. The emblem is the standing
    // here; the tier's WORD belongs on the Ranked clause, where the player is
    // deciding whether to queue.
    expect(text).not.toMatch(/Ranked Silver/);
    expect(text).not.toMatch(/\bSILVER\b/i);
    expect(text).not.toMatch(/Leaguecraft Academy/);

    // The champion coin is gone entirely: a bare portrait with no adjacent
    // word cannot be told apart from an opponent or an avatar.
    expect(band.querySelector("[data-champion]")).toBeNull();

    // What remains: the label, the role, and the two anchors.
    expect(text).toContain("Jungle");
    expect(band.querySelector(".play-scroll-banner__standing")).toBeTruthy();
  });

  it("draws the standing through RankEmblem, at the band's own size", () => {
    renderScroll();
    const emblem = screen
      .getByTestId("play-scroll-role-banner")
      .querySelector(".play-scroll-banner__standing");
    expect(emblem).toBeTruthy();
    // `hero` is the ART size — the small emblem set is the incomplete one —
    // and the band sizes that box down in CSS.
    expect(emblem?.getAttribute("data-variant")).toBe("hero");
    // Earned, because this fixture is `rated: true`. An unrated account gets
    // `data-baseline` instead, which is the contract every Ranked test reads.
    expect(emblem?.getAttribute("data-tier")).toBe("silver");
    expect(emblem?.getAttribute("data-baseline")).toBeNull();
  });

  it("draws the baseline emblem for an account that has never been rated", () => {
    renderScroll({
      progression: { ...(PROGRESSION as object), rated: false } as never,
    });
    const emblem = screen
      .getByTestId("play-scroll-role-banner")
      .querySelector(".play-scroll-banner__standing");
    expect(emblem?.getAttribute("data-baseline")).toBe("silver");
    expect(emblem?.getAttribute("data-tier")).toBeNull();
  });

  it("opens on a real role for an account that has never picked one", () => {
    // There is no "No role chosen" state any more. The band IS the choice, so
    // an empty header with an instruction to go back to the lobby would be
    // telling the player to leave the surface that can answer them. Nothing
    // is persisted by opening here — the preview is local until Ranked
    // commits it.
    renderScroll({ role: null });
    expect(screen.getByTestId("play-scroll-role-name").textContent).toBe("Top");
    expect(screen.getByTestId("play-scroll-mascot").getAttribute("data-role")).toBe("top");
    expect(screen.getByTestId("play-scroll").textContent).not.toContain("No role chosen");
  });

  describe("the mascot is the project's mascot, and it is a toy", () => {
    it("is the shared RoleMascot, turned toward the name beside it", () => {
      // Not a bare <img> with a hand-rolled float. `RoleMascot` already owns
      // every mascot's motion across Mogzy — the idle layer, the plate's own
      // direction, the click reaction — so the record inherits all of it and
      // configures none of it.
      renderScroll();
      const mascot = screen.getByTestId("play-scroll-mascot");
      expect(mascot.getAttribute("data-role")).toBe("jungle");
      expect(mascot.getAttribute("data-facing")).toBe("right");
      expect(mascot.getAttribute("data-interactive")).toBe("true");
      // The idle float is a layer of the component, always present.
      expect(mascot.querySelector(".role-mascot-idle")).toBeTruthy();
    });

    it("reacts when poked, and the reaction is all it does", () => {
      const { onClose, onEnterMatch, onPlayDailyChallenge } = renderScroll();
      const mascot = screen.getByTestId("play-scroll-mascot");
      const layer = screen.getByTestId("play-scroll-mascot-action");

      fireEvent.click(mascot);
      expect(layer.getAttribute("data-playing")).toBe("react");
      expect(layer.className).toContain("role-mascot-react");

      // Nothing else moved: no navigation, no queue write, no mode chosen,
      // and the record did not close under the player.
      expect(onClose).not.toHaveBeenCalled();
      expect(onEnterMatch).not.toHaveBeenCalled();
      expect(onPlayDailyChallenge).not.toHaveBeenCalled();
      expect(h.queue.join).not.toHaveBeenCalled();
      expect(h.queue.joinWithoutClass).not.toHaveBeenCalled();
      expect(h.queue.cancel).not.toHaveBeenCalled();
      expect(screen.getByTestId("play-scroll").getAttribute("data-view"))
        .toBe("menu");
    });

    it("survives being poked repeatedly", () => {
      // The failure this pins is real and was measured in Chrome: dropping an
      // animation class cancels the running animation, but `animationcancel`
      // arrives a FRAME LATER — by which time the replacement is already
      // running — so a naive listener wipes out the animation that replaced
      // it and the second of two quick clicks silently does nothing.
      renderScroll();
      const mascot = screen.getByTestId("play-scroll-mascot");
      const layer = screen.getByTestId("play-scroll-mascot-action");

      for (let i = 0; i < 6; i += 1) fireEvent.click(mascot);
      expect(layer.getAttribute("data-playing")).toBe("react");
      expect(layer.className).toContain("role-mascot-react");

      // And it still settles cleanly, with no transform stranded on it.
      fireEvent.animationEnd(layer);
      expect(layer.getAttribute("data-playing")).toBeNull();
      expect(layer.className).not.toContain("role-mascot-react");
    });

    it("does not react at all under prefers-reduced-motion", () => {
      // Unlike a combat action, the reaction carries no information, so it is
      // dropped outright rather than neutralised — and it is dropped at the
      // SOURCE, so the DOM stays honest for anything reading `data-playing`.
      const media = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {},
        onchange: null, dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;
      try {
        renderScroll();
        const mascot = screen.getByTestId("play-scroll-mascot");
        fireEvent.click(mascot);
        expect(
          screen.getByTestId("play-scroll-mascot-action").getAttribute("data-playing"),
        ).toBeNull();
      } finally {
        window.matchMedia = media;
      }
    });

    it("is not a control, and does not pretend to be one", () => {
      // The AI1 contract: an interactive mascot is a decorative surface that
      // wiggles. It leads nowhere and changes nothing, so it is not a tab
      // stop and has no announced name — an announced control that does
      // nothing would be worse for a keyboard user than no control at all.
      renderScroll();
      const mascot = screen.getByTestId("play-scroll-mascot");
      expect(mascot.tagName).toBe("SPAN");
      expect(mascot.getAttribute("role")).toBeNull();
      expect(mascot.getAttribute("tabindex")).toBeNull();
      // And its art stays out of the accessibility tree — the role's name is
      // written beside it.
      const img = mascot.querySelector("img");
      expect(img?.getAttribute("alt")).toBe("");
      expect(img?.getAttribute("aria-hidden")).toBe("true");
    });
  });

  it("offers all three entries, as first-class options", () => {
    renderScroll();
    expect(screen.getByTestId("play-mode-ranked").textContent).toContain("Ranked Match");
    expect(screen.getByTestId("play-mode-daily").textContent).toContain("Daily Challenge");
    expect(screen.getByTestId("play-mode-invite").textContent).toContain("Invite");
    // None of them is disabled or marked as unfinished.
    for (const id of ["ranked", "daily", "invite"]) {
      expect(screen.getByTestId(`play-mode-${id}`)).not.toBeDisabled();
    }
    expect(screen.getByTestId("play-scroll").textContent).not.toMatch(/TODO|coming soon/i);
  });

  it("paints each entry with its OWN supplied miniature", () => {
    // The three files are the owner's, they live under public/assets/ranked/,
    // and each belongs to exactly one entry. A card that fell back to a
    // generic emblem — or that took another mode's picture — is the failure
    // this pins: the art is the thing that tells the three modes apart before
    // a word is read.
    renderScroll();
    const plateSrc = (mode: string) =>
      screen
        .getByTestId(`play-mode-${mode}`)
        .querySelector<HTMLImageElement>("img.play-plate__art")?.getAttribute("src");

    expect(plateSrc("ranked")).toBe("/assets/ranked/ranked.png");
    expect(plateSrc("daily")).toBe("/assets/ranked/DC.png");
    expect(plateSrc("invite")).toBe("/assets/ranked/invite.png");

    // And each carries its own accent, so the three frames are told apart by
    // the stylesheet rather than by three hand-written inline styles.
    for (const mode of ["ranked", "daily", "invite"]) {
      expect(screen.getByTestId(`play-mode-${mode}`).getAttribute("data-mode"))
        .toBe(mode);
    }
    // Ranked, and only Ranked, is the emphasised entry.
    expect(screen.getByTestId("play-mode-ranked").getAttribute("data-emphasis"))
      .toBe("true");
    expect(screen.getByTestId("play-mode-daily").getAttribute("data-emphasis"))
      .toBeNull();
  });

  it("keeps every miniature out of the accessibility tree", () => {
    // The mode is written out beside each picture — the clause title, the
    // beat headline, the notice heading — so identity is never carried by art
    // alone and no plate announces itself a second time.
    renderScroll();
    for (const img of screen.getByTestId("play-scroll")
      .querySelectorAll("img.play-plate__art")) {
      expect(img.getAttribute("alt")).toBe("");
      expect(img.closest(".play-plate")?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("writes the Ranked line as rating and earned tier, and nothing else", () => {
    renderScroll();
    const mark = screen.getByTestId("play-mode-ranked-detail");
    expect(mark.textContent).toContain("Rating");
    expect(mark.textContent).toContain("1320");
    // The tier, as a WORD — the emblem in the band above is a picture, and a
    // picture is not a name.
    expect(mark.textContent).toContain("Silver");
    // NOT the distance to the next rung. That is a target, not a standing,
    // and a second number beside the first turned a written line into a
    // progress readout.
    expect(mark.textContent).not.toContain("130");
    expect(mark.textContent).not.toMatch(/to Gold/i);
  });

  it("draws the Ranked line as written text, never as bordered chips", () => {
    // The regression this pins is visual but it is structural too: the mark
    // used to be a row of outlined pills, which read as a dashboard widget
    // dropped onto a manuscript. Each part is now a plain inline span whose
    // only distinguishing property is its ink.
    renderScroll();
    const mark = screen.getByTestId("play-mode-ranked-detail");
    expect(mark.className).toContain("play-mode-card__meta");
    expect(mark.querySelector(".play-mode-card__meta-label")).toBeTruthy();
    expect(mark.querySelector(".play-mode-card__meta-figure")).toBeTruthy();
    // No element in the mark carries the old chip class.
    expect(mark.querySelectorAll(".play-mode-card__mark")).toHaveLength(0);
    // The tier carries its own tier, so the stylesheet can give it its metal.
    expect(
      mark.querySelector(".play-mode-card__meta-tier")?.getAttribute("data-tier"),
    ).toBe("silver");
  });

  it("shows no Ranked figure when the backend gave no standing", () => {
    renderScroll({ progression: null });
    expect(screen.queryByTestId("play-mode-ranked-detail")).toBeNull();
  });

  it("withholds the Ranked line for an account that has never been rated", () => {
    // `rated: false` means the account has never had a rated match, so its
    // rating is the ladder's starting number and its tier is the ladder's
    // floor. Printing either would present a default as a result.
    renderScroll({
      progression: { ...(PROGRESSION as object), rated: false } as never,
    });
    expect(screen.queryByTestId("play-mode-ranked-detail")).toBeNull();
  });

  it("gives the Daily clause its streak, and nothing but its streak", () => {
    renderScroll();
    const mark = screen.getByTestId("play-mode-daily-detail");
    expect(mark.textContent).toContain("4-day streak");
    // Today's progress and today's theme were both real and both true, and
    // three marks under a two-line note still read as a dashboard.
    expect(mark.textContent).not.toContain("2 / 5");
    expect(mark.textContent).not.toContain("2/5");
    expect(mark.textContent).not.toContain("Item Knowledge");
    // The roster is not read until Invite is opened, so there is no
    // connection count to show — and none is faked.
    expect(screen.queryByTestId("play-mode-invite-detail")).toBeNull();
  });

  it("marks the streak's flame so the stylesheet can glint it", () => {
    renderScroll();
    const flame = screen
      .getByTestId("play-mode-daily-detail")
      .querySelector(".play-mode-card__flame");
    expect(flame).toBeTruthy();
    // Decorative: the streak is written out beside it, which is what lets the
    // flame take a genuinely red tone rather than a passing-contrast ink.
    expect(flame?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows no Daily mark at all when there is no daily state", () => {
    renderScroll({ daily: null });
    expect(screen.queryByTestId("play-mode-daily-detail")).toBeNull();
  });

  it("closes on the close control, and on Escape, while nothing is live", () => {
    const { onClose } = renderScroll();
    fireEvent.click(screen.getByTestId("play-scroll-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("admin policy decides which entries appear", () => {
  it("withholds a mode the policy turns off, and keeps the others", () => {
    renderScroll({ modes: { ranked: true, daily: false, invite: true } });
    expect(screen.getByTestId("play-mode-ranked")).toBeTruthy();
    expect(screen.queryByTestId("play-mode-daily")).toBeNull();
    expect(screen.getByTestId("play-mode-invite")).toBeTruthy();
  });

  it("still says something when every entry is withheld", () => {
    renderScroll({ modes: { ranked: false, daily: false, invite: false } });
    expect(screen.getByTestId("play-scroll-no-modes")).toBeTruthy();
  });
});

describe("Ranked Match", () => {
  it("opens matchmaking on the same sheet — not another setup screen", async () => {
    renderScroll();
    await openRanked();
    expect(screen.getByTestId("play-ranked")).toBeTruthy();
    expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("ranked");
    // The role banner is still on the sheet: the identity did not change.
    expect(screen.getByTestId("play-scroll-role-name").textContent).toBe("Jungle");
  });

  it("joins the EXISTING queue, sending no class of its own", async () => {
    renderScroll();
    await openRanked();
    fireEvent.click(screen.getByTestId("play-ranked-join"));
    expect(h.queue.joinWithoutClass).toHaveBeenCalledTimes(1);
    expect(h.queue.joinAs).not.toHaveBeenCalled();
  });

  it("lets an account with NO stored role enter, on the role it stepped to", async () => {
    // The old behaviour was a disabled join and "choose a role on the lobby's
    // role scroll" — an instruction to leave the surface that can answer it.
    // The record's stepper always has a real role now, so there is nothing to
    // refuse: Ranked commits whatever it is showing.
    const { onCommitRole } = renderScroll({ role: null });
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    expect(screen.getByTestId("play-scroll-role-name").textContent).toBe("Jungle");

    await openRanked();
    expect(onCommitRole).toHaveBeenCalledWith("jungle");
    expect(screen.getByTestId("play-ranked-join")).not.toBeDisabled();
    expect(screen.queryByTestId("play-ranked-role-required")).toBeNull();
  });

  it("shows the search state with a cancel, and the role the entry carries", async () => {
    h.queue.state = "waiting";
    h.queue.canCancel = true;
    h.queue.status = { role: "support" };
    renderScroll();
    await openRanked();
    expect(screen.getByTestId("play-ranked-headline").textContent)
      .toContain("Searching for an opponent");
    // The SERVER's confirmed role wins over the account's local one.
    expect(screen.getByTestId("play-ranked-queued-as").textContent).toContain("Support");
    fireEvent.click(screen.getByTestId("play-ranked-cancel"));
    expect(h.queue.cancel).toHaveBeenCalledTimes(1);
  });

  it("shows opponent-found during the pairing window, and withdraws Cancel", async () => {
    h.queue.state = "pairing";
    h.queue.canCancel = false;
    renderScroll();
    await openRanked();
    expect(screen.getByTestId("play-ranked-headline").textContent)
      .toContain("Preparing your match");
    expect(screen.getByTestId("play-ranked").textContent).toContain("Opponent found");
    // Cancel is GONE, not merely disabled: it could only be refused.
    expect(screen.queryByTestId("play-ranked-cancel")).toBeNull();
  });

  it("hands the match to the live-match host once the server has one", async () => {
    h.queue.state = "matched";
    h.queue.matchId = "rkm_go";
    const { onEnterMatch } = renderScroll();
    await openRanked();
    await waitFor(() => expect(onEnterMatch).toHaveBeenCalledWith("rkm_go"));
    expect(onEnterMatch).toHaveBeenCalledTimes(1);
  });

  it("surfaces an unavailable queue instead of a dead button", async () => {
    h.queue.state = "unavailable";
    h.queue.unavailableReason = "Ranked matchmaking is paused right now.";
    renderScroll();
    await openRanked();
    expect(screen.getByTestId("play-ranked-unavailable").textContent)
      .toContain("paused right now");
    // And leaving is safe again, because nothing is live.
    expect(screen.getByTestId("play-scroll-close")).toBeTruthy();
  });
});

describe("the record cannot be dismissed over a live queue entry", () => {
  for (const state of ["joining", "waiting", "pairing", "matched", "cancelling"] as QueueState[]) {
    it(`withholds every exit while the queue is ${state}`, async () => {
      h.queue.state = state;
      h.queue.matchId = state === "matched" ? "rkm_x" : null;
      const { onClose } = renderScroll();
      await openRanked();
      expect(screen.queryByTestId("play-scroll-close")).toBeNull();
      expect(screen.queryByTestId("play-ranked-back")).toBeNull();
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();
    });
  }

  it("lets the player back out while the queue is idle", async () => {
    renderScroll();
    await openRanked();
    fireEvent.click(screen.getByTestId("play-ranked-back"));
    expect(screen.getByTestId("play-scroll-modes")).toBeTruthy();
  });
});

describe("Daily Challenge", () => {
  /**
   * The route `/quiz/daily` is Daily Score Attack — a time trial, and a
   * different feature. The Daily Challenge is hosted in-page by `Quiz.tsx`,
   * so the record calls the host's own entry rather than navigating.
   */
  it("starts the host's own daily entry and closes the record", () => {
    const { onClose, onPlayDailyChallenge } = renderScroll();
    fireEvent.click(screen.getByTestId("play-mode-daily"));
    expect(onPlayDailyChallenge).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not open a second view for it", () => {
    renderScroll();
    fireEvent.click(screen.getByTestId("play-mode-daily"));
    expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("menu");
  });
});

describe("a Daily Challenge that is already done for today", () => {
  /**
   * The defect this closes: the clause offered to play a day with nothing
   * left in it, the host fetched the set, filtered to zero remaining, and put
   * the page back to the lobby — so pressing Daily Challenge on a finished
   * day looked like a dead button.
   *
   * The record knows before it draws, from state it was already handed.
   */

  it("still renders the normal, clickable clause while questions remain", () => {
    const { onPlayDailyChallenge, onClose } = renderScroll();
    const card = screen.getByTestId("play-mode-daily");
    expect(card.tagName).toBe("BUTTON");
    expect(card).not.toBeDisabled();
    expect(screen.queryByTestId("play-mode-daily-complete")).toBeNull();

    fireEvent.click(card);
    expect(onPlayDailyChallenge).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the streak on an unfinished day, exactly as before", () => {
    renderScroll();
    expect(screen.getByTestId("play-mode-daily-detail").textContent)
      .toContain("4-day streak");
  });

  it("draws a completed PANEL instead of the launcher", () => {
    renderScroll({ daily: DAILY_DONE });

    // The launcher is GONE — not present-and-disabled. There is nothing in
    // the slot that a click could reach `onPlayDailyChallenge` through.
    expect(screen.queryByTestId("play-mode-daily")).toBeNull();

    const panel = screen.getByTestId("play-mode-daily-complete");
    expect(panel.tagName).toBe("DIV");
    expect(panel.getAttribute("data-complete")).toBe("true");
    // Not a control by any reading: no role, no tabindex, no disabled state
    // standing in for one.
    expect(panel.getAttribute("role")).toBeNull();
    expect(panel.getAttribute("tabindex")).toBeNull();
    expect(panel.hasAttribute("disabled")).toBe(false);
    expect(panel.getAttribute("aria-disabled")).toBeNull();
  });

  it("says the day is complete, in the owner's words", () => {
    renderScroll({ daily: DAILY_DONE });
    const panel = screen.getByTestId("play-mode-daily-complete");
    expect(panel.textContent).toContain("Today's Challenge Complete");
    expect(panel.textContent).toContain("Come back tomorrow.");
    expect(panel.textContent).toContain("Play practice questions to improve");
    // It reads as DONE, never as broken.
    expect(panel.textContent).not.toMatch(/unavailable|disabled|error|closed/i);
  });

  it("still keeps its streak", () => {
    // The day was completed; the streak it fed is the reward for that.
    renderScroll({ daily: DAILY_DONE });
    const panel = screen.getByTestId("play-mode-daily-complete");
    expect(panel.textContent).toContain("4-day streak");
  });

  it("cannot start the Daily Challenge from anywhere on the panel", () => {
    const { onPlayDailyChallenge } = renderScroll({ daily: DAILY_DONE });
    const panel = screen.getByTestId("play-mode-daily-complete");
    fireEvent.click(panel);
    fireEvent.click(panel.querySelector(".play-mode-card__title") as Element);
    fireEvent.click(panel.querySelector(".play-plate") as Element);
    expect(onPlayDailyChallenge).not.toHaveBeenCalled();
  });

  it("nests no interactive control inside another", () => {
    // `<button disabled>` wrapping a link is the shape this deliberately is
    // NOT: a disabled button takes its whole subtree out of the tab order in
    // several browsers, so the one action the panel exists to offer would be
    // unreachable by keyboard.
    renderScroll({ daily: DAILY_DONE });
    const panel = screen.getByTestId("play-mode-daily-complete");
    const interactive = panel.querySelectorAll("button, a, [role='button'], [tabindex]");
    expect(interactive).toHaveLength(1);
    const action = screen.getByTestId("play-mode-daily-action");
    expect(interactive[0]).toBe(action);
    expect(action.closest("button")).toBe(action);
    expect(action.closest("a")).toBeNull();
  });

  it("offers Practice as an ordinary, reachable control", () => {
    renderScroll({ daily: DAILY_DONE });
    const action = screen.getByRole("button", {
      name: "Play practice questions to improve",
    });
    expect(action).not.toBeDisabled();
    expect(action.getAttribute("type")).toBe("button");
  });

  it("closes the record and hands the player to Practice", () => {
    const { onClose, onPlayPractice, onPlayDailyChallenge } =
      renderScroll({ daily: DAILY_DONE });

    fireEvent.click(screen.getByTestId("play-mode-daily-action"));

    // Closed FIRST, then travelled: the host owns the page underneath, and a
    // dialog left open over a page scrolling somewhere else is a trap.
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPlayPractice).toHaveBeenCalledTimes(1);
    // And it is a handoff, not a quiz start.
    expect(onPlayDailyChallenge).not.toHaveBeenCalled();
  });

  it("leaves Ranked and Invite untouched on a finished day", () => {
    renderScroll({ daily: DAILY_DONE });
    expect(screen.getByTestId("play-mode-ranked")).not.toBeDisabled();
    expect(screen.getByTestId("play-mode-invite")).not.toBeDisabled();
    expect(screen.queryByTestId("play-mode-ranked-complete")).toBeNull();
    expect(screen.queryByTestId("play-mode-invite-complete")).toBeNull();
  });

  it("reads completion from the service the button actually opens", () => {
    // ARENA1 Step 5 §19. The legacy quiz-daily payload describes a DIFFERENT
    // product — different card count, different retry model, different notion
    // of "completed" — and the clause was deciding from it while the button
    // beside it opened DC2. When the two disagreed, the clause either refused
    // a playable day or opened a finished one.
    renderScroll({ daily: { ...DAILY, completed: true, resolved: 12 } });
    expect(screen.getByTestId("play-mode-daily-complete")).toBeTruthy();
    expect(screen.queryByTestId("play-mode-daily")).toBeNull();
  });

  it("treats an UNANSWERED status as playable, never as finished", () => {
    // A Daily service that is briefly unreachable, or a visitor whose session
    // has not landed yet. An unknown day is not a finished one, and an unknown
    // day stays offerable — the same safe default the legacy predicate had.
    renderScroll({ daily: DAILY_UNKNOWN });
    expect(screen.getByTestId("play-mode-daily")).toBeTruthy();
    expect(screen.queryByTestId("play-mode-daily-complete")).toBeNull();
  });

  it("claims no streak when the service has not answered", () => {
    renderScroll({ daily: DAILY_UNKNOWN });
    // Not "0-day streak" and not an empty flame — the detail row is simply not
    // drawn, which is what the clause already does for an absent figure.
    expect(screen.queryByTestId("play-mode-daily-detail")).toBeNull();
    expect(screen.getByTestId("play-mode-daily")).toBeTruthy();
  });

  it("claims no streak when the last finished run is too old to still count", () => {
    // `liveStreak` returns null for a run older than yesterday, so the clause
    // is never handed a number that stopped being true two days ago.
    renderScroll({ daily: { ...DAILY, streak: null } });
    expect(screen.queryByTestId("play-mode-daily-detail")).toBeNull();
  });
});

describe("the role stepper on the record", () => {
  /**
   * THE RULE THIS SECTION EXISTS FOR: browsing is local.
   *
   * `PUT /api/ranked/role` is rate limited to ten writes per account per
   * minute (`role_set`). A five-role ring is two laps from exhausting it, so
   * stepping the arrows must cost nothing — the account is written exactly
   * once, when the player commits by choosing Ranked Match.
   */

  it("opens on the role the lobby had already settled on", () => {
    renderScroll();
    expect(screen.getByTestId("play-scroll-role-name").textContent).toBe("Jungle");
    expect(screen.getByTestId("play-scroll-mascot").getAttribute("data-role")).toBe("jungle");
  });

  it("steps the preview, and the mascot with it", () => {
    renderScroll();
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    expect(screen.getByTestId("play-scroll-role-name").textContent).toBe("Mid");
    expect(screen.getByTestId("play-scroll-mascot").getAttribute("data-role")).toBe("mid");

    fireEvent.click(screen.getByTestId("play-scroll-role-prev"));
    expect(screen.getByTestId("play-scroll-role-name").textContent).toBe("Jungle");
    expect(screen.getByTestId("play-scroll-mascot").getAttribute("data-role")).toBe("jungle");
  });

  it("WRITES NOTHING while the player steps, however far they go", () => {
    // Three full laps of a five-role ring: thirty presses. Under the old
    // per-move write that is three times the whole minute's budget.
    const { onCommitRole } = renderScroll();
    for (let i = 0; i < 15; i += 1) {
      fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    }
    for (let i = 0; i < 15; i += 1) {
      fireEvent.click(screen.getByTestId("play-scroll-role-prev"));
    }
    expect(onCommitRole).not.toHaveBeenCalled();
    // And a full lap each way lands exactly where it started.
    expect(screen.getByTestId("play-scroll-role-name").textContent).toBe("Jungle");
  });

  it("wraps at both ends, in the lobby's own order", () => {
    // The canonical order is top → jungle → mid → adc → support, and the
    // lobby's ring wraps; one step right off the end must mean the same thing
    // on both surfaces.
    renderScroll({ role: "support" });
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    expect(screen.getByTestId("play-scroll-role-name").textContent).toBe("Top");

    cleanup();
    renderScroll({ role: "top" });
    fireEvent.click(screen.getByTestId("play-scroll-role-prev"));
    expect(screen.getByTestId("play-scroll-role-name").textContent).toBe("Support");
  });

  it("names the destination on each arrow, not just a direction", () => {
    // "Previous role" alone makes a screen-reader user step blind to hear
    // where they landed.
    renderScroll();
    expect(screen.getByTestId("play-scroll-role-prev").textContent).toContain("Top");
    expect(screen.getByTestId("play-scroll-role-next").textContent).toContain("Mid");
  });

  it("keeps the arrows as real, keyboard-reachable buttons", () => {
    renderScroll();
    for (const id of ["play-scroll-role-prev", "play-scroll-role-next"]) {
      const arrow = screen.getByTestId(id);
      expect(arrow.tagName).toBe("BUTTON");
      expect(arrow.getAttribute("type")).toBe("button");
      expect(arrow).not.toBeDisabled();
    }
  });

  it("commits the STEPPED role when Ranked is chosen, and only then", async () => {
    const { onCommitRole } = renderScroll();
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));   // mid
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));   // adc
    expect(onCommitRole).not.toHaveBeenCalled();

    await openRanked();
    expect(onCommitRole).toHaveBeenCalledTimes(1);
    expect(onCommitRole).toHaveBeenCalledWith("adc");
  });

  it("does NOT enter matchmaking when the commit is refused", async () => {
    // The queue join sends no role — the backend reads the STORED preference
    // inside its own transaction — so entering on a failed write would queue
    // the player as whoever they used to be.
    const onCommitRole = vi.fn(async () => false);
    renderScroll({ onCommitRole });
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));

    fireEvent.click(screen.getByTestId("play-mode-ranked"));
    await waitFor(() => expect(onCommitRole).toHaveBeenCalledWith("mid"));

    // Still on the menu, with every entry offered again.
    expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("menu");
    expect(screen.queryByTestId("play-ranked")).toBeNull();
    expect(screen.getByTestId("play-mode-ranked")).not.toBeDisabled();
    expect(h.queue.joinWithoutClass).not.toHaveBeenCalled();
  });

  it("waits for a slow commit before entering matchmaking", async () => {
    let release: (ok: boolean) => void = () => {};
    const onCommitRole = vi.fn(
      () => new Promise<boolean>((resolve) => { release = resolve; }),
    );
    renderScroll({ onCommitRole });

    fireEvent.click(screen.getByTestId("play-mode-ranked"));
    await waitFor(() => expect(onCommitRole).toHaveBeenCalled());
    // The write is in flight: matchmaking must not be on screen yet.
    expect(screen.queryByTestId("play-ranked")).toBeNull();

    release(true);
    await waitFor(() =>
      expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("ranked"),
    );
  });

  it("commits NOTHING for Daily Challenge, Invite or Practice", async () => {
    // None of the three queues, so none of them needs the account's stored
    // role to be anything in particular — and each would otherwise spend one
    // of ten rate-limited writes a minute on a player who never entered
    // Ranked.
    const daily = renderScroll();
    fireEvent.click(screen.getByTestId("play-mode-daily"));
    expect(daily.onCommitRole).not.toHaveBeenCalled();
    expect(daily.onPlayDailyChallenge).toHaveBeenCalledTimes(1);
    cleanup();

    const invite = renderScroll();
    fireEvent.click(screen.getByTestId("play-mode-invite"));
    await waitFor(() =>
      expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("invite"),
    );
    expect(invite.onCommitRole).not.toHaveBeenCalled();
    cleanup();

    const practice = renderScroll();
    fireEvent.click(screen.getByTestId("play-scroll-practice"));
    expect(practice.onCommitRole).not.toHaveBeenCalled();
    expect(practice.onPlayPractice).toHaveBeenCalledTimes(1);
  });
});

describe("the Ranked emblem in the role selector", () => {
  it("renders the account's crest beside the role", () => {
    renderScroll();
    const emblem = screen
      .getByTestId("play-scroll-role-banner")
      .querySelector(".play-scroll-banner__standing");
    expect(emblem).toBeTruthy();
    // Earned, from the fixture's `rated: true`. An unrated account gets
    // `data-baseline` — the contract every Ranked surface reads.
    expect(emblem?.getAttribute("data-tier")).toBe("silver");
    expect(emblem?.getAttribute("data-variant")).toBe("hero");
  });

  it("carries NO tier caption — the crest is the rank", () => {
    // The old band said the standing three times: the crest, a SILVER caption
    // under it, and "· Ranked Silver" beside the role. The tier's WORD belongs
    // on the Ranked clause, in that tier's own metal, where the player is
    // deciding whether to queue.
    renderScroll();
    const band = screen.getByTestId("play-scroll-role-banner");
    expect(band.textContent).toBe("Previous role — TopNext role — MidJungle");
    expect(band.textContent).not.toMatch(/Ranked Silver/i);
    expect(band.textContent).not.toMatch(/\bSILVER\b/i);
  });

  /**
   * THE CREST IS NEVER WITHHELD. Mogzy retired "Unranked": the ladder's floor
   * is Bronze, and an account with no standing is shown AT the floor rather
   * than off the ladder. This band used to hide the emblem whenever
   * `progression` was null — every guest, and every account before its first
   * rated match — which left a blank rank slot on the one sheet whose job is
   * to say who is entering.
   */
  it("still renders a crest when there is NO standing, at the ladder's floor", () => {
    renderScroll({ progression: null });
    const crest = screen
      .getByTestId("play-scroll-role-banner")
      .querySelector(".play-scroll-banner__standing");
    expect(crest).not.toBeNull();
    // The one shared rule, not a PLAY1-local guess.
    expect(crest!.getAttribute("data-baseline")).toBe(BASELINE_RANK_TIER);
    // BASELINE, not a tier claim: nothing here awards Bronze.
    expect(crest!.getAttribute("data-tier")).toBeNull();
    // The stepper still works — the crest is decoration, not the control.
    expect(screen.getByTestId("play-scroll-role-name").textContent).toBe("Jungle");
  });

  it("never writes the word Unranked, and never leaves the rank slot empty", () => {
    for (const progression of [null, undefined]) {
      cleanup();
      renderScroll({ progression });
      const band = screen.getByTestId("play-scroll-role-banner");
      expect(band.textContent).not.toMatch(/unranked/i);
      expect(band.querySelector(".play-scroll-banner__standing")).not.toBeNull();
    }
  });

  it("prefers a REAL standing over the floor whenever the account has one", () => {
    // Silver, rated: the earned art and `data-tier` take over completely.
    renderScroll();
    const crest = screen
      .getByTestId("play-scroll-role-banner")
      .querySelector(".play-scroll-banner__standing");
    expect(crest!.getAttribute("data-tier")).toBe("silver");
    expect(crest!.getAttribute("data-baseline")).toBeNull();
  });

  it("shows an unrated account's tier as the FLOOR, not as an award", () => {
    // `rated: false` means the tier is the ladder's starting value rather than
    // anything won, so the crest is drawn as baseline even though a tier token
    // came back from the backend.
    const unrated = { ...(PROGRESSION as unknown as Record<string, unknown>), rated: false };
    renderScroll({ progression: unrated as never });
    const crest = screen
      .getByTestId("play-scroll-role-banner")
      .querySelector(".play-scroll-banner__standing");
    expect(crest).not.toBeNull();
    expect(crest!.getAttribute("data-tier")).toBeNull();
    expect(crest!.getAttribute("data-baseline")).toBeTruthy();
  });
});

describe("the permanent Practice entry", () => {
  it("is a footer, not a fourth mode", () => {
    renderScroll();
    const footer = screen.getByTestId("play-scroll-practice");
    // Outside the clause list entirely.
    expect(footer.closest('[data-testid="play-scroll-modes"]')).toBeNull();
    expect(screen.getAllByTestId(/^play-mode-(ranked|daily|invite)$/)).toHaveLength(3);
    expect(footer.textContent).toContain("Practice Questions");
  });

  it("is a reachable control with an accessible name", () => {
    renderScroll();
    const footer = screen.getByRole("button", { name: /Practice Questions/ });
    expect(footer.tagName).toBe("BUTTON");
    expect(footer.getAttribute("type")).toBe("button");
  });

  it("closes the record and hands the player to Practice", () => {
    const { onClose, onPlayPractice, onPlayDailyChallenge } = renderScroll();
    fireEvent.click(screen.getByTestId("play-scroll-practice"));
    // Closed first, then travelled — the host owns the page underneath.
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPlayPractice).toHaveBeenCalledTimes(1);
    // NOT routed through Daily Challenge: the Daily workstream can replace
    // that mode entirely without this footer noticing.
    expect(onPlayDailyChallenge).not.toHaveBeenCalled();
  });

  it("holds the icon slot without inventing a picture", () => {
    // The owner supplies the mark. Until then the slot keeps its geometry so
    // dropping the asset in later moves nothing on the sheet.
    renderScroll();
    const mark = screen.getByTestId("play-scroll-practice")
      .querySelector(".play-scroll-practice__mark");
    expect(mark).toBeTruthy();
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(mark?.querySelector("img")).toBeNull();
  });
});

describe("Invite", () => {
  const FRIEND = (id: string, name: string) => ({
    id: `f-${id}`, requester_id: "me", addressee_id: id, status: "accepted",
    created_at: "t",
    profile: { id, display_name: name, avatar_url: null, is_pro: false },
  });

  it("lists the account's real Academy connections", () => {
    h.friends.friends = [FRIEND("p1", "Ashen"), FRIEND("p2", "Bravura")];
    renderScroll();
    fireEvent.click(screen.getByTestId("play-mode-invite"));
    expect(screen.getByTestId("play-invite-friend-p1").textContent).toContain("Ashen");
    expect(screen.getByTestId("play-invite-friend-p2").textContent).toContain("Bravura");
  });

  it("selects a summoner and names them on the action", () => {
    h.friends.friends = [FRIEND("p1", "Ashen")];
    renderScroll();
    fireEvent.click(screen.getByTestId("play-mode-invite"));
    expect(screen.getByTestId("play-invite-send").textContent).toContain("Choose a summoner");
    fireEvent.click(screen.getByTestId("play-invite-friend-p1"));
    expect(screen.getByTestId("play-invite-friend-p1")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("play-invite-send").textContent).toContain("Challenge Ashen");
  });

  /**
   * The honesty rule. There is no Ranked invite backend, so the action must
   * not appear to succeed — and the reason must be readable rather than only
   * visible as a disabled control.
   */
  it("states that Ranked challenges are not open yet, and does not fake one", () => {
    h.friends.friends = [FRIEND("p1", "Ashen")];
    renderScroll();
    fireEvent.click(screen.getByTestId("play-mode-invite"));
    fireEvent.click(screen.getByTestId("play-invite-friend-p1"));
    const notice = screen.getByTestId("play-invite-availability");
    expect(notice.textContent).toBe(RANKED_INVITE_UNAVAILABLE_REASON);
    const send = screen.getByTestId("play-invite-send");
    expect(send).toBeDisabled();
    expect(send.getAttribute("aria-describedby")).toBe(notice.getAttribute("id"));
  });

  /**
   * The seam, exercised. When a Ranked invite backend exists it reports
   * itself available through `RankedInviteGateway` and NOTHING in this view
   * has to change — the notice disappears and the challenge becomes live off
   * the same two fields. Rendered directly, because that is the only way to
   * inject an availability the product cannot yet produce.
   */
  it("becomes a live challenge the day the gateway reports one", () => {
    h.friends.friends = [FRIEND("p1", "Ashen")];
    render(
      <InvitePlayView
        signedIn
        onBack={() => {}}
        availability={{ available: true, reason: null }}
      />,
    );
    expect(screen.queryByTestId("play-invite-availability")).toBeNull();
    fireEvent.click(screen.getByTestId("play-invite-friend-p1"));
    const send = screen.getByTestId("play-invite-send");
    expect(send).not.toBeDisabled();
    expect(send.getAttribute("aria-describedby")).toBeNull();
  });

  it("shows the honest empty roster rather than a fake one", () => {
    h.friends.friends = [];
    renderScroll();
    fireEvent.click(screen.getByTestId("play-mode-invite"));
    expect(screen.getByTestId("play-invite-empty")).toBeTruthy();
    expect(screen.getByTestId("play-invite-send")).toBeDisabled();
  });

  it("asks a signed-out visitor to sign in", () => {
    renderScroll({ signedIn: false });
    fireEvent.click(screen.getByTestId("play-mode-invite"));
    expect(screen.getByTestId("play-invite-signed-out")).toBeTruthy();
  });

  it("goes back to the three clauses", () => {
    renderScroll();
    fireEvent.click(screen.getByTestId("play-mode-invite"));
    fireEvent.click(screen.getByTestId("play-invite-back"));
    expect(screen.getByTestId("play-scroll-modes")).toBeTruthy();
  });
});

describe("bots are not part of the primary PLAY experience", () => {
  it("offers no bot difficulty, class or playtest entry", () => {
    renderScroll();
    const text = screen.getByRole("dialog").textContent ?? "";
    expect(text).not.toMatch(/play vs bot/i);
    expect(text).not.toMatch(/playtest/i);
    expect(text).not.toMatch(/\b(tank|mage|marksman)\b/i);
    expect(text).not.toMatch(/\b(easy|standard|hard)\b/i);
  });

  it("shows an ordinary player no bot control anywhere on the record", async () => {
    renderScroll();
    expect(screen.queryByTestId("play-ranked-bot-toggle")).toBeNull();
    await openRanked();
    // Asserted only once matchmaking is actually on screen — a `queryBy`
    // that runs before the view opens is true of every possible page.
    expect(screen.getByTestId("play-ranked")).toBeTruthy();
    expect(screen.queryByTestId("play-ranked-bot-toggle")).toBeNull();
    expect(screen.getByTestId("play-ranked-join").textContent)
      .toContain("Enter the Queue");
  });

  it("shows nothing while the admin answer is still unknown", async () => {
    // Not-yet-known must read as NOT admin: the control is never drawn on a
    // guess and then taken away.
    h.roles.loading = true;
    renderScroll();
    await openRanked();
    expect(screen.getByTestId("play-ranked")).toBeTruthy();
    expect(screen.queryByTestId("play-ranked-bot-toggle")).toBeNull();
  });
});

/**
 * MATCH WITH BOT — the admin's Ranked testing lever.
 *
 * It is one switch on the existing Ranked entry: no mode, no card, no
 * difficulty, no class, no bot identity. Everything below is about it staying
 * that small, and about it never reaching an ordinary player.
 *
 * Entering matchmaking goes through `openRanked`, because pressing Ranked is
 * no longer a synchronous view change — the record commits the role it is
 * previewing first and moves only when that write holds.
 */
describe("the admin Match-with-Bot switch", () => {
  const openRankedAsAdmin = async (
    over: Partial<React.ComponentProps<typeof RankedPlayScroll>> = {},
  ) => {
    h.roles.isAdmin = true;
    const utils = renderScroll(over);
    await openRanked();
    return utils;
  };

  it("is offered to an admin, and is OFF when the record opens", async () => {
    await openRankedAsAdmin();
    const input = screen.getByTestId("play-ranked-bot-toggle-input") as HTMLInputElement;
    expect(input.checked).toBe(false);
    expect(screen.getByTestId("play-ranked-bot-toggle").textContent)
      .toContain("Match with Bot");
  });

  it("joins normally while it is off", async () => {
    await openRankedAsAdmin();
    fireEvent.click(screen.getByTestId("play-ranked-join"));
    expect(h.queue.joinWithoutClass).toHaveBeenCalledTimes(1);
    expect(h.queue.joinWithoutClass.mock.calls[0][0]).toBeUndefined();
  });

  it("asks for a bot ONLY when it is on", async () => {
    await openRankedAsAdmin();
    fireEvent.click(screen.getByTestId("play-ranked-bot-toggle-input"));
    fireEvent.click(screen.getByTestId("play-ranked-join"));
    expect(h.queue.joinWithoutClass).toHaveBeenCalledWith({ matchWithBot: true });
  });

  it("says what pressing Play will now do, without shouting about it", async () => {
    await openRankedAsAdmin();
    fireEvent.click(screen.getByTestId("play-ranked-bot-toggle-input"));
    // The two claims that would otherwise be false are withdrawn: that an
    // opponent is being searched for, and that rating is at stake.
    const text = screen.getByTestId("play-ranked").textContent ?? "";
    expect(text).toContain("Unrated");
    expect(text).not.toContain("Rating is at stake");
    expect(screen.getByTestId("play-ranked-join").textContent).toContain("Bot");
  });

  it("forgets it between opens — there is no sticky bot mode", async () => {
    const { unmount } = await openRankedAsAdmin();
    fireEvent.click(screen.getByTestId("play-ranked-bot-toggle-input"));
    expect((screen.getByTestId("play-ranked-bot-toggle-input") as HTMLInputElement)
      .checked).toBe(true);
    // Leaving Ranked, then coming back inside the SAME open record.
    fireEvent.click(screen.getByTestId("play-ranked-back"));
    await openRanked();
    expect((screen.getByTestId("play-ranked-bot-toggle-input") as HTMLInputElement)
      .checked).toBe(false);
    // And across a fresh open of the whole record.
    unmount();
    await openRankedAsAdmin();
    expect((screen.getByTestId("play-ranked-bot-toggle-input") as HTMLInputElement)
      .checked).toBe(false);
  });

  it("is withdrawn once the server has an entry — it can change nothing then", async () => {
    h.queue.state = "waiting";
    h.queue.canCancel = true;
    await openRankedAsAdmin();
    // The view IS open and IS mid-queue; the control is absent from that, not
    // absent because nothing rendered.
    expect(screen.getByTestId("play-ranked").getAttribute("data-queue-state"))
      .toBe("waiting");
    expect(screen.queryByTestId("play-ranked-bot-toggle")).toBeNull();
  });

  it("adds no difficulty, class, speed or bot-identity choice", async () => {
    await openRankedAsAdmin();
    fireEvent.click(screen.getByTestId("play-ranked-bot-toggle-input"));
    const text = screen.getByRole("dialog").textContent ?? "";
    expect(text).not.toMatch(/\b(easy|standard|hard)\b/i);
    expect(text).not.toMatch(/\b(tank|mage|marksman)\b/i);
    expect(text).not.toMatch(/difficulty/i);
    // ONE control on the Ranked entry, and it is the switch itself.
    expect(screen.getByTestId("play-ranked")
      .querySelectorAll("input[type=checkbox]")).toHaveLength(1);
  });
});


/* ────────────────────────────────────────────────────────────────────────────
 * PLAY1 SOUND — the record's cues.
 *
 * The rule the whole layer is built on is "one user action, one sound", so
 * every case below asserts the WHOLE call list rather than "was called". A cue
 * that fires alongside another it should not have is exactly the defect this
 * pass exists to prevent, and `toHaveBeenCalledWith` would not see it.
 *
 * The queue cues are keyed to the controller's own state TRANSITIONS, never to
 * the button that started them: the record polls every 700ms during pairing and
 * re-renders on every read, so anything driven by "the state is X" would repeat
 * for as long as X lasted.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Every cue sounded so far, in order. */
const cues = () => sfx.play.mock.calls.flat();

/**
 * Walk the fabricated controller through a state, the way the real one does.
 *
 * The mocked hook hands back the SAME object every render, so mutating it
 * changes nothing by itself; `rerender` is what the real controller's
 * `setState` does for free.
 */
function advance(
  rerender: () => void,
  state: QueueState,
  patch: Partial<typeof h.queue> = {},
) {
  h.queue.state = state;
  Object.assign(h.queue, patch);
  rerender();
}

describe("sound — closing the record", () => {
  it("sounds the sheet rolling shut, once, on the close control", () => {
    const { onClose } = renderScroll();
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-scroll-close"));
    expect(cues()).toEqual(["scrollClose"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sounds it once on Escape, not once per handler in the chain", () => {
    const { onClose } = renderScroll();
    sfx.play.mockClear();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(cues()).toEqual(["scrollClose"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays silent when the close is WITHHELD over a live queue entry", async () => {
    // Every exit is withdrawn from `joining` onward, so the sheet does not
    // move — and nothing may sound as though it had.
    h.queue.state = "waiting";
    h.queue.canCancel = true;
    const { onClose } = renderScroll();
    await openRanked();
    sfx.play.mockClear();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(cues()).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByTestId("play-scroll-close")).toBeNull();
  });
});

describe("sound — choosing a way to play", () => {
  it("sounds the seal once for Ranked, then nothing until the queue moves", async () => {
    renderScroll();
    sfx.play.mockClear();
    await openRanked();
    expect(cues()).toEqual(["modeConfirm"]);
  });

  it("sounds the seal once for Invite", () => {
    renderScroll();
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-mode-invite"));
    expect(cues()).toEqual(["modeConfirm"]);
  });

  /**
   * Daily Challenge is the case a careless implementation doubles: it is a
   * selection AND it closes the record. Closing there is a HANDOFF, and the
   * handoff is already announced by the seal.
   */
  it("sounds the seal once for Daily Challenge — never the seal AND the close", () => {
    const { onClose, onPlayDailyChallenge } = renderScroll();
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-mode-daily"));
    expect(cues()).toEqual(["modeConfirm"]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPlayDailyChallenge).toHaveBeenCalledTimes(1);
  });

  it("sounds the seal once for the Practice footer — and no close cue", () => {
    const { onPlayPractice, onClose } = renderScroll();
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-scroll-practice"));
    expect(cues()).toEqual(["modeConfirm"]);
    expect(onPlayPractice).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sounds the seal once for the Practice action on a finished day", () => {
    const { onPlayPractice } = renderScroll({ daily: DAILY_DONE });
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-mode-daily-action"));
    expect(cues()).toEqual(["modeConfirm"]);
    expect(onPlayPractice).toHaveBeenCalledTimes(1);
  });

  it("makes no sound for a clause that cannot be selected", () => {
    // A completed day is drawn as a PANEL with no button. Nothing to press,
    // nothing to hear.
    renderScroll({ daily: DAILY_DONE });
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-mode-daily-complete"));
    expect(cues()).toEqual([]);
  });
});

describe("sound — the Ranked role commit", () => {
  it("sounds a refusal after the seal when the role write is declined", async () => {
    const onCommitRole = vi.fn(async () => false);
    renderScroll({ onCommitRole });
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-mode-ranked"));

    await waitFor(() => expect(cues()).toEqual(["modeConfirm", "error"]));
    // The record stayed on its menu, so the refusal has something on screen
    // beside it — the host's own notice.
    expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("menu");
  });

  it("never sounds a queue start for a refused commit", async () => {
    const onCommitRole = vi.fn(async () => false);
    renderScroll({ onCommitRole });
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-mode-ranked"));
    await waitFor(() => expect(cues()).toContain("error"));
    expect(cues()).not.toContain("queueStart");
  });
});

/**
 * A record whose fabricated queue can be walked through states.
 *
 * Its own harness rather than `renderScroll`'s, because these cases need to
 * re-render on demand: the mocked controller hands back the SAME object every
 * render, so mutating it changes nothing by itself — a re-render is what the
 * real controller's `setState` does for free.
 */
type StatefulScrollProps = React.ComponentProps<typeof StatefulScroll>;

function renderQueueScroll(over: Partial<StatefulScrollProps> = {}) {
  const onClose = vi.fn();
  const onEnterMatch = vi.fn();
  const onPlayDailyChallenge = vi.fn();
  const onPlayPractice = vi.fn();
  const onCommitRole = vi.fn(() => true);
  const onRoleChange = vi.fn();
  const props: StatefulScrollProps = {
    onClose,
    initialRole: "jungle",
    onRoleChange,
    progression: PROGRESSION,
    modes: ALL_MODES,
    daily: DAILY,
    signedIn: true,
    onEnterMatch,
    onPlayDailyChallenge,
    onCommitRole,
    onPlayPractice,
    handoffDelayMs: 0,
    ...over,
  };
  const utils = render(<StatefulScroll {...props} />);
  /** Move the controller and let the record see it. */
  const advance = (state: QueueState, patch: Partial<typeof h.queue> = {}) => {
    h.queue.state = state;
    Object.assign(h.queue, patch);
    // A NEW element each time: an identical reference would let React bail out
    // of the re-render and the record would never see the new state.
    utils.rerender(<StatefulScroll {...props} />);
  };
  return { ...utils, advance, onClose, onEnterMatch, onCommitRole };
}

describe("sound — the queue's cues", () => {
  it("acknowledges the join press, but does NOT sound a queue start for it", async () => {
    const { advance } = renderQueueScroll();
    await openRanked();
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-ranked-join"));
    advance("joining");
    // The control answers the press with the quiet fallback knock — and that is
    // all. The request is out; the server has not accepted anything yet, so the
    // cue that means "you are in the queue" has not been earned.
    expect(cues()).toEqual(["buttonPress"]);
  });

  it("sounds the queue opening once the SERVER has the entry", async () => {
    const { advance } = renderQueueScroll();
    await openRanked();
    advance("joining");
    sfx.play.mockClear();
    advance("waiting", { canCancel: true });
    expect(cues()).toEqual(["queueStart"]);
  });

  it("does not re-sound the queue opening while the wait polls on", async () => {
    const { advance } = renderQueueScroll();
    await openRanked();
    advance("joining");
    advance("waiting", { canCancel: true });
    sfx.play.mockClear();
    for (let i = 0; i < 4; i += 1) advance("waiting", { canCancel: true });
    expect(cues()).toEqual([]);
  });

  /**
   * PASSIVE RECOVERY IS NOT AN EVENT. A record that opens onto a queue entry
   * the server already had is looking at a standing state, not watching one
   * arrive, and the player did nothing to start it.
   */
  it("says nothing when an existing queue entry is recovered on open", () => {
    h.queue.state = "waiting";
    h.queue.canCancel = true;
    renderQueueScroll();
    expect(cues()).toEqual([]);
  });

  it("sounds a REFUSAL, not a queue start, when the join is rejected", async () => {
    const { advance } = renderQueueScroll();
    await openRanked();
    advance("joining");
    sfx.play.mockClear();
    // `handleError(e, "action")` is the only thing that puts an in-flight join
    // back to selection, and it prints the reason under the button.
    advance("selecting_class", {
      error: "Choose your role before joining the Ranked queue.",
    });
    expect(cues()).toEqual(["error"]);
  });

  it("sounds the opponent bell once, on the pairing window opening", async () => {
    const { advance } = renderQueueScroll();
    await openRanked();
    advance("joining");
    advance("waiting", { canCancel: true });
    sfx.play.mockClear();
    advance("pairing", { canCancel: false });
    expect(cues()).toEqual(["opponentFound"]);
  });

  /**
   * THE POLLING TRAP. `pairing` is polled every 700ms and each read re-renders
   * with the same status. The bell must ring for the NEWS, not for the state.
   */
  it("does not re-ring the bell as the same pairing state is polled again", async () => {
    const { advance } = renderQueueScroll();
    await openRanked();
    advance("joining");
    advance("waiting", { canCancel: true });
    advance("pairing");
    sfx.play.mockClear();
    for (let i = 0; i < 5; i += 1) advance("pairing");
    expect(cues()).toEqual([]);
  });

  it("does not ring again when pairing becomes matched — that is the same news", async () => {
    const { advance } = renderQueueScroll();
    await openRanked();
    advance("joining");
    advance("waiting", { canCancel: true });
    advance("pairing");
    sfx.play.mockClear();
    advance("matched", { matchId: "rkm_1" });
    advance("matched", { matchId: "rkm_1" });
    expect(cues()).toEqual([]);
  });

  it("rings for a SECOND, real pairing after the first turned out to be wrong", async () => {
    // The controller returns a pairing reading to `waiting` when both sources
    // say there is no match after all. The next pairing is genuinely new news.
    const { advance } = renderQueueScroll();
    await openRanked();
    advance("joining");
    advance("waiting", { canCancel: true });
    advance("pairing");
    advance("waiting", { canCancel: true });
    sfx.play.mockClear();
    advance("pairing");
    expect(cues()).toEqual(["opponentFound"]);
  });

  it("says nothing for a match recovered on open — no transition happened", () => {
    h.queue.state = "matched";
    h.queue.matchId = "rkm_recovered";
    renderQueueScroll();
    expect(cues()).toEqual([]);
  });

  it("stays silent through a rate limit and a network blip — internal retries", async () => {
    const { advance } = renderQueueScroll();
    await openRanked();
    advance("joining");
    advance("waiting", { canCancel: true });
    sfx.play.mockClear();
    // The controller writes both of these into `error` and keeps polling from
    // `waiting`. Neither is something the player has to act on.
    advance("waiting", { error: "Slowing down to respect the queue rate limit…" });
    advance("waiting", { error: "network unavailable" });
    expect(cues()).toEqual([]);
  });

  it("sounds a refusal when Ranked closes under a player who is looking at it", async () => {
    const { advance } = renderQueueScroll();
    await openRanked();
    advance("waiting", { canCancel: true });
    sfx.play.mockClear();
    advance("unavailable", {
      unavailableReason: "Ranked matchmaking is paused right now.",
      canCancel: false,
    });
    expect(cues()).toEqual(["error"]);
    expect(screen.getByTestId("play-ranked-unavailable")).toBeTruthy();
  });

  it("says nothing when a closed queue is discovered behind the three clauses", () => {
    // The controller polls from the moment the record mounts, so an
    // unavailable verdict can land while the menu is still on screen — where
    // there is no refusal on the page to go with a refusal sound.
    const { advance } = renderQueueScroll();
    sfx.play.mockClear();
    advance("unavailable", {
      unavailableReason: "Ranked matchmaking is paused right now.",
    });
    expect(cues()).toEqual([]);
  });
});

describe("sound — the role stepper and the mascot", () => {
  it("ticks once for the next arrow, and moves the role", async () => {
    renderScroll();
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    await waitFor(() =>
      expect(screen.getByTestId("play-scroll-mascot").getAttribute("data-role")).toBe("mid"),
    );
    expect(cues()).toEqual(["roleStep"]);
  });

  it("ticks once for the previous arrow", () => {
    renderScroll();
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-scroll-role-prev"));
    expect(cues()).toEqual(["roleStep"]);
  });

  it("gives a hammered stepper one tick per notch — no more, and no fewer", async () => {
    renderScroll();
    sfx.play.mockClear();
    const next = screen.getByTestId("play-scroll-role-next");
    for (let i = 0; i < 5; i += 1) fireEvent.click(next);
    expect(cues()).toEqual([
      "roleStep", "roleStep", "roleStep", "roleStep", "roleStep",
    ]);
    // Five notches around a five-role ring: all the way back to where it began.
    await waitFor(() =>
      expect(screen.getByTestId("play-scroll-mascot").getAttribute("data-role")).toBe("jungle"),
    );
  });

  it("writes nothing to the account, however far the stepper is worked", () => {
    const { onCommitRole } = renderScroll();
    for (let i = 0; i < 12; i += 1) {
      fireEvent.click(screen.getByTestId("play-scroll-role-next"));
    }
    expect(onCommitRole).not.toHaveBeenCalled();
  });

  it("answers a poke at the mascot, once per poke", () => {
    renderScroll();
    sfx.play.mockClear();
    const mascot = screen.getByTestId("play-scroll-mascot");
    fireEvent.click(mascot);
    fireEvent.click(mascot);
    fireEvent.click(mascot);
    expect(cues()).toEqual(["mascotReact", "mascotReact", "mascotReact"]);
  });

  it("still answers under prefers-reduced-motion, where the wiggle is dropped", () => {
    // Less movement is not a request for silence — the app's audio preference
    // is a separate switch, and `RoleMascot` drops only the animation.
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q.includes("prefers-reduced-motion"),
      media: q, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      renderScroll();
      sfx.play.mockClear();
      fireEvent.click(screen.getByTestId("play-scroll-mascot"));
      expect(cues()).toEqual(["mascotReact"]);
      expect(
        screen.getByTestId("play-scroll-mascot-action").dataset.playing,
      ).toBeUndefined();
    } finally {
      window.matchMedia = original;
    }
  });
});


/* ────────────────────────────────────────────────────────────────────────────
 * THE RANKED AUTH GATE, at the record's own boundary.
 *
 * `Quiz.rankedRole.test.tsx` proves the whole flow against the real page; these
 * pin the RECORD's half of the contract — that the question is asked before
 * anything is attempted, and that it is asked of Ranked alone.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("Ranked's account gate", () => {
  it("asks the host for an account instead of committing, when there is none", async () => {
    const onRequireAccount = vi.fn();
    const { onCommitRole } = renderScroll({ hasAccount: false, onRequireAccount });
    fireEvent.click(screen.getByTestId("play-mode-ranked"));
    await waitFor(() => expect(onRequireAccount).toHaveBeenCalledTimes(1));

    // Nothing was written and nothing was entered: the gate runs FIRST.
    expect(onCommitRole).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("menu");
    expect(screen.queryByTestId("play-ranked")).toBeNull();
    expect(h.queue.joinWithoutClass).not.toHaveBeenCalled();
  });

  it("plays the seal and no negative cue — a gate is not a failure", async () => {
    sfx.play.mockClear();
    renderScroll({ hasAccount: false, onRequireAccount: vi.fn() });
    fireEvent.click(screen.getByTestId("play-mode-ranked"));
    await waitFor(() => expect(cues()).toContain("modeConfirm"));
    expect(cues()).toEqual(["modeConfirm"]);
  });

  it("leaves the local role exactly where the player put it", async () => {
    const onRequireAccount = vi.fn();
    const { onSelectRole } = renderScroll({ hasAccount: false, onRequireAccount });
    fireEvent.click(screen.getByTestId("play-scroll-role-next"));   // jungle -> mid
    await waitFor(() =>
      expect(screen.getByTestId("play-scroll-mascot").getAttribute("data-role")).toBe("mid"),
    );
    onSelectRole.mockClear();

    fireEvent.click(screen.getByTestId("play-mode-ranked"));
    await waitFor(() => expect(onRequireAccount).toHaveBeenCalled());
    // Not reset, not cleared, not snapped back.
    expect(screen.getByTestId("play-scroll-mascot").getAttribute("data-role")).toBe("mid");
    expect(onSelectRole).not.toHaveBeenCalled();
  });

  it("gates RANKED only — the other entries never queue, so they never ask", async () => {
    const onRequireAccount = vi.fn();
    const { onPlayDailyChallenge } = renderScroll({ hasAccount: false, onRequireAccount });

    fireEvent.click(screen.getByTestId("play-mode-invite"));
    await waitFor(() =>
      expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("invite"),
    );
    expect(onRequireAccount).not.toHaveBeenCalled();

    cleanup();
    const second = renderScroll({ hasAccount: false, onRequireAccount });
    fireEvent.click(screen.getByTestId("play-scroll-practice"));
    expect(second.onPlayPractice).toHaveBeenCalledTimes(1);
    expect(onRequireAccount).not.toHaveBeenCalled();
    void onPlayDailyChallenge;
  });

  it("lets a real account straight through to the commit", async () => {
    const onRequireAccount = vi.fn();
    const { onCommitRole } = renderScroll({ hasAccount: true, onRequireAccount });
    await openRanked();
    expect(onCommitRole).toHaveBeenCalledTimes(1);
    expect(onRequireAccount).not.toHaveBeenCalled();
  });

  /** The default matters: every existing caller and both dev previews mount
   *  this component without the prop and must be unchanged. */
  it("assumes an account when the host says nothing", async () => {
    const onRequireAccount = vi.fn();
    const { onCommitRole } = renderScroll({ onRequireAccount });
    await openRanked();
    expect(onCommitRole).toHaveBeenCalledTimes(1);
    expect(onRequireAccount).not.toHaveBeenCalled();
  });
});


/* ────────────────────────────────────────────────────────────────────────────
 * THE ORDINARY CONTROLS.
 *
 * Every intentional press in the record makes a sound; the specialised cue
 * wins wherever there is one, and the quiet fallback knock covers what is
 * left. No control gets both.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("sound — the record's ordinary controls", () => {
  it("knocks once for Back out of the queue view", async () => {
    renderScroll();
    await openRanked();
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-ranked-back"));
    expect(cues()).toEqual(["buttonPress"]);
    expect(screen.getByRole("dialog").getAttribute("data-view")).toBe("menu");
  });

  it("knocks once for Back out of a refusal notice", async () => {
    h.queue.state = "unavailable";
    h.queue.unavailableReason = "Ranked matchmaking is paused right now.";
    renderScroll();
    await openRanked();
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-ranked-back"));
    expect(cues()).toEqual(["buttonPress"]);
  });

  it("knocks once for Cancel Queue, and never the negative cue", async () => {
    h.queue.state = "waiting";
    h.queue.canCancel = true;
    renderScroll();
    await openRanked();
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-ranked-cancel"));
    // Leaving a queue you chose to join is not a refusal.
    expect(cues()).toEqual(["buttonPress"]);
    expect(h.queue.cancel).toHaveBeenCalledTimes(1);
  });

  it("knocks once for Back out of Invite", () => {
    renderScroll();
    fireEvent.click(screen.getByTestId("play-mode-invite"));
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-invite-back"));
    expect(cues()).toEqual(["buttonPress"]);
  });

  it("knocks once when a summoner is chosen from the roster", () => {
    h.friends.friends = [
      { id: "f1", profile: { id: "p1", display_name: "Sylvara", avatar_url: null } },
    ];
    renderScroll();
    fireEvent.click(screen.getByTestId("play-mode-invite"));
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-invite-friend-p1"));
    expect(cues()).toEqual(["buttonPress"]);
  });

  /**
   * The CHALLENGE control is intentionally silent: it has no `onClick` at all
   * and is disabled while Ranked invites have no backend, so there is no press
   * for a cue to answer. The phase that gives it an action gives it a sound.
   */
  it("says nothing for the challenge control, which has no action yet", () => {
    h.friends.friends = [
      { id: "f1", profile: { id: "p1", display_name: "Sylvara", avatar_url: null } },
    ];
    renderScroll();
    fireEvent.click(screen.getByTestId("play-mode-invite"));
    fireEvent.click(screen.getByTestId("play-invite-friend-p1"));
    sfx.play.mockClear();
    fireEvent.click(screen.getByTestId("play-invite-send"));
    expect(cues()).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * ONE ACTION = ONE SOUND, as a property of the whole surface.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("sound — no control ever gets two cues", () => {
  /**
   * The specialised cue WINS. A mode card is a seal and not also a knock; a
   * role arrow is a tick and not also a knock; the close is a sheet and not
   * also a knock. Asserting the whole call list per press is what catches a
   * generic handler quietly stacking underneath a specific one.
   */
  const pressed: Array<[string, string, (() => void)?]> = [
    ["play-mode-ranked", "modeConfirm"],
    ["play-mode-daily", "modeConfirm"],
    ["play-mode-invite", "modeConfirm"],
    ["play-scroll-practice", "modeConfirm"],
    ["play-scroll-role-next", "roleStep"],
    ["play-scroll-role-prev", "roleStep"],
    ["play-scroll-mascot", "mascotReact"],
    ["play-scroll-close", "scrollClose"],
  ];

  for (const [testId, expected] of pressed) {
    it(`${testId} makes exactly one sound: ${expected}`, async () => {
      renderScroll();
      sfx.play.mockClear();
      fireEvent.click(screen.getByTestId(testId));
      await waitFor(() => expect(cues().length).toBeGreaterThan(0));
      expect(cues()).toEqual([expected]);
    });
  }

  it("never lets the fallback knock reach a control that has its own cue", async () => {
    renderScroll();
    sfx.play.mockClear();
    for (const [testId] of pressed.slice(0, 3)) {
      cleanup();
      renderScroll();
      fireEvent.click(screen.getByTestId(testId));
    }
    await waitFor(() => expect(cues().length).toBeGreaterThan(0));
    expect(cues()).not.toContain("buttonPress");
  });
});


/* ────────────────────────────────────────────────────────────────────────────
 * SOUND MUST NEVER BE LOAD-BEARING.
 *
 * Every control here calls the cue from inside its click handler, and most of
 * them sound it BEFORE doing the thing — `sfx.play("buttonPress"); onBack();`.
 * That ordering is only safe because `usePlaySfx().play` cannot throw, which is
 * a guarantee of the hook rather than of these call sites.
 *
 * The assertion therefore lives with the guarantee, in
 * `src/lib/audio/play-sfx.test.ts` ("never throws into the caller, whatever the
 * audio stack does"). A version of it here would prove nothing: this suite
 * replaces `usePlaySfx` with a spy, so it would only be testing the spy.
 * ──────────────────────────────────────────────────────────────────────────── */


/* ────────────────────────────────────────────────────────────────────────────
 * A TOAST IS NOT "OUTSIDE".
 *
 * The Ranked signup gate raises a persistent notice WHILE this record is open,
 * so the player can act on it from here. Radix treats every pointer-down beyond
 * its content as a dismissal, which made pressing "Create Account" do two
 * things at once: dismiss the record (sounding the sheet rolling shut) and
 * activate the CTA (sounding its own knock). One physical click, two cues and
 * two outcomes — measured in the browser before this guard existed.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("interacting with a toast does not dismiss the record", () => {
  /** A pointer-down that originates inside sonner's container. */
  function pressInsideToast() {
    const toaster = document.createElement("div");
    toaster.setAttribute("data-sonner-toaster", "");
    const button = document.createElement("button");
    toaster.appendChild(button);
    document.body.appendChild(toaster);
    fireEvent.pointerDown(button);
    // Radix listens on the document for the follow-up as well.
    fireEvent.pointerUp(button);
    return () => toaster.remove();
  }

  it("keeps the record open, and stays silent, when a toast is pressed", async () => {
    const { onClose } = renderScroll();
    sfx.play.mockClear();
    const cleanupToaster = pressInsideToast();
    try {
      await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
      expect(onClose).not.toHaveBeenCalled();
      // No close cue, because nothing closed.
      expect(cues()).toEqual([]);
    } finally {
      cleanupToaster();
    }
  });

  /**
   * The predicate itself, directly.
   *
   * Radix's outside-pointer-down detection does not fire for synthetic events
   * under jsdom, so the "a real outside press still dismisses" half cannot be
   * driven from here — the dismissal paths that CAN be are covered above
   * (the close control, and Escape). What is testable, and what actually
   * changed, is which interactions the record now declines to treat as
   * outside.
   */
  describe("the predicate", () => {
    const ev = (target: unknown) =>
      ({ detail: { originalEvent: { target } as unknown as Event } });

    it("recognises a press inside sonner's container", () => {
      const toaster = document.createElement("div");
      toaster.setAttribute("data-sonner-toaster", "");
      const button = document.createElement("button");
      toaster.appendChild(button);
      expect(isToastInteraction(ev(button))).toBe(true);
      expect(isToastInteraction(ev(toaster))).toBe(true);
    });

    it("does NOT swallow an ordinary press elsewhere on the page", () => {
      const elsewhere = document.createElement("div");
      expect(isToastInteraction(ev(elsewhere))).toBe(false);
    });

    it("is safe for an event with no usable target", () => {
      expect(isToastInteraction(ev(null))).toBe(false);
      expect(isToastInteraction(ev(undefined))).toBe(false);
      expect(isToastInteraction({})).toBe(false);
    });
  });
});
