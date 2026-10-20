/**
 * The Orrery's compact Academy identity and its Daily Challenge seal.
 *
 * The Living Hextech Orrery is the page's subject, so the Academy introduces
 * itself with a small engraved crest instead of a website header, and the
 * Daily Challenge is a Hextech seal (a gold medallion on an engraved plate),
 * not a rectangular button. Ranked is disabled and is not offered here at all.
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
 * intent prefetch and the `academy-core-daily` / `academy-core-shortcuts` ids.
 */
import { Link } from "react-router-dom";

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
          onPointerEnter={() => prefetchRoute(DAILY_ROUTE, { intent: true })}
          onFocus={() => prefetchRoute(DAILY_ROUTE, { intent: true })}
        >
          <svg className="o35-seal-mark" viewBox="0 0 56 56" aria-hidden focusable="false">
            <circle className="o35-seal-disc" cx="28" cy="28" r="26.5" />
            <circle className="o35-seal-ticks" cx="28" cy="28" r="23" pathLength="96" />
            <path className="o35-seal-hex" d="M28 10.5 43.2 19.25v17.5L28 45.5 12.8 36.75v-17.5Z" />
            <path className="o35-seal-play" d="M24 20.5 36.5 28 24 35.5Z" />
          </svg>
          <span className="o35-seal-text">
            <span className="o35-seal-kicker">{dailyResume ? "Resume" : "Play"}</span>{" "}
            <span className="o35-seal-label">Daily Challenge</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
