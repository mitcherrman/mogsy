/**
 * Visible data-source and methodology attribution for League Docs / Pro Data
 * pages. AdSense reviewers (and readers) should see where the numbers come
 * from without digging through metadata.
 */

interface DataSourcesNoticeProps {
  /** Include the Leaguepedia esports attribution (pro-play pages). */
  leaguepedia?: boolean;
  /** Optional freshness context, e.g. "Data refreshed with each import run". */
  freshness?: string;
  className?: string;
}

export default function DataSourcesNotice({
  leaguepedia = false,
  freshness,
  className,
}: DataSourcesNoticeProps) {
  return (
    <section
      className={`mt-6 rounded-xl border border-border bg-card/60 p-4 text-xs text-muted-foreground ${className ?? ""}`}
      aria-label="Data sources and methodology"
      data-sources-notice
    >
      <h2 className="text-[10px] uppercase tracking-widest font-bold text-[#c9a84c]">
        Data sources &amp; methodology
      </h2>
      <p className="mt-2">
        Game data and champion assets originate from{" "}
        <a
          href="https://www.riotgames.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          Riot Games
        </a>{" "}
        materials. League of Legends is a trademark of Riot Games, Inc. Mogzy is an unofficial fan
        project and isn't endorsed by Riot Games.
      </p>
      {leaguepedia && (
        <p className="mt-2">
          Professional match records are adapted from{" "}
          <a
            href="https://lol.fandom.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Leaguepedia
          </a>{" "}
          (CC BY-SA). Mogzy performs its own import auditing, normalization, reconciliation, and
          derived-stat calculations on top of those records, so figures here can differ from other
          sites' aggregations.
        </p>
      )}
      <p className="mt-2">
        Mogzy normalizes and cross-checks values across sources and presents its own calculations
        {leaguepedia ? " and coverage summaries" : " and projections"}. Mistakes are ours — use the{" "}
        <a href="/contact" className="text-primary hover:underline">
          contact page
        </a>{" "}
        to report data issues.
      </p>
      {freshness && <p className="mt-2 text-muted-foreground/80">{freshness}</p>}
    </section>
  );
}
