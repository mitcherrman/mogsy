/**
 * PPQ2-C — the premium Pro Play arena pieces, driven by the REAL frozen
 * payloads (`PRO_PLAY_SAMPLES`).
 *
 * The load-bearing tests are the answer-safety ones: nothing pre-answer may
 * carry an evidence value, prefer one option, reorder the options or mark a
 * tablet correct; and reveal content may not mount before a graded answer.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { PRO_PLAY_SAMPLES } from "@/lib/pro-play/__fixtures__/proPlaySamples";
import { asEvidence, asQuestionContext, type ProPlayQuestionContext } from "@/lib/pro-play/contract";
import type { AnswerOptionView } from "@/lib/ranked-core/viewTypes";
import ProPlayAnchorPlate from "./ProPlayAnchorPlate";
import { proPlayAnswerSlots } from "./ProPlayOptionContent";
import ProPlayQuestionDossier from "./ProPlayQuestionDossier";
import ProPlaySessionPanel from "./ProPlaySessionPanel";
import {
  alignTabletIdentities,
  anchorPlateKind,
  monogram,
  sessionHeadline,
  tabletLayout,
  type ProPlayOutcome,
} from "./proPlayArenaModel";

const mocks = vi.hoisted(() => ({ manifest: null as unknown }));
vi.mock("@/hooks/useChampionAssets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useChampionAssets")>();
  return { ...actual, useChampionAssets: () => ({ data: mocks.manifest }) };
});

/** Every champion the fixtures name, with icon + loading art. */
function manifestFor(): unknown {
  const champions: Record<string, unknown> = {};
  for (const sample of Object.values(PRO_PLAY_SAMPLES)) {
    const ctx = asQuestionContext(sample.question.context);
    for (const s of [ctx?.anchor, ...(ctx?.subjects ?? [])]) {
      if (s?.kind === "champion" && s.media?.key) {
        const k = s.media.key;
        champions[k] = { icon: `assets/c/${k}/icon.png`, splash: `assets/c/${k}/splash.jpg`, loading: `assets/c/${k}/loading.jpg`, cutout: "" };
      }
    }
  }
  return { ok: true, champions };
}

const ALL = Object.keys(PRO_PLAY_SAMPLES);

function fixture(key: string) {
  const sample = PRO_PLAY_SAMPLES[key];
  const context = asQuestionContext(sample.question.context)!;
  const options: AnswerOptionView[] = sample.question.choices.map((label, index) => ({ id: String(index), index, label }));
  const correctId = String(sample.question.choices.indexOf(sample.result.correct_answer));
  return { sample, context, options, correctId };
}

/**
 * The plate, the dossier and one stand-in cell per option holding the
 * option's content — the canonical button that hosts it in the arena is not
 * part of this workstream (see the handoff's integration request).
 */
function renderStage(key: string, slotsInput: { revealed?: boolean; revealSlots?: React.ReactNode[] } = {}) {
  const f = fixture(key);
  const slots = proPlayAnswerSlots({ options: f.options, context: f.context, ...slotsInput });
  const utils = render(
    <TooltipProvider>
      <div data-testid="stage">
        <ProPlayAnchorPlate context={f.context} />
        <div data-testid="cells">
          {(slots.optionContent ?? []).map((node, i) => <div key={i} data-cell={i}>{node}</div>)}
        </div>
      </div>
      <ProPlayQuestionDossier context={f.context} />
    </TooltipProvider>,
  );
  return { ...utils, ...f, slots };
}

const cells = () => [...document.querySelectorAll<HTMLElement>("[data-cell]")];

beforeEach(() => { mocks.manifest = manifestFor(); });
afterEach(() => { cleanup(); });

// ─── The pure model ───────────────────────────────────────────────────────

