/**
 * RFX1 Phase 2B1 — the round media descriptor.
 *
 * Two questions, and the second matters more:
 *   1. does it name the images the pre-reveal surface actually draws?
 *   2. does it name NOTHING that only the reveal (or the answer) would draw?
 *
 * Question payloads are the backend-dumped fixtures the renderer is already
 * tested against, read through the real wire reader.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import academyHall from "@/assets/ranked/academy-hall.jpg";
import itemShopkeeper from "@/assets/ranked/item-shopkeeper.png";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import type { ChampionManifest } from "@/hooks/useChampionAssets";
import { JUNGLE_GRASS_BACKGROUND } from "@/lib/question-surface/jungleAtmosphere";
import { readPublicQuestion } from "@/lib/ranked-public/contracts";
import type { MetaReflexCard, PublicRoundView } from "@/lib/ranked-public/contracts";
import {
  CHAMPION_OPTION_QUESTION, ITEM_OPTION_QUESTION, NUMERIC_QUESTION,
  type BackendQuestionPayload,
} from "../adapters/optionMediaFixtures";
import { RANKED_CHROME_URLS } from "./rankedChrome";
import { MOTIF_ART_URLS, rankedRoundMedia } from "./roundMedia";

const url = (p: string) => resolveQuizAssetUrl(p)!;

function quizRound(q: BackendQuestionPayload | Record<string, unknown>, n = 1): PublicRoundView {
  return {
    matchId: "m1",
    activeRound: { roundNumber: n, startedAt: new Date().toISOString() },
    question: readPublicQuestion(q),
    segment: { moduleId: "quiz", moduleVersion: 1, challengeCount: 1, challengeIndex: 0 },
    segmentState: null,
    players: [],
  } as unknown as PublicRoundView;
}

const all = (m: { critical: string[]; bestEffort: string[] }) => [...m.critical, ...m.bestEffort];

describe("rankedRoundMedia — what the pre-reveal surface draws", () => {
  it("item recipe card: subject, known components, and every option icon", () => {
    const m = rankedRoundMedia(quizRound(ITEM_OPTION_QUESTION));
    expect(m.critical).toEqual(expect.arrayContaining([
      url("assets/items/3078.png"), // Trinity Force, the subject
      url("assets/items/3057.png"), url("assets/items/3044.png"), // Sheen, Phage
      url("assets/items/3067.png"), url("assets/items/1028.png"),
      url("assets/items/1029.png"), url("assets/items/1033.png"), // the 4 options
    ]));
    // A recipe card draws its tree, not the shopkeeper.
    expect(m.critical).not.toContain(itemShopkeeper);
  });

  it("purchase history renders the LIFECYCLE family band: its items and champion, no splash", () => {
    const m = rankedRoundMedia(quizRound(NUMERIC_QUESTION));
    expect(m.critical).toEqual([
      url("assets/items/1055.png"), url("assets/items/2003.png"),
      url("assets/items/3044.png"), url("assets/items/3067.png"),
      url("assets/champions/Darius/icon.png"),
    ]);
    // The family band draws no splash, so none is fetched.
    expect(m.critical.some((u) => u.includes("/splash/"))).toBe(false);
  });

  it("cinematic Combat Calculation: splash, ability and the item row", () => {
    const presentation = NUMERIC_QUESTION.presentation as { assets: { subject: Record<string, unknown> } };
    const m = rankedRoundMedia(quizRound({
      ...NUMERIC_QUESTION,
      presentation: {
        assets: { subject: { ...presentation.assets.subject, ability_icon: "assets/champions/Darius/Q.png" } },
        presentation: { role: "context", timing: "question", spoiler: false, scenario_type: "combat_calculation" },
      },
    }));
    expect(m.critical).toEqual(expect.arrayContaining([
      url("assets/champions/Darius/splash/0_default.jpg"),
      url("assets/champions/Darius/Q.png"),
      url("assets/items/1055.png"), url("assets/items/3067.png"),
    ]));
  });

  it("an item card with no recipe composes the shopkeeper backdrop", () => {
    const m = rankedRoundMedia(quizRound({
      question_id: "q", prompt: "How much Ability Haste does Kindlegem grant?",
      options: ["5", "10", "15", "20"], category: "item_stats",
      presentation: {
        assets: { subject: { type: "item", name: "Kindlegem", icon: "assets/items/3067.png" } },
        presentation: { scenario_type: "item", timing: "question", role: "context", spoiler: false },
      },
    }));
    expect(m.critical).toEqual([url("assets/items/3067.png"), itemShopkeeper]);
  });

  it("a jungle pet environment card seats the jungle ground", () => {
    const m = rankedRoundMedia(quizRound({
      question_id: "q", prompt: "At what stage does this companion evolve?",
      options: ["a", "b", "c", "d"], category: "jungle_systems",
      presentation: {
        assets: { subject: { type: "jungle_pet", name: "Mosstomper", icon: "assets/jungle/moss.png" } },
        presentation: { timing: "question", role: "context", spoiler: false },
      },
    }));
    expect(m.critical).toEqual([url("assets/jungle/moss.png"), JUNGLE_GRASS_BACKGROUND]);
  });

  it("a media-free round draws the compact band's ground for its category only", () => {
    const plain = { question_id: "q", prompt: "When does Baron spawn?", options: ["a", "b", "c", "d"] };
    expect(rankedRoundMedia(quizRound({ ...plain, category: "objective_timers" })).critical)
      .toEqual([academyHall]);
    expect(rankedRoundMedia(quizRound({ ...plain, category: "trivia" })).critical).toEqual([]);
  });

  it("motif accents are best-effort, and not requested where the layer is hidden (<640px)", () => {
    const q = { ...ITEM_OPTION_QUESTION, topic: { category: "items", motif: "items_economy" } };
    expect(rankedRoundMedia(quizRound(q), { viewportWidth: 1440 }).bestEffort)
      .toEqual(["/assets/ranked/question-accents/amptome.png"]);
    expect(rankedRoundMedia(quizRound(q), { viewportWidth: 390 }).bestEffort).toEqual([]);
  });

  it("every motif and chrome path is still painted by the stylesheet", () => {
    const css = readFileSync(resolve(__dirname, "../../../index.css"), "utf8");
    for (const u of [...Object.values(MOTIF_ART_URLS).flat(), ...RANKED_CHROME_URLS]) {
      expect(css, u).toContain(u);
    }
  });
});

describe("rankedRoundMedia — ANTI-CHEAT: nothing only the reveal or the answer would draw", () => {
  it("never names the build-path ANSWER (missing component), even when the payload carries it", () => {
    const leaky = {
      ...ITEM_OPTION_QUESTION,
      presentation: {
        ...(ITEM_OPTION_QUESTION.presentation as Record<string, unknown>),
        missing_component_item_name: "Kindlegem",
        missing_component_icon: "assets/items/ANSWER-3067.png",
        missing_component_item_id: 9999,
      },
    };
    const urls = all(rankedRoundMedia(quizRound(leaky)));
    expect(urls.some((u) => u.includes("ANSWER"))).toBe(false);
    expect(urls.some((u) => u.includes("9999"))).toBe(false);
  });

  it("a spoiler subject contributes nothing before the reveal", () => {
    const m = rankedRoundMedia(quizRound({
      question_id: "q", prompt: "Which champion is this?", options: ["Ahri", "Lux", "Zed", "Jinx"],
      category: "champion_identity",
      presentation: {
        assets: { subject: { type: "champion", name: "Ahri", icon: "assets/champions/Ahri/icon.png" } },
        presentation: { scenario_type: "champion_profile", role: "answer", timing: "reveal", spoiler: true },
      },
    }), { manifest: manifestFor(["Ahri", "Lux", "Zed", "Jinx"]) });
    expect(all(m).some((u) => u.includes("Ahri"))).toBe(false);
  });

  it("never computes the reveal-time champion upgrade: no option's splash is requested", () => {
    // A champion-identification question whose band would be UPGRADED at the
    // reveal to the correct option's splash. Pre-reveal it names no champion.
    const m = rankedRoundMedia(quizRound(CHAMPION_OPTION_QUESTION),
      { manifest: manifestFor(["Garen", "Sett", "Darius", "Mordekaiser"]) });
    expect(all(m).some((u) => u.includes("/splash/"))).toBe(false);
    // Option icons: all four or none — never one singled out.
    const icons = all(m).filter((u) => u.includes("/icon.png"));
    expect(icons).toHaveLength(4);
  });

  it("option media is all-or-nothing: a misaligned set requests none", () => {
    const bad = { ...ITEM_OPTION_QUESTION, option_media: ITEM_OPTION_QUESTION.option_media!.slice(0, 3) };
    const m = rankedRoundMedia(quizRound(bad));
    for (const id of ["3067", "1028", "1029", "1033"]) {
      expect(m.critical).not.toContain(url(`assets/items/${id}.png`));
    }
  });

  it("reads no settlement: the descriptor's only input is the public round", () => {
    // The signature is the proof; this pins it against a future widening.
    expect(rankedRoundMedia.length).toBeLessThanOrEqual(2);
  });
});

describe("rankedRoundMedia — Meta Reflex: the whole block at once", () => {
  const card = (i: number, kind: "magnitude" | "recognition"): MetaReflexCard => (kind === "recognition"
    ? { kind, challengeIndex: i, prompt: "p", entityKind: "ability", leftCardId: `l${i}`, rightCardId: `r${i}`,
        left: { mediaUrl: `api/ranked/media/segment-card/m1/4/${i}/left.png` },
        right: { mediaUrl: `api/ranked/media/segment-card/m1/4/${i}/right.png` } }
    : { kind, challengeIndex: i, prompt: "p", entityKind: "item", leftCardId: `l${i}`, rightCardId: `r${i}`,
        left: { entityId: `a${i}`, label: `A${i}`, media: `assets/items/a${i}.png` },
        right: { entityId: `b${i}`, label: `B${i}`, media: `assets/items/b${i}.png` } }) as MetaReflexCard;

  it("returns both sides of all five cards, not just the current one", () => {
    const cards = [card(0, "magnitude"), card(1, "recognition"), card(2, "magnitude"),
      card(3, "recognition"), card(4, "magnitude")];
    const round = {
      matchId: "m1", activeRound: { roundNumber: 4 }, question: null,
      segment: { moduleId: "item_cost_duel", moduleVersion: 4, challengeCount: 5, challengeIndex: 0 },
      segmentState: { segmentNumber: 4, ownNextChallengeIndex: 0, block: { contract: "meta_reflex", cards } },
      players: [],
    } as unknown as PublicRoundView;
    const m = rankedRoundMedia(round);
    expect(m.critical).toHaveLength(10);
    expect(m.critical).toContain(url("assets/items/a4.png"));
    expect(m.critical).toContain(url("api/ranked/media/segment-card/m1/4/3/right.png"));
    // Recognition art is positional: its URL names a side, never a subject.
    for (const u of m.critical.filter((x) => x.includes("segment-card"))) {
      expect(u).toMatch(/segment-card\/m1\/4\/\d\/(left|right)\.png$/);
    }
  });
});

function manifestFor(names: string[]): ChampionManifest {
  return {
    champions: Object.fromEntries(names.map((n) => [n, {
      splash: `assets/champions/${n}/splash/0.jpg`, loading: `assets/champions/${n}/loading/0.jpg`,
      icon: `assets/champions/${n}/manifest-icon.png`,
    }])),
  } as unknown as ChampionManifest;
}
