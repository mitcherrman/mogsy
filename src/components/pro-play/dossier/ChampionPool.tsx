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

import { useMemo, useState } from "react";

import { formatDate, formatRate, formatRecord } from "@/lib/pro-play/researchApi";
import type { DemonstratedPool, Lane, PoolChampion } from "@/lib/pro-play/matchupApi";

import ProPlayTooltip from "../ProPlayTooltip";

import { useBoardSelection } from "./BoardSelection";

import { ChampionIcon } from "./DossierMedia";
import { Disclosure } from "./DossierChrome";

/** Below this, a win rate is noise rather than a record. Printed on screen. */
export const MIN_GAMES_FOR_RATE = 5;

/**
 * How many champions a COLLAPSED card shows.
 *
 * This is a layout number, not a claim about the player, and it is never
 * printed: the reader sees "Show all 24", not "top 12". Twelve is two full
 * rows of fixed-width tiles at the width a lane half actually gets, which is
 * what keeps the two halves of a lane the same height whether one player has
 * six demonstrated picks and the other twenty-four.
 */
export const BOARD_PRIMARY_MAX = 12;

/** The two ordering strips. Icon-only, so they cost one line each. */
export const BOARD_STRIP_MAX = 10;

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
      label: `Best record ${MIN_GAMES_FOR_RATE}g+`,
      champions: record.slice(0, size),
    });
  }
  return out;
}

/**
 * One champion, as a fixed-width tile.
 *
 * THE NAME IS GONE FROM THE FACE OF THE CHIP, and that is the point. A row of
 * chips labelled "Xin Zhao", "Vi", "Nocturne", "Jarvan IV" wraps into ragged
 * columns whose width is decided by an accident of naming, so five champions
 * could occupy the same space as three. Every tile is now the same width, so a
 * row is a grid, twice as many fit, and the eye reads down the numbers instead
 * of across the words.
 *
 * The name is not lost -- `ProPlayTooltip` makes each tile a real focusable
 * button carrying the champion, its record and its last game, reachable by
 * hover, by keyboard and (through the native `title`) by touch. An icon nobody
 * recognises is still identifiable; it just costs a hover instead of a line of
 * text in every tile.
 */
function ChampionChip({
  champion,
  onSelect,
  selected,
}: {
  champion: PoolChampion;
  onSelect?: (championKey: string) => void;
  selected?: boolean;
}) {
  // Leads with the name, then adds only what the tile does NOT already show.
  // Wins, games and win rate are printed on the tile, so repeating them here
  // would make a screen reader say each twice; the losses half of the record
  // and the date are not.
  const detail = [
    champion.key,
    formatRecord(champion.wins, champion.losses),
    champion.last_played_at ? `last ${formatDate(champion.last_played_at)}` : null,
    champion.banned ? "banned in this selection" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ProPlayTooltip
      label={champion.key}
      tooltip={detail}
      testId={`champ-chip-${champion.key}`}
      onClick={onSelect ? () => onSelect(champion.key) : undefined}
      pressed={onSelect ? Boolean(selected) : undefined}
      className={[
        "dossier-champ-chip",
        champion.banned ? "is-banned" : "",
        selected ? "is-selected" : "",
      ].join(" ")}
    >
      <ChampionIcon champion={champion.key} muted={champion.banned} />
      {/* "10/13" rather than "13g": `g` reads as gold on a League page, and
          wins-over-games says in the same width what games-plus-rate needed
          two numbers to say. */}
      <span className="dossier-champ-chip__stat tabular-nums">
        {champion.wins}/{champion.games}
      </span>
      <span className="dossier-champ-chip__rate tabular-nums">
        {formatRate(champion.win_rate)}
      </span>
    </ProPlayTooltip>
  );
}

/**
 * A champion in an ordering strip: the icon alone, with everything else in the
 * tooltip. The strips exist to show a SEQUENCE, and a sequence needs position,
 * not statistics repeated from the grid above it.
 */
