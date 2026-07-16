/**
 * Difficulty / rank signal for quiz content slides — the rank EMBLEM ONLY.
 * No text, no border, no container chrome: just the League rank icon, sized
 * to stay legible after social compression. The caller positions it in the
 * card's left area above answer A; it is absolutely positioned there so it
 * never affects the question text or the card's flow height (no drift).
 */
import type { DifficultyInfo } from "@/lib/quiz-screenshot/difficulty";

export default function DifficultyBadge({
  info,
  resolveUrl,
  size = 58,
}: {
  info: DifficultyInfo;
  resolveUrl: (path?: string) => string | undefined;
  size?: number;
}) {
  const emblem = resolveUrl(info.emblemPath);
  if (!emblem) return null;
  return (
    <img
      data-quiz-difficulty
      data-difficulty-tier={info.tier}
      src={emblem}
      alt={`${info.rankLabel} rank`}
      className="object-contain select-none"
      style={{
        width: size,
        height: size,
        filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))",
      }}
    />
  );
}
