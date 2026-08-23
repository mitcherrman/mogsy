/**
 * RA1 Phase 1.5: layout-stability contracts.
 *
 * The governing rule: a user action may change what the arena LOOKS like, but
 * never where anything IS. jsdom does no layout, so these assert the structural
 * contracts that produce stability — reserved slots, stable grid tracks, no
 * mount/unmount of layout-affecting text, no variant swap that changes a border
 * box. The pixel proof lives in the browser probe recorded in the phase report.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import { CombatantPanel } from "@/components/ranked-arena/CombatantPanel";
import { TimerDisplay } from "@/components/ranked-arena/TimerDisplay";
import { AbilityTray } from "@/components/ranked-arena/AbilityTray";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { AbilityView, CombatantView, TimerView } from "@/lib/ranked-core/viewTypes";
import { privatePlayerV2, publicRoundV2 } from "@/lib/ranked-public/fixtures";

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

/** Source scans read STRUCTURE, so an explanation of a bug must not read as
 *  the bug: comments are stripped before anything is asserted about a file. */
const stripJsxComments = (src: string) =>
  src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

const combatant = (over: Partial<CombatantView> = {}): CombatantView => ({
  playerId: "userA", name: "You", tag: "Tank", side: "player", classId: "tank",
  hp: 150, maxHp: 170, xp: 12, level: 1, nextLevelThreshold: 30,
  currentLevelThreshold: 0, hasSubmitted: false, abilityWindow: "open",
  hasAbilitySelected: false, ...over,
});

const timer = (over: Partial<TimerView> = {}): TimerView => ({
  durationSeconds: 30, remainingSeconds: 22, paused: false, urgent: false,
  modifierNotices: undefined, ...over,
});

const ability = (over: Partial<AbilityView> = {}): AbilityView => ({
  id: "tank.fortify", name: "Fortify", description: "Shield yourself.",
  unlocked: true, selected: false, locked: false, exhausted: false,
  remainingCharges: 3, unavailableReason: null, ...over,
});

describe("timer geometry", () => {
  it("keeps a stable box across value, urgency and expiry", () => {
    const { rerender, container } = render(<TimerDisplay timer={timer()} />);
    const section = container.querySelector('[data-testid="timer-display"]')!;
    // Reserved minimum width + tabular digits: the value cannot resize the box.
    expect(section.className).toContain("min-w-");
    const value = screen.getByTestId("timer-value");
    expect(value.className).toContain("tabular-nums");

    // Expiry and modifier notices are OVERLAID, never stacked into the flow —
    // mounting one used to make this section taller and push the HUD down.
    rerender(<TimerDisplay timer={timer({ remainingSeconds: 0 })} />);
    const expiredLine = screen.getByText(/Time's up/);
    expect(expiredLine.closest(".absolute")).not.toBeNull();

    rerender(<TimerDisplay timer={timer({ modifierNotices: ["-5s pressure"] })} />);
    expect(screen.getByTestId("timer-notice").closest(".absolute")).not.toBeNull();
  });
});

describe("combatant status chips", () => {
  it("reserve their rows and their icon slot", () => {
    const { rerender } = render(<CombatantPanel combatant={combatant()} />);
    const status = screen.getByTestId("status-userA");
    // Two rows are always reserved, so a chip re-wrapping cannot change the
    // panel's height mid-round.
    expect(status.className).toContain("min-h-");

    const iconSlotsBefore = status.querySelectorAll("span.inline-flex.h-3.w-3").length;
    rerender(<CombatantPanel combatant={combatant({
      hasSubmitted: true, hasAbilitySelected: true })} />);
    // Same number of icon slots before and after the state change: the second
    // chip's icon appears INSIDE a slot that was already there.
    expect(screen.getByTestId("status-userA").querySelectorAll("span.inline-flex.h-3.w-3").length)
      .toBe(iconSlotsBefore);
  });
});

describe("ability tray geometry", () => {
  it("reserves the armed-marker slot so arming does not re-truncate the name", () => {
    const { rerender } = render(
      <AbilityTray abilities={[ability()]} selectedAbilityId={null}
        permissions={{ ...NO_INTERACTIONS, canSelectAbility: true }}
        onSelectAbility={() => {}} />);
    const marker = () => screen.getByTestId("ability-tank.fortify")
      .querySelector(".ml-auto") as HTMLElement;
    const widthClass = marker().className.match(/w-\[[^\]]+\]/)?.[0];
    expect(widthClass).toBeTruthy();

    rerender(
      <AbilityTray abilities={[ability({ selected: true })]} selectedAbilityId="tank.fortify"
        permissions={{ ...NO_INTERACTIONS, canSelectAbility: true }}
        onSelectAbility={() => {}} />);
    expect(screen.getByText("Armed")).toBeInTheDocument();
    // The slot's declared width is unchanged by the pill appearing inside it.
    expect(marker().className.match(/w-\[[^\]]+\]/)?.[0]).toBe(widthClass);
  });
});

