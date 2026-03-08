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
  {
    id: "chop",
    name: "You're Chopped",
    description: "Card gets cleaved in half with a brutal chop.",
    icon: "🔪",
    contexts: ["swipe", "elocheck"],
    defaultProOnly: true,
  },
  {
    id: "mogged",
    name: "Mogged",
    description: "Gigachad appears and mogs the loser into oblivion.",
    icon: "🗿",
    contexts: ["swipe", "elocheck"],
    defaultProOnly: true,
  },
  {
    id: "doakes",
    name: "Sgt Doakes",
    description: "Surprise! Sgt Doakes walks in on the loser.",
    icon: "😠",
    contexts: ["swipe", "elocheck"],
    defaultProOnly: true,
  },
  {
    id: "amongus",
    name: "Among Us",
    description: "Impostor backstabs the loser. They were ejected.",
    icon: "🔴",
    contexts: ["swipe", "elocheck"],
    defaultProOnly: true,
  },
];

export function getAnimationDef(id: string): CardAnimationDef {
  return CARD_ANIMATIONS.find(a => a.id === id) || CARD_ANIMATIONS[0];
}
