/**
 * Owner takes (Creator Replay, including Daily three acts): a run that is NOT
 * the player's official Daily. Its score, streak and history are never
 * recorded as official, so its result surfaces must not say "Today's
 * Challenge" or "Daily score". The creator replay page provides `true`; every
 * official Daily surface keeps the default and is unchanged.
 */
import { createContext, useContext } from "react";
import type { GameResultsModel } from "@/components/game-results/model";

export const OwnerTakeContext = createContext(false);

export const useOwnerTake = (): boolean => useContext(OwnerTakeContext);

export const OWNER_TAKE_LABELS = {
  headline: "Owner take",
  scoreLabel: "Take score",
  note: "Not official — your Daily score, streak and history are untouched.",
} as const;

/** The main result's hero relabelled for an owner take (same figures). */
export function ownerTakeResult(model: GameResultsModel): GameResultsModel {
  return {
    ...model,
    mode: OWNER_TAKE_LABELS.headline,
    headline: OWNER_TAKE_LABELS.headline,
    score: model.score ? { ...model.score, label: OWNER_TAKE_LABELS.scoreLabel } : model.score,
  };
}
