/**
 * Canonical Ranked combatant presentation (F1 shared arena, Phase B).
 *
 * Stateless and mode-neutral: renders a CombatantView plus neutral round
 * status. Shows only pre-reveal-safe information — never an answer or
 * ability identity. Visual language follows the ranked prototype's
 * PlayerPanel / E2's combatant panel (HP loud, XP quiet), with meter
 * semantics and reduced-motion-safe transitions.
 *
 * QUIZ1 Phase 11 — this is one of the arena's three COLUMNS, not a card in a
 * rail. Four things changed and each is opt-in through a prop, so every
 * existing caller (the staff duel, the inspector, the match-over frame) keeps
 * exactly the panel it had:
 *
 *  * `progressionEnabled={false}` removes the level badge and the XP meter
 *    OUTRIGHT — no empty track, no "Lv —" placeholder. R1 already froze
 *    `level_thresholds=(0,)` on these matches, so the meter was rendering a
 *    permanently-full bar and the words "0 xp · Level 1 (max)" about a system
 *    the match does not have.
 *  * the identity block leads with the ROLE crest (see `roleIdentity.tsx`),
 *    which supersedes the legacy class portrait whenever the match froze a
 *    role. Class art is still the fallback for a pre-R1 match and is still
 *    the only thing `classId` reaches.
 *  * `damage` draws a compact recent-damage trail directly under the HP bar.
 *  * `outcome` lets the reveal beat resolve the column — CORRECT / INCORRECT /
 *    TIMED OUT with an icon AND a word, never colour alone — in the same
 *    reserved row the neutral status chips occupy, so nothing moves.
 */
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Hourglass, Lock, ShieldCheck, XCircle } from "lucide-react";
import { CombatantView, ResolvedCombatantView } from "@/lib/ranked-core/viewTypes";
import type { DamageHistoryEntry, MascotReaction } from "@/pages/quiz-ranked/rankedViews";
import { ClassIdentity, classIdentityFor } from "./classIdentity";
import { RoleCrest, roleIdentityFor } from "./roleIdentity";

/**
 * THE ONE SIDE RULE (AI1 Phase 2B follow-up).
 *
 * A duelist column is either the player's or the opponent's, and the opponent's
 * is the horizontal REFLECTION of the player's — not a second layout that
 * happens to look similar. Every row in the panel derives its alignment from
 * this one function, so a row cannot be mirrored in one place and forgotten in
 * another, which is exactly how the HP row, the status chips and the verdict
 * ended up left-aligned on both columns while everything around them flipped.
 *
 * `side` is read off the combatant rather than passed in, so no caller can put
 * a column on the wrong side of the arena, and standalone users of the meters
 * below get the correct alignment for free.
 */
export function isMirroredSide(combatant: CombatantView): boolean {
  return combatant.side === "opponent";
}

/**
 * Reflect a row of two groups. `flex-row-reverse` swaps which END each group
 * sits at without reversing anything a reader reads left-to-right: "150 / 170"
 * is still "150 / 170", it has just moved to the other side of the row.
 */
const mirrorRow = (mirrored: boolean) => (mirrored ? "flex-row-reverse" : "");

/**
 * Reflect a row whose contents are a SEQUENCE. Position mirrors; order does
 * not. The damage trail is oldest-first and the status chips are answer-then-
 * ability, and a reflection must not turn either of those round.
 */
const mirrorAlign = (mirrored: boolean) => (mirrored ? "justify-end" : "");

