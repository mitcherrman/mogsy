import type { QuizVideoData } from "./types";

/**
 * Default composition props (also mirrored in sample-quiz-video.json for
 * CLI `--props=` rendering). Content matches the Broadcast Studio's
 * offline mock playlist so video output can be eyeballed against the
 * live renderer.
 */
export const SAMPLE_QUIZ_VIDEO: QuizVideoData = {
  title: "Mogsy League Quiz",
  subtitle: "5 questions — how many can you get?",
  website: "mogsy.net/quiz",
  patch: "14.20",
  intro_seconds: 4,
  outro_seconds: 4,
  questions: [
    {
      id: "mock-1",
      question: "What is Ahri's Q (Orb of Deception) base cooldown at rank 1?",
      choices: ["6s", "7s", "8s", "9s"],
      correct_answer: "7s",
      explanation: "Orb of Deception starts at 7s and scales down with rank.",
      category: "champion_ability_cooldowns",
      difficulty: 2,
      champion_name: "Ahri",
      ability_name: "Orb of Deception (Q)",
    },
    {
      id: "mock-2",
      question: "How much Ability Power does Rabadon's Deathcap provide?",
      choices: ["100 AP", "120 AP", "140 AP", "160 AP"],
      correct_answer: "140 AP",
      explanation: "Deathcap gives 140 AP plus a 35% AP multiplier.",
      category: "item_exact_stats",
      difficulty: 1,
      item_name: "Rabadon's Deathcap",
    },
    {
      id: "mock-3",
      question: "What is the base cooldown of Flash?",
      choices: ["210s", "240s", "270s", "300s"],
      correct_answer: "300s",
      explanation: "Flash has a 300 second base cooldown.",
      category: "summoner_spell_cooldowns",
      difficulty: 1,
    },
    {
      id: "mock-4",
      question: "Which component is shared by both Infinity Edge and Bloodthirster?",
      choices: ["B.F. Sword", "Pickaxe", "Cloak of Agility", "Vampiric Scepter"],
      correct_answer: "B.F. Sword",
      explanation: "Both items build from a B.F. Sword.",
      category: "item_build_paths",
      difficulty: 2,
      item_name: "Infinity Edge",
    },
    {
      id: "mock-5",
      question: "Which two items combine into Trinity Force's Sheen line?",
      choices: [
        "Sapphire Crystal + Amplifying Tome",
        "Ruby Crystal + Long Sword",
        "Sapphire Crystal + Long Sword",
        "Amplifying Tome + Long Sword",
      ],
      correct_answer: "Sapphire Crystal + Amplifying Tome",
      explanation: "Sheen combines a Sapphire Crystal with an Amplifying Tome.",
      category: "item_components",
      difficulty: 3,
      item_name: "Sheen",
    },
  ],
};
