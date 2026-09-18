/**
 * RE1 — THE RANKED END SCREEN'S CENTREPIECE.
 *
 * One panel that answers the three questions a finished duel is asked first:
 * who played, what the score was, and where it was won or lost.
 *
 *   [viewer mascot · name · role]     24 — 14     [role · name · opponent mascot]
 *   ─────────────────────────────────────────────────────────────────────────
 *   You        +2 +0 +3 +2 +4 +2 +2 +3 +0 +2
 *               1  2  3  4  5  6  7  8  9 10
 *   Opponent   +0 +2 +2 +0 +2 +0 +2 +3 +2 +0
 *
 * The two role mascots FRAME the scoreline rather than sit beside the grid:
 * they are large enough to be the two competitors, and they never take a
 * column from the ten modules underneath.
 *
 * EVERYTHING HERE IS HANDED IN. The score is the result row's (the
 * `scoreline` node is `RankedScoreline`), the slots are `buildModuleDuel`'s,
 * and the names are what the controller is allowed to show — this component
 * decides nothing about who won, and invents no name for a bot or for an
 * opponent whose name the backend withheld.
 */
import type { ReactNode } from "react";
import { RoleMascot } from "@/components/mascot/RoleMascot";
import {
  NeutralSigil, roleIdentityFor, type RoleIdentity,
} from "@/components/ranked-arena/roleIdentity";
import type { MatchResult } from "@/components/ranked-arena/MatchOverFrame";
import type { ModuleDuelSlot } from "./moduleDuel";
import { RankedModuleDuel } from "./RankedModuleDuel";

export interface ResultDuelist {
  /** What the product is allowed to call this side: a display name, "You",
   *  "Bot" or "Opponent". Never invented here. */
  name: string;
  /** The role the match froze for this seat, or null (a pre-role match). */
  roleId: string | null;
  /** The role label the arena already used; the identity label otherwise. */
  tag?: string | null;
}

/**
 * The mascot, at result-screen size. A seat with a role gets that role's own
 * art (a same-role bot therefore wears the viewer's mascot, mirrored); a seat
 * with `role: null` — a match frozen before roles existed — gets the neutral
 * emblem the live arena uses, and nothing is guessed from its class.
 */
function DuelistFigure({ identity, mirrored }: { identity: RoleIdentity; mirrored: boolean }) {
  const box = "relative aspect-[6/7] w-[4.5rem] sm:w-24 lg:w-32 min-[1500px]:w-36";
  return (
    <span aria-hidden data-testid={`result-duelist-figure${mirrored ? "-opponent" : ""}`}
      data-role={identity.role ?? "none"}
      className="relative flex shrink-0 items-end justify-center">
      {/* Seating glow in the role's own accent. Background only. */}
      <span aria-hidden className="pointer-events-none absolute -inset-x-3 bottom-0 top-3 rounded-2xl"
        style={{ backgroundImage:
          `radial-gradient(60% 55% at 50% 65%, ${identity.accentSoft}, transparent 72%)` }} />
      {identity.role !== null ? (
        <RoleMascot role={identity.role} facing={mirrored ? "left" : "right"}
          fit="cover" loading="eager" className={box}
          data-testid={`result-duelist-mascot${mirrored ? "-opponent" : ""}`} />
      ) : (
        <span data-testid={`result-duelist-neutral${mirrored ? "-opponent" : ""}`}
          className={`${box} flex items-center justify-center`}>
          <span className="flex h-[70%] w-[80%] items-center justify-center rounded-2xl border border-dashed"
            style={{ color: identity.accent, borderColor: `${identity.accent}55` }}>
            <span className="h-1/2 w-1/2 opacity-80"><NeutralSigil /></span>
          </span>
        </span>
      )}
    </span>
  );
}

function Duelist({ duelist, identity, mirrored, emphasis }: {
  duelist: ResultDuelist; identity: RoleIdentity; mirrored: boolean; emphasis: boolean;
}) {
  return (
    <div
      data-testid={`result-contestant${mirrored ? "-opponent" : ""}`}
      data-emphasis={emphasis ? "true" : "false"}
      // Stacked (mascot over name) on a phone, where a third of the width
      // cannot seat both; side by side from `sm`, mirrored for the opponent.
      className={`flex min-w-0 flex-col items-center gap-1 text-center sm:items-end sm:gap-3 ${
        mirrored ? "sm:flex-row-reverse sm:text-right" : "sm:flex-row sm:text-left"}`}
    >
      <DuelistFigure identity={identity} mirrored={mirrored} />
      <div className="w-full min-w-0 sm:w-auto sm:pb-1">
        <div className={`truncate text-sm font-bold leading-tight sm:text-base ${
          emphasis ? "text-slate-50" : "text-slate-300"}`}>
          {duelist.name}
        </div>
        <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: identity.accent }}>
          {duelist.tag ?? identity.label}
        </div>
      </div>
    </div>
  );
}

export function RankedResultDuel({
  viewer, opponent, result, scoreline, slots,
}: {
  viewer: ResultDuelist;
  opponent: ResultDuelist;
  /** The backend's word, for emphasis only. */
  result: MatchResult;
  /** The final scoreline, already built from the result row. */
  scoreline: ReactNode;
  slots: readonly ModuleDuelSlot[];
}) {
  const viewerIdentity = roleIdentityFor(viewer.roleId);
  const opponentIdentity = roleIdentityFor(opponent.roleId);
  return (
    <section aria-label="Duel result" data-testid="ranked-result-duel"
      className="ranked-panel space-y-3 px-3 py-3 sm:px-5 lg:space-y-4 lg:py-4">
      {/* Desktop: mascot · score · mascot on one line. A phone cannot seat the
          scoreline between two mascots — the auto centre track eats the width
          and the duelists collapse to slivers — so there the score takes its
          own row above the two duelists. */}
      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-4">
        <Duelist duelist={viewer} identity={viewerIdentity} mirrored={false}
          emphasis={result !== "defeat"} />
        <div className="order-first col-span-2 self-center sm:order-none sm:col-span-1">
          {scoreline}
        </div>
        <Duelist duelist={opponent} identity={opponentIdentity} mirrored
          emphasis={result !== "victory"} />
      </div>
      {slots.length > 0 && (
        <div className="border-t border-white/10 pt-3">
          <RankedModuleDuel slots={slots}
            viewerLabel={viewer.name} opponentLabel={opponent.name}
            viewerIdentity={viewerIdentity} opponentIdentity={opponentIdentity} />
        </div>
      )}
    </section>
  );
}