/**
 * THE SCROLL CONTRACT, as RG1 finally settled it.
 *
 * RA1 1.1 banned an internal scroll region outright, because a pinned game
 * viewport had produced a second scrollbar beside the browser's own. RG1's
 * first draft brought the pin back WITH a scrollbar inside the question card
 * — and the owner rejected that: a scrollbar in the parchment is not what a
 * game screen does.
 *
 * The content audit that followed showed the scrollbar had never been needed.
 * Every question `ranked_modern` can currently serve (928 rows, all
 * four-option) has a prompt of at most 108 characters and options of at most
 * 63; the synthetic probe that forced the overflow was 4.4x and 2.1x those
 * bounds. So the stage is a FLOOR sized to seat real content whole, the card
 * scrolls nothing, and the pathological case grows the page and lets the
 * browser's own scrollbar handle it.
 *
 * The rule is therefore back to "no internal scroll region", and it is now a
 * rule the layout can actually keep:
 *
 *   BEFORE (RG1 draft)          AFTER
 *   card had overflow-y-auto    no overflow anywhere in the arena
 *   long real question: 145px   long real question: fits, 211px to spare
 *     of internal scroll          at 1440x900
 */
describe("the Ranked arena declares no internal scroll region", () => {
  // A source scan, not a render assertion, deliberately: the live-round tests
  // and the browser probe only ever reach the ACTIVE arena, and the leftover
  // that motivated this check was in the terminal match-over branch, which
  // neither of them mounts.
  // ARENA1 Step 3: the arena's JSX — including the terminal branch this check
  // was written for — lives in `CanonicalArena` now, and the stage frame it
  // sits in lives in `ArenaShell`, so the scan follows both.
  const files = [
    "src/components/ranked-arena/CanonicalArena.tsx",
    "src/components/ranked-arena/ArenaShell.tsx",
    "src/pages/quiz-ranked/QuizRankedMatch.tsx",
    "src/pages/quiz-ranked/QuizRankedPage.tsx",
    "src/components/Layout.tsx",
  ];
  const sourceOf = (file: string) =>
    stripJsxComments(readFileSync(resolve(process.cwd(), file), "utf8"));

  it.each(files)("%s declares no scroll container at all", (file) => {
    expect(sourceOf(file)).not.toMatch(/overflow-y-auto|overflow-auto|overflow-y-scroll/);
  });

  it("leaves no residue of the retired scroll wrapper", () => {
    // The wrapper survives as a structural flex box; what must not survive is
    // a name that tells the next reader the card scrolls.
    for (const file of files) {
      expect(sourceOf(file)).not.toContain("ranked-question-scroll");
    }
    expect(css).not.toContain("ranked-question-scroll");
  });

  it("makes the stage a FLOOR, so oversized content grows the page", () => {
    // ARENA1 Step 3: the frame is `ArenaShell` now. Same declaration, same
    // tokens, one directory over — every mode that reaches the arena inherits
    // it instead of only the route that used to write it.
    const src = sourceOf("src/components/ranked-arena/ArenaShell.tsx");
    // `min-h`, never `h`: a cap is what forces content to be clipped or to
    // scroll inside the card, and that is the design being retired here.
    expect(src).toContain("lg:min-h-[var(--ranked-stage-h)]");
    expect(src).not.toMatch(/lg:h-\[var\(--ranked-stage-h\)\]/);
    // `--app-viewport-h` subtracts a header band this route no longer sits
    // below (it reclaims it), so using it would leave the reclaimed strip
    // unspent. The two tokens describe two different pages.
    expect(src).not.toContain("app-viewport-h");
    expect(css).toContain("--ranked-stage-h:");
  });

  it("keeps the automatic minimum size in force on the flexing bands", () => {
    // `min-h-0` is the switch that lets a flex child be SHORTER than its
    // content. On the arena grid or the question card that is a clip; the
    // whole no-scroll design depends on it not being there.
    const src = sourceOf("src/components/ranked-arena/CanonicalArena.tsx");
    expect(src).not.toContain("lg:min-h-0");
    expect(sourceOf("src/components/ranked-arena/ArenaShell.tsx")).not.toContain("min-h-0");
  });

  it("still keeps the shell's header offset and the viewport token", () => {
    // Layout is UNTOUCHED. Ranked reclaims the band at the PAGE, the same way
    // /lol and /quiz do, so every other route keeps the reservation and with it
    // the RA1 1.1 route-loading overflow fix.
    const layout = readFileSync(resolve(process.cwd(), "src/components/Layout.tsx"), "utf8");
    expect(layout).toContain("pt-[var(--app-header-h)] pb-bottom-nav");
    expect(css).toContain("--app-viewport-h: calc(100dvh");
  });
});

describe("answer-choice border lock", () => {
  it("pins every choice state to the same border box", () => {
    // Selecting swapped the shared button from `outline` (1px border) to
    // `default` (none) — a 2px change to the control's height.
    expect(css).toMatch(/\[data-answers-state\] \[data-quiz-choice\] \{[^}]*border-width: 1px/);
    expect(css).toMatch(
      /\[data-answers-state\] \[data-quiz-choice\]:not\(\[data-choice-state="idle"\]\)/);
  });
});

