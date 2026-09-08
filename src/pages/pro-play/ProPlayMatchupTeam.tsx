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

import { useMemo, useState } from "react";
import {
  Disclosure,
  Dossier,
  DossierSection,
  FinePrint,
  MogzyNote,
} from "@/components/pro-play/dossier/DossierChrome";
import {
  ArchiveWarnings,
  LanePlate,
  MatchHeader,
  ScopeRail,
  TeamSummaryPlate,
} from "@/components/pro-play/dossier/MatchDossier";
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

function TeamSelect({
  contract,
  selection,
  side,
  onChange,
}: {
  contract: MatchupContract;
  selection: TeamSelection;
  side: "a" | "b";
  onChange: (next: TeamSelection) => void;
}) {
  const value = side === "a" ? selection.team_a : selection.team_b;
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Team {side.toUpperCase()}
      </span>
      <select
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        value={value ?? ""}
        aria-label={`Team ${side.toUpperCase()}`}
        data-testid={`team-select-${side}`}
        onChange={(e) => onChange(withTeamSide(selection, side, e.target.value || null))}
      >
        <option value="">Select a team…</option>
        {contract.focus_set.teams.map((t) => (
          // The owner's short label beside the canonical key, and the status
          // verbatim. "watchlist" is never rewritten into anything warmer.
          <option key={t.team_key} value={t.team_key}>
            {t.owner_label} — {t.team_key} ({t.status})
          </option>
        ))}
      </select>
    </label>
  );
}

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
      <MogzyNote label="On bans">{data.bans.note}</MogzyNote>
    </div>
  );
}

// --- the board --------------------------------------------------------------

export function TeamBoard({
  contract,
  data,
  selection,
  onChange,
  onSwitchToLane,
}: {
  contract: MatchupContract;
  data: TeamMatchupResponse;
  selection: TeamSelection;
  onChange: (next: TeamSelection) => void;
  onSwitchToLane: () => void;
}) {
  const headerA = data.teams.a;
  const headerB = data.teams.b;
  const configured = Boolean(headerA && headerB);

  return (
    <Dossier>
      <MatchHeader data={data} contract={contract} />

      {/* The server's team-mode note denies a draft, a ban, a starter and a
          result, in its own words. It is a margin annotation now instead of a
          leading paragraph — but it renders on every board, unedited. */}
      <MogzyNote testId="team-mode-note">{data.notes.team_mode}</MogzyNote>

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
          <button
            type="button"
            className="dossier-btn"
            data-testid="team-to-lane"
            onClick={onSwitchToLane}
          >
            Lane explorer
          </button>
        </div>
      </div>

      {/* The team pickers move BELOW the dossier once both are chosen: they
          are how you change the subject, not how you read it. Before that
          they are the only thing on screen worth doing, so they lead. */}
      <Disclosure
        label={configured ? "Change teams" : "Choose two teams"}
        openLabel="Done choosing"
        defaultOpen={!configured}
        testId="dossier-team-picker"
      >
        <div className="dossier-pickers">
          <TeamSelect contract={contract} selection={selection} side="a" onChange={onChange} />
          <TeamSelect contract={contract} selection={selection} side="b" onChange={onChange} />
        </div>
      </Disclosure>

      {/* Asserted, not assumed. Ten records at once is exactly where a reader
          would invent a series score, so nothing renders unless the server
          says this is not head-to-head. */}
      {data.head_to_head === false ? (
        <DossierSection
          title="Lane Study"
          eyebrow="The five matchups"
          testId="dossier-lane-study"
        >
          <div className="dossier-lanes" data-testid="lane-board">
            {data.lanes.map((row) => (
              <LanePlate key={row.lane} row={row} preview={data.pool_preview} />
            ))}
          </div>
          {/* Named accurately, then explained on request — rather than a
              denial paragraph sitting above ten records. */}
          <MogzyNote label="Independent performance comparison" testId="dossier-side-by-side-note">
            {data.notes.side_by_side}
          </MogzyNote>
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
