import { lazy, Suspense } from "react";

const SliceBattleAnimation = lazy(() => import("@/components/SliceBattleAnimation"));
const ShatterAnimation = lazy(() => import("@/components/animations/ShatterAnimation"));
const BurnAnimation = lazy(() => import("@/components/animations/BurnAnimation"));
const VaporizeAnimation = lazy(() => import("@/components/animations/VaporizeAnimation"));
const CrushAnimation = lazy(() => import("@/components/animations/CrushAnimation"));
const DefaultFadeAnimation = lazy(() => import("@/components/animations/DefaultFadeAnimation"));

interface CardItem {
  imageUrl: string | null;
  name: string;
}

interface Props {
  animationId: string;
  winnerSide: 0 | 1 | null;
  items: CardItem[];
  onComplete: () => void;
}

export default function CardAnimationRouter({ animationId, winnerSide, items, onComplete }: Props) {
  const commonProps = { winnerSide, items, onComplete };

  return (
    <Suspense fallback={null}>
      {animationId === "slice" && <SliceBattleAnimation {...commonProps} />}
      {animationId === "shatter" && <ShatterAnimation {...commonProps} />}
      {animationId === "burn" && <BurnAnimation {...commonProps} />}
      {animationId === "vaporize" && <VaporizeAnimation {...commonProps} />}
      {animationId === "crush" && <CrushAnimation {...commonProps} />}
      {animationId === "default" && <DefaultFadeAnimation {...commonProps} />}
      {!["slice", "shatter", "burn", "vaporize", "crush", "default"].includes(animationId) && (
        <DefaultFadeAnimation {...commonProps} />
      )}
    </Suspense>
  );
}
