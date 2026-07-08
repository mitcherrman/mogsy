import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ScenarioCardProps, ScenarioSelection } from "./types";
import { selectScenario } from "./classify";
import { ChampionScenarioCard } from "./ChampionScenarioCard";
import { CombatCalculationScenarioCard } from "./CombatCalculationScenarioCard";
import { CollectibleCard, SubjectPlaceholder, SubjectPlaceholderCard } from "./DefaultScenarioCard";

/**
 * ScenarioCard — single entry point for the broadcast subject panel.
 *
 * Dispatches to a specialized card based on selectScenario (explicit
 * presentation.scenario_type → assets.subject.type → legacy classification).
 * Spoiler gating and reveal-swap behavior live in selectScenario and are
 * identical to the pre-framework SubjectPanel.
 *
 * To add a new question-type visual: create a card component, add a variant
 * to ScenarioSelection, and handle it in selectScenario + renderCard. No
 * BroadcastRenderer changes needed.
 */
export function ScenarioCard({ question, revealActive, correctAnswer }: ScenarioCardProps) {
  const selection = useMemo(
    () => selectScenario(question, revealActive, correctAnswer),
    [question, revealActive, correctAnswer],
  );

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={selection.key}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="flex h-full w-full items-center justify-center"
        >
          {renderCard(selection)}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function renderCard(selection: ScenarioSelection) {
  switch (selection.card) {
    case "combat_calculation":
      return <CombatCalculationScenarioCard subject={selection.combat} />;
    case "champion_profile":
      return <ChampionScenarioCard champion={selection.champion} />;
    case "collectible":
      return <CollectibleCard iconUrl={selection.iconUrl} label={selection.label} kind={selection.kind} />;
    case "placeholder":
      return <SubjectPlaceholderCard kind={selection.kind} category={selection.category} />;
    case "empty":
      return <SubjectPlaceholder />;
  }
}
