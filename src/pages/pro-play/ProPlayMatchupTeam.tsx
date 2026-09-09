// ---------------------------------------------------------------------------
// Team mode — the five-lane board, rendered inside the same Explorer page.
//
// A SECOND BOARD, NOT A SECOND EXPLORER. The page, the shell, the URL rules
// and the admin gate are Phase 1's; `mode=team` in the query string chooses
// which board `ProPlayMatchup` renders and which endpoint it calls. Lane mode
// is untouched and is still the default, so every Phase 1 link ever shared
// keeps working.
//
// THE FIVE THINGS THIS SCREEN MUST NOT SAY, and where each is prevented:
//
// 1. "Head-to-head." Ten records on one screen is the most inviting place in
//    the product to read a series score that is not there. The section is
//    headed "Side-by-side record", the render is conditioned on the server's
//    `head_to_head` being false, and the server's sentence is printed under it.
// 2. "This is the starting five." A lane the roster authority will not call is
//    rendered as a timeshare with every candidate and no highlight; only
//    `is_starter` — its verdict about games ALREADY PLAYED — draws the badge,
//    and the badge says "demonstrated starter".
// 3. "Qualified for Worlds." Focus status prints verbatim through Phase 1's
//    `FocusBadge`, and `asserts_qualification` is the only field allowed to
//    change the wording.
// 4. "Champions they can play." The heading is "Demonstrated picks", the
//    server's pool note is printed, and the collapse at `pool_preview` is a
//    DISPLAY point — every row is in the payload and "Show all N" reveals it.
//    There is no minimum-game filter anywhere in this file.
// 5. Any prediction of a draft, a ban, or a result. The server's `team_mode`
//    note denies all four in words and is printed at the top of the board.
//
// MECHANICS ARE NOT RENDERED HERE. Five mechanics panels would bury the board,
// so mechanics stay where Phase 1 put them: one lane drill-down away, in the
// lane view, reading the same public `/api/docs/champions/{slug}` authority.
//
// PHASE 3 CHANGED WEIGHT, NOT WORDING. Every sentence above still ships and
// still comes from the server; what moved is where the reader meets it. The
// no-prediction note is a margin annotation, the focus caveat and the pool
// notes are behind "What this means", and the five lanes — which used to sit
// under eight form fields — are now the first thing on the page. The parts
// themselves live in `@/components/pro-play/dossier`; this file is the
// composition, the team pickers and the ban bar.
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState } from "react";
import {
  Dossier,
  DossierSection,
  FinePrint,
} from "@/components/pro-play/dossier/DossierChrome";
import {
  ArchiveWarnings,
  LanePlate,
  MatchHeader,
  ScopeRail,
  TeamSummaryPlate,
} from "@/components/pro-play/dossier/MatchDossier";
import {
  BoardSelectionProvider,
  type ChampionSelection,
} from "@/components/pro-play/dossier/BoardSelection";
import { ChampionIcon } from "@/components/pro-play/dossier/DossierMedia";
import {
  type MatchupContract,
  type TeamMatchupResponse,
  type TeamSelection,
  withTeamBanToggled,
  withTeamScope,
  withTeamSide,
  withTeamsSwapped,
} from "@/lib/pro-play/matchupApi";

// --- controls ---------------------------------------------------------------
// Team selection lives in the VS banner (`MatchHeader`), which is the one
// control that changes the subject. What remains here operates on the matchup
// already chosen: scope, sides and bans.