/** HP meter. maxHp null = unknown: absolute number only, no proportion. */
export function HealthMeter({ combatant }: { combatant: CombatantView }) {
  const { hp, maxHp, name } = combatant;
  const mirrored = isMirroredSide(combatant);
  const pct = maxHp !== null && maxHp > 0 ? Math.min(100, Math.round((hp / maxHp) * 100)) : null;
  return (
    <div data-testid={`hp-${combatant.playerId}`}>
      <div className={`flex items-baseline justify-between mb-1 ${mirrorRow(mirrored)}`}>
        <span className="text-xs font-semibold">HP</span>
        <span className="tabular-nums text-base font-bold leading-none">
          {hp}
          {maxHp !== null && (
            <span className="text-xs font-medium text-muted-foreground"> / {maxHp}</span>
          )}
        </span>
      </div>
      {pct !== null ? (
        <div
          role="meter"
          aria-label={`${name} HP`}
          aria-valuenow={hp}
          aria-valuemin={0}
          aria-valuemax={maxHp!}
          className="h-3 rounded-full bg-muted overflow-hidden border border-border"
        >
          <div
            className={`h-full rounded-full transition-all duration-700 motion-reduce:transition-none ${
              pct > 50 ? "bg-emerald-500" : pct > 25 ? "bg-amber-500" : "bg-destructive"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : (
        // Unknown maximum: no proportional bar — we never invent a max HP.
        <div
          className="text-[11px] text-muted-foreground"
          aria-label={`${name} HP ${hp}, maximum unknown`}
        >
          Max HP unavailable
        </div>
      )}
    </div>
  );
}

/** Quiet XP progression bar; thresholds are supplied, never computed here. */
export function ExperienceMeter({ combatant }: { combatant: CombatantView }) {
  const { xp, level, currentLevelThreshold, nextLevelThreshold, playerId } = combatant;
  const mirrored = isMirroredSide(combatant);
  const atMax = nextLevelThreshold === null;
  let pct: number | null = null;
  if (!atMax && currentLevelThreshold !== null && nextLevelThreshold > currentLevelThreshold) {
    pct = Math.min(
      100,
      Math.max(
        0,
        Math.round(((xp - currentLevelThreshold) / (nextLevelThreshold - currentLevelThreshold)) * 100),
      ),
    );
  }
  return (
    <div data-testid={`xp-${playerId}`}>
      <div className={`flex justify-between text-[11px] text-muted-foreground mb-1 ${
        mirrorRow(mirrored)}`}>
        <span id={`xp-label-${playerId}`}>XP</span>
        <span className="tabular-nums" aria-labelledby={`xp-label-${playerId}`}>
          {atMax
            ? `${xp} xp · Level ${level} (max)`
            : nextLevelThreshold !== null
              ? `${xp} / ${nextLevelThreshold} xp`
              : `${xp} xp`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-violet-400/70 transition-all duration-700 motion-reduce:transition-none"
          style={{ width: `${atMax ? 100 : (pct ?? 0)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Neutral round-status chips: submitted / thinking, ability window state.
 * Announced politely; never reveals WHICH answer or ability was chosen.
 */
function RoundStatus({ combatant, showAbility = true }:
{ combatant: CombatantView; showAbility?: boolean }) {
  const { hasSubmitted, abilityWindow, hasAbilitySelected, name } = combatant;
  const mirrored = isMirroredSide(combatant);
  // ONE reserved row, and each badge holds a fixed icon slot.
  //
  // Phase 2 compact layout: the ability chip's labels are short enough
  // ("Armed" / "Picking…" / "Locked") that both chips always fit one line in
  // the rail, so the reserved height is a single row now instead of two.
  // The answer chip keeps its full wording — "Answer locked" is load-bearing
  // copy (tutorial + player comprehension); the ability chip is disambiguated
  // by its aria-label rather than a longer visible label. The icon still
  // occupies the same 12px whether or not it is drawn.
  //
  // RA10: the chips are compacted (11px / px-1.5) because the lg rail is now
  // 14rem — at default Badge density the WIDEST pairing ("Answer locked" +
  // "Picking…") wrapped while narrower pairings did not, which made the panel
  // height depend on round state. At this density every state pairing fits
  // one row in a 14rem rail.
  return (
    <div
      className={`flex min-h-7 flex-wrap content-start gap-1.5 ${mirrorAlign(mirrored)}`}
      role="status"
      aria-label={`${name} round status`}
      data-testid={`status-${combatant.playerId}`}
    >
      <Badge variant={hasSubmitted ? "default" : "secondary"} className="gap-1 px-1.5 text-[11px]">
        <span aria-hidden className="inline-flex h-3 w-3 shrink-0 items-center justify-center">
          {hasSubmitted ? <Lock className="h-3 w-3" /> : <Hourglass className="h-3 w-3" />}
        </span>
        {hasSubmitted ? "Answer locked" : "Thinking…"}
      </Badge>
      {showAbility && abilityWindow !== null && (
        <Badge variant={abilityWindow === "locked" ? "default" : "secondary"} className="gap-1 px-1.5 text-[11px]"
          aria-label={abilityWindow === "locked" ? "Ability locked"
            : hasAbilitySelected ? "Ability armed" : "Choosing ability"}>
          <span aria-hidden className="inline-flex h-3 w-3 shrink-0 items-center justify-center">
            {abilityWindow === "locked" ? <Lock className="h-3 w-3" />
              : hasAbilitySelected ? <CheckCircle2 className="h-3 w-3" /> : null}
          </span>
          {abilityWindow === "locked" ? "Locked"
            : hasAbilitySelected ? "Armed" : "Picking…"}
        </Badge>
      )}
    </div>
  );
}

/**
 * RA10 — class mascot portrait (framed bust). DECORATIVE by contract: the tag
 * line already names the class, so the image is aria-hidden and a missing or
 * unknown class degrades to a monogram in the very same frame — the header's
 * geometry never depends on which class (or whether any) arrived.
 */
function ClassPortrait({
  identity,
  fallbackLabel,
  mirrored,
}: {
  identity: ClassIdentity;
  fallbackLabel: string;
  mirrored: boolean;
}) {
  return (
    <span
      aria-hidden
      data-testid="class-portrait"
      // Hidden on the narrow mobile cards, where 48px of art squeezed the
      // name to a single letter — the tag row shows a mini-crest there
      // instead, so the class stays visible at every width. On the RA11 wide
      // stage (17rem rails) the bust takes one step up; the step is
      // viewport-driven, never state-driven, so panel geometry stays constant
      // within any given viewport.
      className="relative hidden h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#0b1727] sm:block min-[1500px]:h-14 min-[1500px]:w-14"
      style={{
        boxShadow: `inset 0 0 0 1px ${identity.accent}33, inset 0 -8px 12px -8px rgba(0,0,0,0.8)`,
        backgroundImage: `radial-gradient(80% 70% at 50% 30%, ${identity.accentSoft}, transparent 75%)`,
      }}
    >
      {identity.portrait ? (
        // The class art is a painted 2:3 card (its backdrop is baked in), so
        // the frame shows a cover crop biased toward the figure's head rather
        // than a zoomed cutout — zooming read as noise at 48px. Opponent art
        // mirrors so both duelists face the arena centre.
        <img
          src={identity.portrait}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className={`absolute inset-0 h-full w-full select-none object-cover [object-position:50%_30%] ${
            mirrored ? "-scale-x-100" : ""
          }`}
        />
      ) : (
        <span
          className="absolute inset-0 flex items-center justify-center text-base font-black uppercase"
          style={{ color: identity.accent }}
        >
          {fallbackLabel.charAt(0) || "?"}
        </span>
      )}
    </span>
  );
}

/**
 * The recent-damage trail: what happened to THIS player's HP, newest last.
 *
 * A history, not a log. It is capped, it renders no round in which nothing
 * happened (see `projectDamageHistory`), and it never scrolls — three to five
 * chips is the whole surface. The newest chip is emphasised for one beat and
 * then reads like the rest; under reduced motion it simply arrives.
 *
 * The row is ALWAYS present (`min-h`), so the first hit of a match cannot add
 * a row to one column and not the other.
 */
export function DamageTrail({
  entries,
  playerId,
  mirrored,
}: {
  entries: DamageHistoryEntry[];
  playerId: string;
  mirrored: boolean;
}) {
  const newest = entries.length > 0 ? entries[entries.length - 1] : null;
  return (
    <div
      data-testid={`damage-trail-${playerId}`}
      aria-label="Recent damage"
      className={`flex min-h-[1.5rem] flex-wrap items-center gap-1 ${mirrorAlign(mirrored)}`}
    >
      {entries.length === 0 ? (
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
          No damage yet
        </span>
      ) : (
        entries.map((e) => (
          <span
            key={e.roundNumber}
            data-testid={`damage-chip-${playerId}-${e.roundNumber}`}
            data-kind={e.kind}
            data-newest={e === newest ? "true" : "false"}
            title={`Round ${e.roundNumber}`}
            className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] font-semibold tabular-nums ${
              e.kind === "blocked"
                ? "bg-sky-400/10 text-sky-300"
                : "bg-destructive/15 text-[#e2757b]"
            } ${e === newest
              ? "ring-1 ring-inset ring-current/50 animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none"
              : "opacity-70"}`}
          >
            {e.kind === "blocked" ? (
              <>
                <ShieldCheck aria-hidden className="h-3 w-3 shrink-0" />
                <span className="sr-only">
                  Round {e.roundNumber}: {e.amount} absorbed, HP {e.hpAfter}
                </span>
                <span aria-hidden>{e.amount}</span>
              </>
            ) : (
              <>
                <span className="sr-only">
                  Round {e.roundNumber}: {e.amount} damage taken, HP {e.hpAfter}
                </span>
                <span aria-hidden>-{e.amount}</span>
              </>
            )}
          </span>
        ))
      )}
    </div>
  );
}

const OUTCOME_STATE: Record<
  ResolvedCombatantView["outcome"],
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  correct: {
    label: "CORRECT",
    className: "border-emerald-400/60 bg-emerald-400/10 text-emerald-300",
    Icon: CheckCircle2,
  },
  incorrect: {
    label: "INCORRECT",
    className: "border-destructive/60 bg-destructive/10 text-[#e2757b]",
    Icon: XCircle,
  },
  timed_out: {
    label: "TIMED OUT",
    className: "border-white/20 bg-white/5 text-muted-foreground",
    Icon: Hourglass,
  },
};

/**
 * The reveal state for one column. Occupies the SAME reserved row the neutral
 * status chips occupy, so resolving a round moves nothing on the page.
 *
 * Icon AND word, never colour alone. `role="status"` announces it once.
 */
function OutcomeState({
  outcome,
  damageDealt,
  playerId,
  name,
  mirrored,
}: {
  outcome: ResolvedCombatantView["outcome"];
  damageDealt: number | null;
  playerId: string;
  name: string;
  /** From `isMirroredSide` — the verdict reflects with everything else. */
  mirrored: boolean;
}) {
  const state = OUTCOME_STATE[outcome];
  const { Icon } = state;
  return (
    <div
      role="status"
      aria-label={`${name} ${state.label.toLowerCase()}`}
      data-testid={`outcome-${playerId}`}
      data-outcome={outcome}
      className={`flex min-h-7 items-center gap-1.5 rounded-md border px-1.5 py-0.5 ${
        mirrorRow(mirrored)} ${state.className}`}
    >
      <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span className="text-[11px] font-black uppercase tracking-[0.12em]">
        {state.label}
      </span>
      {damageDealt !== null && damageDealt > 0 && (
        <span
          data-testid={`outcome-damage-${playerId}`}
          // The auto margin has to change SIDE with the row: in a reversed row
          // `ml-auto` still pushes toward the physical right, which would park
          // the damage number back against the verdict instead of across from
          // it.
          className={`${mirrored ? "mr-auto" : "ml-auto"} whitespace-nowrap text-[11px] font-black tabular-nums text-[#e8c97a]`}
        >
          {damageDealt} DMG
        </span>
      )}
    </div>
  );
}

export function CombatantPanel({
  combatant,
  showRoundStatus = true,
  progressionEnabled = true,
  damage,
  outcome = null,
  damageDealt = null,
  reaction = null,
}: {
  combatant: CombatantView;
  /** Controllers may hide status chips (e.g. between rounds). */
  showRoundStatus?: boolean;
  /**
   * R1: does this match have a level/XP layer at all? Defaults to TRUE so every
   * pre-Phase-11 caller is byte-identical. False removes the level badge and
   * the XP meter entirely — the row is reclaimed, not reserved.
   */
  progressionEnabled?: boolean;
  /** Recent HP changes for this player, oldest first. Absent = no trail row. */
  damage?: DamageHistoryEntry[];
  /** Reveal-beat verdict; null = the neutral Thinking/Locked state. */
  outcome?: ResolvedCombatantView["outcome"] | null;
  /** Damage this player DEALT in the revealed round; shown beside the verdict. */
  damageDealt?: number | null;
  /**
   * AI1 Phase 2 — the mascot reaction for the round being revealed, or null.
   *
   * The panel names an INTENT and passes it to the crest; it owns no motion.
   * Built by `projectMascotReactions` off the same authoritative settlement
   * the HP bar, the trail and the verdict read, so a mascot moves only when
   * the backend actually settled damage.
   */
  reaction?: MascotReaction | null;
}) {
  const { side, name, tag } = combatant;
  const role = roleIdentityFor(combatant.roleId);
  // Class art is the FALLBACK, reached only when the match froze no role. R1
  // forbids deriving one from the other, so this is a branch, never a mapping.
  const classIdentity = classIdentityFor(combatant.classId);
  const accent = role.role ? role.accent : classIdentity.accent;
  // The opponent column is the horizontal REFLECTION of the player's, not a
  // second layout that resembles it: one structure, one rule, and every row
  // below takes its alignment from this. `side` survives only where the two
  // columns genuinely differ in KIND rather than in direction — the card's
  // border and the level badge are blue for you and red for them on both
  // columns, and a mirror must not swap those.
  const mirrored = isMirroredSide(combatant);
  return (
    <section
      aria-label={`${name} panel`}
      data-testid={`combatant-${combatant.playerId}`}
      data-progression={progressionEnabled ? "true" : "false"}
      className={`relative flex h-full flex-col gap-2 rounded-xl border-2 bg-card p-3 ring-1 ring-inset ring-white/5 transition-shadow duration-300 motion-reduce:transition-none ${
        side === "player"
          ? "border-primary/60 shadow-[0_0_24px_-12px_hsl(var(--primary)/0.55)]"
          : "border-destructive/50 shadow-[0_0_24px_-12px_hsl(var(--destructive)/0.45)]"
      } ${outcome === "correct" ? "ring-2 ring-emerald-400/40"
        : outcome === "incorrect" ? "ring-2 ring-destructive/40" : ""}`}
    >
      {/* AI1 Phase 2B — the role mascot gets the top of the column to itself.
          It used to ride inside the 56px crest at the head of the identity
          row, which is exactly what made a character read as an icon. The
          slot takes its height from the mascot's aspect at this column width,
          and nothing below it moves while the mascot animates: every keyframe
          in there is a transform, and transforms do not lay out.

          The arena states only WHERE this goes, WHICH role, WHICH way it
          faces, WHEN something happened, and that it is touchable. Every
          distance, duration, easing curve and keyframe — including the whole
          of the click reaction — stays in `RoleMascot`. */}
      {role.role && (
        <RoleCrest identity={role} mirrored={mirrored} size="stage" interactive
          action={reaction?.action ?? null} actionId={reaction?.actionId ?? null} />
      )}
      {/* Identity row. With the mascot on its own stage above, the name and
          the role sit on ONE line, outer edge to inner edge, so the two
          columns read as a facing pair. The pre-role class fallback keeps its
          original stacked header and its framed bust, untouched. */}
      <header className={`flex items-center gap-2.5 min-w-0 ${mirrored ? "flex-row-reverse" : ""}`}>
        {!role.role && (
          <ClassPortrait identity={classIdentity} fallbackLabel={tag ?? combatant.classId}
            mirrored={mirrored} />
        )}
        <div className={`min-w-0 ${
          role.role ? "flex flex-1 items-baseline justify-between gap-2" : ""} ${
          role.role && mirrored ? "flex-row-reverse" : ""} ${mirrored ? "text-right" : ""}`}>
          <div className="min-w-0 font-bold leading-tight truncate">{name}</div>
          {tag && (
            <div
              data-testid={`identity-tag-${combatant.playerId}`}
              // `justify-between` on the row (not a margin) is what puts the
              // name and the role at OPPOSITE ends. A margin-left:auto reads
              // as "push right" in both rows, which on the mirrored column
              // pushed the role over to sit beside the name instead of across
              // from it — the two columns stopped being each other's mirror.
              className={`flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] ${
                role.role ? "shrink-0" : ""} ${mirrored ? "justify-end" : ""}`}
              style={{ color: accent }}
            >
              {!role.role && classIdentity.portrait && (
                // Mobile stand-in for the framed class bust (hidden <sm). Role
                // crests are SVG and need no small-screen substitute.
                <img
                  src={classIdentity.portrait}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="h-4 w-4 shrink-0 select-none rounded-[3px] object-cover [object-position:50%_22%] sm:hidden"
                />
              )}
              <span className="truncate">{tag}</span>
            </div>
          )}
        </div>
        {/* R1: a no-progression match has no level, so there is no badge and
            no reserved slot for one. */}
        {progressionEnabled && (
          <Badge variant="outline"
            className={`${mirrored ? "mr-auto" : "ml-auto"} shrink-0 tabular-nums ${
              side === "player" ? "border-primary/50 text-primary" : "border-destructive/50 text-destructive"
            }`}>
            Lv {combatant.level}
          </Badge>
        )}
      </header>
      <HealthMeter combatant={combatant} />
      {damage && (
        <div className="flex-1">
          <DamageTrail entries={damage} playerId={combatant.playerId} mirrored={mirrored} />
        </div>
      )}
      {progressionEnabled && <ExperienceMeter combatant={combatant} />}
      {/* ONE reserved row: the reveal verdict REPLACES the neutral chips in
          place, so resolving a round shifts nothing. */}
      {outcome !== null ? (
        <OutcomeState outcome={outcome} damageDealt={damageDealt}
          playerId={combatant.playerId} name={name} mirrored={mirrored} />
      ) : (
        showRoundStatus && (
          // R1: the ability chip is part of the ability layer, so it goes with
          // it. Without this the panel still announced "Picking…" about a
          // system the match does not have.
          <RoundStatus combatant={combatant} showAbility={progressionEnabled} />
        )
      )}
    </section>
  );
}
