/**
 * MALT — `/dev/lobby-preview`: the Leaguecraft lobby, rendered from frozen
 * demo state instead of from an account.
 *
 * The lobby's information architecture only becomes judgeable once the sheets
 * have something written on them, and a local dev account has nothing. This
 * page mounts the REAL `LeaguecraftHub` — the same component `/quiz` mounts,
 * with the same three parchment scrolls — and hands it constants.
 *
 * ISOLATION, stated as a rule rather than as an intention:
 *  - it fetches nothing, writes nothing, and touches no storage or auth;
 *  - every callback it passes down is a no-op, so PLAY, role selection and
 *    the practice tiles cannot start a match, persist a role, or navigate
 *    into real gameplay from here;
 *  - the fixtures live in one module imported by this page ALONE, so no
 *    production surface can reach them;
 *  - `/dev/*` is a `developer_route` under the ads policy and is linked from
 *    no navigation.
 *
 * Deleting this directory and its route line removes the demo completely.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import LeaguecraftHub from "@/components/quiz/LeaguecraftHub";
import {
  LOBBY_PREVIEW_STATES,
  PREVIEW_SETS,
  type LobbyPreviewProfile,
} from "./lobbyPreviewFixtures";

const PROFILES: LobbyPreviewProfile[] = ["timmy", "newcomer"];

/** Every host action the hub can fire, deliberately inert. */
function noop() {}

/** Today's set, finished. Demo state only — nothing here is read or written. */
const PREVIEW_DAILY_DONE = {
  date: "2026-08-21", answered: 5, correct: 4, target: 5, xpBonus: 250,
  dailyStreak: 4, lastCompletedDate: "2026-08-21", completed: true, remaining: 0,
  themeTitle: "Item Knowledge", themeBlurb: "Recipes and component paths.",
};

export default function LobbyPreviewPage() {
  const [profile, setProfile] = useState<LobbyPreviewProfile>("timmy");
  // The role the preview is "signed in" as. Local only: selecting a role here
  // moves the demo, and there is no writer behind it.
  const state = LOBBY_PREVIEW_STATES[profile];
  const [role, setRole] = useState(state.rankedRole);

  return (
    <div className="min-h-screen bg-background">
      {/* The switcher. Plain chrome on purpose — nothing about this bar should
          read as part of the lobby it is previewing. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-primary/20 bg-card/70 px-4 py-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/80">
          Lobby preview
        </span>
        <span className="text-[11px] text-muted-foreground">
          Demo state only — nothing here reads or writes a real account.
        </span>
        <div className="ml-auto flex items-center gap-2">
          {PROFILES.map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`lobby-preview-${id}`}
              aria-pressed={profile === id}
              onClick={() => {
                setProfile(id);
                setRole(LOBBY_PREVIEW_STATES[id].rankedRole);
              }}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                profile === id
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-primary/25 text-muted-foreground hover:border-primary/60"
              }`}
            >
              {LOBBY_PREVIEW_STATES[id].label}
            </button>
          ))}
          <Link to="/quiz" className="text-[11px] underline-offset-4 hover:underline">
            Real lobby
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] px-4 pt-2 pb-8">
        <LeaguecraftHub
          progress={state.progress}
          ranked={state.ranked}
          /* The lobby's role COMMIT. Demo state only — this page writes no
             account — so it simply reports that the commit held and lets the
             record open, which is the branch a reviewer wants to look at. */
          onPlayRanked={() => true}
          onEnterMatch={noop}
          onPlayDailyChallenge={noop}
          /* A day already answered out, so the record's COMPLETED Daily
             Challenge clause — and the Practice handoff it offers — can be
             looked at over the real lobby. The handoff itself is real here:
             the section it scrolls to is this page's own `LeaguecraftHub`. */
          dailyChallenge={PREVIEW_DAILY_DONE}
          playModes={{ ranked: true, daily: true, invite: true }}
          sets={[...PREVIEW_SETS]}
          setsLoading={false}
          onSelectSet={noop}
          onRefreshSets={noop}
          history={state.history}
          historyLoading={false}
          historyError={null}
          rankedRole={role}
          onSelectRankedRole={setRole}
          rankedProgression={state.progression}
          matchHistory={state.matchHistory}
          matchHistoryLoading={false}
          displayName={state.displayName}
          signedIn={state.signedIn}
          demoRoleMastery={state.demoRoleMastery}
        />
      </div>
    </div>
  );
}