function ChampionGlyph({
  champion,
  category,
}: {
  champion: PoolChampion;
  category: PoolCategoryId;
}) {
  const detail = [
    champion.key,
    category === "recent" && champion.last_played_at
      ? `last played ${formatDate(champion.last_played_at)}`
      : `${champion.games}g · ${formatRecord(champion.wins, champion.losses)} · ${formatRate(champion.win_rate)}`,
    champion.banned ? "banned in this selection" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <ProPlayTooltip
      label={champion.key}
      tooltip={detail}
      testId={`champ-glyph-${category}-${champion.key}`}
      className={["dossier-champ-glyph", champion.banned ? "is-banned" : ""].join(" ")}
    >
      <ChampionIcon champion={champion.key} muted={champion.banned} />
    </ProPlayTooltip>
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
/** Who this pool belongs to. Absent off the board — the lane explorer renders
 *  the same component and has no selection to make. */
export interface PoolOwner {
  player_lp_page: string;
  display_name: string;
  team_key: string;
  lane: Lane;
}

export function ChampionPoolSummary({
  pool,
  poolOmitted,
  preview,
  testId,
  owner,
}: {
  pool: DemonstratedPool | null;
  poolOmitted: boolean;
  preview: number;
  testId?: string;
  owner?: PoolOwner;
}) {
  const [expanded, setExpanded] = useState(false);
  const board = useBoardSelection();
  // `preview` is the server's own display hint. It stays the FLOOR rather than
  // the ceiling: the board may show more now that a tile is an icon instead of
  // a name, but never fewer than the backend asked for.
  const cap = Math.max(preview, BOARD_PRIMARY_MAX);
  const { primary, strips, total } = useMemo(() => {
    if (!pool) return { primary: [], strips: [] as PoolCategory[], total: 0 };
    const cats = poolCategories(pool.champions, pool.champions.length);
    const played = cats.find((c) => c.id === "played")?.champions ?? [];
    return {
      // Collapsed shows a fixed number so the two halves of a lane stay level;
      // expanded shows the pool, in the same tiles, in the same card.
      primary: expanded ? played : played.slice(0, cap),
      strips: cats
        .filter((c) => c.id !== "played")
        .map((c) => ({ ...c, champions: c.champions.slice(0, BOARD_STRIP_MAX) })),
      total: played.length,
    };
  }, [pool, cap, expanded]);

  const onSelect = owner
    ? (championKey: string) =>
        board.onSelect({
          player_lp_page: owner.player_lp_page,
          display_name: owner.display_name,
          team_key: owner.team_key,
          opponent_team_key: board.opponentOf(owner.team_key),
          lane: owner.lane,
          champion: championKey,
          scope_id: board.scopeId,
          scope_label: board.scopeLabel,
        })
    : undefined;

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
      {/* The "Champion Arsenal · Demonstrated picks" heading and its "24 in
          2026" counter used to sit here. Both were removed by owner decision:
          the heading labelled the only thing in the block, and the scope and
          the pool size are now carried by the player card's own scope tag and
          by the "Show all 24" action. The POOL SEMANTICS are unchanged and
          still printed verbatim by the board's own fine print
          (`data.notes.pool`) — the label went, the guarantee did not. */}
      {/* THE POOL ITSELF, not a sample of it. Ordered by games, and showing
          every champion up to a cap that only fires on the largest pools. */}
      <div className="dossier-pool__cat" data-testid="pool-cat-played">
        <span className="dossier-pool__cat-label">Most played</span>
        {/* Collapsed, the grid holds two rows whether the player has six picks
            or twenty-four, which is what keeps a lane's two halves level. */}
        <div
          className={["dossier-pool__grid", expanded ? "is-expanded" : ""].join(" ")}
          data-expanded={expanded ? "true" : "false"}
        >
          {primary.map((c) => (
            <ChampionChip
              key={`played-${c.key}`}
              champion={c}
              onSelect={onSelect}
              selected={
                board.selected?.champion === c.key &&
                board.selected?.player_lp_page === owner?.player_lp_page
              }
            />
          ))}
        </div>
        {/* No action when the whole pool already fits — an expander that
            expands nothing is a lie about there being more. */}
        {total > cap ? (
          <button
            type="button"
            className="dossier-pool__expand"
            data-testid="pool-expand"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Show fewer" : `Show all ${total}`}
          </button>
        ) : null}
      </div>

      {/* The other two orderings are ORDERINGS, not separate arsenals — the
          same champions in a different sequence. Repeating them as full tiles
          was what made a lane card feel like the same four picks three times,
          so they are icon-only strips: the sort is still on screen, and it
          costs one line instead of a block. */}
      {strips.map((cat) => (
        <div key={cat.id} className="dossier-pool__strip" data-testid={`pool-cat-${cat.id}`}>
          <span className="dossier-pool__strip-label">{cat.label}</span>
          <div className="dossier-pool__strip-icons">
            {cat.champions.map((c) => (
              <ChampionGlyph key={`${cat.id}-${c.key}`} champion={c} category={cat.id} />
            ))}
          </div>
        </div>
      ))}

      {/* Named for what it IS, not for how many rows it has. "Show all 24"
          above and "View full champion pool (24)" here were two controls
          claiming the same thing and doing different things — one expands the
          tiles, this one opens the evidence table with the columns a tile has
          no room for (share of games, last played). */}
      <Disclosure
        label="View record table"
        openLabel="Hide record table"
        testId="pool-disclosure"
      >
        <PoolTable pool={pool} />
      </Disclosure>
    </div>
  );
}