function TeamBanBar({
  data,
  selection,
  onChange,
}: {
  data: TeamMatchupResponse;
  selection: TeamSelection;
  onChange: (next: TeamSelection) => void;
}) {
  // Only champions somebody on this board demonstrably plays are offered.
  // Offering all 170 would suggest a draft model that does not exist, and
  // banning a champion nobody picked is a no-op set difference.
  const offered = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of data.lanes) {
      for (const side of [row.a, row.b]) {
        for (const cand of side?.candidates ?? []) {
          for (const champ of cand.pool?.champions ?? []) {
            counts.set(champ.key, (counts.get(champ.key) ?? 0) + champ.games);
          }
        }
      }
    }
    for (const key of selection.bans) if (!counts.has(key)) counts.set(key, 0);
    // Most-played first: a reader banning by hand reaches for those.
    return [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  }, [data, selection.bans]);

  const [all, setAll] = useState(false);
  if (!offered.length) return null;
  const shown = all ? offered : offered.slice(0, 24);

  return (
    <div data-testid="team-bans">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Bans ({selection.bans.length}) — applied to every lane
      </span>
      <div className="flex flex-wrap gap-1.5">
        {shown.map(([key]) => {
          const banned = selection.bans.includes(key);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={banned}
              data-testid={`team-ban-${key}`}
              onClick={() => onChange(withTeamBanToggled(selection, key))}
              className={[
                "rounded-md border px-2 py-0.5 text-xs transition-colors",
                banned
                  ? "border-destructive bg-destructive/10 text-destructive line-through"
                  : "border-border text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {key}
            </button>
          );
        })}
        {offered.length > shown.length ? (
          <button
            type="button"
            className="rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            data-testid="team-bans-show-all"
            onClick={() => setAll(true)}
          >
            Show all {offered.length}
          </button>
        ) : null}
      </div>
      <FinePrint testId="dossier-bans-note">{data.bans.note}</FinePrint>
    </div>
  );
}

// --- the board --------------------------------------------------------------

/**
 * What a champion click produces in Step 1: the settled question, stated, and
 * an honest note that the answer is not built yet.
 *
 * It deliberately shows NO statistics. Everything it could cheaply repeat is
 * already on the tile that was clicked, and anything more -- this player on
 * this champion INTO that opponent -- is exactly the contextual aggregation
 * Step 2 adds and this step was told not to start. An empty panel promising
 * numbers would be worse than a panel that says what it is.
 */
function ChampionSelectionShell({
  selection,
  onClose,
}: {
  selection: ChampionSelection;
  onClose: () => void;
}) {
  return (
    <div className="dossier-champsel" data-testid="champion-selection-shell" role="status">
      <div className="dossier-champsel__id">
        <ChampionIcon champion={selection.champion} />
        <span className="dossier-champsel__text">
          <strong>{selection.champion}</strong>
          <span className="dossier-muted">
            {selection.display_name} · {selection.team_key} · {selection.lane} ·{" "}
            {selection.scope_label}
            {selection.opponent_team_key ? ` · vs ${selection.opponent_team_key}` : ""}
          </span>
        </span>
      </div>
      <span className="dossier-champsel__note">
        The player × champion dossier is the next step; this selection is what it
        will be built from.
      </span>
      <button
        type="button"
        className="dossier-btn"
        data-testid="champion-selection-close"
        onClick={onClose}
      >
        Clear
      </button>
    </div>
  );
}

