// ---------------------------------------------------------------------------
// PRESENTATION-ONLY ability labels.
//
// The backend's private projection sends ability IDS only (it never sends
// display names or descriptions), so this is a display dictionary keyed by
// those ids. It contains no charges, no numbers, no formulas, and no
// availability rules — availability, charges, locked/unlocked state, and
// legality all come from the backend private projection at runtime. Unknown
// ids fall back to the raw id rather than being hidden or invented.
// ---------------------------------------------------------------------------

interface AbilityLabel {
  name: string;
  description: string;
}

const LABELS: Record<string, AbilityLabel> = {
  "tank.fortify": {
    name: "Fortify",
    description: "After answering correctly, gain extra time on the next question.",
  },
  "tank.brace": {
    name: "Brace",
    description: "If you answer incorrectly while the opponent is correct, reduce incoming damage.",
  },
  "tank.barrier": {
    name: "Barrier",
    description: "Gain a shield against one future damage instance.",
  },
  "mage.arcane_charge": {
    name: "Arcane Charge",
    description: "After answering correctly, improve a future successful attack.",
  },
  "mage.overload": {
    name: "Overload",
    description: "Commit to being correct; if you are, amplify this round's damage.",
  },
  "mage.insight": {
    name: "Insight",
    description: "Modify future Combat Lab availability.",
  },
  "marksman.tempo": {
    name: "Tempo",
    description: "After answering correctly, reduce the opponent's time on the next question.",
  },
  "marksman.suppressing_fire": {
    name: "Suppressing Fire",
    description: "Commit to being correct; if you are, increase next-round timer pressure.",
  },
  "marksman.focus": {
    name: "Focus",
    description: "Reward consecutive correct answers with sustained accuracy bonuses.",
  },
};

export const abilityName = (abilityId: string): string => LABELS[abilityId]?.name ?? abilityId;

export const abilityDescription = (abilityId: string): string =>
  LABELS[abilityId]?.description ?? "";

export const NO_ABILITY = "__none__";
