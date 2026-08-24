/**
 * RG2 — the universal node draws three independent channels and invents none
 * of them.
 *
 * The tests are organised by CHANNEL rather than by mode, which is itself the
 * claim under test: nothing in this component knows whether a node came from a
 * Ranked round or a Daily card, so nothing here needs to say.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QuizTimelineNode } from "./QuizTimelineNode";
import {
  nodeLabel,
  readTimelineTopic,
  resolveNodeArt,
  tierStripCount,
  MAX_TIER_STRIPS,
  type QuizTimelineNodeModel,
  type TimelineTopic,
} from "./timelineNodeModel";
import {
  PUBLIC_CATEGORY_KEYS, categoryArt, DIFFICULTY_TIERS,
} from "@/lib/quiz/publicCategory";

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

const topic = (over: Partial<TimelineTopic> = {}): TimelineTopic => ({
  category: "itemization", tier: "medium",
  iconHint: { kind: "category", key: "Item Costs", icon: null },
  ...over,
});

const model = (over: Partial<QuizTimelineNodeModel> = {}): QuizTimelineNodeModel => ({
  ordinal: 4, state: "resolved", topic: topic(), outcome: "correct", ...over,
});

const mount = (over: Partial<QuizTimelineNodeModel> = {}) => {
  render(<QuizTimelineNode node={model(over)} />);
  return screen.getByTestId("quiz-timeline-plate");
};

const stripe = () => screen.queryByTestId("quiz-timeline-result-stripe");
const metal = () => screen.queryByTestId("quiz-timeline-difficulty");

// ───────────────────────────────────────────────────── channel 1: result

describe("the result channel", () => {
  it("puts a stripe on the TOP edge and leaves the subject alone", () => {
    const plate = mount({ outcome: "correct" });
    expect(stripe()).not.toBeNull();
    // THE rule of the design: the icon is not replaced by a tick.
    expect(plate.querySelector(".quiz-timeline-face")).not.toBeNull();
    expect(css).toMatch(/\.quiz-timeline-result \{[^}]*top: 0/);
  });

  it("carries the verdict in a SHAPE as well as a colour", () => {
    // Green for right and red for wrong is the commonest colour-vision
    // failure there is, so the stripe also breaks into a different number of
    // segments per verdict.
    const counts = new Map<string, number>();
    for (const outcome of
      ["correct", "both-correct", "incorrect", "timed-out"] as const) {
      const { unmount } = render(<QuizTimelineNode node={model({ outcome })} />);
      counts.set(outcome, screen
        .getAllByTestId("quiz-timeline-result-stripe")[0]
        .querySelectorAll(".quiz-timeline-result-segment").length);
      unmount();
    }
    expect(counts.get("correct")).toBe(1);
    expect(counts.get("both-correct")).toBe(2);
    expect(counts.get("incorrect")).toBe(4);
    // Timed out shares a segment count with correct and is separated by being
    // unlit instead — it is the verdict that is an ABSENCE.
    expect(counts.get("timed-out")).toBe(1);
    expect(css).toMatch(
      /\[data-outcome="timed-out"\] \.quiz-timeline-result \{[^}]*opacity/);
  });

  it("draws NO stripe on an unresolved node", () => {
    mount({ state: "current", outcome: null });
    expect(stripe()).toBeNull();
  });

  it("draws no stripe on a resolved node whose verdict aged out", () => {
    // A real and ordinary state: the settlement ledger is bounded, so an old
    // round stays resolved and simply carries no verdict.
    const plate = mount({ state: "resolved", outcome: null });
    expect(plate).toHaveAttribute("data-outcome", "");
    expect(stripe()).toBeNull();
  });
});

// ───────────────────────────────────────────────── channel 2: difficulty

describe("the difficulty channel", () => {
  it("draws one bronze, two silver and three gold strips", () => {
    expect(tierStripCount("easy")).toBe(1);
    expect(tierStripCount("medium")).toBe(2);
    expect(tierStripCount("hard")).toBe(3);
    for (const [tier, count] of
      [["easy", 1], ["medium", 2], ["hard", 3]] as const) {
      const { unmount } = render(
        <QuizTimelineNode node={model({ topic: topic({ tier }) })} />);
      expect(screen.getByTestId("quiz-timeline-difficulty")
        .querySelectorAll(".quiz-timeline-metal-strip"), tier)
        .toHaveLength(count);
      unmount();
    }
  });

  it("draws the scenario tier AS hard — three lines, never four", () => {
    // Scenario is a real fourth tier in the backend's scheduling and stays
    // one; the visible difficulty language is three levels and stops there.
    expect(tierStripCount("scenario")).toBe(3);
    const plate = mount({ topic: topic({ tier: "scenario" }) });
    expect(metal()!.querySelectorAll(".quiz-timeline-metal-strip"))
      .toHaveLength(3);
    // The raw tier is still inspectable — the SEMANTICS did not change, only
    // how many lines they are drawn with.
    expect(plate).toHaveAttribute("data-tier", "scenario");
    expect(plate).toHaveAttribute("data-strips", "3");
  });

  it("never draws more than three lines for any tier", () => {
    for (const tier of DIFFICULTY_TIERS) {
      expect(tierStripCount(tier), tier).toBeLessThanOrEqual(MAX_TIER_STRIPS);
      const { unmount } = render(
        <QuizTimelineNode node={model({ topic: topic({ tier }) })} />);
      expect(screen.getByTestId("quiz-timeline-difficulty")
        .querySelectorAll(".quiz-timeline-metal-strip").length, tier)
        .toBeLessThanOrEqual(3);
      unmount();
    }
    expect(MAX_TIER_STRIPS).toBe(3);
  });

  it("makes a scenario node and a hard node identical in this channel", () => {
    // Not "similar" — a reader must not be able to tell them apart by the
    // metal, because the channel only claims three levels.
    const read = (tier: "hard" | "scenario") => {
      const { unmount } = render(
        <QuizTimelineNode node={model({ topic: topic({ tier }) })} />);
      const strips = [...screen.getByTestId("quiz-timeline-difficulty")
        .querySelectorAll<HTMLElement>(".quiz-timeline-metal-strip")]
        .map((el) => el.getAttribute("style"));
      unmount();
      return strips;
    };
    expect(read("scenario")).toEqual(read("hard"));
  });

  it("draws NOTHING when no tier was stated", () => {
    const plate = mount({ topic: topic({ tier: null }) });
    expect(plate).toHaveAttribute("data-tier", "");
    expect(plate).toHaveAttribute("data-strips", "0");
    expect(metal()).toBeNull();
    expect(tierStripCount(null)).toBe(0);
  });

  it("never prints the tier as a word", () => {
    // Nine of these sit side by side at 36px. The word exists for assistive
    // tech (see `nodeLabel`) and is deliberately not the visible design.
    for (const tier of DIFFICULTY_TIERS) {
      const { unmount } = render(
        <QuizTimelineNode node={model({ topic: topic({ tier }) })} />);
      expect(screen.getByTestId("quiz-timeline-plate").textContent ?? "")
        .not.toMatch(/easy|medium|hard|scenario/i);
      unmount();
    }
  });

  it("sits on the BOTTOM edge and costs the plate no height", () => {
    expect(css).toMatch(/\.quiz-timeline-metal \{[^}]*position: absolute/);
    expect(css).toMatch(/\.quiz-timeline-metal \{[^}]*bottom: 0/);
    // Fixed-width slices, never stretched: a row that filled the plate would
    // read as a progress bar.
    expect(css).toMatch(/\.quiz-timeline-metal-strip \{[^}]*width: \d/);
  });
});

// ──────────────────────────────────────────────────── channel 3: subject

describe("the subject channel", () => {
  it("shows the champion PORTRAIT and a stat badge for a champion-stats node", () => {
    const plate = mount({
      topic: topic({
        category: "champion-stats",
        iconHint: { kind: "champion", key: "Aatrox",
          icon: "assets/champions/Aatrox/Aatrox.png" },
      }),
    });
    const img = plate.querySelector("img")!;
    expect(img.getAttribute("src")).toContain("assets/champions/Aatrox/Aatrox.png");
    expect(plate).toHaveAttribute("data-specific", "true");
    expect(plate).toHaveAttribute("data-badge", "stat");
  });

  it("shows the champion portrait and a COMBAT badge for a scenario node", () => {
    const plate = mount({
      topic: topic({
        category: "scenarios",
        iconHint: { kind: "champion", key: "Darius",
          icon: "assets/champions/Darius/Darius.png" },
      }),
    });
    expect(plate.querySelector("img")!.getAttribute("src"))
      .toContain("Darius");
    expect(plate).toHaveAttribute("data-badge", "combat");
  });

  it("badges an ability question so a portrait cannot mean three things", () => {
    // The reason the badge exists: a picture of Aatrox is the right main icon
    // for his base armour, for his E cooldown and for a scenario about him.
    const plate = mount({
      topic: topic({
        category: "abilities",
        iconHint: { kind: "champion", key: "Aatrox",
          icon: "assets/champions/Aatrox/Aatrox.png" },
      }),
    });
    expect(plate).toHaveAttribute("data-badge", "ability");
  });

  it("adds NO badge when the main icon is the category tile", () => {
    // The tile already says what kind of question it is; a badge on top would
    // state the same fact twice.
    expect(mount()).toHaveAttribute("data-badge", "none");
  });

  it("falls back to the category when the backend could not verify the art", () => {
    // The NAME is proven, the picture is not, and a path built here from the
    // name is exactly the unverified guess the backend refused to make.
    const art = resolveNodeArt(topic({
      category: "itemization",
      iconHint: { kind: "item", key: "Trinity Force", icon: null },
    }));
    expect(art.specific).toBe(false);
    expect(art.label).toBe("Trinity Force");
    expect(art.badge).toBe("none");
  });

  it("draws a neutral token when the node has no topic at all", () => {
    const plate = mount({ state: "upcoming", topic: null, outcome: null });
    expect(plate).toHaveAttribute("data-category", "");
    expect(plate.querySelector("img")).toBeNull();
    expect(plate.querySelector("circle")!.getAttribute("fill")).toBe("none");
  });

  it("gives Meta Reflex a drawn mark rather than borrowed entity art", () => {
    // The block is a speed drill ACROSS champions, items and stats. Borrowing
    // the abilities tile (a picture of Lux's ultimate) made it appear to claim
    // an ability it never asked about.
    const plate = mount({
      topic: topic({ category: "meta-reflex", tier: null,
        iconHint: { kind: "meta_reflex", key: null, icon: null } }),
    });
    expect(plate.querySelector("img")).toBeNull();
    expect(plate.querySelector("path")!.getAttribute("d"))
      .toBe("M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z");
  });

  it("has art or a drawn mark for every public category", () => {
    for (const key of PUBLIC_CATEGORY_KEYS) {
      const art = categoryArt(key);
      expect(Boolean(art.iconPath || art.glyph), key).toBe(true);
      expect(art.label, key).toBeTruthy();
    }
  });
});

// ───────────────────────────────────────────────────── the accessible name

describe("the accessible name", () => {
  const base: QuizTimelineNodeModel = {
    ordinal: 6, state: "resolved", topic: null, outcome: null };

  it("states position, subject, difficulty and outcome in reading order", () => {
    expect(nodeLabel({
      ...base,
      topic: {
        category: "abilities", tier: "hard",
        iconHint: { kind: "champion", key: "Aatrox",
          icon: "assets/champions/Aatrox/Aatrox.png" },
      },
      outcome: "incorrect",
    })).toBe("Round 6, resolved, Aatrox, Abilities & Cooldowns, hard, "
      + "abilities, you answered incorrectly");
  });

  it("says nothing it was not told", () => {
    expect(nodeLabel({ ...base, state: "upcoming" }))
      .toBe("Round 6, upcoming, not yet known");
  });

  it("calls the scenario tier hard, exactly as the drawing does", () => {
    // The label must not announce a fourth difficulty a sighted reader cannot
    // see — the two channels have to agree.
    const label = (tier: "hard" | "scenario") => nodeLabel({
      ...base,
      topic: { category: "abilities", tier, iconHint: null },
    });
    expect(label("scenario")).toBe(label("hard"));
    expect(label("scenario")).toContain("hard");
    expect(label("scenario")).not.toContain("scenario");
  });

  it("takes the unit from the caller so a Daily counts questions", () => {
    expect(nodeLabel({ ...base, state: "current" }, { unit: "Question" }))
      .toBe("Question 6, current, not yet known");
  });
});

// ────────────────────────────────────────────────────────── wire reading

describe("reading a topic off the wire", () => {
  it("accepts the backend's snake_case block", () => {
    expect(readTimelineTopic({
      category: "itemization", tier: "easy",
      icon_hint: { kind: "item", key: "Doran's Blade",
        icon: "assets/items/1055.png" },
    })).toEqual({
      category: "itemization", tier: "easy",
      iconHint: { kind: "item", key: "Doran's Blade",
        icon: "assets/items/1055.png" },
    });
  });

  it("degrades an unknown key rather than failing a live match", () => {
    // A client is expected to lag a deploy and the taxonomy is expected to
    // grow. A neutral mark is the correct rendering of "no art for this yet".
    const read = readTimelineTopic({
      category: "quantum-mechanics", tier: "trivial", icon_hint: null });
    expect(read).toEqual({ category: "general", tier: null, iconHint: null });
  });

  it("returns null for a missing or malformed block", () => {
    for (const value of [null, undefined, "topic", 7, []]) {
      expect(readTimelineTopic(value)).toBeNull();
    }
  });
});
