/**
 * Answer-option media: transport reader + view adapter (RA6).
 *
 * Covers the two pure steps between the backend payload and the answer grid:
 *
 *   public-round envelope -> readQuestion (contracts.ts)
 *   -> PublicQuestionSource.optionMedia
 *   -> questionViewFromPublicQuestion -> AnswerOptionView.media
 *
 * The rule under test throughout is POSITIONAL ALIGNMENT: entry i belongs to
 * option i, and anything that could break that correspondence drops the whole
 * set rather than applying it off-by-one.
 */

import { describe, expect, it } from "vitest";

import { questionViewFromPublicQuestion } from "./adaptToViews";
import {
  ABILITY_OPTION_QUESTION,
  BackendQuestionPayload,
  CHAMPION_OPTION_QUESTION,
  ITEM_OPTION_QUESTION,
  NUMERIC_QUESTION,
  OPTION_MEDIA_QUESTIONS,
  RUNE_OPTION_QUESTION,
  SUMMONER_SPELL_OPTION_QUESTION,
} from "./optionMediaFixtures";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";

/** Wrap a backend question payload in a real public-round envelope. */
function envelopeWith(question: unknown) {
  const envelope = publicRoundV2();
  (envelope.payload as Record<string, unknown>).question = question;
  return envelope;
}

function readQuestionOf(question: unknown) {
  return readPublicRound(envelopeWith(question)).question!;
}

describe("option media: envelope reader", () => {
  it.each(Object.entries(OPTION_MEDIA_QUESTIONS))(
    "preserves the backend %s option media verbatim",
    (_name, payload) => {
      const question = readQuestionOf(payload);
      expect(question.optionMedia).toEqual(payload.option_media);
    },
  );

  it("a question with no option media reads as null (old payload)", () => {
    const question = readQuestionOf(NUMERIC_QUESTION);
    expect(question.optionMedia).toBeNull();
    // The premise media it DOES carry is untouched.
    expect(question.presentation).toEqual(NUMERIC_QUESTION.presentation);
  });

  it("a pre-RA6 payload with no option_media key at all still parses", () => {
    const { option_media: _omitted, ...legacy } = ITEM_OPTION_QUESTION;
    const question = readQuestionOf(legacy);
    expect(question.optionMedia).toBeNull();
    expect(question.options).toEqual(ITEM_OPTION_QUESTION.options);
    expect(question.presentation).toEqual(ITEM_OPTION_QUESTION.presentation);
  });

  it("one malformed entry drops the WHOLE array, never a partial set", () => {
    for (const broken of [
      { type: "item", name: "x" }, // no icon
      { type: "item", icon: "a.png" }, // no name
      { name: "x", icon: "a.png" }, // no type
      { type: "", name: "x", icon: "a.png" },
      null,
      "Kindlegem",
      ["Kindlegem"],
    ]) {
      const media = [...ITEM_OPTION_QUESTION.option_media!];
      media[2] = broken as never;
      expect(readQuestionOf({ ...ITEM_OPTION_QUESTION, option_media: media })
        .optionMedia).toBeNull();
    }
  });

  it("a non-array or empty option_media reads as null", () => {
    for (const value of [{}, "media", 3, [], null]) {
      expect(readQuestionOf({ ...ITEM_OPTION_QUESTION, option_media: value })
        .optionMedia).toBeNull();
    }
  });

  it("keeps a numeric or string id and drops anything else", () => {
    const media = ITEM_OPTION_QUESTION.option_media!.map((e) => ({
      ...e, id: { nested: true },
    }));
    const read = readQuestionOf({ ...ITEM_OPTION_QUESTION, option_media: media });
    expect(read.optionMedia!.every((e) => !("id" in e))).toBe(true);
    expect(readQuestionOf(CHAMPION_OPTION_QUESTION).optionMedia![0].id).toBe("Garen");
    expect(readQuestionOf(RUNE_OPTION_QUESTION).optionMedia![0].id).toBe(2);
  });
});

describe("option media: view adapter", () => {
  it.each(Object.entries(OPTION_MEDIA_QUESTIONS))(
    "zips %s media onto the options by position",
    (_name, payload: BackendQuestionPayload) => {
      const view = questionViewFromPublicQuestion(readQuestionOf(payload));
      expect(view.options).toHaveLength(payload.options.length);
      view.options.forEach((option, index) => {
        expect(option.label).toBe(payload.options[index]);
        expect(option.media).toEqual(payload.option_media![index]);
        // The entity the icon depicts is the option's OWN text.
        expect(option.media!.name).toBe(option.label);
        expect(option.index).toBe(index);
      });
    },
  );

  it("numeric options get no media on any option", () => {
    const view = questionViewFromPublicQuestion(readQuestionOf(NUMERIC_QUESTION));
    expect(view.options.map((o) => o.media)).toEqual([null, null, null, null]);
  });

  it("reordering the options reorders the media identically", () => {
    const permutation = [3, 1, 0, 2];
    const reordered = {
      ...ITEM_OPTION_QUESTION,
      options: permutation.map((i) => ITEM_OPTION_QUESTION.options[i]),
      option_media: permutation.map((i) => ITEM_OPTION_QUESTION.option_media![i]),
    };
    const view = questionViewFromPublicQuestion(readQuestionOf(reordered));
    view.options.forEach((option, index) => {
      expect(option.media!.name).toBe(option.label);
      expect(option.media).toEqual(
        ITEM_OPTION_QUESTION.option_media![permutation[index]]);
    });
  });

  it("a length mismatch drops the whole set rather than misattributing", () => {
    for (const media of [
      ITEM_OPTION_QUESTION.option_media!.slice(0, 3),
      [...ITEM_OPTION_QUESTION.option_media!, ITEM_OPTION_QUESTION.option_media![0]],
    ]) {
      const view = questionViewFromPublicQuestion({
        questionId: "q", prompt: "p", category: null,
        options: ITEM_OPTION_QUESTION.options,
        optionMedia: media,
      });
      expect(view.options.every((o) => o.media === null)).toBe(true);
    }
  });

  it("is unchanged for a source that never mentions option media", () => {
    const view = questionViewFromPublicQuestion({
      questionId: "q", prompt: "p", category: "items",
      options: ["a", "b", "c", "d"],
    });
    expect(view.options).toEqual([
      { id: "0", index: 0, label: "a", media: null },
      { id: "1", index: 1, label: "b", media: null },
      { id: "2", index: 2, label: "c", media: null },
      { id: "3", index: 3, label: "d", media: null },
    ]);
  });

  it("ability option media never names a slot", () => {
    const view = questionViewFromPublicQuestion(
      readQuestionOf(ABILITY_OPTION_QUESTION));
    for (const option of view.options) {
      expect(option.media!.icon).toContain("api/ranked/media/ability-icon/");
      expect(option.media).not.toHaveProperty("slot");
      expect(option.media!.icon).not.toMatch(/\/[QWER]_/);
    }
    expect(JSON.stringify(view)).not.toContain("assets/champions");
  });

  it("summoner-spell media survives even though the scenario classifier has no such card", () => {
    // `summoner_spell` is a subject type selectScenario does not classify. The
    // option icon is rendered from its `icon` directly, so it never reaches
    // that classifier and is unaffected by the gap.
    const view = questionViewFromPublicQuestion(
      readQuestionOf(SUMMONER_SPELL_OPTION_QUESTION));
    expect(view.options.map((o) => o.media!.type))
      .toEqual(["summoner_spell", "summoner_spell", "summoner_spell", "summoner_spell"]);
  });
});
