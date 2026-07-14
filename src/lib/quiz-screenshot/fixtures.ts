/**
 * Deterministic repo fixtures for the screenshot harness — used by unit
 * tests, the dev-mode fallback of /dev/quiz-render, and offline smoke runs.
 * Imageless on purpose so captures are stable with no backend running.
 */
import type { RenderQuestion } from "./types";

export const SAMPLE_RENDER_QUESTIONS: RenderQuestion[] = [
  {
    id: "fixture-explained",
    question_text: "Which item grants the highest flat armor in League of Legends?",
    choices: [
      { label: "Thornmail" },
      { label: "Dead Man's Plate" },
      { label: "Randuin's Omen" },
      { label: "Sunfire Aegis" },
    ],
    correct_index: 0,
    explanation:
      "Thornmail grants 70 armor, the highest flat armor of any completed item, and reflects damage to attackers while applying Grievous Wounds.",
    category: "item_exact_stats",
    difficulty: 2,
  },
  {
    id: "fixture-no-explanation",
    question_text: "How many members are on each team in a standard Summoner's Rift game?",
    choices: [{ label: "3" }, { label: "4" }, { label: "5" }, { label: "6" }],
    correct_index: 2,
    category: "general",
    difficulty: 1,
  },
  {
    id: "fixture-long-text",
    question_text:
      "A full-build Jinx with 100% critical strike chance attacks a target with 200 armor and no other resistances. Considering only base armor mitigation, roughly what fraction of her physical damage is prevented?",
    choices: [
      { label: "One quarter of the damage" },
      { label: "One third of the damage" },
      { label: "One half of the damage" },
      { label: "Two thirds of the damage" },
    ],
    correct_index: 3,
    explanation:
      "Damage reduction is armor / (100 + armor). With 200 armor that is 200 / 300 ≈ 66.7%, so about two thirds of the physical damage is mitigated.",
    category: "champion_ability_cooldowns",
    difficulty: 4,
  },
];
