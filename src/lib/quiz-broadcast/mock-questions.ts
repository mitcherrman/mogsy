import type { QuizQuestion } from "@/lib/quiz/api";

/**
 * Local fallback question set used when the live quiz API is unreachable.
 * Lets the Broadcast Studio + Window be developed/tested end-to-end without
 * depending on backend completeness. Mock questions carry a `correct_answer`
 * inside metadata so the renderer can show the reveal phase offline.
 */
export const MOCK_BROADCAST_QUESTIONS: QuizQuestion[] = [
  {
    id: "mock-1",
    category: "champion_ability_cooldowns",
    question_text: "What is Ahri's Q (Orb of Deception) base cooldown at rank 1?",
    format: "multiple_choice",
    choices: ["6s", "7s", "8s", "9s"],
    difficulty: 2,
    metadata: { correct_answer: "7s", explanation: "Orb of Deception starts at 7s and scales down with rank.", champion: "Ahri", patch: "14.20" },
  },
  {
    id: "mock-2",
    category: "item_exact_stats",
    question_text: "How much Ability Power does Rabadon's Deathcap provide?",
    format: "multiple_choice",
    choices: ["100 AP", "120 AP", "140 AP", "160 AP"],
    difficulty: 1,
    metadata: { correct_answer: "140 AP", explanation: "Deathcap gives 140 AP plus a 35% AP multiplier.", item: "Rabadon's Deathcap", patch: "14.20" },
  },
  {
    id: "mock-3",
    category: "summoner_spell_cooldowns",
    question_text: "What is the base cooldown of Flash?",
    format: "multiple_choice",
    choices: ["210s", "240s", "270s", "300s"],
    difficulty: 1,
    metadata: { correct_answer: "300s", explanation: "Flash has a 300 second base cooldown.", summoner: "Flash" },
  },
  {
    id: "mock-4",
    category: "item_build_paths",
    question_text: "Which component is shared by both Infinity Edge and Bloodthirster?",
    format: "multiple_choice",
    choices: ["B.F. Sword", "Pickaxe", "Cloak of Agility", "Vampiric Scepter"],
    difficulty: 2,
    metadata: { correct_answer: "B.F. Sword", explanation: "Both items build from a B.F. Sword.", item: "Infinity Edge" },
  },
  {
    id: "mock-5",
    category: "item_components",
    question_text: "Which two items combine into Trinity Force's Sheen line?",
    format: "multiple_choice",
    choices: ["Sapphire Crystal + Amplifying Tome", "Ruby Crystal + Long Sword", "Sapphire Crystal + Long Sword", "Amplifying Tome + Long Sword"],
    difficulty: 3,
    metadata: { correct_answer: "Sapphire Crystal + Amplifying Tome", explanation: "Sheen combines a Sapphire Crystal with an Amplifying Tome.", item: "Sheen" },
  },
];