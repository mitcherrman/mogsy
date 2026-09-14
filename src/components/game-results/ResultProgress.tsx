/**
 * PROGRESS / REWARDS — what the game moved.
 *
 * XP, a streak, a rating, a collection: the systems that outlive this one
 * match. They sit together, below the performance figures, because a player
 * reads "how did I do" before "what did I get".
 *
 * AN UNRATED GAME SAYS SO. That is the one item here that is not a number, and
 * it is the reason the section exists in this shape: a Bot Ranked match moves
 * nothing on the ladder, and the honest way to render that is a row that says
 * "Unrated — the ladder did not move", never a "+0 Rating" chip that looks
 * like a result.
 */
import { Flame, Library, Sparkles, TrendingUp, MinusCircle } from "lucide-react";
import type { ResultProgressItem } from "./model";

const ICONS = {
  xp: Sparkles,
  streak: Flame,
  rating: TrendingUp,
  collection: Library,
  unrated: MinusCircle,
} as const;

function deltaTone(delta: number | null | undefined): string {
  if (typeof delta !== "number" || delta === 0) return "text-slate-100";
  return delta > 0 ? "text-emerald-300" : "text-[#e2757b]";
}

export function ResultProgress({ items }: { items: readonly ResultProgressItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Progress" data-testid="result-progress" className="space-y-2">
      <h3 className="ranked-eyebrow">Progress</h3>
      <dl className="rounded-[0.6rem] border border-white/10 bg-[#0b1727] divide-y divide-white/5">
        {items.map((item) => {
          const Icon = item.icon ? ICONS[item.icon] : null;
          return (
            <div
              key={item.key}
              data-testid={item.testId ?? `result-progress-${item.key}`}
              className="flex items-center gap-2 px-3 py-2"
            >
              {Icon && (
                <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#f0d78c]/70" />
              )}
              <dt className="min-w-0 flex-1 text-xs text-slate-400">
                {item.label}
                {item.hint && (
                  <span className="block text-[10px] text-slate-500">{item.hint}</span>
                )}
              </dt>
              <dd className={`shrink-0 text-sm font-bold tabular-nums ${
                deltaTone(item.delta)}`}>
                {item.value}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