describe("alignTabletIdentities", () => {
  it.each(ALL)("is rich, single-kind and in choice order for the real payload (%s)", (key) => {
    const { options, context } = fixture(key);
    const ids = alignTabletIdentities(options, context);
    expect(ids.kind).not.toBe("plain");
    expect(ids.items.map((i) => i.label)).toEqual(options.map((o) => o.label));
    expect(new Set(ids.items.map((i) => i.kind)).size).toBe(1);
  });

  it("drops EVERY tablet to plain when one subject does not name its option", () => {
    const { options, context } = fixture("t1_lineage");
    const broken: ProPlayQuestionContext = {
      ...context,
      subjects: context.subjects.map((s, i) => (i === 2 ? { ...s, label: "Someone else" } : s)),
    };
    const ids = alignTabletIdentities(options, broken);
    expect(ids.kind).toBe("plain");
    expect(ids.items.every((i) => i.kind === "plain")).toBe(true);
  });

  it("drops to plain on a length mismatch, a mixed kind, or no context", () => {
    const { options, context } = fixture("pro_play");
    expect(alignTabletIdentities(options, { ...context, subjects: context.subjects.slice(1) }).kind).toBe("plain");
    expect(alignTabletIdentities(options, {
      ...context, subjects: context.subjects.map((s, i) => (i === 0 ? { ...s, kind: "player" } : s)),
    }).kind).toBe("plain");
    expect(alignTabletIdentities(options, null).kind).toBe("plain");
  });

  it("never reorders: a reversed subject list is a mismatch, not a re-join", () => {
    const { options, context } = fixture("champion_player");
    const ids = alignTabletIdentities(options, { ...context, subjects: [...context.subjects].reverse() });
    expect(ids.kind).toBe("plain");
  });
});

describe("layout and helpers", () => {
  it("chooses the arrangement from the option count only", () => {
    expect(tabletLayout(2)).toBe("facing");
    expect(tabletLayout(3)).toBe("grid");
    expect(tabletLayout(4)).toBe("grid");
    expect(tabletLayout(5)).toBe("stack");
  });

  it("maps every anchor kind to a plate", () => {
    expect(anchorPlateKind(fixture("champion_player").context)).toBe("champion");
    expect(anchorPlateKind(fixture("player_champion").context)).toBe("player");
    expect(anchorPlateKind(fixture("team_champion").context)).toBe("team");
    expect(anchorPlateKind(fixture("patch").context)).toBe("scope");
    expect(anchorPlateKind(null)).toBe("none");
  });

  it("uses the server short code for a crest, else initials", () => {
    expect(monogram("Kiwoom DRX", "KRX")).toBe("KRX");
    expect(monogram("Nongshim RedForce Academy", null)).toBe("NRA");
    expect(monogram("Fnatic", null)).toBe("FNA");
  });

  it("states the session headline from server numbers only", () => {
    expect(sessionHeadline({ number: 1, total: 10, score: 0, answered: 0 })).toBe("Question 1 / 10");
    expect(sessionHeadline({ number: 4, total: 10, score: 2, answered: 3 })).toBe("Question 4 / 10 · 2 correct");
  });
});

// ─── Answer safety ────────────────────────────────────────────────────────

