/**
 * PGM1/PM1 — the hub's invitation to More Challenges.
 *
 * The returning player's way to the bonus modes (the Daily's result is the
 * other). PGM1 shipped it as a plain text row; PM1 makes it an INVITATION —
 * a banner with the catalog's own art — while keeping every contract the row
 * had:
 *
 *   - it is ONE link to `/quiz/more-challenges` carrying
 *     `moreChallengesState("leaguecraft")`, and nothing else is clickable;
 *   - it reads nothing and fetches nothing, so the lobby's load is unchanged;
 *   - it does not list the catalog: three of the catalog's own decorative
 *     medallions (`GameArt`, the same compositions the catalog's hero shows)
 *     are atmosphere, not doors. The catalog page still owns every mode, its
 *     status, its pagination, Daily Extras and the player's stats;
 *   - it says, in words, that these modes are unrated.
 *
 * DISTINCT FROM QUICK STUDY ON PURPOSE. Quick Study is the cool navy plate of
 * six study doors; this is a single warm banner — ember and gold over the
 * same navy — so the two read as one Academy activity area with two clearly
 * different kinds of thing in it: study a subject, or go and play.
 *
 * It is a LINK, never a queue: nothing here can start a Ranked match.
 */
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Trophy } from "lucide-react";
import { GameArt } from "@/components/public-modes/gallery/GameArt";
import "@/components/public-modes/gallery/gallery.css";
import type { PublicModeId } from "@/lib/public-modes/contracts";
import { MODE_ACCENT } from "@/lib/public-modes/gallery";
import { MORE_CHALLENGES_ROUTE, moreChallengesState } from "@/lib/public-modes/launch";

/** The two modes the copy names, and one of the new ones. Decorative only. */
const MEDALLIONS: readonly PublicModeId[] = ["time_trial", "survival", "match_grid"];

export default function MoreChallengesInvite({ headingId }: { headingId: string }) {
  return (
    <div
      data-testid="hub-more-challenges-card"
      className="relative overflow-hidden rounded-xl border border-[#c9a84c]/35
        bg-[radial-gradient(90%_160%_at_100%_50%,rgba(236,122,100,0.16)_0%,transparent_55%),radial-gradient(60%_120%_at_0%_0%,rgba(242,193,78,0.10)_0%,transparent_60%),linear-gradient(180deg,rgba(14,22,40,0.95)_0%,rgba(6,12,24,0.94)_100%)]
        shadow-[0_18px_44px_-28px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(240,215,140,0.16)]"
    >
      {/* Ember accent along the leading edge: the one mark that says "play". */}
      <span aria-hidden className="pointer-events-none absolute inset-y-3 left-0 w-[3px] rounded-r bg-gradient-to-b from-[#f2c14e] via-[#ec7a64] to-[#c0584f]" />
      <div className="flex flex-col gap-3 p-3 pl-4 sm:flex-row sm:items-center sm:gap-4 sm:p-4 sm:pl-5">
        {/* The catalog's own medallions. A `mc-gallery` scope because that is
            what their stylesheet is written against; no catalog layout comes
            with it. Decorative: `GameArt` is aria-hidden. */}
        <div aria-hidden="true" className="mc-gallery flex shrink-0 gap-2" data-testid="hub-more-challenges-art">
          {MEDALLIONS.map((id) => (
            <div key={id} style={{ ["--mc-accent" as string]: MODE_ACCENT[id] }}
              className="h-12 w-12 overflow-hidden rounded-xl border border-[#c9a84c]/30 shadow-[0_8px_18px_-10px_rgba(0,0,0,0.9)] sm:h-14 sm:w-14 lg:h-16 lg:w-16">
              <GameArt modeId={id} className="h-full w-full" />
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <p className="ranked-eyebrow flex items-center gap-1.5 !text-[#f2c14e]">
            <Trophy aria-hidden className="h-3 w-3" />
            Bonus modes
          </p>
          <h2 id={headingId} className="ranked-title mt-1 text-xl font-bold leading-none sm:text-2xl">
            More Challenges
          </h2>
          <p className="mt-1.5 text-[13px] leading-snug text-[#d9cfb8]/90">
            Time Trial, Survival and the new bonus modes — extra League games for after your Daily Challenge.
          </p>
          <p data-testid="hub-more-challenges-unrated"
            className="mt-2 inline-flex items-start gap-1.5 rounded-md border border-[#3fb6a8]/30 bg-[#3fb6a8]/[0.07] px-2 py-1 text-[11px] leading-snug text-[#a7e3da]">
            <ShieldCheck aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
            Unrated: none of them change your Daily score or Ranked rating.
          </p>
        </div>

        <Link
          to={MORE_CHALLENGES_ROUTE}
          state={moreChallengesState("leaguecraft")}
          data-testid="hub-more-challenges-link"
          className="group inline-flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-[#f0d78c]/60
            bg-[linear-gradient(180deg,#e8c56a_0%,#c9a84c_55%,#a8862f_100%)] px-5 text-sm font-bold text-[#1a1206] sm:w-auto
            shadow-[0_10px_22px_-12px_rgba(242,193,78,0.7),inset_0_1px_0_rgba(255,244,210,0.6)]
            transition-[transform,filter,box-shadow] duration-150 hover:-translate-y-0.5 hover:brightness-110
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d78c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060c18]
            active:translate-y-0 active:brightness-95 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          Browse More Challenges
          <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </Link>
      </div>
    </div>
  );
}
