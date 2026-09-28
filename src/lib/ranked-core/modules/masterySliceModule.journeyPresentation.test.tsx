/**
 * JOURNEY-PRES-V1 — Journey children take part in the Mogzy question system:
 * the QF1 motif, RQ1 role emblems, the board's splash underlays and the
 * Journey banner's role emblem. (JP2 retired JP1's per-child focus plate: the
 * state board is now the Journey's whole media region.)
 *
 * Real J4 captures (`lib/journey/__fixtures__/j4`) through the production
 * parser and the production `masterySliceModule` viewport, as the other
 * Journey suites do. jsdom has no layout: geometry (no scroll, no overflow,
 * lock-in visible) is certified in a real browser — see
 * `JOURNEY_PRESENTATION_V1_HANDOFF.md`.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readPublicRound, type MasterySliceChallengeView } from "@/lib/ranked-public/contracts";
import { NO_INTERACTIONS, type CombatantView } from "@/lib/ranked-core/viewTypes";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { journeyViewFor } from "@/lib/journey/adapter";
import { journeyRailIdentity } from "@/lib/journey/rail";
import { JourneyStateBoard } from "@/components/journey/JourneyStateBoard";
import { CombatantPanel } from "@/components/ranked-arena/CombatantPanel";
import { MasteryAssetsContext, type MasteryAssets } from "@/features/mastery/player/MasteryAssets";
import { masterySliceModule } from "./masterySliceModule";

const DIR = resolve(process.cwd(), "src/lib/journey/__fixtures__/j4");
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const snap = (n: string, label: string): CaptureSnapshot => {
  const s = load(n).find((x) => x.label === label);
  if (!s) throw new Error(`${n}: ${label}`);
  return s;
};
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
/** The wire challenges of a capture (raw, snake_case). */
const wireChallenges = (s: CaptureSnapshot): Record<string, unknown>[] =>
  ((s.envelope.payload as { segment_state: { challenges: { challenges: Record<string, unknown>[] } } })
    .segment_state.challenges.challenges);
/** The parsed challenge at `index`, through the production reader. */
const parsed = (s: CaptureSnapshot, index: number): MasterySliceChallengeView => {
  const block = readPublicRound(s.envelope).segmentState!.block;
  const list = block?.contract === "mastery_slice" ? block.challenges : [];
  const c = list.find((x) => x.challengeIndex === index);
  if (!c) throw new Error(`no challenge ${index}`);
  return c;
};

