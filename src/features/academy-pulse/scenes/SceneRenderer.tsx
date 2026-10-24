/**
 * Academy Pulse — kind → scene. The one place that knows every scene.
 */
import type { ComponentType } from "react";

import type { PulseItem, PulseSceneKind } from "../model/pulse-types";
import ActivityScene from "./ActivityScene";
import ChallengeScene from "./ChallengeScene";
import CreatorScene from "./CreatorScene";
import InsightScene from "./InsightScene";
import LeaderboardScene from "./LeaderboardScene";
import MiniGameScene from "./MiniGameScene";
import NewsScene from "./NewsScene";
import PremiumScene from "./PremiumScene";
import QuestionScene from "./QuestionScene";
import SponsorScene from "./SponsorScene";
import type { SceneProps } from "./scene-kit";

// Each scene is typed to its own item; the registry is indexed by that item's kind.
const SCENES: Record<PulseSceneKind, ComponentType<SceneProps<never>>> = {
  activity: ActivityScene,
  minigame: MiniGameScene,
  leaderboard: LeaderboardScene,
  news: NewsScene,
  premium: PremiumScene,
  sponsor: SponsorScene,
  creator: CreatorScene,
  insight: InsightScene,
  question: QuestionScene,
  challenge: ChallengeScene,
};

/** The scene's accent colour (drives the frame's glow and the transition flare). */
export const SCENE_ACCENT: Record<PulseSceneKind, string> = {
  activity: "#f2c96b",
  minigame: "#5fe0ff",
  leaderboard: "#b9a6ff",
  news: "#7fb4ff",
  premium: "#ffcf7a",
  sponsor: "#b8c7d6",
  creator: "#ff6b8a",
  insight: "#7cf0b0",
  question: "#8fd8ff",
  challenge: "#ffa25f",
};

export default function SceneRenderer(props: SceneProps<PulseItem>) {
  const Scene = SCENES[props.item.kind] as ComponentType<SceneProps<PulseItem>>;
  return <Scene {...props} />;
}