export function TeamBoard({
  contract,
  data,
  selection,
  onChange,
}: {
  contract: MatchupContract;
  data: TeamMatchupResponse;
  selection: TeamSelection;
  onChange: (next: TeamSelection) => void;
}) {
  const headerA = data.teams.a;
  const headerB = data.teams.b;
  const configured = Boolean(headerA && headerB);

  // STEP 1 STOPS HERE ON PURPOSE. A champion click settles who/which/against
  // whom/in what scope and nothing else: no request is made, no contract is
  // invented, and the panel below states plainly that the detail is not built
  // yet rather than showing an empty frame that looks broken. Step 2 replaces
  // the panel and keeps this state.
  const [selectedChampion, setSelectedChampion] = useState<ChampionSelection | null>(null);

  // Clearing on a scope or team change is the honest default: a selection made
  // in one scope is not a selection in another, and silently re-pointing it at
  // different numbers would be worse than dropping it.
  const boardKey = `${selection.team_a}|${selection.team_b}|${selection.scope_id}`;
  const lastKey = useRef(boardKey);
  if (lastKey.current !== boardKey) {
    lastKey.current = boardKey;
    if (selectedChampion) setSelectedChampion(null);
  }

  const boardSelection = useMemo(
    () => ({
      scopeLabel: data.scope.scope_label,
      scopeId: data.scope.scope_id,
      opponentOf: (teamKey: string) =>
        teamKey === headerA?.team_key
          ? headerB?.team_key ?? null
          : teamKey === headerB?.team_key
            ? headerA?.team_key ?? null
            : null,
      selected: selectedChampion,
      onSelect: (next: ChampionSelection) =>
        // Clicking the selected tile again clears it, so the tile is a toggle
        // rather than a trap with no way back.
        setSelectedChampion((cur) =>
          cur &&
          cur.champion === next.champion &&
          cur.player_lp_page === next.player_lp_page
            ? null
            : next,
        ),
    }),
    [data.scope, headerA, headerB, selectedChampion],
  );

  return (
    <Dossier>
      <MatchHeader
        data={data}
        contract={contract}
        selection={selection}
        onChange={onChange}
      />

      {/* The server's team-mode note denies a draft, a ban, a starter and a
          result, in its own words. It is a margin annotation now instead of a
          leading paragraph — but it renders on every board, unedited. */}

      <div className="dossier-controls" data-testid="dossier-controls">
        <ScopeRail
          contract={contract}
          scopeId={selection.scope_id}
          onChange={(next) => onChange(withTeamScope(selection, next))}
        />
        <div className="dossier-controls__actions">
          <button
            type="button"
            className="dossier-btn"
            data-testid="team-swap"
            onClick={() => onChange(withTeamsSwapped(selection))}
          >
            Swap sides
          </button>
          {/* A second "Lane explorer" button stood here. The board no longer
              asks the reader to choose a mode — each lane plate's "Open lane
              dossier" is the one way down, and it carries the lane with it
              instead of dropping them into an empty explorer. `onSwitchToLane`
              is still plumbed for that route. */}
        </div>
      </div>

      {/* Asserted, not assumed. Ten records at once is exactly where a reader
          would invent a series score, so nothing renders unless the server
          says this is not head-to-head. */}
      {data.head_to_head === false ? (
        <DossierSection
          title="Lane Study"
          eyebrow="Each player's own record"
          testId="dossier-lane-study"
        >
          <BoardSelectionProvider value={boardSelection}>
            <div className="dossier-lanes" data-testid="lane-board">
              {data.lanes.map((row) => (
                <LanePlate key={row.lane} row={row} preview={data.pool_preview} />
              ))}
            </div>
          </BoardSelectionProvider>
          {selectedChampion ? (
            <ChampionSelectionShell
              selection={selectedChampion}
              onClose={() => setSelectedChampion(null)}
            />
          ) : null}
          {/* The no-head-to-head guarantee is carried by the section's own
              eyebrow and by this one line, not by a boxed disclaimer above ten
              records. The server's sentence is still printed verbatim — it is
              the exact wording the semantics are guaranteed in. */}
          <FinePrint testId="dossier-side-by-side-note">{data.notes.side_by_side}</FinePrint>
          {/* Two separate server sentences, rendered separately. Joining them
              into one string would make each unquotable, and these are the
              exact words the pool semantics are guaranteed in. */}
          <FinePrint testId="dossier-pool-fineprint">{data.notes.pool}</FinePrint>
          <FinePrint testId="dossier-pool-bound-fineprint">{data.notes.pool_bound}</FinePrint>
        </DossierSection>
      ) : null}

      {headerA || headerB ? (
        <DossierSection title="Team Record" eyebrow="Side by side" testId="dossier-team-record">
          <div className="dossier-teamsums">
            <TeamSummaryPlate header={headerA} />
            <TeamSummaryPlate header={headerB} />
          </div>
        </DossierSection>
      ) : null}

      <DossierSection title="Global Bans" eyebrow="Applied to every lane" testId="dossier-bans">
        <TeamBanBar data={data} selection={selection} onChange={onChange} />
      </DossierSection>

      <ArchiveWarnings data={data} />
    </Dossier>
  );
}
