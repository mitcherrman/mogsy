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

describe("no Ranked surface reintroduces internal scrolling or a pinned height", () => {
  // A source scan, not a render assertion, deliberately: the live-round tests
  // and the browser probe only ever reach the ACTIVE arena, and the leftover
  // that motivated this check was in the terminal match-over branch, which
  // neither of them mounts.
  const files = [
    "src/pages/quiz-ranked/QuizRankedMatch.tsx",
    "src/pages/quiz-ranked/QuizRankedPage.tsx",
    "src/components/Layout.tsx",
  ];
  const stripComments = (s: string) =>
    s.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

  it.each(files)("%s declares no scroll container and no viewport-derived height", (file) => {
    const src = stripComments(readFileSync(resolve(process.cwd(), file), "utf8"));
    expect(src).not.toMatch(/overflow-y-auto|overflow-auto|overflow-y-scroll/);
    // `--app-viewport-h` may still be REFERENCED for loading placeholders (that
    // is the route-loading overflow fix); what must not come back is an arena
    // container sized to it, or a flex-fill chain that pins the arena's height.
    expect(src).not.toMatch(/h-\[var\(--app-viewport-h\)\]/);
    expect(src).not.toMatch(/lg:flex-1|lg:min-h-0/);
  });

  it("still keeps the shell's header offset and the viewport token", () => {
    const layout = readFileSync(resolve(process.cwd(), "src/components/Layout.tsx"), "utf8");
    // Removing the game viewport must not undo the RA1 1.1 loading fix.
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

  it("gives the answer/ability values their own grid track", async () => {
    await mountArena();
    await waitFor(() => expect(screen.getByTestId("status-answer")).toBeInTheDocument());
    for (const id of ["status-answer", "status-ability"]) {
      const value = screen.getByTestId(id);
      // The value is a grid item in a fixed [auto | 1fr] pair, not a flex item
      // in a `justify-between` row — that is what used to slide it sideways by
      // the width of its own text on every selection.
      expect(value.parentElement!.className).toContain("grid-cols-[auto_minmax(0,1fr)]");
      expect(value.className).toContain("truncate");
      expect(value.className).toContain("text-right");
    }
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
    const source = readFileSync(
      resolve(process.cwd(), "src/pages/quiz-ranked/QuizRankedMatch.tsx"), "utf8");
    expect(source).toContain("{!moduleOwnsSubmission && (");
    expect(source).not.toContain("!moduleOwnsSubmission && !isProgression");
  });
});
