/**
 * Card Animation Registry
 * Defines all available win/lose animations for swipe games and elo check.
 */

export interface CardAnimationDef {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji
  contexts: ("swipe" | "elocheck")[];
  defaultProOnly: boolean;
}

export const CARD_ANIMATIONS: CardAnimationDef[] = [
  {
    id: "default",
    name: "Classic Fade",
    description: "Simple fade-out transition. Clean and minimal.",
    icon: "✨",
    contexts: ["swipe", "elocheck"],
    defaultProOnly: false,
  },
  {
    id: "slice",
    name: "Paper Rip",
    description: "Loser's card tears apart with a jagged diagonal rip.",
    icon: "🗡️",
    contexts: ["swipe", "elocheck"],
    defaultProOnly: false,
  },
  {
    id: "shatter",
    name: "Shatter",
    description: "Card explodes into glass-like fragments.",
    icon: "💎",
    contexts: ["swipe", "elocheck"],
    defaultProOnly: true,
  },
  {
    id: "burn",
    name: "Disenchant",
    description: "Card dissolves in golden flames from the edges inward.",
    icon: "🔥",
    contexts: ["swipe", "elocheck"],
    defaultProOnly: true,
  },
  {
    id: "vaporize",
    name: "Vaporize",
    description: "Card disintegrates into floating dust particles.",
    icon: "💨",
    contexts: ["swipe", "elocheck"],
    defaultProOnly: true,
  },
  {
    id: "crush",
    name: "Crush",
    description: "Card crumples and collapses inward with impact.",
    icon: "💥",
    contexts: ["swipe", "elocheck"],
    defaultProOnly: true,
  },
];

export function getAnimationDef(id: string): CardAnimationDef {
  return CARD_ANIMATIONS.find(a => a.id === id) || CARD_ANIMATIONS[0];
}