describe("answer safety (pre-answer)", () => {
  it.each(ALL)("shows no evidence value anywhere before an answer (%s)", (key) => {
    const { container, sample, context } = renderStage(key);
    // Seasons, patches and scope chips are contract-sanctioned identity full
    // of digits; remove them before the scan (the same rule as the legacy
    // card's sweep), then look for every evidence value.
    const allowed = [
      ...context.scope_tags.map((t) => t.label),
      ...context.scope_tags.map((t) => t.tooltip ?? ""),
      ...[context.anchor, ...context.subjects].flatMap((s) => [
        s?.seasons?.label ?? "",
        ...(s?.teams ?? []).map((t) => t.seasons?.label ?? ""),
      ]),
    ].filter(Boolean).sort((a, b) => b.length - a.length);
    let text = container.textContent ?? "";
    for (const fragment of allowed) text = text.split(fragment).join(" ");
    const evidence = asEvidence(sample.result.evidence)!;
    for (const subject of evidence.subjects) {
      if (subject.display && subject.display.length > 1) expect(text).not.toContain(subject.display);
      for (const raw of [subject.games, subject.wins, subject.losses, subject.picks, subject.bans]) {
        if (typeof raw !== "number") continue;
        expect(text).not.toMatch(new RegExp(`(?<![\\w.%–-])${raw}(?![\\w.%–-])`));
      }
    }
  });

  it.each(ALL)("mounts no reveal slot before grading, even when slots are passed (%s)", (key) => {
    const { options } = fixture(key);
    renderStage(key, { revealSlots: options.map((o) => <span data-testid="leak">{o.label}</span>) });
    expect(screen.queryAllByTestId("leak")).toHaveLength(0);
    expect(document.querySelector("[data-pp-reveal-slot]")).toBeNull();
    // Content carries no state vocabulary at all: states are the canonical button's.
    expect(document.querySelector("[data-choice-state], [data-quiz-choice]")).toBeNull();
  });

  it.each(ALL)("draws every option with the same structure, in server order (%s)", (key) => {
    const { options } = renderStage(key);
    const ts = cells();
    expect(ts.map((t) => t.querySelector("[data-pp-tablet-name]")?.textContent)).toEqual(options.map((o) => o.label));
    // Structure signature: tag + data-* attribute NAMES, text ignored.
    const signature = (el: Element) => [...el.querySelectorAll("*")]
      // Excluded: the code rows (one chip per team the server listed) and the
      // inside of the role box (an emblem, or the neutral FLEX mark) — both
      // are the option's own identity, never a function of correctness.
      .filter((n) => !n.closest("[data-pp-tablet-teams], [data-pp-tablet-leagues]")
        && !n.parentElement?.closest("[data-pp-tablet-role]"))
      .map((n) => `${n.tagName}[${[...n.attributes].map((a) => a.name).filter((a) => a.startsWith("data-")).sort().join(",")}]`)
      .join(" ");
    expect(new Set(ts.map(signature)).size).toBe(1);
    // Media: on every tablet or none.
    const media = ts.map((t) => t.querySelectorAll("[data-option-media], [data-pro-play-shield], [data-pp-tablet-role]").length);
    expect(new Set(media).size).toBe(1);
  });

  it.each(ALL)("the anchor plate never names an option (%s)", (key) => {
    renderStage(key);
    const plate = document.querySelector("[data-pro-play-plate]")!;
    const text = plate.textContent ?? "";
    for (const label of PRO_PLAY_SAMPLES[key].question.choices) {
      // A plate may only contain an option's name as part of a longer word
      // that is the anchor's own (none of the fixtures do).
      expect(text.includes(label)).toBe(false);
    }
  });

  it("a champion lineup draws one slot per option, all identical, with no names", () => {
    renderStage("pro_play");
    const slices = [...document.querySelectorAll("[data-lineup-slice]")];
    expect(slices).toHaveLength(4);
    expect(new Set(slices.map((s) => s.querySelectorAll("img").length)).size).toBe(1);
    expect(slices.map((s) => s.textContent)).toEqual(["A", "B", "C", "D"]);
    expect(slices[0].closest("[aria-hidden]")).not.toBeNull();
  });

  it("keeps symmetric media when one champion's art fails", () => {
    renderStage("team_champion");
    const icons = [...document.querySelectorAll<HTMLImageElement>("[data-option-media] img")];
    expect(icons).toHaveLength(4);
    fireEvent.error(icons[1]);
    expect(document.querySelectorAll("[data-option-media]")).toHaveLength(4);
    expect(document.querySelectorAll('[data-option-media][data-option-media-state="error"]')).toHaveLength(1);
  });

  it("renders no legacy presentation, family id or scope sentinel", () => {
    for (const key of ALL) {
      const { container, unmount } = renderStage(key);
      const html = container.innerHTML;
      expect(html).not.toMatch(/pro_(champion|player|team)_[a-z_]*comparison/);
      expect(html).not.toContain("|ALL|");
      unmount();
    }
  });
});

// ─── The slots handed to the canonical grid ──────────────────────────────

