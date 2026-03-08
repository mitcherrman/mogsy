import { lazy, Suspense } from "react";
import type { AnimationCardItem } from "./AnimationCardStats";

const SliceBattleAnimation = lazy(() => import("@/components/SliceBattleAnimation"));
const ShatterAnimation = lazy(() => import("@/components/animations/ShatterAnimation"));
const BurnAnimation = lazy(() => import("@/components/animations/BurnAnimation"));
const VaporizeAnimation = lazy(() => import("@/components/animations/VaporizeAnimation"));
const CrushAnimation = lazy(() => import("@/components/animations/CrushAnimation"));
const ChopAnimation = lazy(() => import("@/components/animations/ChopAnimation"));
const DefaultFadeAnimation = lazy(() => import("@/components/animations/DefaultFadeAnimation"));

interface Props {
  animationId: string;
  winnerSide: 0 | 1 | null;
  items: AnimationCardItem[];
  onComplete: () => void;
}

export type { AnimationCardItem };

export default function CardAnimationRouter({ animationId, winnerSide, items, onComplete }: Props) {
  const commonProps = { winnerSide, items, onComplete };

  return (
    <Suspense fallback={null}>
      {animationId === "slice" && <SliceBattleAnimation {...commonProps} />}
      {animationId === "shatter" && <ShatterAnimation {...commonProps} />}
      {animationId === "burn" && <BurnAnimation {...commonProps} />}
      {animationId === "vaporize" && <VaporizeAnimation {...commonProps} />}
      {animationId === "crush" && <CrushAnimation {...commonProps} />}
      {animationId === "chop" && <ChopAnimation {...commonProps} />}
      {animationId === "default" && <DefaultFadeAnimation {...commonProps} />}
      {!["slice", "shatter", "burn", "vaporize", "crush", "chop", "default"].includes(animationId) && (
        <DefaultFadeAnimation {...commonProps} />
      )}
    </Suspense>
  );
}
