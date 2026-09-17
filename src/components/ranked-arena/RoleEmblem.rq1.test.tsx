/**
 * RQ1 — question role emblems: the component, the wire path, the live card,
 * the timeline, and the authority guards.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionRoleEmblems, RoleEmblem, ROLE_EMBLEM_SRC } from "./RoleEmblem";
import { RoundTimeline } from "./RoundTimeline";
import { InteractiveScenarioSurface } from "@/components/question-surface/InteractiveScenarioSurface";
import { readTimelineTopic } from "@/components/quiz/timeline/timelineNodeModel";
import { questionViewFromPublicQuestion } from "@/lib/ranked-core/adapters/adaptToViews";
import { TIMELINE_ANCHOR_INDEX, TIMELINE_VISIBLE_NODES } from "@/lib/ranked-core/roundTimeline";
import { RANKED_ROLES } from "@/lib/ranked-public/roles";
import type { QuizQuestion } from "@/lib/quiz/api";
import type {
  InteractionPermissions, QuestionView, TimelineNode,
} from "@/lib/ranked-core/viewTypes";

afterEach(cleanup);

describe("RoleEmblem", () => {
  it("maps every canonical role to its shipped SVG, with adc -> bot.svg", () => {
    expect(ROLE_EMBLEM_SRC).toEqual({
      top: "/assets/ranked/mogzy-role-icons/top.svg",
      jungle: "/assets/ranked/mogzy-role-icons/jungle.svg",
      mid: "/assets/ranked/mogzy-role-icons/mid.svg",
      adc: "/assets/ranked/mogzy-role-icons/bot.svg",
      support: "/assets/ranked/mogzy-role-icons/support.svg",
    });
    for (const role of RANKED_ROLES) {
      expect(readFileSync(resolve(process.cwd(), "public", ROLE_EMBLEM_SRC[role].slice(1)), "utf8"))
        .toContain("<svg");
    }
  });

  it("names the role accessibly and reserves its box before load", () => {
    render(<RoleEmblem role="adc" size="md" />);
    const img = screen.getByRole("img", { name: "ADC" });
    expect(img.getAttribute("width")).toBe("20");
    expect(img.getAttribute("height")).toBe("20");
  });

  it("a cluster renders one emblem per role in lane order, and nothing for none", () => {
    const { container } = render(<QuestionRoleEmblems roles={["support", "top", "top"]} />);
    const cluster = screen.getByRole("img", { name: "Question roles: Top, Support" });
    expect(Array.from(cluster.querySelectorAll("[data-testid='role-emblem']"))
      .map((e) => e.getAttribute("data-role"))).toEqual(["top", "support"]);
    cleanup();
    const empty = render(<QuestionRoleEmblems roles={[]} />);
    expect(empty.container.innerHTML).toBe("");
    expect(container).toBeTruthy();
  });
});

describe("wire path: topic.roles -> QuestionView.roles", () => {
  it("reads canonical roles, drops unknowns, and omits the field when none", () => {
    expect(readTimelineTopic({ category: "abilities", roles: ["mid", "bot", "top"] })?.roles)
      .toEqual(["top", "mid"]);
    expect(readTimelineTopic({ category: "abilities", roles: [] })).not.toHaveProperty("roles");
    expect(readTimelineTopic({ category: "abilities" })).not.toHaveProperty("roles");
  });

  it("carries roles onto the question view only when the topic states them", () => {
    const base = { questionId: "q", prompt: "p", options: ["a", "b"], category: "x" };
    expect(questionViewFromPublicQuestion({
      ...base, topic: readTimelineTopic({ category: "abilities", roles: ["jungle"] }),
    }).roles).toEqual(["jungle"]);
    expect(questionViewFromPublicQuestion({ ...base, topic: null })).not.toHaveProperty("roles");
  });
});

// ─────────────────────────────────────────────────────────────── live card

const OPEN: InteractionPermissions = {
  canSelectAnswer: true, canChangeAnswer: true, canSelectAbility: true,
  canReviewSubmission: true, canConfirmSubmission: true, canAdvance: false,
};
const LOCKED: InteractionPermissions = { ...OPEN, canSelectAnswer: false,
  canChangeAnswer: false, canSelectAbility: false, canReviewSubmission: false,
  canConfirmSubmission: false };

const Q: QuestionView = {
  questionId: "q", category: "Champion Ability Cooldowns", prompt: "What is Aatrox E's cooldown?",
  options: ["10", "9", "8", "7"].map((label, index) => ({ id: String(index), index, label })),
};
const CHAMPION_SCENARIO: QuizQuestion = {
  id: "q", category: Q.category!, question_text: Q.prompt, format: "multiple_choice",
  choices: Q.options.map((o) => o.label),
  // An item subject only to get the cinematic band (the header category row)
  // without the champion band's data hooks; roles come from the VIEW, not this.
  metadata: { assets: { subject: { type: "item", name: "Rabadon's Deathcap", icon: "assets/items/3089.png" } } },
};

function card(question: QuestionView, extra: Record<string, unknown> = {}) {
  return render(
    <InteractiveScenarioSurface question={question} selectedOptionId={null}
      permissions={OPEN} onSelectOption={vi.fn()} variant="competitive"
      scenarioSource={CHAMPION_SCENARIO} {...extra} />,
  );
}

describe("live question card", () => {
  it("single-role question: one emblem immediately left of the category, same row", () => {
    card({ ...Q, roles: ["top"] });
    const row = screen.getByTestId("question-meta-row");
    const [first, second] = Array.from(row.children);
    expect(first.getAttribute("data-testid")).toBe("question-role-emblems");
    expect(second.className).toContain("scenario-category");
    expect(within(row).getAllByTestId("role-emblem")).toHaveLength(1);
    // The prompt still follows the metadata row directly.
    expect(row.nextElementSibling?.tagName).toBe("H2");
  });

  it("multi-role question: every applicable role", () => {
    card({ ...Q, roles: ["adc", "support"] });
    expect(within(screen.getByTestId("question-meta-row")).getAllByTestId("role-emblem")
      .map((e) => e.getAttribute("data-role"))).toEqual(["adc", "support"]);
  });

  it("neutral question: no emblem and the original category markup", () => {
    card(Q);
    expect(screen.queryByTestId("role-emblem")).toBeNull();
    expect(screen.queryByTestId("question-meta-row")).toBeNull();
    expect(document.querySelector(".scenario-category")).not.toBeNull();
  });

  it("persists through the reveal", () => {
    const { rerender } = card({ ...Q, roles: ["mid"] });
    rerender(
      <InteractiveScenarioSurface question={{ ...Q, roles: ["mid"] }} selectedOptionId="0"
        permissions={LOCKED} onSelectOption={vi.fn()} variant="competitive"
        scenarioSource={CHAMPION_SCENARIO} revealedCorrectOptionId="1" />,
    );
    expect(within(screen.getByTestId("question-meta-row")).getByTestId("role-emblem")
      .getAttribute("data-role")).toBe("mid");
  });

  it("compact band (no media): the emblem sits beside the band's category label", () => {
    render(<InteractiveScenarioSurface question={{ ...Q, roles: ["jungle"] }}
      selectedOptionId={null} permissions={OPEN} onSelectOption={vi.fn()} variant="competitive" />);
    expect(within(screen.getByTestId("scenario-compact")).getByTestId("role-emblem")
      .getAttribute("data-role")).toBe("jungle");
  });
});

// ──────────────────────────────────────────────────────────────── timeline

describe("round timeline", () => {
  const nodes: TimelineNode[] = [
    { roundNumber: 1, index: 0, visible: true, state: "resolved", segmentKind: "standard",
      outcome: "correct", tag: null,
      topic: { category: "abilities", tier: "hard", roles: ["top"],
        iconHint: { kind: "champion", key: "Aatrox", icon: "assets/champions/Aatrox/icon.png" } } },
    { roundNumber: 2, index: 1, visible: true, state: "current", segmentKind: "standard",
      outcome: null, tag: null,
      topic: { category: "itemization", tier: "easy", iconHint: { kind: "category", key: "Item Costs", icon: null } } },
    { roundNumber: 3, index: 2, visible: true, state: "upcoming", segmentKind: null,
      outcome: null, tag: null, topic: null },
  ];
  const mount = () => render(<RoundTimeline timeline={{
    visibleNodes: TIMELINE_VISIBLE_NODES, anchorIndex: TIMELINE_ANCHOR_INDEX,
    windowStart: 1, currentIndex: 1, currentRoundNumber: 2, anchored: false, nodes }} />);

  it("keeps the primary art and adds the role only as a small corner marker", () => {
    mount();
    const node = screen.getByTestId("timeline-node-1");
    const primary = Array.from(node.querySelectorAll("img"))
      .find((img) => img.getAttribute("data-testid") !== "role-emblem");
    expect(primary?.getAttribute("src")).toContain("assets/champions/Aatrox/icon.png");
    const roles = screen.getByTestId("timeline-node-roles-1");
    expect(roles.className).toContain("absolute");
    expect(within(roles).getByTestId("role-emblem").getAttribute("width")).toBe("11");
    expect(node.querySelector(".sr-only")?.textContent).toContain("Top question");
  });

  it("draws no role marker for a neutral node or an unknown future node", () => {
    mount();
    expect(screen.queryByTestId("timeline-node-roles-2")).toBeNull();
    expect(screen.queryByTestId("timeline-node-roles-3")).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────── authority guards

describe("authority guards", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
  /** One top-level function's source, from its declaration to the next one. */
  const fn = (file: string, name: string) => {
    const source = read(file);
    const start = source.indexOf(`export function ${name}`);
    expect(start, `${file}:${name}`).toBeGreaterThanOrEqual(0);
    const ends = [source.indexOf("\nexport function ", start + 1),
      source.indexOf("\nfunction ", start + 1)].filter((n) => n > 0);
    return source.slice(start, ends.length ? Math.min(...ends) : source.length);
  };
  const QUESTION_ROLE_CODE = () => [
    read("src/components/ranked-arena/RoleEmblem.tsx"),
    fn("src/components/quiz/timeline/timelineNodeModel.ts", "readQuestionRoles"),
    fn("src/components/quiz/timeline/timelineNodeModel.ts", "readTimelineTopic"),
    fn("src/lib/ranked-core/adapters/adaptToViews.ts", "questionViewFromPublicQuestion"),
  ];

  it("question-role code never reads the player's roleId", () => {
    for (const source of QUESTION_ROLE_CODE()) expect(source).not.toMatch(/\broleId\b/);
    expect(read("src/components/question-surface/InteractiveScenarioSurface.tsx"))
      .not.toMatch(/roleId/);
    expect(read("src/components/ranked-arena/RoundTimeline.tsx")).not.toMatch(/roleId/);
  });

  it("no prompt or category string matching is used as the role authority", () => {
    for (const source of QUESTION_ROLE_CODE()) {
      expect(source).not.toMatch(/category\??\.(includes|match|startsWith|toLowerCase)/);
      expect(source).not.toMatch(/prompt\??\.(includes|match|startsWith|toLowerCase)/);
    }
  });
});
