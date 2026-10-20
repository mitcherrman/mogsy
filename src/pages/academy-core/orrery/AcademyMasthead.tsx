/**
 * The Orrery's compact Academy identity and its Daily Challenge seal.
 *
 * The Living Hextech Orrery is the page's subject, so the Academy introduces
 * itself with a small engraved crest instead of a website header, and the
 * Daily Challenge is a Hextech sigil (gold bezel, slow rune ring, a crystal
 * holding the play glyph) set on an engraved plaque with a passing sheen, not a
 * rectangular button. Its motion is subtle and stops under reduced motion. Ranked is disabled and is not offered here at all.
 *
 *   full (>= 1024 px)  crest above the seal, at the head of the left column
 *   stacked            one row above the instrument: crest left, seal right
 *   short landscape    crest above the seal, beside the instrument
 *
 * Styles: ./academy-core-masthead.css, imported by AcademyCorePage AFTER the
 * Orrery stylesheet (it overrides some stacked-layout rules at equal specificity).
 *
 * Contracts kept from the previous header: the level-1 heading "Mogzy
 * Academy" (#acore-title labels the hero), the Daily link's accessible name
 * ("Play Daily Challenge" / "Resume Daily Challenge"), its router state, its
 * entry analytics (`academy_core_daily_button`), its intent prefetch and the `academy-core-daily` / `academy-core-shortcuts` ids.
 */
import { Link } from "react-router-dom";

import { trackDailyEntry } from "@/lib/analytics/dailyEntry";
import { DAILY_START_STATE } from "@/lib/daily-challenge/run/entry";
import { prefetchRoute } from "@/lib/route-prefetch";
import { DAILY_ROUTE } from "@/pages/academy-core/academy-core-destinations";

export default function AcademyMasthead({ dailyResume }: { dailyResume: boolean }) {
  return (
    <div className="o35-masthead" data-testid="academy-core-masthead">
      <header className="o35-brand o35-crest">
        <svg className="o35-crest-mark" viewBox="0 0 40 44" aria-hidden focusable="false">
          <path className="o35-crest-hex" d="M20 2 37 11.5v21L20 42 3 32.5v-21Z" />
          <path className="o35-crest-hex-in" d="M20 7.5 32.2 14.5v15L20 36.5 7.8 29.5v-15Z" />
          <path className="o35-crest-gem" d="M20 12.5 26.4 22 20 31.5 13.6 22Z" />
          <path className="o35-crest-glint" d="M20 12.5 23.2 22 20 31.5" />
        </svg>
        <div className="o35-crest-text">
          <p className="acore-eyebrow o35-crest-eyebrow">Mogzy&rsquo;s Hextech Workshop</p>
          <h1 id="acore-title" className="o35-title">
            <span className="o35-title-pre">Mogzy</span> <span className="o35-title-main">Academy</span>
          </h1>
        </div>
      </header>

      <div className="acore-shortcuts o35-shortcuts" data-testid="academy-core-shortcuts">
        <Link
          to={DAILY_ROUTE}
          state={DAILY_START_STATE}
          className="o35-seal"
          data-resume={dailyResume ? "true" : "false"}
          data-testid="academy-core-daily"
          onClick={() => trackDailyEntry("academy_core_daily_button")}
          onPointerEnter={() => prefetchRoute(DAILY_ROUTE, { intent: true })}
          onFocus={() => prefetchRoute(DAILY_ROUTE, { intent: true })}
        >
          {/* the engraved plaque (gold edge, dark Hextech glass, a passing sheen) */}
          <span className="o35-seal-plate" aria-hidden>
            <span className="o35-seal-sheen" />
          </span>
          {/* the sigil: gold bezel, a slow rune ring, a Hextech crystal holding the play glyph */}
          <svg className="o35-seal-mark" viewBox="0 0 64 64" aria-hidden focusable="false">
            <defs>
              <linearGradient id="o35-sigil-gold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff3cc" />
                <stop offset="0.45" stopColor="#e2bf6a" />
                <stop offset="1" stopColor="#8a6424" />
              </linearGradient>
              <radialGradient id="o35-sigil-core" cx="50%" cy="38%" r="70%">
                <stop offset="0" stopColor="#f2fdff" />
                <stop offset="0.3" stopColor="#8fe0ff" />
                <stop offset="0.7" stopColor="#2a62c4" />
                <stop offset="1" stopColor="#0c2152" />
              </radialGradient>
              <radialGradient id="o35-sigil-aura" cx="50%" cy="50%" r="50%">
                <stop offset="0.55" stopColor="#7fd4ff" stopOpacity="0.55" />
                <stop offset="1" stopColor="#7fd4ff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle className="o35-sigil-aura" cx="32" cy="32" r="32" />
            <circle className="o35-sigil-bezel" cx="32" cy="32" r="29" />
            <circle className="o35-sigil-notches" cx="32" cy="32" r="27.2" pathLength="120" />
            <circle className="o35-sigil-well" cx="32" cy="32" r="25.4" />
            <g className="o35-sigil-runes">
              <circle className="o35-sigil-rune-ring" cx="32" cy="32" r="22.4" pathLength="100" />
              <path className="o35-sigil-rune" d="M32 7.4 33.7 9.6 32 11.8 30.3 9.6Z" />
              <path className="o35-sigil-rune" d="M32 7.4 33.7 9.6 32 11.8 30.3 9.6Z" transform="rotate(120 32 32)" />
              <path className="o35-sigil-rune" d="M32 7.4 33.7 9.6 32 11.8 30.3 9.6Z" transform="rotate(240 32 32)" />
            </g>
            <path className="o35-sigil-crystal" d="M32 16.5 45.4 24.25v15.5L32 47.5 18.6 39.75v-15.5Z" />
            <path className="o35-sigil-facet" d="M32 16.5V32L45.4 24.25M32 32 18.6 24.25" />
            <path className="o35-sigil-play" d="M28.2 25.2 40 32 28.2 38.8Z" />
          </svg>
          <span className="o35-seal-text">
            <span className="o35-seal-kicker">
              <span className="o35-seal-rune" aria-hidden />
              {dailyResume ? "Resume" : "Play"}
              <span className="o35-seal-rune" aria-hidden />
            </span>{" "}
            <span className="o35-seal-label">Daily Challenge</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
