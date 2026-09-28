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
 * HUB5 — History is DETERMINISTIC. Each account state reads a History golden
 * that HUB2.1's real route generated from raw Daily facts
 * (`history/timmyHistory.golden.json`), through the production parser. The
 * entitlement switch picks which server state the account is shown under;
 * it changes what the server would have said, never what the UI does with it.
 * The route itself is registered in development builds only (App.tsx).
 *
 * Deleting this directory and its route line removes the demo completely.
 */

import type { DailyStatusView } from "@/lib/daily-challenge/status";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import LeaguecraftHub from "@/components/quiz/LeaguecraftHub";
import type { MissedQuestionsState } from "@/components/quiz/workspace/useMissedQuestions";
import type { QuestionLibraryState } from "@/components/quiz/workspace/useQuestionLibrary";
import {
  LOBBY_PREVIEW_STATES,
  PREVIEW_SETS,
  type LobbyPreviewProfile,
  type PreviewEntitlement,
} from "./lobbyPreviewFixtures";
import { TIMMY_HISTORY_SOURCES } from "./history/timmyHistorySource";
import { ANALYTICS_LAB_SOURCES } from "./history/analyticsLabSource";

/** Every generated History golden the preview can serve, by scenario. */
const HISTORY_SOURCES: Record<string, (typeof TIMMY_HISTORY_SOURCES)[keyof typeof TIMMY_HISTORY_SOURCES]> = {
  ...TIMMY_HISTORY_SOURCES,
  ...ANALYTICS_LAB_SOURCES,
};
import {
  demoAnalyticsSource,
  demoAnalyticsSourceEmpty,
  demoChampionKnowledge,
  demoChampionKnowledgeEmpty,
  demoRoleDimension,
} from "./demoLobbyAnalytics";

const PROFILES: LobbyPreviewProfile[] = ["timmy", "firstDaily", "fullDaily", "analyticsLab", "newcomer"];
const ENTITLEMENTS: PreviewEntitlement[] = ["premium", "free", "unavailable"];

/** Every host action the hub can fire, deliberately inert. */
function noop() {}

/** Today's Daily, finished. Demo state only — nothing here is read or written. */
const PREVIEW_DAILY_DONE: DailyStatusView = {
  known: true, completed: true, resumable: false,
  resolved: 12, total: 12, streak: 4, theme: "Item Knowledge",
};

export default function LobbyPreviewPage() {
  const [profile, setProfile] = useState<LobbyPreviewProfile>("timmy");
  // The role the preview is "signed in" as. Local only: selecting a role here
  // moves the demo, and there is no writer behind it.
  const state = LOBBY_PREVIEW_STATES[profile];
  const [role, setRole] = useState(state.rankedRole);
  const [entitlement, setEntitlement] = useState<PreviewEntitlement>(state.defaultEntitlement);
  const view = state.entitlements[entitlement] ?? state.entitlements[state.defaultEntitlement]!;
  const offered = ENTITLEMENTS.filter((e) => state.entitlements[e]);

  /**
   * The Review pane's bank, HANDED IN rather than loaded.
   *
   * The pane loads its own data on the real lobby. Here it must not: this
   * page's whole contract is that it reads no account, and a reviewer opening
   * the Review tab would otherwise have fired a real request from a demo
   * screen. Every action on the resolved state is inert, exactly like the
   * callbacks above.
   */
  const review: MissedQuestionsState = useMemo(() => {
    const data = view.missedQuestions;
    const items = data ? [...data.results] : [];
    const totalCount = data?.total_count ?? items.length;
    return {
      data,
      items,
      loading: false,
      loadingMore: false,
      error: view.missedError,
      // More exists on the server; loading it is inert here like every
      // other action.
      hasMore: items.length < totalCount,
      totalCount,
      loadMore: noop,
      retry: noop,
    };
  }, [view]);

  /** REVIEW's OWNED collection, resolved for the same reason: opening the
   *  Owned tab on a demo screen must not fire a real account read. */
  const owned: QuestionLibraryState = useMemo(
    () => ({
      summary: state.questionLibrary.summary,
      entries: [...state.questionLibrary.entries],
      pagination: null,
      loading: false,
      loadingMore: false,
      error: null,
      needsAccount: false,
      hasMore: false,
      loadMore: noop,
      retry: noop,
    }),
    [state.questionLibrary],
  );

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
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
          {PROFILES.map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`lobby-preview-${id}`}
              aria-pressed={profile === id}
              onClick={() => {
                setProfile(id);
                setRole(LOBBY_PREVIEW_STATES[id].rankedRole);
                setEntitlement(LOBBY_PREVIEW_STATES[id].defaultEntitlement);
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
          {offered.length > 1 && (
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Entitlement">
              {offered.map((id) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`lobby-preview-entitlement-${id}`}
                  aria-pressed={entitlement === id}
                  onClick={() => setEntitlement(id)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    entitlement === id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-primary/25 text-muted-foreground hover:border-primary/60"
                  }`}
                >
                  {state.entitlements[id]!.label}
                </button>
              ))}
            </div>
          )}
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
          /* Demo state only — this page writes no account, so the commit
             simply reports that it held and lets Ranked proceed. */
          onCommitRole={() => true}
          onEnterMatch={noop}
          onPlayDailyChallenge={noop}
          /* A day already answered out, so the record's COMPLETED Daily
             Challenge clause — and the Practice handoff it offers — can be
             looked at over the real lobby. The handoff itself is real here:
             the section it scrolls to is this page's own `LeaguecraftHub`. */
          dailyChallenge={PREVIEW_DAILY_DONE}
          playModes={{ ranked: true, daily: true, invite: true }}
          sets={[...PREVIEW_SETS]}
          onSelectSet={noop}
          history={view.history}
          historyLoading={false}
          historyError={null}
          reviewState={review}
          ownedQuestionsPreview={owned}
          /* FROZEN OVERRIDE. Ranked history IS wired into the real record now
             (B1); this replaces it with a fixed set so the visual pass is
             deterministic and this page stays offline. An account with no
             duels gets an empty set — the real empty record. Never a Daily
             child match: those belong to their Daily run alone. */
          rankedHistoryPreview={state.rankedRecord}
          /* Frozen reviews for every Ranked row AND every Daily stage's child
             match, so each question timeline and its popover or sheet draws
             from a fixed set and this page never reaches the network. */
          rankedReviewPreview={state.reviews}
          /* HUB5: History's Daily runs, as HUB2.1's real route produced them
             for this account and entitlement, read through the production
             parser. */
          dailyHistorySource={HISTORY_SOURCES[view.dailyHistory]}
          rankedRole={role}
          onSelectRankedRole={setRole}
          rankedProgression={state.progression}
          matchHistory={state.matchHistory}
          matchHistoryLoading={false}
          displayName={state.displayName}
          signedIn={state.signedIn}
          demoRoleMastery={state.demoRoleMastery}
          /* RL2, demo only. Timmy has champion knowledge; the newcomer has a
             real, empty one — which is NOT production's absent state, and the
             two must be visibly different here. */
          championKnowledge={
            profile === "timmy" ? demoChampionKnowledge : demoChampionKnowledgeEmpty
          }
          /* RL2, demo only. An offline analytics source, in the Premium shape
             so all three Time options can be exercised. */
          analyticsSource={profile === "timmy" ? demoAnalyticsSource : demoAnalyticsSourceEmpty}
          /* RL2, demo only. The one role dimension in the product; passing it
             is what makes the carousel's Role control operable. */
          demoAnalyticsRoleDimension={demoRoleDimension}
        />
      </div>
    </div>
  );
}
