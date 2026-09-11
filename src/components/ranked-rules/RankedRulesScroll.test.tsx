/**
 * The rules scroll, as a player meets it.
 *
 * Three things are being defended here, and only three:
 *
 *   1. WHO SEES IT AND WHEN — a first-time browser gets it open, a returning
 *      one gets it collapsed, and the acknowledgement survives a remount.
 *      Versioned, so a later scoring change can re-show it exactly once.
 *   2. WHAT IT SAYS — every RP1 award, and in particular that a multi-question
 *      module's speed bonus needs a PERFECT module, with no standalone perfect
 *      bonus anywhere in the copy.
 *   3. HOW IT BEHAVES — reopenable, dismissable, keyboard-reachable.
 *
 * Match safety is proved in `QuizRankedMatch.rulesScroll.test.tsx`, against a
 * real match rather than against this component alone.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

// This repo's jsdom pin exposes no working Storage; suites that genuinely
// exercise persistence opt into the shared stub. See src/test/localStorageStub.
import { installLocalStorageStub } from "@/test/localStorageStub";

import { RankedRulesScroll } from "./RankedRulesScroll";
import {
  RANKED_RULES_VERSION,
  markRankedRulesSeen,
  readSeenRankedRulesVersion,
  shouldAutoOpenRankedRules,
} from "@/lib/ranked/ranked-rules-seen";

const panel = () => screen.queryByTestId("ranked-rules-panel");
const tab = () => screen.getByTestId("ranked-rules-tab");

const resetStorage = installLocalStorageStub();

beforeEach(() => resetStorage());
afterAll(() => resetStorage());

describe("a first-time player", () => {
  it("is shown the rules without asking, and the tab says so", () => {
    render(<RankedRulesScroll />);
    expect(panel()).not.toBeNull();
    expect(tab()).toHaveAttribute("aria-expanded", "true");
  });

  it("acknowledging records THIS rules version, not a bare boolean", () => {
    render(<RankedRulesScroll />);
    fireEvent.click(screen.getByTestId("ranked-rules-acknowledge"));

    expect(panel()).toBeNull();
    expect(readSeenRankedRulesVersion()).toBe(RANKED_RULES_VERSION);
  });

  it("starts collapsed on the next visit", () => {
    const first = render(<RankedRulesScroll />);
    fireEvent.click(screen.getByTestId("ranked-rules-acknowledge"));
    first.unmount();

    render(<RankedRulesScroll />);
    expect(panel()).toBeNull();
    expect(tab()).toHaveAttribute("aria-expanded", "false");
  });
});

describe("a returning player", () => {
  beforeEach(() => markRankedRulesSeen(RANKED_RULES_VERSION));

  it("starts collapsed, and the affordance is still there to be found", () => {
    render(<RankedRulesScroll />);
    expect(panel()).toBeNull();
    expect(tab()).toBeInTheDocument();
  });

  it("can reopen it, and close it again", () => {
    render(<RankedRulesScroll />);

    fireEvent.click(tab());
    expect(panel()).not.toBeNull();

    fireEvent.click(screen.getByTestId("ranked-rules-close"));
    expect(panel()).toBeNull();
  });

  it("Escape closes it, the way every other panel in the app does", () => {
    render(<RankedRulesScroll />);
    fireEvent.click(tab());
    expect(panel()).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(panel()).toBeNull();
  });
});

describe("the seen-version contract", () => {
  it("a browser that has never stored anything reads as unseen", () => {
    expect(readSeenRankedRulesVersion()).toBe(0);
    expect(shouldAutoOpenRankedRules()).toBe(true);
  });

  it("a stale acknowledgement re-opens the scroll exactly once", () => {
    // What a scoring change looks like from an existing player's browser.
    markRankedRulesSeen(RANKED_RULES_VERSION);
    expect(shouldAutoOpenRankedRules(RANKED_RULES_VERSION + 1)).toBe(true);

    markRankedRulesSeen(RANKED_RULES_VERSION + 1);
    expect(shouldAutoOpenRankedRules(RANKED_RULES_VERSION + 1)).toBe(false);
  });

  it("a rolled-back client does not re-interrupt a caught-up player", () => {
    markRankedRulesSeen(RANKED_RULES_VERSION + 1);
    expect(shouldAutoOpenRankedRules(RANKED_RULES_VERSION)).toBe(false);
  });

  it("a corrupt stored value is unseen, never 'some version'", () => {
    localStorage.setItem("lol:ranked-rules:seen_version", "not-a-number");
    expect(readSeenRankedRulesVersion()).toBe(0);
    expect(shouldAutoOpenRankedRules()).toBe(true);
  });
});

describe("what the scroll actually tells the player", () => {
  const text = () => {
    render(<RankedRulesScroll />);
    return screen.getByTestId("ranked-rules-content").textContent ?? "";
  };

  it("names every RP1 award", () => {
    const body = text();
    expect(body).toMatch(/Correct answer\s*\+2/);
    expect(body).toMatch(/Hard question\s*\+3/);
    expect(body).toMatch(/Correct, and first to answer\s*\+1/);
    expect(body).toMatch(/Each correct answer\s*\+1/);
  });

  it("makes the multi-question speed bonus conditional on a PERFECT module",
    () => {
      const body = text();
      // The row states both halves of the condition…
      expect(body).toMatch(/Perfect module, and first to finish\s*\+1/);
      // …and the failure case is spelled out, because that is the half a
      // player is most likely to guess wrong. 4/5 first earns 4, not 5.
      expect(body).toMatch(/Miss one and there is no speed bonus/i);
    });

  it("never implies a standalone perfect bonus", () => {
    render(<RankedRulesScroll />);
    const rows = Array.from(
      screen.getByTestId("ranked-rules-content").querySelectorAll(".mogzy-scroll-row"),
    ).map((row) => (row.textContent ?? "").toLowerCase());

    // RP1 has exactly one bonus and it requires perfection AND finishing
    // first. So no row may award anything for perfection on its own: every
    // row that mentions it must also say "first" in the same breath.
    const perfectRows = rows.filter((row) => row.includes("perfect"));
    expect(perfectRows.length).toBeGreaterThan(0);
    for (const row of perfectRows) expect(row).toContain("first");

    // And the phrase itself never appears — a "perfect bonus" is not a thing
    // the backend awards and must not be a thing this scroll names.
    const body = (screen.getByTestId("ranked-rules-content").textContent ?? "")
      .toLowerCase();
    expect(body).not.toMatch(/perfect\s+(module\s+)?bonus/);
  });

  it("states the match structure and how it is won", () => {
    const body = text();
    expect(body).toMatch(/10 modules/i);
    expect(body).toMatch(/Highest score wins/i);
    expect(body).toMatch(/equal score is a draw/i);
  });

  it("says nothing about HP or damage — this is the points match", () => {
    const body = text().toLowerCase();
    expect(body).not.toContain("hp");
    expect(body).not.toContain("damage");
    expect(body).not.toContain("health");
  });
});

describe("reaching it without a mouse", () => {
  beforeEach(() => markRankedRulesSeen(RANKED_RULES_VERSION));

  it("the collapsed control is a real button with a useful name", () => {
    render(<RankedRulesScroll />);
    const control = screen.getByRole("button", {
      name: "View Ranked scoring rules",
    });
    expect(control).toBe(tab());
    // Not an image with a click handler — see the mascot note in the shell.
    expect(control.tagName).toBe("BUTTON");
  });

  it("opens on Enter and lands focus on the way out", () => {
    render(<RankedRulesScroll />);
    tab().focus();
    // Enter on a focused <button> is a click; jsdom does not synthesise that,
    // so the click is what a keyboard press actually produces.
    fireEvent.click(tab());

    const acknowledge = screen.getByTestId("ranked-rules-acknowledge");
    expect(document.activeElement).toBe(acknowledge);

    fireEvent.click(acknowledge);
    expect(document.activeElement).toBe(tab());
  });

  it("announces its open state on the control that toggles it", () => {
    render(<RankedRulesScroll />);
    expect(tab()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(tab());
    expect(tab()).toHaveAttribute("aria-expanded", "true");
  });

  it("the open scroll is a labelled dialog that does not trap the page", () => {
    render(<RankedRulesScroll />);
    fireEvent.click(tab());

    const dialog = screen.getByRole("dialog", { name: "Ranked Rules" });
    expect(dialog).toBe(panel());
    // Non-modal on purpose: the match behind it is live and must stay
    // reachable by keyboard while the rules are open.
    expect(dialog).toHaveAttribute("aria-modal", "false");
  });
});
