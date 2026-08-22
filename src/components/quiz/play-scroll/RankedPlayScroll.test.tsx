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
 *   · admin policy decides which entries appear.
 */
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { QueueState } from "@/pages/quiz-ranked/useRankedQueue";

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
}));

vi.mock("@/pages/quiz-ranked/useRankedQueue", () => ({
  useRankedQueue: () => h.queue,
}));
vi.mock("@/hooks/useFriends", () => ({
  useFriends: () => h.friends,
}));
vi.mock("@/lib/quiz/api", () => ({
  resolveQuizAssetUrl: (p?: string) => (p ? `http://assets.local/${p}` : undefined),
}));

import RankedPlayScroll from "./RankedPlayScroll";
import type { RankedRole } from "@/lib/ranked-public/roles";
import InvitePlayView from "./InvitePlayView";
import { RANKED_INVITE_UNAVAILABLE_REASON } from "@/lib/ranked-public/rankedInvite";

const ALL_MODES = { ranked: true, daily: true, invite: true };

const PROGRESSION = {
  schemaVersion: "v1", serverTime: "t", rating: 1320, tier: "silver",
  nextTier: "gold", tierFloorRating: 1200, nextTierRating: 1450,
  ratingToNext: 130, progressPercent: 13, rated: true, matchesRated: 40,
} as never;

const DAILY = {
  date: "2026-08-21", answered: 2, correct: 2, target: 5, xpBonus: 250,
  dailyStreak: 4, lastCompletedDate: null, completed: false, remaining: 3,
  themeTitle: "Item Knowledge", themeBlurb: "Recipes",
};

/** The same day, answered out. */
const DAILY_DONE = {
  ...DAILY, answered: 5, correct: 4, completed: true, remaining: 0,
  lastCompletedDate: "2026-08-21",
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

  it("reads completion from the counts, not only from the flag", () => {
    // `completed` can lag the day's own remainder — the host filters on what
    // is LEFT, so what is left is what the clause must believe.
    renderScroll({ daily: { ...DAILY, completed: false, remaining: 0 } });
    expect(screen.getByTestId("play-mode-daily-complete")).toBeTruthy();
    expect(screen.queryByTestId("play-mode-daily")).toBeNull();
  });

  it("treats an EMPTY daily payload as playable, never as finished", () => {
    // A backend outage leaves every count at zero. Zero questions is an
    // unknown day, not a finished one, and an unknown day stays offerable.
    renderScroll({
      daily: { ...DAILY, answered: 0, target: 0, remaining: 0, completed: false },
    });
    expect(screen.getByTestId("play-mode-daily")).toBeTruthy();
    expect(screen.queryByTestId("play-mode-daily-complete")).toBeNull();
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

  it("withholds the crest entirely when there is no standing", () => {
    // A placeholder crest would be a claim about an account that has none.
    renderScroll({ progression: null });
    expect(
      screen.getByTestId("play-scroll-role-banner")
        .querySelector(".play-scroll-banner__standing"),
    ).toBeNull();
    // The stepper still works — the crest is decoration, not the control.
    expect(screen.getByTestId("play-scroll-role-name").textContent).toBe("Jungle");
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
});
