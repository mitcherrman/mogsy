/**
 * MC-UX1 — the gallery's compact hero: what this page is, that the games are
 * optional and unrated, and a jump to each collection.
 */
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { PublicModeId } from "@/lib/public-modes/contracts";
import { MODE_ACCENT, type GalleryGroup } from "@/lib/public-modes/gallery";
import { GameArt } from "./GameArt";

const MEDALLIONS: readonly PublicModeId[] = ["match_grid", "perfect_timing", "reconstruct"];

export function GalleryHero({ groups, total, ready }: {
  groups: GalleryGroup[] | null;
  total: number | null;
  /** Cards playable right now; null while the catalog loads. */
  ready: number | null;
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

      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <div className="ranked-eyebrow">Leaguecraft · Bonus games</div>
          <h1 className="ranked-title mt-1.5 text-[1.65rem] font-bold leading-none min-[400px]:text-[2rem] sm:text-5xl">More Challenges</h1>
          <p className="mt-2.5 max-w-xl text-[14px] leading-snug text-[color:var(--ranked-text)] opacity-90 sm:text-[15px]">
            {total ? `${total} optional League games` : "Optional League games"} for extra practice.{" "}
            <span className="text-[color:var(--ranked-muted)]">
              Unrated: they never change your Daily score or Ranked rating.
            </span>
          </p>
        </div>
        <div className="mc-hero-medallions hidden flex-none md:grid" aria-hidden="true">
          {MEDALLIONS.map((id) => (
            <div key={id} style={{ ["--mc-accent" as string]: MODE_ACCENT[id] }}>
              <GameArt modeId={id} />
            </div>
          ))}
        </div>
      </div>

      {groups && groups.length > 0 && (
        <nav aria-label="Game collections" className="mt-3.5 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
          {groups.map((g) => (
            <a key={g.id} href={`#mc-${g.id}`} className="mc-jump" data-testid={`more-challenges-jump-${g.id}`}
              onClick={(e) => {
                const el = document.getElementById(`mc-${g.id}`);
                if (!el) return;
                e.preventDefault();
                el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
              }}>
              {g.title}
              <span className="mc-jump-count">{g.modes.length}</span>
            </a>
          ))}
          {ready !== null && (
            <span className="col-span-3 text-right text-xs text-[color:var(--ranked-muted)] sm:ml-auto" data-testid="more-challenges-count">
              {ready} ready to play now
            </span>
          )}
        </nav>
      )}
    </header>
  );
}
