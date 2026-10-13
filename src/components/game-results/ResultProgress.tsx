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
 *
 * MPE — THE KNOWLEDGE ROWS AND THE ONE EARNED GAIN
 * ────────────────────────────────────────────────
 * XP and collection rows share one warm emphasis (a gold spine and wash): they
 * are the Academy's own currencies and the end screen treats them as one
 * family. ONE of them may also MOVE: an `xp` item whose adapter stated a
 * positive `delta` is an earned Academy XP gain and counts up (`EarnedXpValue`).
 * An XP TOTAL (no delta), the in-match level ("Lv 3 · 50 XP", no delta), a
 * zero and a negative all stay still — `isEarnedXp` is the one predicate for
 * this, shared with the compact strip so the two presentations cannot drift.
 */
import type { CSSProperties } from "react";
import { Flame, Library, Sparkles, TrendingUp, MinusCircle } from "lucide-react";
import { EarnedXpValue } from "./EarnedXpValue";
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

/**
 * Is this an EARNED Academy XP gain? Only an `xp` item whose adapter stated a
 * positive signed `delta`. A total is not a delta; a level is not a delta.
 */
export function isEarnedXp(item: ResultProgressItem): item is ResultProgressItem & { delta: number } {
  return item.icon === "xp" && typeof item.delta === "number" && item.delta > 0;
}

/** XP and the collection: the Academy's two currencies, one emphasis. */
export function isKnowledgeItem(item: ResultProgressItem): boolean {
  return item.icon === "xp" || item.icon === "collection";
}

/** Entrance stagger between rows, and the count-up's lead-in after its row. */
const ROW_STEP_MS = 70;
export const EARNED_XP_LEAD_MS = 320;

export function ResultProgress({ items, enterDelayMs = 0 }: {
  items: readonly ResultProgressItem[];
  /** Where this section sits in the screen's entrance sequence. */
  enterDelayMs?: number;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Progress" data-testid="result-progress" className="space-y-2">
      <h3 className="ranked-eyebrow">Progress</h3>
      <dl className="divide-y divide-white/5 overflow-hidden rounded-[0.6rem] border border-white/10 bg-[#0b1727]">
        {items.map((item, index) => {
          const Icon = item.icon ? ICONS[item.icon] : null;
          const knowledge = isKnowledgeItem(item);
          const earned = isEarnedXp(item);
          const delay = enterDelayMs + index * ROW_STEP_MS;
          return (
            <div
              key={item.key}
              data-testid={item.testId ?? `result-progress-${item.key}`}
              data-knowledge={knowledge ? "true" : undefined}
              className={`reward-enter relative flex items-center gap-2 px-3 py-2 ${
                knowledge ? "bg-gradient-to-r from-[#f0d78c]/[0.08] via-transparent to-transparent" : ""}`}
              style={{ "--reward-delay": `${delay}ms` } as CSSProperties}
            >
              {knowledge && (
                <span aria-hidden className="absolute inset-y-0 left-0 w-0.5
                  bg-gradient-to-b from-[#f5e6b8] via-[#c9a84c] to-[#7fd6ef]/70" />
              )}
              {Icon && (
                <Icon aria-hidden className={`h-3.5 w-3.5 shrink-0 ${
                  knowledge ? "text-[#f0d78c]" : "text-[#f0d78c]/70"}`} />
              )}
              <dt className="min-w-0 flex-1 text-xs text-slate-400">
                {item.label}
                {item.hint && (
                  <span className="block text-[10px] text-slate-500">{item.hint}</span>
                )}
              </dt>
              <dd className={`shrink-0 text-sm font-bold tabular-nums ${
                earned ? "text-[#f5e6b8]" : deltaTone(item.delta)}`}>
                {earned ? (
                  <EarnedXpValue amount={item.delta} value={item.value}
                    delayMs={delay + EARNED_XP_LEAD_MS} />
                ) : item.value}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
