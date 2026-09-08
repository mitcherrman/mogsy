// ---------------------------------------------------------------------------
// Champion pools, summarised before they are tabulated.
//
// WHAT THE CATEGORIES ARE ALLOWED TO SAY. Every heading here names its own
// SORT, not a judgement:
//
//   "Most played"   — games, descending.
//   "Most recent"   — last_played_at, descending.
//   "Best record"   — win rate, descending, over champions with at least
//                     MIN_GAMES_FOR_RATE games. The threshold is printed in
//                     the heading, so the rule is on screen rather than in
//                     someone's head.
//
// There is deliberately no "signature", "comfort" or "pocket" pick. Those are
// interpretations, and none of them has a defined rule in this product yet;
// inventing one here would put a claim on the page that nothing backs. If we
// later DEFINE one, it belongs in the backend beside the rest of the
// demonstrated-pick semantics, not in a component.
//
// A banned champion stays in every view, struck through. Seeing that you
// removed something he plays is the entire point of the ban control, so
// filtering it out would destroy the feature.
// ---------------------------------------------------------------------------

import { useMemo } from "react";

import { formatDate, formatRate, formatRecord } from "@/lib/pro-play/researchApi";
import type { DemonstratedPool, PoolChampion } from "@/lib/pro-play/matchupApi";

import { ChampionIcon } from "./DossierMedia";
import { Disclosure } from "./DossierChrome";

/** Below this, a win rate is noise rather than a record. Printed on screen. */
export const MIN_GAMES_FOR_RATE = 5;

export type PoolCategoryId = "played" | "recent" | "record";

export interface PoolCategory {
  id: PoolCategoryId;
  label: string;
  champions: PoolChampion[];
}

/**
 * The three orderings, each already trimmed to `size`. Pure, so the tests can
 * pin the rules without rendering anything.
 */
export function poolCategories(champions: PoolChampion[], size: number): PoolCategory[] {
  const played = [...champions].sort((a, b) => b.games - a.games || a.key.localeCompare(b.key));

  const dated = champions.filter((c) => c.last_played_at);
  const recent = [...dated].sort(
    (a, b) => (b.last_played_at ?? "").localeCompare(a.last_played_at ?? "") || b.games - a.games,
  );

  const rated = champions.filter((c) => c.win_rate !== null && c.games >= MIN_GAMES_FOR_RATE);
  const record = [...rated].sort(
    (a, b) => (b.win_rate ?? 0) - (a.win_rate ?? 0) || b.games - a.games,
  );

  const out: PoolCategory[] = [{ id: "played", label: "Most played", champions: played.slice(0, size) }];
  // A category with nothing to say is omitted rather than shown empty: an
  // empty "Most recent" would read as "he has not played recently", which is
  // a claim about the player instead of about our dates.
  if (recent.length) out.push({ id: "recent", label: "Most recent", champions: recent.slice(0, size) });
  if (record.length) {
    out.push({
      id: "record",
      label: `Best record (${MIN_GAMES_FOR_RATE}+ games)`,
      champions: record.slice(0, size),
    });
  }
  return out;
}

function ChampionChip({ champion }: { champion: PoolChampion }) {
  return (
    <span
      className={["dossier-champ-chip", champion.banned ? "is-banned" : ""].join(" ")}
      data-testid={`champ-chip-${champion.key}`}
      title={champion.banned ? `${champion.key} — banned in this selection` : champion.key}
    >
      <ChampionIcon champion={champion.key} muted={champion.banned} />
      <span className="dossier-champ-chip__text">
        <span className="dossier-champ-chip__name">{champion.key}</span>
        <span className="dossier-champ-chip__stat tabular-nums">
          {champion.games}g · {formatRate(champion.win_rate)}
        </span>
      </span>
    </span>
  );
}

/** The full evidence table, behind the disclosure. Every row, always. */
function PoolTable({ pool }: { pool: DemonstratedPool }) {
  return (
    <div className="dossier-table-scroll">
      <table className="dossier-table" data-testid="pool-full-table">
        <thead>
          <tr>
            <th scope="col">Champion</th>
            <th scope="col">Games</th>
            <th scope="col">Record</th>
            <th scope="col">Win rate</th>
            <th scope="col">Share</th>
            <th scope="col">Last played</th>
          </tr>
        </thead>
        <tbody>
          {pool.champions.map((c) => (
            <tr key={c.key} className={c.banned ? "is-banned" : undefined} data-testid={`pool-row-${c.key}`}>
              <td>{c.key}</td>
              <td className="tabular-nums">{c.games}</td>
              <td className="tabular-nums">{formatRecord(c.wins, c.losses)}</td>
              <td className="tabular-nums">{formatRate(c.win_rate)}</td>
              <td className="tabular-nums">{formatRate(c.champion_share)}</td>
              <td className="tabular-nums">{formatDate(c.last_played_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Summary first, evidence second.
 *
 * `poolOmitted` is a different fact from an empty pool and keeps its own
 * sentence: the roster row is real, only the pool FETCH was bounded, and the
 * lane view serves it in full.
 */
export function ChampionPoolSummary({
  pool,
  poolOmitted,
  preview,
  testId,
}: {
  pool: DemonstratedPool | null;
  poolOmitted: boolean;
  preview: number;
  testId?: string;
}) {
  const categories = useMemo(
    () => (pool ? poolCategories(pool.champions, preview) : []),
    [pool, preview],
  );

  if (poolOmitted) {
    return (
      <p className="dossier-muted" data-testid="pool-omitted">
        Demonstrated picks not loaded for this candidate — open the lane dossier to see them in full.
      </p>
    );
  }
  if (!pool) return null;
  if (pool.participation === "did_not_participate") {
    return (
      <p className="dossier-muted" data-testid="pool-dnp">
        Did not participate in {pool.scope_label}. This is not a record of zero picks.
      </p>
    );
  }
  if (!pool.champions.length) {
    return (
      <p className="dossier-muted" data-testid="pool-empty">
        No picks in {pool.scope_label}.
      </p>
    );
  }

  return (
    <div className="dossier-pool" data-testid={testId ?? "champion-pool"}>
      <div className="dossier-pool__head">
        {/* "Demonstrated picks" is the semantic label and must survive every
            visual pass — it is what stops the list reading as "champions they
            can play". "Champion Arsenal" is ornament above it, never instead
            of it. */}
        <span className="dossier-pool__title">
          <span className="dossier-pool__ornament">Champion Arsenal</span>
          Demonstrated picks
        </span>
        <span className="dossier-pool__count tabular-nums" data-testid="pool-size">
          {pool.pool_size} in {pool.scope_label}
        </span>
      </div>

      {categories.map((cat) => (
        <div key={cat.id} className="dossier-pool__cat" data-testid={`pool-cat-${cat.id}`}>
          <span className="dossier-pool__cat-label">{cat.label}</span>
          <div className="dossier-pool__chips">
            {cat.champions.map((c) => (
              <ChampionChip key={`${cat.id}-${c.key}`} champion={c} />
            ))}
          </div>
        </div>
      ))}

      <Disclosure
        label={`View full champion pool (${pool.champions.length})`}
        openLabel="Hide full champion pool"
        testId="pool-disclosure"
      >
        <PoolTable pool={pool} />
      </Disclosure>
    </div>
  );
}
