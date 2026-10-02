// ---------------------------------------------------------------------------
// MRLVL1 Phase 3 — the `LVL n` badge on a level-aware Meta Reflex card.
//
// WHAT THIS IS
// The champion level the SERVER froze this card at, rendered. Meta Reflex
// champion-stat cards for HP, AD and armor are generated at one of six
// breakpoints (1, 6, 11, 16, 18, 20), and the card compares the two champions'
// stats AT THAT LEVEL rather than at level 1. Without the badge, "Which
// champion has more Health?" is an unanswerable question with a definite
// answer, which is the worst kind.
//
// WHAT THIS IS NOT
// It never decides, infers, defaults or calculates a level. It renders the
// number it is handed and nothing else. `null`/`undefined` renders NOTHING —
// it is not "level 1 by default", because a level-independent card (move
// speed, attack range, item cost, recognition, classification) genuinely has
// no level, and so does every Meta Reflex segment frozen before MRLVL1. A
// badge inferred for those would be a claim about data nobody recorded.
//
// WHY LEVEL 1 IS NOT SPECIAL-CASED
// A level-1 card is an ordinary level-aware card that happens to sit at the
// bottom of the growth curve. Hiding its badge would make the ONE breakpoint
// where the level-aware and base-stat numbers coincide look like a
// level-independent card, and a player would have no way to tell "at level 1"
// from "level does not apply here".
//
// WHY IT IS A SHARED COMPONENT
// It was written to be shared by Ranked Meta Reflex and the standalone League
// Swipe game, whose card renderers had nothing else in common. LS-RETIRE1
// retired the standalone game; Ranked/Daily Meta Reflex is now its consumer.
// Kept as its own component so any future surface showing a frozen champion
// level reuses one pill instead of growing a second copy free to drift.
// ---------------------------------------------------------------------------

/** Text prefix. Deliberately "LVL", never "LEVEL" — see MRLVL1_HANDOFF.md. */
const LEVEL_PREFIX = "LVL";

export interface ChampionLevelBadgeProps {
  /**
   * The server's `champion_level`. `null`/`undefined` renders nothing.
   *
   * Optional and nullable on purpose: a segment frozen before MRLVL1 has no
   * such key at all, and it must render exactly as it did before.
   */
  level?: number | null;
  /** Extra classes for host-specific spacing. Never for restyling the pill. */
  className?: string;
}

export function ChampionLevelBadge({ level, className }: ChampionLevelBadgeProps) {
  // `!= null` catches BOTH null and undefined, and — unlike a truthiness check
  // — keeps level 0 out of the "absent" branch on principle. The backend never
  // emits 0, and a badge silently vanishing would be the wrong way to find out
  // if it ever did.
  if (level == null) return null;

  return (
    <span
      data-testid="champion-level-badge"
      // The raw value, for tests and for anything that needs the number rather
      // than the rendered string.
      data-champion-level={level}
      className={[
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap",
        // `min-w` + `tabular-nums` are the no-jump rule: LVL 1 and LVL 20
        // occupy identical width, so a block does not shuffle its prompt
        // sideways as the breakpoint changes from card to card.
        //
        // 4rem is measured, not guessed: the widest label ("LVL 20", two
        // digits plus the tracking) lays out at 61px, so the floor has to
        // clear that or a one-digit level renders narrower and the badge
        // breathes between cards. 3.5rem did exactly that.
        "min-w-[4rem] rounded-full border px-2 py-0.5 tabular-nums",
        // SC-RENAME3: a solid dark-panel pill with the bright ranked gold. The
        // old translucent gold-on-gold (text #e8c97a over a 15% gold wash)
        // all but vanished on the light parchment folio the prompt sits on.
        // Same `.ranked-academy` tokens (fallbacks for hosts outside it), so
        // it reads on parchment AND on the dark chamber (~9:1 text contrast).
        "border-[var(--ranked-gold,#b9934c)] bg-[var(--ranked-bg-panel,#0b1727)] text-[var(--ranked-gold-bright,#d5b66f)]",
        // Smaller than the prompt (text-base/lg/xl) at every breakpoint, and
        // the same uppercase tracking the existing tier/eyebrow pills use, so
        // it reads as a label rather than as an answer or a timer.
        "text-[11px] font-bold uppercase leading-none tracking-[0.14em]",
        className ?? "",
      ].join(" ")}
    >
      {LEVEL_PREFIX} {level}
    </span>
  );
}

export default ChampionLevelBadge;
