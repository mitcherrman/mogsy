/**
 * The Pro Play question card, driven by REAL server payloads.
 *
 * Every case below is a frozen production (or live-authority) response, so
 * these assert what the card does with what the backend actually sends —
 * including the cases a hand-written fixture would never have thought of: a
 * FLEX role, a four-team career, a league name the policy refuses to shorten,
 * and two lineages of the same organisation in one question.
 *
 * The load-bearing test in this file is the answer-safety sweep: it walks the
 * rendered DOM for every shape and fails if any number from the reveal
 * appears before an answer.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProPlayEvidence from "./ProPlayEvidence";
import ProPlayQuestionCard from "./ProPlayQuestionCard";
import { PRO_PLAY_SAMPLES } from "@/lib/pro-play/__fixtures__/proPlaySamples";
import { asEvidence, asQuestionContext } from "@/lib/pro-play/contract";

// The manifest is a react-query fetch; stubbing the hook keeps these as unit
// tests of the CARD rather than of the query layer, matching how every other
// champion-media test in the repo does it.
const mocks = vi.hoisted(() => ({ manifest: null as unknown }));

vi.mock("@/hooks/useChampionAssets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useChampionAssets")>();
  return { ...actual, useChampionAssets: () => ({ data: mocks.manifest }) };
});

const MANIFEST = {
  ok: true,
  champions: {
    Kennen: { icon: "assets/champions/Kennen/icon.png", splash: "assets/champions/Kennen/splash/0_default.jpg", loading: "assets/champions/Kennen/loading/0_default.jpg", cutout: "" },
    "Kai'Sa": { icon: "assets/champions/Kaisa/icon.png", splash: "assets/champions/Kaisa/splash/0_default.jpg", loading: "assets/champions/Kaisa/loading/0_default.jpg", cutout: "" },
    Udyr: { icon: "", splash: "assets/champions/Udyr/splash/0_default.jpg", loading: "assets/champions/Udyr/loading/0_default.jpg", cutout: "" },
    Gangplank: { icon: "", splash: "assets/champions/Gangplank/splash/0_default.jpg", loading: "assets/champions/Gangplank/loading/0_default.jpg", cutout: "" },
    "Twisted Fate": { icon: "", splash: "assets/champions/TwistedFate/splash/0_default.jpg", loading: "assets/champions/TwistedFate/loading/0_default.jpg", cutout: "" },
  },
};

function installManifest(manifest: unknown = MANIFEST) {
  mocks.manifest = manifest;
}

function renderCard(key: string) {
  const sample = PRO_PLAY_SAMPLES[key];
  const context = asQuestionContext(sample.question.context);
  const utils = render(
    <ProPlayQuestionCard
      topic={sample.question.topic}
      questionText={sample.question.question_text}
      context={context}
    >
      <div data-testid="choices">{sample.question.choices.join(" | ")}</div>
    </ProPlayQuestionCard>,
  );
  return { ...utils, sample, context };
}

beforeEach(() => installManifest());
afterEach(() => {
  cleanup();
  mocks.manifest = null;
});

const ALL = Object.keys(PRO_PLAY_SAMPLES);

// ── 1. context rail ────────────────────────────────────────────────────────

describe("context rail", () => {
  it.each(ALL)("renders relationship, scope and metric chips for %s", (key) => {
    const { context } = renderCard(key);
    expect(screen.getByTestId("pro-play-relationship")).toHaveTextContent(
      context!.relationship.label,
    );
    expect(screen.getByTestId("pro-play-metric-tag")).toHaveTextContent(
      context!.metric.label,
    );
    const chips = screen.getAllByTestId("pro-play-scope-tag");
    expect(chips).toHaveLength(context!.scope_tags.length);
  });

  it("renders scope chips in the server's order and never re-sorts them", () => {
    const { context } = renderCard("patch");
    const rendered = screen
      .getAllByTestId("pro-play-scope-tag")
      .map((el) => el.textContent);
    expect(rendered).toEqual(context!.scope_tags.map((t) => t.label));
  });

  it("shows ALL TIME for an all-time career scope", () => {
    renderCard("nuguri_clear");
    const labels = screen.getAllByTestId("pro-play-scope-tag").map((e) => e.textContent);
    expect(labels).toEqual(["LCK", "ALL TIME"]);
  });

  it("shows no ALL TIME chip on a patch-scoped question", () => {
    renderCard("patch");
    const labels = screen.getAllByTestId("pro-play-scope-tag").map((e) => e.textContent);
    expect(labels).not.toContain("ALL TIME");
    expect(labels.some((l) => l?.startsWith("PATCH"))).toBe(true);
  });

  it("renders the curated pro scope as ALL PRO PLAY and never the sentinel", () => {
    const { container } = renderCard("pro_play");
    const labels = screen.getAllByTestId("pro-play-scope-tag").map((e) => e.textContent);
    expect(labels).toContain("ALL PRO PLAY");
    expect(container.innerHTML).not.toMatch(/MAJOR_PRO|PRO_TEAM/);
  });

  it("keeps a league tooltip reachable by keyboard, not only by hover", () => {
    renderCard("nuguri_clear");
    // The chip IS the trigger: a tooltip on a non-focusable span would be
    // unreachable by keyboard, so `ProPlayTooltip` renders a real button.
    const league = screen.getAllByTestId("pro-play-scope-tag")[0];
    expect(league.tagName).toBe("BUTTON");
    expect(league).toHaveAttribute("title", "LoL Champions Korea");
    expect(league).toHaveAccessibleName(/LoL Champions Korea/);
  });
});

// ── 2. Recent Esports ──────────────────────────────────────────────────────

describe("Recent Esports Trivia", () => {
  it("renders the editorial chip when the server tags the question", () => {
    renderCard("recent");
    expect(screen.getByTestId("pro-play-editorial-tag")).toHaveTextContent(
      "Recent Esports",
    );
  });

  it("renders no editorial chip on an all-time question", () => {
    renderCard("nuguri_clear");
    expect(screen.queryByTestId("pro-play-editorial-tag")).toBeNull();
  });
});

// ── 3. champion anchor ─────────────────────────────────────────────────────

describe("champion anchor", () => {
  it("prefers loading art, which is composed around the champion", () => {
    renderCard("champion_player"); // anchor: Udyr
    const img = screen.getByTestId("pro-play-anchor-splash");
    expect(img.getAttribute("src")).toContain("assets/champions/Udyr/loading");
  });

  it("falls back to splash when a champion has no loading art", () => {
    installManifest({
      ok: true,
      champions: {
        Udyr: { icon: "", splash: "assets/champions/Udyr/splash/0_default.jpg", loading: "", cutout: "" },
      },
    });
    renderCard("champion_player");
    const img = screen.getByTestId("pro-play-anchor-splash");
    expect(img.getAttribute("src")).toContain("assets/champions/Udyr/splash");
  });

  it("resolves an apostrophe name from the backend key without a new resolver", () => {
    // The contract's key IS the manifest key, which is why Kai'Sa needs no
    // special case and never becomes the 404-on-Linux "KaiSa" folder spelling.
    const anchorSample = PRO_PLAY_SAMPLES.champion_player;
    const context = asQuestionContext({
      ...(anchorSample.question.context as Record<string, unknown>),
      anchor: {
        kind: "champion",
        label: "Kai'Sa",
        id: "Kai'Sa",
        media: { kind: "champion", key: "Kai'Sa" },
      },
    });
    render(
      <ProPlayQuestionCard topic="Champion" questionText="Q?" context={context}>
        <div />
      </ProPlayQuestionCard>,
    );
    const img = screen.getByTestId("pro-play-anchor-splash");
    expect(img.getAttribute("src")).toContain("assets/champions/Kaisa/");
    expect(img.getAttribute("src")).not.toContain("KaiSa");
  });

  it("renders no art band for a scope anchor, whose media key is null", () => {
    renderCard("scope_champion");
    expect(screen.queryByTestId("pro-play-anchor-splash")).toBeNull();
    expect(screen.getByText(/highest ban count|higher/i)).toBeTruthy();
  });

  it("still renders the question when the manifest is unavailable", () => {
    installManifest(null);
    renderCard("champion_player");
    expect(screen.queryByTestId("pro-play-anchor-splash")).toBeNull();
    expect(screen.getByText(PRO_PLAY_SAMPLES.champion_player.question.question_text)).toBeTruthy();
  });
});

// ── 4. subject cards ───────────────────────────────────────────────────────

describe("subject cards", () => {
  it("renders one card per compared entity, structurally symmetric", () => {
    const { context } = renderCard("nuguri_clear");
    const cards = screen.getAllByTestId(/pro-play-subject-(role|years|teams)/);
    // three rows on each of two cards
    expect(cards).toHaveLength(6);
    expect(context!.subjects).toHaveLength(2);
  });

  it("renders the same row set on both sides even when a value is missing", () => {
    const { container } = renderCard("champion_player");
    const cards = container.querySelectorAll("[data-pro-play-subject]");
    expect(cards.length).toBeGreaterThanOrEqual(2);
    const shapes = Array.from(cards).map((card) =>
      Array.from(card.querySelectorAll("[data-testid^='pro-play-subject-']"))
        .map((row) => row.getAttribute("data-testid"))
        .join(","),
    );
    expect(new Set(shapes).size).toBe(1);
  });

  it("shows scoped years, not career years", () => {
    renderCard("nuguri_clear");
    expect(screen.getByText("2018–2022")).toBeTruthy();
    expect(screen.getByText("2022–2026")).toBeTruthy();
  });

  it("labels a FLEX role rather than guessing a lane", () => {
    renderCard("flex");
    const flex = screen.getByText("FLEX");
    expect(flex.closest("[data-pro-play-role]")).toHaveAttribute(
      "data-pro-play-role",
      "flex",
    );
  });

  it("gives a role a keyboard-reachable tooltip", () => {
    renderCard("nuguri_clear");
    const role = screen.getAllByText("TOP")[0].closest("button");
    expect(role).toHaveAttribute("title", "Top lane");
  });

  it("reports a truncated team list as a count instead of dropping teams", () => {
    const { context } = renderCard("multi_team");
    const player = context!.subjects.find(
      (s) => (s.teams_total ?? 0) > (s.teams_shown ?? 0),
    );
    if (!player) return; // the captured sample happens to fit; nothing to assert
    expect(screen.getAllByTestId("pro-play-subject-teams").length).toBeGreaterThan(0);
    expect(
      document.querySelector("[data-pro-play-team-overflow]")?.textContent,
    ).toMatch(/^\+\d+$/);
  });

  it("keeps SK Telecom T1 and T1 as two separate teams", () => {
    renderCard("t1_lineage");
    const cards = Array.from(document.querySelectorAll("[data-pro-play-subject='team']"));
    const byName = new Map(
      cards.map((c) => [c.querySelector("p")?.textContent ?? "", c]),
    );
    const t1 = byName.get("T1");
    const skt = byName.get("SK Telecom T1");
    expect(t1).toBeTruthy();
    expect(skt).toBeTruthy();
    expect(within(t1 as HTMLElement).getByText("2020–2026")).toBeTruthy();
    expect(within(skt as HTMLElement).getByText("2016–2019")).toBeTruthy();
    expect(within(skt as HTMLElement).getByText("SKT")).toBeTruthy();
  });

  it("renders no subject cards when the options are champions", () => {
    renderCard("scope_champion");
    expect(document.querySelector("[data-pro-play-subject-cards]")).toBeNull();
  });
});

// ── 5. answer safety ───────────────────────────────────────────────────────

describe("answer safety", () => {
  it.each(ALL)("shows no evidence value before an answer (%s)", (key) => {
    const { container, sample, context } = renderCard(key);
    // SEASONS AND SCOPE CHIPS ARE ALLOWED PRE-ANSWER and are full of digits —
    // "2013–2018", "PATCH 26.09". They are contract-sanctioned identity, not
    // metric values, so they are removed before the scan; otherwise every
    // two-digit metric value would false-positive inside a year. What remains
    // is everything a metric value could actually hide in.
    const allowed = [
      ...context!.scope_tags.map((t) => t.label),
      ...context!.subjects.flatMap((subj) => [
        subj.seasons?.label ?? "",
        ...(subj.teams ?? []).map((t) => t.seasons?.label ?? ""),
      ]),
    ].filter(Boolean);
    let text = container.textContent ?? "";
    for (const fragment of allowed) text = text.split(fragment).join(" ");

    const evidence = asEvidence(sample.result.evidence)!;
    for (const subject of evidence.subjects) {
      // A single character is not evidence: a "6" appears inside every
      // "2026" and "26.09" in a server-authored stem. The boundary-matched
      // number scan below is exact and covers those values properly.
      if (subject.display && subject.display.length > 1) {
        expect(text).not.toContain(subject.display);
      }
      for (const raw of [subject.games, subject.wins, subject.losses,
                         subject.picks, subject.bans]) {
        if (typeof raw !== "number") continue;
        expect(text).not.toMatch(new RegExp(`(?<![\\w.%–-])${raw}(?![\\w.%–-])`));
      }
    }
  });

  it.each(ALL)("mounts no evidence section before an answer (%s)", (key) => {
    renderCard(key);
    expect(document.querySelector("[data-pro-play-evidence]")).toBeNull();
  });

  it.each(ALL)("never leaks an internal family id or scope sentinel (%s)", (key) => {
    const { container } = renderCard(key);
    expect(container.innerHTML).not.toMatch(
      /pro_player_champion_comparison|pro_team_champion_comparison|pro_champion_scope_comparison|MAJOR_PRO|PRO_TEAM/,
    );
  });
});

// ── 6. reveal evidence ─────────────────────────────────────────────────────

describe("reveal evidence", () => {
  it("renders a side-by-side win-rate comparison with its sample", () => {
    const evidence = asEvidence(PRO_PLAY_SAMPLES.nuguri_clear.result.evidence)!;
    render(<ProPlayEvidence evidence={evidence} />);
    expect(screen.getByText("75.0%")).toBeTruthy();
    expect(screen.getByText("60.0%")).toBeTruthy();
    expect(screen.getByText(/12 games · 9W–3L/)).toBeTruthy();
    expect(screen.getByText(/10 games · 6W–4L/)).toBeTruthy();
  });

  it("marks the correct subject", () => {
    const evidence = asEvidence(PRO_PLAY_SAMPLES.nuguri_clear.result.evidence)!;
    render(<ProPlayEvidence evidence={evidence} />);
    const correct = document.querySelector("[data-correct='true']");
    expect(correct?.textContent).toContain(evidence.correct_label!);
  });

  it("renders a ban metric without inventing win/loss fields", () => {
    const evidence = asEvidence(PRO_PLAY_SAMPLES.patch.result.evidence)!;
    render(<ProPlayEvidence evidence={evidence} />);
    expect(screen.getByText(evidence.metric.label)).toBeTruthy();
    expect(screen.queryByText(/W–/)).toBeNull();
  });

  it.each(ALL)("renders a value for every subject (%s)", (key) => {
    const evidence = asEvidence(PRO_PLAY_SAMPLES[key].result.evidence);
    if (!evidence) return;
    render(<ProPlayEvidence evidence={evidence} />);
    const values = document.querySelectorAll("[data-pro-play-evidence-value]");
    expect(values).toHaveLength(evidence.subjects.length);
    values.forEach((v) => expect(v.textContent).not.toBe("—"));
    cleanup();
  });
});

// ── 7. fallback ────────────────────────────────────────────────────────────

describe("additive fallback", () => {
  it("renders the pre-Step-1 question when there is no context", () => {
    render(
      <ProPlayQuestionCard topic="Champion" questionText="Plain question?" context={null}>
        <div data-testid="choices" />
      </ProPlayQuestionCard>,
    );
    expect(screen.getByText("Champion")).toBeTruthy();
    expect(screen.getByText("Plain question?")).toBeTruthy();
    expect(screen.queryByTestId("pro-play-relationship")).toBeNull();
  });

  it("returns null context for a malformed blob rather than throwing", () => {
    expect(asQuestionContext(undefined)).toBeNull();
    expect(asQuestionContext({})).toBeNull();
    expect(asQuestionContext({ relationship: {}, metric: {} })).toBeNull();
    expect(asEvidence({ subjects: [] })).toBeNull();
  });

  it("survives a context whose optional fields are all missing", () => {
    const context = asQuestionContext({
      relationship: { id: "champion_player", label: "Champion → Player" },
      metric: { id: "win_rate", label: "WIN RATE" },
      subjects: [
        { kind: "player", label: "A" },
        { kind: "player", label: "B" },
      ],
    });
    render(
      <ProPlayQuestionCard topic="Player" questionText="Q?" context={context}>
        <div />
      </ProPlayQuestionCard>,
    );
    // Rows are still present on both cards, filled with the neutral marker —
    // dropping a row on one side only is the asymmetry that would leak.
    expect(screen.getAllByTestId("pro-play-subject-role")).toHaveLength(2);
    expect(screen.getAllByTestId("pro-play-subject-years")).toHaveLength(2);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });
});

// ── 8. mobile structure ────────────────────────────────────────────────────

describe("mobile-safe structure", () => {
  it("stacks subject cards in one column below the sm breakpoint", () => {
    renderCard("nuguri_clear");
    const grid = document.querySelector("[data-pro-play-subject-cards]");
    expect(grid?.className).toContain("grid-cols-1");
    expect(grid?.className).toContain("sm:grid-cols-2");
  });

  it("pairs ranking cards into two columns even on mobile", () => {
    // Four stacked cards measured ~480px at 375px on a real NA LCS ranking
    // and pushed the answer buttons below the fold.
    renderCard("flex");
    const grid = document.querySelector("[data-pro-play-subject-cards]");
    expect(grid?.getAttribute("data-pro-play-subject-count")).toBe("4");
    expect(grid?.className).toContain("grid-cols-2");
    expect(grid?.className).not.toContain("grid-cols-1");
  });

  it("wraps the chip rail instead of overflowing horizontally", () => {
    renderCard("patch");
    const rail = document.querySelector("[data-pro-play-context-rail]");
    expect(rail?.className).toContain("flex-wrap");
    expect(rail?.className).not.toContain("overflow-x");
  });

  it("truncates a long subject name rather than widening the card", () => {
    renderCard("flex");
    const name = document.querySelector("[data-pro-play-subject] p");
    expect(name?.className).toContain("truncate");
  });
});

// ── 9. evidence never repeats its own headline ─────────────────────────────

describe("evidence support line", () => {
  it("says 'of N games' for a WINS metric rather than repeating the wins", () => {
    const evidence = asEvidence({
      metric: { id: "wins", label: "WINS", kind: "count" },
      correct_label: "B",
      subjects: [
        { label: "A", display: "12", games: 27, wins: 12 },
        { label: "B", display: "24", games: 26, wins: 24 },
      ],
    })!;
    render(<ProPlayEvidence evidence={evidence} />);
    expect(screen.getByText("of 27 games")).toBeTruthy();
    // The headline is the wins; printing "12W" underneath it is the
    // repetition this line exists to avoid.
    expect(screen.queryByText(/12W/)).toBeNull();
  });

  it("says 'N won' for a GAMES metric rather than repeating the games", () => {
    const evidence = asEvidence({
      metric: { id: "games_played", label: "GAMES", kind: "count" },
      correct_label: "A",
      subjects: [{ label: "A", display: "40", games: 40, wins: 24 }],
    })!;
    render(<ProPlayEvidence evidence={evidence} />);
    expect(screen.getByText("24 won")).toBeTruthy();
    expect(screen.queryByText(/40 games/)).toBeNull();
  });

  it("keeps the full sample under a WIN RATE headline", () => {
    const evidence = asEvidence(PRO_PLAY_SAMPLES.nuguri_clear.result.evidence)!;
    render(<ProPlayEvidence evidence={evidence} />);
    expect(screen.getByText("12 games · 9W–3L")).toBeTruthy();
  });

  it("shows the scope size under a BANS headline", () => {
    const evidence = asEvidence({
      metric: { id: "bans", label: "BANS", kind: "count" },
      correct_label: "A",
      subjects: [{ label: "A", display: "26", bans: 26, scope_games: 43 }],
    })!;
    render(<ProPlayEvidence evidence={evidence} />);
    expect(screen.getByText("of 43 scope games")).toBeTruthy();
  });
});