describe("the live arena's status slots", () => {
  let unmount: () => void;

  beforeEach(() => {
    const json = (body: unknown) => new Response(JSON.stringify(body), {
      status: 200, headers: { "Content-Type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith("/resume")) {
        return json({
          schema_version: "ranked_duel.resume.v1", projection_type: "resume",
          match_id: "m1", round_number: 1, server_time: "2026-07-18T12:00:00+00:00",
          payload: { match_status: "active", match_over: false,
            public: publicRoundV2(), private: privatePlayerV2("userA"),
            progression_pending_players: [], latest_resolved_round: null, result: null },
        });
      }
      if (u.endsWith("/private")) return json(privatePlayerV2("userA"));
      if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
      if (/\/matches\/m1$/.test(u)) return json(publicRoundV2());
      return json({});
    }) as unknown as typeof fetch);
  });
  afterEach(() => { unmount?.(); vi.unstubAllGlobals(); });

  async function mountArena() {
    const view = render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
    unmount = view.unmount;
    await screen.findByTestId("ranked-match");
    return view;
  }

  it("does not render the redundant answer/ability status card", async () => {
    await mountArena();
    await waitFor(() => expect(screen.getByTestId("submission-status")).toBeInTheDocument());
    // Phase 2 compact layout: the side card duplicated the selected answer
    // (visible in the grid) and the armed ability (visible in the tray) at a
    // cost of ~94px + a 20rem track. Only the transient status line survives.
    expect(screen.queryByTestId("status-answer")).toBeNull();
    expect(screen.queryByTestId("status-ability")).toBeNull();
    expect(screen.queryByTestId("ranked-submission-status")).toBeNull();
  });

  it("reserves a fixed line box for the transient submission status", async () => {
    await mountArena();
    const status = await screen.findByTestId("submission-status");
    // Always mounted with a reserved height: the three strings differ enough in
    // length that swapping them used to change the panel's height.
    expect(status.className).toContain("min-h-");
    expect(status.className).toContain("line-clamp-2");
  });

  it("keeps the ability tray mounted when the round locks it", async () => {
    // Visibility follows the roster, never the round's open/closed state — the
    // latter flips at every boundary and used to unmount ~140px of HUD.
    const { abilityTrayIsUseful } = await import("./rankedViews");
    const locked = [{ id: "tank.fortify", name: "Fortify", description: "d",
      unlocked: true, selected: false, locked: true, exhausted: false,
      remainingCharges: 3, unavailableReason: null }];
    expect(abilityTrayIsUseful(locked, null)).toBe(true);
    // Genuinely spent for the match is still hidden — that is content, not
    // availability.
    expect(abilityTrayIsUseful(
      [{ ...locked[0], locked: false, exhausted: true }], null)).toBe(false);
  });

  it("keeps the HUD row mounted through a level-2 choice", async () => {
    await mountArena();
    // The row used to unmount entirely during progression, tearing its whole
    // height out of the middle of the page.
    // ARENA1 Step 3: same gate, same rule — the flag is `surface.ownsSubmission`
    // on the view model now, and the row it guards is in CanonicalArena.
    const source = readFileSync(
      resolve(process.cwd(), "src/components/ranked-arena/CanonicalArena.tsx"), "utf8");
    expect(source).toContain("{!surface.ownsSubmission && (");
    expect(source).not.toContain("!surface.ownsSubmission && !progression");
  });
});

describe("R1 geometry: a no-progression match reclaims the ability row", () => {
  // The DECISION is still Ranked's (it reads the match's own
  // `progressionEnabled`); the ROW is the arena's.
  const source = () => readFileSync(
    resolve(process.cwd(), "src/pages/quiz-ranked/QuizRankedMatch.tsx"), "utf8");
  const arena = () => readFileSync(
    resolve(process.cwd(), "src/components/ranked-arena/CanonicalArena.tsx"), "utf8");

  it("removes the tray by not mounting it — no reserved empty track", () => {
    // The tray was ALREADY conditional, so `progressionEnabled` joins the
    // existing condition rather than swapping the tray for a spacer. A spacer
    // is what would leave a blank ~140px band on every R1 match.
    expect(source()).toContain("const showAbilityTray = progressionEnabled");
    expect(source()).not.toMatch(/ability-tray-placeholder|ability-tray-spacer/);
  });

  it("keeps the HUD row and its reserved status line on BOTH match kinds", () => {
    // The row is gated on the module, not on progression: the status line is
    // the one thing nothing else on screen shows, and its reserved height is
    // what stops the HUD resizing between "Submitting…" and an error.
    expect(arena()).toContain("{!surface.ownsSubmission && (");
    expect(arena()).not.toContain("!surface.ownsSubmission && progressionEnabled && (");
  });

  it("hides the level-2 overlay without touching the flow it overlays", () => {
    // The overlay is absolutely positioned over the question, so hiding it
    // moves nothing — the question surface keeps its box either way.
    // `hasSurface` is the same condition the old inline expression spelled out:
    // a resolved renderer AND something for it to draw.
    expect(arena()).toContain('className={hasSurface ? "absolute inset-x-0 top-0 z-20" : ""}');
  });
});
