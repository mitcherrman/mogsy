/**
 * THE MODULE-HISTORY BUBBLE (RM1 Pass 1).
 *
 * One settled module, as one token: the BASE points it earned, coloured by
 * whether that base was positive, with a small mark when the server also
 * awarded the speed bonus.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ONE RULE: THE NUMBER IS THE BASE, THE CHIP IS THE BONUS
 * ─────────────────────────────────────────────────────────────────────────
 * A bubble NEVER adds the bonus into its figure. `+2` with a `+1` chip means "two
 * base, and it was also quick" — three points banked — and that is deliberate:
 * the product sentence RP1 exists to teach is knowledge first, speed second,
 * and a merged `+3` erases the half that says which one the player earned.
 * Merging would also make the bubble's colour a lie: a wrong-but-fast module
 * cannot exist, but a `0 base + bonus` row rendered as `+1` green would claim
 * it did.
 *
 * So the two values travel separately all the way down from the settlement
 * (`ModulePointsAward.basePoints` / `.speedBonusPoints` → `RoundHistoryEntry`
 * → here), and this component performs no arithmetic on them at all.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT IS ITS OWN FILE
 * ─────────────────────────────────────────────────────────────────────────
 * It has two consumers, neither of them written yet:
 *
 *   * RM1 Pass 2 — the strip inside each `CombatantPanel` column;
 *   * Ranked ES1 — the end screen's ten-module comparison, the viewer's row
 *     directly above the opponent's.
 *
 * Those are a live HUD and a results table, and a bubble drawn twice would be
 * two vocabularies for one fact within days. So it takes NOTHING about either
 * context: no round number, no player, no side, no mirroring, no layout. It is
 * a token of fixed size that its caller places. `className` is the only seam,
 * and it is for placement, never for repainting the two states.
 *
 * ACCESSIBILITY. Colour is never the only channel — a zero says "0 points" in
 * text and a bonus says "plus 1 speed bonus" in text, so the dot is `aria-hidden`
 * decoration over a label that already stated it. The visible glyph is
 * `aria-hidden` for the same reason: "+2" read aloud beside "2 base points,
 * plus 1 speed bonus" is the same fact twice.
 */

export interface ModuleBubbleProps {
  /**
   * The module's BASE award, or null.
   *
   * Null is "the settlement published no award" — an hp round, or a backend
   * that predates `module_points`. It is NOT zero: a zero is the claim that the
   * module scored this player nothing, and the bubble must not make a claim the
   * settlement did not. A null bubble is drawn neutral and says "not scored".
   */
  basePoints: number | null;
  /**
   * The speed bonus the SERVER awarded, or null/0 for the common case.
   *
   * A number rather than a boolean, because the accessible label states the
   * figure and RP1's bonus is not guaranteed to stay at one point forever. The
   * dot appears if and only if this is greater than zero — the server's own
   * answer, never a timing comparison made here.
   */
  speedBonusPoints?: number | null;
  /** Placement only. Never the two states' colour. */
  className?: string;
  /** Test hook; the caller owns the identity of the module this describes. */
  testId?: string;
}

/**
 * The visible glyph. `+0`, `+1`, `+2`, `+3`, … and an em dash for a module the
 * settlement never scored.
 */
export function moduleBubbleGlyph(basePoints: number | null): string {
  return basePoints === null ? "—" : `+${basePoints}`;
}

/**
 * The spoken form, which is the ONLY place both numbers are stated together.
 *
 * "2 base points" / "2 base points, plus 1 speed bonus" / "0 points" — the
 * zero case drops the word "base" because there is no base/bonus distinction
 * left to draw when nothing was earned.
 */
export function moduleBubbleLabel(
  basePoints: number | null, speedBonusPoints: number | null | undefined,
): string {
  if (basePoints === null) return "Module not scored";
  const bonus = speedBonusPoints ?? 0;
  const base = basePoints === 0
    ? "0 points"
    : `${basePoints} base ${basePoints === 1 ? "point" : "points"}`;
  if (bonus <= 0) return base;
  return `${base}, plus ${bonus} speed bonus`;
}

export function ModuleBubble({
  basePoints, speedBonusPoints = null, className = "", testId,
}: ModuleBubbleProps) {
  const bonus = speedBonusPoints ?? 0;
  const hasBonus = bonus > 0;
  const scored = basePoints !== null;
  // Green for a positive base, red for a zero, neutral for a module the
  // settlement never scored. One expression, so the three states cannot drift
  // apart, and the token's SIZE is identical in all three — a row of bubbles
  // must not change height because one module went badly.
  const tone = !scored
    ? "border-white/15 bg-white/[0.04] text-muted-foreground/60"
    : basePoints > 0
      ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200"
      : "border-destructive/60 bg-destructive/15 text-[#e2757b]";
  return (
    <span
      role="img"
      aria-label={moduleBubbleLabel(basePoints, speedBonusPoints)}
      data-testid={testId ?? "module-bubble"}
      // Read by both future consumers' tests and by nothing else: the state a
      // bubble is in is observable without reading a colour.
      data-base-points={scored ? String(basePoints) : "none"}
      data-speed-bonus={hasBonus ? "true" : "false"}
      className={`relative inline-flex h-6 min-w-6 shrink-0 items-center justify-center
        rounded-full border px-1.5 text-[11px] font-black leading-none tabular-nums
        ${tone} ${className}`}
    >
      <span aria-hidden>{moduleBubbleGlyph(basePoints)}</span>
      {hasBonus && (
        // The speed mark: the bonus FIGURE, legible. Top-RIGHT of the token,
        // and deliberately not mirrored with the column it may sit in: it is
        // a property of the module, so a reader comparing the viewer's row
        // against the opponent's finds it in the same corner on both.
        //
        // R2: this was a 6px white dot, and on the owner's live Reconstruct
        // result the bot's two speed bonuses were invisible — "+2 +2 +0"
        // beside a 6-6 draw read as a scoring bug. The chip states "+1" so a
        // row visibly sums to the total printed at its end. Absolute, so the
        // token's size is unchanged. `aria-hidden`: the label says it in words.
        <span aria-hidden data-testid="module-bubble-speed"
          className="absolute -right-2 -top-2 rounded-full bg-amber-300 px-[3px] text-[9px]
            font-black leading-[12px] text-[#070f1c] ring-1 ring-[#070f1c]">
          {`+${bonus}`}
        </span>
      )}
    </span>
  );
}
