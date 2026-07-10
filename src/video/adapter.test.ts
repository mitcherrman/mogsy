import { describe, expect, it } from "vitest";
import { adaptQuestion, adaptQuestions, type SourceQuestion } from "./adapter";

const GOOD: SourceQuestion = {
  id: 42,
  question_text: "How much AP does Rabadon's Deathcap provide?",
  format: "multiple_choice",
  category: "item_exact_stats",
  difficulty: 1,
  choices: ["100 AP", { label: "140 AP" }, "160 AP"],
  correct_answer: { type: "exact", value: "140 ap" }, // case-insensitive match
  explanation: "Deathcap gives 140 AP plus a 35% multiplier.",
  metadata: { item_name: "Rabadon's Deathcap", patch: "14.20" },
};

describe("adaptQuestion", () => {
  it("converts a ReviewQuestion-shaped row", () => {
    const q = adaptQuestion(GOOD);
    expect(typeof q).not.toBe("string");
    if (typeof q === "string") return;
    expect(q.question).toMatch(/Rabadon/);
    expect(q.choices).toEqual(["100 AP", "140 AP", "160 AP"]); // object choice flattened
    expect(q.correct_index).toBe(1);
    expect(q.item_name).toBe("Rabadon's Deathcap");
    expect(q.patch).toBe("14.20");
    expect(q.explanation).toMatch(/multiplier/);
  });

  it("synthesizes assets.subject from legacy item/spell/rune fields", () => {
    // Item Costs shape: item_name + top-level image_path, no assets.subject
    const item = adaptQuestion({
      id: 1,
      question_text: "How much does Stormsurge cost?",
      choices: ["2750 gold", "2800 gold"],
      correct_answer: "2800 gold",
      metadata: { item_name: "Stormsurge", cost: 2800 },
      image_path: "assets/items/3871.png",
    });
    if (typeof item === "string") throw new Error(item);
    expect(item.image_path).toBe("assets/items/3871.png");
    expect((item.metadata!.assets as { subject?: unknown }).subject).toEqual({
      type: "item",
      id: undefined,
      name: "Stormsurge",
      icon: "assets/items/3871.png",
    });

    // Summoner Spells shape: spell_name + asset_path
    const spell = adaptQuestion({
      id: 2,
      question_text: "Which summoner spell is used for mobility?",
      choices: ["Flash", "Ignite"],
      correct_answer: "Flash",
      metadata: { spell_name: "Flash", spell_key: "F", asset_path: "assets/spells/Flash.png" },
    });
    if (typeof spell === "string") throw new Error(spell);
    expect((spell.metadata!.assets as { subject?: unknown }).subject).toMatchObject({
      type: "spell",
      name: "Flash",
      slot: "F",
      icon: "assets/spells/Flash.png",
    });

    // Runes shape
    const rune = adaptQuestion({
      id: 3,
      question_text: "Which rune tree contains Lethal Tempo?",
      choices: ["Precision", "Domination"],
      correct_answer: "Precision",
      metadata: { rune_name: "Lethal Tempo", asset_path: "assets/runes/LethalTempo.png" },
    });
    if (typeof rune === "string") throw new Error(rune);
    expect((rune.metadata!.assets as { subject?: unknown }).subject).toMatchObject({ type: "rune", name: "Lethal Tempo" });
  });

  it("never overwrites an existing assets.subject", () => {
    const existing = { type: "item", id: "3916", name: "Oblivion Orb", icon: "assets/items/3916.png" };
    const q = adaptQuestion({
      id: 4,
      question_text: "How much AP does Oblivion Orb give?",
      choices: ["30", "40"],
      correct_answer: "30",
      metadata: { item_name: "Oblivion Orb", assets: { subject: existing } },
      image_path: "assets/items/other.png",
    });
    if (typeof q === "string") throw new Error(q);
    expect((q.metadata!.assets as { subject?: unknown }).subject).toEqual(existing);
  });

  it("passes source metadata through (plus normalized subject) for the broadcast ScenarioCard framework", () => {
    const q = adaptQuestion(GOOD);
    if (typeof q === "string") throw new Error(q);
    // Original fields preserved; legacy item_name normalized into assets.subject.
    expect(q.metadata).toMatchObject(GOOD.metadata!);
    expect(q.metadata!.assets).toMatchObject({ subject: { type: "item", name: "Rabadon's Deathcap" } });
    // No metadata → field omitted, not an empty object.
    const bare = adaptQuestion({ id: 2, question_text: "Q?", choices: ["a", "b"], correct_answer: "a" });
    if (typeof bare === "string") throw new Error(bare);
    expect(bare.metadata).toBeUndefined();
  });

  it("accepts string correct_answer and metadata fallbacks", () => {
    const q = adaptQuestion({
      id: 1,
      question_text: "Q?",
      choices: ["a", "b"],
      correct_answer: "b",
      metadata: { explanation: "meta why", champion: "Ahri" },
    });
    if (typeof q === "string") throw new Error(q);
    expect(q.correct_index).toBe(1);
    expect(q.explanation).toBe("meta why");
    expect(q.champion_name).toBe("Ahri");
  });

  it("accepts mock-style metadata.correct_answer", () => {
    const q = adaptQuestion({
      id: 1,
      question_text: "Q?",
      choices: ["a", "b"],
      metadata: { correct_answer: "a" },
    });
    if (typeof q === "string") throw new Error(q);
    expect(q.correct_index).toBe(0);
  });

  it("rejects unusable rows with a reason", () => {
    expect(adaptQuestion({ ...GOOD, format: "free_text" })).toMatch(/unsupported format/);
    expect(adaptQuestion({ ...GOOD, question_text: "" })).toMatch(/missing question_text/);
    expect(adaptQuestion({ ...GOOD, choices: ["only one"] })).toMatch(/at least 2 choices/);
    expect(adaptQuestion({ ...GOOD, correct_answer: null, metadata: {} })).toMatch(/missing correct answer/);
    expect(adaptQuestion({ ...GOOD, correct_answer: "999 AP" })).toMatch(/not among choices/);
  });
});

describe("adaptQuestions", () => {
  it("collects usable questions, reports skips, applies limit", () => {
    const bad: SourceQuestion = { id: "bad", question_text: "", choices: ["a", "b"] };
    const { data, skipped } = adaptQuestions([GOOD, bad, { ...GOOD, id: 43 }, { ...GOOD, id: 44 }], {
      limit: 2,
      title: "T",
    });
    expect(data.title).toBe("T");
    expect(data.questions.map((q) => q.id)).toEqual([42, 43]); // limit hit before id 44
    expect(skipped).toEqual([{ id: "bad", reason: "missing question_text" }]);
    expect(data.subtitle).toMatch(/2 questions/);
  });

  it("derives video patch only when all questions agree", () => {
    const same = adaptQuestions([GOOD, { ...GOOD, id: 2 }]);
    expect(same.data.patch).toBe("14.20");
    const mixed = adaptQuestions([
      GOOD,
      { ...GOOD, id: 2, metadata: { ...GOOD.metadata, patch: "14.21" } },
    ]);
    expect(mixed.data.patch).toBeUndefined();
    const forced = adaptQuestions([GOOD], { patch: "15.1" });
    expect(forced.data.patch).toBe("15.1");
  });

  it("output renders through the real timing model", async () => {
    const { buildTimeline } = await import("./timing");
    const { data } = adaptQuestions([GOOD, { ...GOOD, id: 2 }]);
    const t = buildTimeline(data);
    expect(t.totalFrames).toBeGreaterThan(0);
    expect(t.questions).toHaveLength(2);
  });
});