const Viewport = masterySliceModule.Viewport;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function show(s: CaptureSnapshot) {
  vi.setSystemTime(Date.parse(s.at));
  const round = readPublicRound(s.envelope);
  return render(
    <QueryClientProvider client={queryClient}>
      <Viewport publicRound={round} segmentState={round.segmentState} selection={null}
        permissions={NO_INTERACTIONS} onSelect={() => {}}
        actions={{ submitChallenge: () => {}, busy: false, error: null }} skewMs={0} />
    </QueryClientProvider>,
  );
}
const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("the QF1 motif is no longer suppressed inside a Journey", () => {
  it("the Journey stylesheet no longer hides the motif; it clips the bleed at its host instead", () => {
    expect(CSS).not.toMatch(/\.journey-question\s+\.question-motif-layer\s*\{\s*display:\s*none/);
    expect(CSS).toMatch(/\.journey-question\s+\.question-motif-host\s*\{[^}]*overflow:\s*clip/);
  });

  it.each([
    ["Champion child (structural)", "child0-live", 0, "champion_studies"],
    ["Matchup child (comparison)", "child1-live", 1, "champion_studies"],
    ["Combat child (prose)", "child2-live", 2, "combat_workings"],
  ])("%s draws its own motif layer, from its own challenge", (_n, label, index, motif) => {
    const s = snap("lucian.standard", label);
    expect(parsed(s, index).motif).toBe(motif);
    show(s);
    const question = screen.getByTestId("journey-question");
    const layer = within(question).getByTestId("question-motif-layer");
    expect(layer).toHaveAttribute("data-motif", motif);
    // Its host opts in, so the layer anchors and paints beneath the question.
    expect(layer.parentElement!.className).toContain("question-motif-host");
  });

  it("the motif follows the CHILD, not the Journey: it changes when the child changes", () => {
    const { unmount } = show(snap("lucian.standard", "child0-live"));
    expect(screen.getByTestId("question-motif-layer")).toHaveAttribute("data-motif", "champion_studies");
    unmount();
    show(snap("lucian.standard", "child2-live"));
    expect(screen.getByTestId("question-motif-layer")).toHaveAttribute("data-motif", "combat_workings");
  });

  it("a child with no motif draws no layer (fail closed, no blanket Journey motif)", () => {
    const s = clone(snap("lucian.standard", "child0-live"));
    for (const c of wireChallenges(s)) delete c.motif;
    show(s);
    expect(screen.queryByTestId("question-motif-layer")).toBeNull();
  });
});

describe("question role emblems come from challenge.roles alone", () => {
  it("the board's step header shows the current question's roles — never the Journey's role string", () => {
    const s = snap("lucian.standard", "child0-live");
    const journeyRole = (s.envelope.payload as {
      segment_state: { challenges: { journey: { role: string } } } }).segment_state.challenges.journey.role;
    expect(journeyRole).toBe("bot"); // unvalidated recipe string, not a role id
    show(s);
    const roles = within(screen.getByTestId("journey-board")).getByTestId("journey-question-roles");
    expect(roles).toHaveAttribute("data-roles", "adc");
    expect(within(roles).getAllByTestId("role-emblem").map((e) => e.getAttribute("data-role"))).toEqual(["adc"]);
  });

  it("changes with the child (Pantheon: Leona's support → a four-role Matchup)", () => {
    const { unmount } = show(snap("pantheon.standard", "child0-live"));
    expect(screen.getByTestId("journey-question-roles")).toHaveAttribute("data-roles", "support");
    unmount();
    show(snap("pantheon.standard", "child1-live"));
    expect(screen.getByTestId("journey-question-roles")).toHaveAttribute("data-roles", "top jungle mid support");
  });

  it("a universal question (no roles) shows no badge anywhere", () => {
    const s = clone(snap("lucian.standard", "child2-live"));
    for (const c of wireChallenges(s)) delete c.roles;
    show(s);
    expect(screen.queryByTestId("journey-question-roles")).toBeNull();
    expect(screen.queryByTestId("question-role-emblems")).toBeNull();
  });
});

describe("the board's splash underlays use the public champion identity", () => {
  const board = (assets: MasteryAssets) => {
    const s = snap("lucian.standard", "child0-live");
    const seg = readPublicRound(s.envelope).segmentState!;
    const view = journeyViewFor(seg.journey, {
      ownNextChallengeIndex: seg.ownNextChallengeIndex, ownCardStartedAt: seg.ownCardStartedAt,
      ownFinished: seg.ownFinished,
    })!;
    render(
      <MasteryAssetsContext.Provider value={assets}>
        <JourneyStateBoard state={view.board} />
      </MasteryAssetsContext.Provider>,
    );
    return view.board;
  };

  it("each side sits on ITS champion's splash, decorative and hidden from assistive tech", () => {
    const seen: string[] = [];
    const state = board({
      championIconUrl: () => null, itemIconUrl: () => null,
      championSplashUrl: (id, name) => { seen.push(`${id}|${name}`); return `splash:${name}`; },
    });
    const [subject, opponent] = state.sides;
    for (const side of [subject, opponent]) {
      const el = screen.getByTestId(`journey-splash-${side.side}`);
      expect(el).toHaveAttribute("aria-hidden", "true");
      expect(el).toHaveAttribute("data-champion", side.championName);
      expect(el.querySelector("img")).toHaveAttribute("src", `splash:${side.championName}`);
      // Inside its own side panel, so the text on top of it stays that panel's.
      expect(screen.getByTestId(`journey-side-${side.side}`)).toContainElement(el);
    }
    // Asked for by the side's public id and name — nothing else.
    expect(seen).toEqual(expect.arrayContaining([
      `${subject.championId}|${subject.championName}`, `${opponent.championId}|${opponent.championName}`]));
  });

  it("no resolver (tests, the Lab, a missing manifest) draws no underlay and no box", () => {
    board({ championIconUrl: () => null, itemIconUrl: () => null });
    expect(screen.queryByTestId(/^journey-splash-/)).toBeNull();
  });
});

describe("JP3 — while a Journey runs, the banner draws no match role (the board is the scenario)", () => {
  const combatant = (over: Partial<CombatantView> = {}): CombatantView => ({
    playerId: "you", name: "You", tag: "Jungle", side: "player", classId: "tank",
    roleId: "jungle", identityMode: "role", score: 0, hp: 150, maxHp: 170, xp: 0, level: 1,
    nextLevelThreshold: null, currentLevelThreshold: 0, hasSubmitted: false,
    abilityWindow: null, hasAbilitySelected: false, ...over,
  });
  const rail = () => {
    const s = snap("lucian.standard", "child0-live");
    const seg = readPublicRound(s.envelope).segmentState!;
    const view = journeyViewFor(seg.journey, {
      ownNextChallengeIndex: seg.ownNextChallengeIndex, ownCardStartedAt: seg.ownCardStartedAt,
      ownFinished: seg.ownFinished,
    })!;
    return journeyRailIdentity(view.board, "subject");
  };

  it("a Journey banner draws neither the match role's name nor its emblem ('Jungle' is not the Journey's lane)", () => {
    render(<CombatantPanel combatant={combatant()} presentation="banner" damage={[]} journey={rail()} />);
    expect(screen.queryByTestId("identity-tag-you")).toBeNull();
    expect(screen.queryByTestId("role-emblem")).toBeNull();
    expect(screen.getByTestId("combatant-you").textContent).not.toMatch(/jungle/i);
    // Identity and score stay: the name, the champion crest, the tally.
    expect(screen.getByTestId("combatant-you")).toHaveTextContent("You");
    expect(screen.getByTestId("journey-crest-subject")).toBeInTheDocument();
    expect(screen.getByTestId("score-you")).toBeInTheDocument();
  });

  it("outside a Journey the banner is unchanged: the role's name, and the mascot says the rest", () => {
    render(<CombatantPanel combatant={combatant()} presentation="banner" damage={[]} />);
    expect(screen.getByTestId("identity-tag-you")).toHaveTextContent("Jungle");
    expect(within(screen.getByTestId("identity-tag-you")).queryByTestId("role-emblem")).toBeNull();
  });

  it("the phone match bar drops the match-role emblem during a Journey, and keeps it otherwise", async () => {
    const { MobileMatchBar } = await import("@/components/ranked-arena/MobileMatchBar");
    const barRail = (journey: ReturnType<typeof rail> | null) => ({
      kind: "combatant" as const, combatant: combatant(), presentation: "banner" as const, damage: [], outcome: null,
      damageDealt: null, feedback: null, reaction: null, award: null, journey,
    });
    const other = { ...barRail(null), combatant: combatant({ playerId: "opp", name: "Bot", side: "opponent", roleId: "top", tag: "Top" }) };
    const header = {
      eyebrow: "Ranked Duel", title: "10 / 10", transitionNote: null, playtestNote: null, presenceNote: null,
      timerLabel: "Journey timer", timer: { durationSeconds: 120, remainingSeconds: 100, paused: false, urgent: false },
    };
    const { unmount } = render(<MobileMatchBar header={header} left={barRail(rail())} right={other} progressionEnabled={false} />);
    expect(within(screen.getByTestId("mobile-combatant-you")).queryByTestId("role-emblem")).toBeNull();
    unmount();
    render(<MobileMatchBar header={header} left={barRail(null)} right={other} progressionEnabled={false} />);
    expect(within(screen.getByTestId("mobile-combatant-you")).getByTestId("role-emblem")).toHaveAttribute("data-role", "jungle");
  });
});
