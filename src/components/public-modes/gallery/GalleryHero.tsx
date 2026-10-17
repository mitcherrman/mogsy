/**
 * MC-UX1/MC-UX2 — the hub's compact hero: what this page is (optional,
 * unrated games), the Random button beside the title, and the player's own
 * stats beneath. The collections are paged below it (CategoryPager).
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { PublicModeId } from "@/lib/public-modes/contracts";
import { MODE_ACCENT } from "@/lib/public-modes/gallery";
import { GameArt } from "./GameArt";

const MEDALLIONS: readonly PublicModeId[] = ["match_grid", "perfect_timing", "reconstruct"];

export function GalleryHero({ total, ready, action, children }: {
  total: number | null;
  /** Cards playable right now; null while the catalog loads. */
  ready: number | null;
  /** Beside the title (MC-UX2: Random). */
  action?: ReactNode;
  /** Beneath the title (MC-UX2: the player's stats). */
  children?: ReactNode;
}) {
  return (
    <header className="mc-hero px-4 pb-4 pt-2 sm:px-6 sm:pb-5 sm:pt-3" data-testid="more-challenges-hero">
      <Link
        to="/quiz"
        data-testid="more-challenges-back"
        className="-ml-2 inline-flex min-h-[44px] items-center gap-1.5 rounded px-2 text-[13px] text-[color:var(--ranked-muted)]
          hover:text-[color:var(--ranked-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(201,168,76,0.6)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Leaguecraft
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-5">
          <div className="min-w-0">
            <div className="ranked-eyebrow">Leaguecraft · Bonus games</div>
            <h1 className="ranked-title mt-1.5 text-[1.65rem] font-bold leading-none min-[400px]:text-[2rem] sm:text-5xl">More Challenges</h1>
            <p className="mt-2.5 max-w-xl text-[14px] leading-snug text-[color:var(--ranked-text)] opacity-90 sm:text-[15px]">
              {total ? `${total} optional League games` : "Optional League games"} for extra practice.{" "}
              <span className="text-[color:var(--ranked-muted)]">
                Unrated: they never change your Daily score or Ranked rating.
              </span>
            </p>
            {ready !== null && (
              <p className="mt-1.5 text-xs text-[color:var(--ranked-muted)]" data-testid="more-challenges-count">
                {ready} ready to play now
              </p>
            )}
          </div>
          <div className="mc-hero-medallions hidden flex-none 2xl:grid" aria-hidden="true">
            {MEDALLIONS.map((id) => (
              <div key={id} style={{ ["--mc-accent" as string]: MODE_ACCENT[id] }}>
                <GameArt modeId={id} />
              </div>
            ))}
          </div>
        </div>
        {action}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </header>
  );
}