describe("proPlayAnswerSlots", () => {
  it("asks for a pair for two options and the 2-up grid for three or four", () => {
    expect(proPlayAnswerSlots({ ...fixture("champion_player") }).columns).toBe("pair");
    expect(proPlayAnswerSlots({ ...fixture("champion_player") }).pairDivider).not.toBeNull();
    expect(proPlayAnswerSlots({ ...fixture("t1_lineage") }).columns).toBe("wide-2");
    expect(proPlayAnswerSlots({ ...fixture("t1_lineage") }).pairDivider).toBeNull();
  });

  it("returns no content at all when the identities cannot be symmetric", () => {
    const { options, context } = fixture("t1_lineage");
    const slots = proPlayAnswerSlots({ options, context: { ...context, subjects: context.subjects.slice(1) } });
    expect(slots.optionContent).toBeNull();
    expect(proPlayAnswerSlots({ options, context: null }).optionContent).toBeNull();
  });

  it("one node per option, in order", () => {
    const { options, context } = fixture("pro_play");
    expect(proPlayAnswerSlots({ options, context }).optionContent).toHaveLength(options.length);
  });

  it("mounts reveal slots only once revealed, in place of the facts", () => {
    const { options } = fixture("t1_lineage");
    renderStage("t1_lineage", { revealed: true, revealSlots: options.map((o) => <span data-testid="slot">{o.label}</span>) });
    expect(screen.getAllByTestId("slot")).toHaveLength(4);
    for (const facts of document.querySelectorAll("[data-pp-tablet-facts]")) {
      expect(facts.className).toContain("invisible");
      expect(facts.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("puts nothing interactive inside a tablet", () => {
    for (const key of ALL) {
      const { unmount } = renderStage(key);
      expect(screen.getByTestId("cells").querySelector("button, a, input, [tabindex]")).toBeNull();
      unmount();
    }
  });
});

// ─── Panels ───────────────────────────────────────────────────────────────

describe("session panel", () => {
  const outcomes = new Map<number, ProPlayOutcome>([[1, "correct"], [2, "incorrect"]]);

  it("shows the server's score and only received outcomes", () => {
    render(<ProPlaySessionPanel number={4} total={10} score={1} answered={3} outcomes={outcomes} />);
    expect(screen.getByTestId("session-score").textContent).toMatch(/1\s*\/\s*3/);
    const pips = [...document.querySelectorAll<HTMLElement>("[data-pip]")];
    expect(pips).toHaveLength(10);
    expect(pips.map((p) => p.dataset.pipState)).toEqual([
      "correct", "incorrect", "unknown", "current", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming",
    ]);
  });

  it("carries no opponent, rating, health or clock vocabulary", () => {
    const { container } = render(
      <TooltipProvider>
        <ProPlaySessionPanel number={4} total={10} score={1} answered={3} outcomes={outcomes} />
        {ALL.map((k) => (
          <div key={k}>
            <ProPlayQuestionDossier context={fixture(k).context} />
            <ProPlayAnchorPlate context={fixture(k).context} />
          </div>
        ))}
      </TooltipProvider>,
    );
    const text = (container.textContent ?? "").toLowerCase();
    for (const word of ["opponent", "elo", "hp", "health", "damage", "streak", "rating", "timer", "seconds", "bot"]) {
      expect(text).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
  });
});

describe("question dossier", () => {
  it("spells out every scope chip and the metric definition", () => {
    const { context } = fixture("patch");
    render(<TooltipProvider><ProPlayQuestionDossier context={context} /></TooltipProvider>);
    const scopes = screen.getAllByTestId("dossier-scope");
    expect(scopes.map((s) => s.dataset.tagType)).toEqual(context.scope_tags.map((t) => t.type));
    expect(screen.getByText("Mid-Season Invitational")).toBeInTheDocument();
    expect(screen.getByTestId("dossier-metric").textContent).toContain("Times banned in this scope");
  });

  it("explains a player anchor's teams with their own spans", () => {
    render(<TooltipProvider><ProPlayQuestionDossier context={fixture("player_champion").context} /></TooltipProvider>);
    const ledger = screen.getByTestId("dossier-anchor-ledger");
    expect(ledger.textContent).toContain("Hanwha Life Esports");
    expect(ledger.textContent).toContain("HLE");
  });

  it("marks recent content from the editorial tag", () => {
    render(<TooltipProvider><ProPlayQuestionDossier context={fixture("recent").context} /></TooltipProvider>);
    expect(screen.getByTestId("dossier-recent")).toBeInTheDocument();
  });
});

// ─── Source guards ────────────────────────────────────────────────────────

describe("source guards", () => {
  const dir = __dirname;
  const sources = readdirSync(dir)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes(".test."))
    .map((f) => ({ f, src: readFileSync(join(dir, f), "utf8") }));

  it("reads no legacy presentation, result or evidence in the product pieces", () => {
    expect(sources.length).toBeGreaterThanOrEqual(6);
    for (const { f, src } of sources) {
      expect(src, f).not.toMatch(/\.presentation\b/);
      expect(src, f).not.toMatch(/\bcorrect_answer\b|\.evidence\b|asEvidence|is_correct/);
    }
  });

  it("never sorts or filters the options", () => {
    const contentSrc = sources.find((s) => s.f === "ProPlayOptionContent.tsx")!.src;
    expect(contentSrc).not.toMatch(/options\.(sort|filter|reverse)\(|\[\.\.\.options\]\.sort/);
  });

  it("stays inside the ONE answer-rendering path (AnswerGrid.elimination guard)", () => {
    for (const { f, src } of sources) {
      expect(src, f).not.toMatch(/data-quiz-choice=\{/);
      expect(src, f).not.toMatch(/(?:function|const)\s+\w*Answer(?:Grid|Options)\b/);
      expect(src, f).not.toMatch(/<button\b/);
    }
  });

  it("imports nothing from the files this workstream may not change", () => {
    for (const { f, src } of sources) {
      expect(src, f).not.toMatch(/from "@\/pages\/ProPlayQuiz"|from "@\/lib\/pro-play\/arena/);
    }
  });
});
