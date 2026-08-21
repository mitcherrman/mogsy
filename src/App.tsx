import AcademyRadioController from "./components/audio/EntryMusicController";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LEAGUE_ONLY_MODE, LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import { AuthProvider } from "./hooks/useAuth";
import { AdminAuthProvider } from "./lib/admin-auth/AdminAuthProvider";
import { SitewideThemeProvider } from "./hooks/useSitewideTheme";
import { useAuthQuerySync } from "./hooks/useAuthQuerySync";
import ProtectedRoute from "./components/ProtectedRoute";
import RequireRankedTutorial from "./components/RequireRankedTutorial";
import AdminRoute from "./components/AdminRoute";
import QuizContentRedirect from "./pages/admin/QuizContentRedirect";
import Layout from "./components/Layout";
import NotFound from "./pages/NotFound";
import TeamSimErrorBoundary from "@/components/combat-lab/TeamSimErrorBoundary";
import {
  isTeamSimPublicRouteEnabled,
  TEAM_SIM_DEV_ROUTE,
  TEAM_SIM_ROUTE,
} from "@/lib/combat-lab/team-sim/featureGate";
import { Suspense, type ReactElement } from "react";
import { lazy } from "react";
import { Routes as R } from "@/lib/route-prefetch";

const Index = R.Index.Component;
const Home = R.Home.Component;
const Auth = R.Auth.Component;
const Play = R.Play.Component;
const Profile = R.Profile.Component;
const Swipe = R.Swipe.Component;
const SwipeHub = R.SwipeHub.Component;
const Leagues = R.Leagues.Component;
const Leaderboard = R.Leaderboard.Component;
const SwipePreset = R.SwipePreset.Component;
const Settings = R.Settings.Component;
const Referral = R.Referral.Component;
const Admin = R.Admin.Component;
const Shop = R.Shop.Component;
const EloCheck = R.EloCheck.Component;
const SwipeLeagues = R.SwipeLeagues.Component;
const UserProfile = R.UserProfile.Component;
const ResetPassword = R.ResetPassword.Component;
// Anonymous -> permanent account confirmation callback (Concern B).
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const AdminPlay = R.AdminPlay.Component;
const AdminData = R.AdminData.Component;
const AdminDemo = R.AdminDemo.Component;
const AdminGaming = R.AdminGaming.Component;
const SecretRoom = R.SecretRoom.Component;
const Moderator = R.Moderator.Component;
const CustomLink = R.CustomLink.Component;
// Multiplayer / MultiplayerGame are intentionally NOT bound here. The legacy
// team lobby is retired: its routes redirect now, so the components — and the
// stub "Invite Friend" button inside MultiplayerLobby, which only ever raised
// a toast and created no invite — stay out of the bundle. The page files and
// the multiplayer_* tables are preserved: this disconnects them, it does not
// delete them.
const Feedback = R.Feedback.Component;
const BlogIndex = R.BlogIndex.Component;
const BlogPost = R.BlogPost.Component;
const AdminBlog = R.AdminBlog.Component;
const AdminBlogEditor = R.AdminBlogEditor.Component;
const CombatLab = R.CombatLab.Component;
const CombatLabDiagnostics = R.CombatLabDiagnostics.Component;
const Quiz = R.Quiz.Component;
const QuizDiagnostics = R.QuizDiagnostics.Component;
const QuizAdmin = R.QuizAdmin.Component;
const LolHub = R.LolHub.Component;
const LeagueSwipeHub = R.LeagueSwipeHub.Component;
const LeagueSwipeGame = R.LeagueSwipeGame.Component;
const LeagueSwipeStats = R.LeagueSwipeStats.Component;
const LolTierList = R.LolTierList.Component;
const LolDevChangelog = R.LolDevChangelog.Component;
const LeagueDocsLanding = R.LeagueDocsLanding.Component;
const LeagueDocsChampionIndex = R.LeagueDocsChampionIndex.Component;
const LeagueDocsChampionDetail = R.LeagueDocsChampionDetail.Component;
const LeagueDocsProData = R.LeagueDocsProData.Component;
const LeagueDocsProYear = R.LeagueDocsProYear.Component;
const LeagueDocsProChampionIndex = R.LeagueDocsProChampionIndex.Component;
const LeagueDocsProChampionDetail = R.LeagueDocsProChampionDetail.Component;
const ProRosterLanding = R.ProRosterLanding.Component;
const ProRosterPlayers = R.ProRosterPlayers.Component;
const ProRosterPlayerProfile = R.ProRosterPlayerProfile.Component;
const ProRosterTeams = R.ProRosterTeams.Component;
const ProRosterTeamProfile = R.ProRosterTeamProfile.Component;
const LolHistory = R.LolHistory.Component;
const LolMissedQuestions = R.LolMissedQuestions.Component;
const LolPro = R.LolPro.Component;
const AdminAbout = R.AdminAbout.Component;
const AdminDiagnostics = R.AdminDiagnostics.Component;
const AdminQuizBroadcast = R.AdminQuizBroadcast.Component;
const QuizBroadcastView = R.QuizBroadcastView.Component;
const BroadcastLiveView = R.BroadcastLiveView.Component;
const AdminQuizWorkspace = R.AdminQuizWorkspace.Component;
const AdminVideoExport = R.AdminVideoExport.Component;
const About = R.About.Component;
const Privacy = R.Privacy.Component;
const Terms = R.Terms.Component;
const Security = R.Security.Component;
const Contact = R.Contact.Component;

// Knowledge Admin — internal tool; lazy-loaded, master-admin gated.
const KnowledgeAdminLayout = lazy(() => import("./pages/admin/knowledge/KnowledgeAdminLayout"));
const KnowledgeDashboard = lazy(() => import("./pages/admin/knowledge/KnowledgeDashboard"));
const KnowledgeQueue = lazy(() => import("./pages/admin/knowledge/KnowledgeQueue"));
const KnowledgeReviewPage = lazy(() => import("./pages/admin/knowledge/KnowledgeReviewPage"));
const KnowledgeHealth = lazy(() => import("./pages/admin/knowledge/KnowledgeHealth"));
const KnowledgeChampionDetail = lazy(() => import("./pages/admin/knowledge/KnowledgeChampionDetail"));
const KnowledgeRundown = lazy(() => import("./pages/admin/knowledge/KnowledgeRundown"));
const KnowledgeHistory = lazy(() => import("./pages/admin/knowledge/KnowledgeHistory"));
const PatchOpsDetail = lazy(() => import("./pages/admin/knowledge/PatchOpsDetail"));

// Admin Directory — the pre-reorganization tool index. Retained as a component
// so nothing is deleted; /admin/directory now redirects to Overview › All Tools.
const AdminDirectory = lazy(() => import("./pages/admin/AdminDirectory"));

// -------------------------------------------------------------------------
// The unified Admin application (Admin Architecture reorganization).
// One shell, ten top-level areas, depth never beyond area → page → tab.
// The shell is navigation only: every destination keeps the gate it already
// had (AdminRoute / AdminAuthGate / RLS / require_admin), unchanged.
// -------------------------------------------------------------------------
const AdminShell = lazy(() => import("./components/admin/shell/AdminShell"));
const AdminOverviewPage = lazy(() => import("./pages/admin/areas/AdminOverviewPage"));
const AdminAllToolsPage = lazy(() => import("./pages/admin/areas/AdminAllToolsPage"));
const AdminPeoplePage = lazy(() => import("./pages/admin/areas/AdminPeoplePage"));
const AdminLeaguecraftPage = lazy(() => import("./pages/admin/areas/AdminLeaguecraftPage"));
const AdminRankedPage = lazy(() => import("./pages/admin/areas/AdminRankedPage"));
const AdminSimulationPage = lazy(() => import("./pages/admin/areas/AdminSimulationPage"));
const AdminGameDataPage = lazy(() => import("./pages/admin/areas/AdminGameDataPage"));
const AdminStudioPage = lazy(() => import("./pages/admin/areas/AdminStudioPage"));
const AdminOperationsPage = lazy(() => import("./pages/admin/areas/AdminOperationsPage"));
const AdminDeveloperPage = lazy(() => import("./pages/admin/areas/AdminDeveloperPage"));
const AdminArenaPage = lazy(() => import("./pages/admin/areas/AdminArenaPage"));

// Admin Platform Policies — global Combat Sim token + tutorial switches.
const AdminPlatformPolicies = lazy(() => import("./pages/admin/AdminPlatformPolicies"));

// ADM2 Phase A — master-admin user and bot directory.
const AdminUserDirectory = lazy(() => import("./pages/admin/AdminUserDirectory"));

// Combat Sim Battles (CB Phase 3A) — public prediction loop + admin operations.
const CombatBattlesIndex = lazy(() => import("./pages/CombatBattlesIndex"));
const CombatBattleDetail = lazy(() => import("./pages/CombatBattleDetail"));
const CombatBattlesAdmin = lazy(() => import("./pages/admin/CombatBattlesAdmin"));

// Dev-only prototype — local mock state, not linked from any navigation.
const RankedDuelPrototype = lazy(() => import("./pages/dev/ranked-duel-prototype/RankedDuelPrototype"));
const StatCheckPage = lazy(() => import("./pages/dev/stat-check/StatCheckPage"));
const StatCheckRoomPage = lazy(() => import("./pages/dev/stat-check/online/StatCheckRoomPage"));

// Public Stat Check entrance: mode selection plus the production-safe bot shell
// (both reuse the components above; neither forks the game or the room flow).
const StatCheckModeSelectPage = lazy(() => import("./pages/stat-check/StatCheckModeSelectPage"));
const StatCheckBotPage = lazy(() => import("./pages/stat-check/StatCheckBotPage"));

// Dev-only prototype — Daily Score Attack against the feature-flagged
// backend; not linked from any navigation.
const DailyScoreAttackPage = lazy(() => import("./pages/dev/daily-score-attack/DailyScoreAttackPage"));

// Production Daily Score Attack surface (feature-flagged server-side; the
// Quiz hub only links here when the backend reports the mode enabled).
const QuizDailyScoreAttack = lazy(() => import("./pages/QuizDailyScoreAttack"));

// Public Ranked route (F1.5) — allowlisted/feature-gated server-side; the
// page fails closed on backend disabled/ineligible via typed error codes.
const QuizRankedPage = lazy(() => import("./pages/quiz-ranked/QuizRankedPage"));

// Dev-only Ranked TUTORIAL prototype — scripted local training match,
// no auth/API/persistence, not linked from any navigation.
const RankedTutorialPage = lazy(() => import("./pages/dev/ranked-tutorial/RankedTutorialPage"));
const RankedArenaInspector = lazy(() => import("./pages/dev/ranked-arena-inspector/RankedArenaInspector"));
const Graph1RacePage = lazy(() => import("./pages/dev/graph1/Graph1RacePage"));
// Dev-only League mechanics XP calculator (MECH1) — thin client over the
// backend league_mechanics engine, not linked from any navigation.
const MechanicsXpPage = lazy(() => import("./pages/dev/mechanics-xp/MechanicsXpPage"));
// SIM2 team-combat editor — deterministic 1v1–2v2 over the backend
// team-simulate API. Additive: /combat-lab keeps its 1v1 surface.
//
// Phase 5A promotes it to a user-facing route behind VITE_TEAM_SIM_ENABLED and
// keeps the internal /dev path as an ALIAS onto the SAME lazy module. One
// implementation, two paths: a copied page could drift, and the copy that
// drifted would be the one taking money.
const TeamSimPage = lazy(() => import("./pages/dev/team-sim/TeamSimPage"));

// LIVE1 production viewer — the user-facing live esports scoreboard.
const EsportsLivePage = lazy(() => import("./pages/esports/live/EsportsLivePage"));

// Dev-only entrance concept — visual iteration on the Mogzy entry screen.
// Purely presentational, no app state, not linked from any navigation.
// The faithful pre-Mogzy original stays viewable at /dev/legacy-entry.
const MogzyEntryV2 = lazy(() => import("./pages/dev/mogzy-entry-v2/MogzyEntryV2"));

// HI1 — the Academy introduction shown to a first-time visitor between the
// entrance and the hub. Full-screen and layout-free like the entrance it
// follows, so it is mounted OUTSIDE <Layout /> alongside it.
const AcademyWelcomePage = lazy(() => import("./pages/welcome/AcademyWelcomePage"));

// Production Ranked TUTORIAL onboarding — mandatory for new accounts, replayable
// for completed ones. Reuses the canonical tutorial with durable completion.
const RankedTutorialOnboardingPage = lazy(() => import("./pages/onboarding/RankedTutorialOnboardingPage"));

// Screenshot render harness — inert without locally injected data, not
// linked from any navigation or the sitemap. Mounted OUTSIDE Layout so
// social-format captures contain no site chrome.
const QuizRenderPage = lazy(() => import("./pages/dev/quiz-render/QuizRenderPage"));

// MALT — the Leaguecraft lobby rendered from frozen demo state, so the three
// parchment scrolls can be reviewed as an ESTABLISHED account reads them
// rather than as an empty one. Inert: it fetches nothing and writes nothing.
const LobbyPreviewPage = lazy(() => import("./pages/dev/lobby-preview/LobbyPreviewPage"));
const PlayScrollPreviewPage = lazy(() => import("./pages/dev/play-scroll/PlayScrollPreviewPage"));

// Content Post Studio — local dev/admin tool driving the loopback studio
// server (npm run content-studio). Inert without it; not linked anywhere.
const ContentStudioPage = lazy(() => import("./pages/dev/content-studio/ContentStudioPage"));

// Public Mastery journeys (J4 launch) — catalog + parameterized player.
// Authenticated; the backend catalog is the only source of listed sets.
const MasteryJourneysPage = lazy(() => import("./pages/quiz-mastery/MasteryJourneysPage"));
const MasteryJourneyPlayerPage = lazy(() => import("./pages/quiz-mastery/MasteryJourneyPlayerPage"));

// Live Mastery (H1/G7) — gated dev player + admin reviewer. Not linked from
// navigation and absent from the sitemap; authenticated / admin-gated routes only.
const MasteryAhriVsSyndraPage = lazy(() => import("./pages/dev/mastery/AhriVsSyndraPage"));
const MasterySyndraProgressionPage = lazy(() => import("./pages/dev/mastery/SyndraProgressionPage"));
const MasterySyndraBranchingPage = lazy(() => import("./pages/dev/mastery/SyndraBranchingPage"));
const MasteryLuxProgressionPage = lazy(() => import("./pages/dev/mastery/LuxProgressionPage"));
const MasteryJarvanProgressionPage = lazy(() => import("./pages/dev/mastery/JarvanProgressionPage"));
const MasteryMaokaiProgressionPage = lazy(() => import("./pages/dev/mastery/MaokaiProgressionPage"));
const MasteryOlafProgressionPage = lazy(() => import("./pages/dev/mastery/OlafProgressionPage"));
const MasteryLuxCooldownProgressionPage = lazy(() => import("./pages/dev/mastery/LuxCooldownProgressionPage"));
const MasteryJarvanCooldownProgressionPage = lazy(() => import("./pages/dev/mastery/JarvanCooldownProgressionPage"));
const MasteryOlafCooldownManaProgressionPage = lazy(() => import("./pages/dev/mastery/OlafCooldownManaProgressionPage"));
const MasteryReviewerPage = lazy(() => import("./pages/admin/mastery/MasteryReviewerPage"));

// League of Legends Glossary — public reference module. Lazy so the
// definitions bundle only loads when the page is visited.
const LolGlossary = lazy(() => import("./pages/lol/Glossary"));

// Patch Reports — public per-patch change reports with Mogzy data comparison.
const PatchReports = lazy(() => import("./pages/lol/PatchReports"));

// Mechanics Explorer — public tools over the canonical mechanics engine
// (MECH1 Phase 5B1: respawn calculator + wave timeline).
const MechanicsExplorerPage = lazy(() => import("./pages/lol/mechanics/MechanicsExplorerPage"));

// Keep cached data warm so navigating back to a screen doesn't refetch.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,        // 1 min — most lists/configs don't change second-to-second
      gcTime: 10 * 60_000,      // keep cache 10 min after unmount
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

import { RouteLoader } from "@/components/Layout";
import { StartupSurface } from "@/components/startup/StartupShells";

/**
 * Subtle in-Layout fallback used while a lazy route chunk resolves.
 * The outer Layout (navbar, background, theme) stays mounted, so we only
 * need to hold the content area open with a transparent placeholder —
 * avoiding the full-screen logo "blink" between navigations.
 */
const RouteFallback = () => <div aria-hidden className="min-h-[50vh]" />;

/**
 * SIM2 Phase 5A: the ONE element both team-sim paths render.
 *
 * Declared once and used by both <Route>s, so the promoted route and the
 * internal alias cannot diverge — a React element is a description, and only
 * whichever route matched ever mounts.
 *
 * The boundary is OUTSIDE the <Suspense>, which is the whole reason it is
 * imported eagerly: a boundary inside the lazy chunk could not catch that
 * chunk failing to load. It is also outside the page component itself, because
 * a boundary cannot catch a throw from its own render.
 */
const teamSimElement = (
  <TeamSimErrorBoundary>
    <Suspense fallback={<RouteFallback />}>
      <TeamSimPage />
    </Suspense>
  </TeamSimErrorBoundary>
);

/**
 * League-only public mode: wraps non-League route elements so they redirect
 * to the League hub while the flag is on. Components stay in the codebase —
 * flip LEAGUE_ONLY_MODE in site-config.ts to restore them.
 */
const leagueGate = (element: ReactElement) =>
  LEAGUE_ONLY_MODE ? <Navigate to={LEAGUE_HOME_ROUTE} replace /> : element;

function AuthQuerySyncBridge() {
  useAuthQuerySync();
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <AuthQuerySyncBridge />
      <AdminAuthProvider>
      <SitewideThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
              <AcademyRadioController />
              <Routes>
                {/* Root entrance. In League-only mode the Academy entry screen IS
                    the homepage: it renders outside <Layout /> so no navbar or
                    footer appears, and its call to action navigates on to
                    LEAGUE_HOME_ROUTE. This deliberately does not use leagueGate,
                    which redirects to /lol — the entrance replaces that redirect.
                    With LEAGUE_ONLY_MODE off, / falls back to the legacy Mogsy
                    landing exactly as before, so the flag keeps its meaning. */}
                <Route
                  path="/"
                  element={
                    LEAGUE_ONLY_MODE ? (
                      <Suspense fallback={<StartupSurface pathname="/" />}><MogzyEntryV2 seo="root" /></Suspense>
                    ) : (
                      <Suspense fallback={<RouteLoader />}><Index /></Suspense>
                    )
                  }
                />
                {/* HI1 Academy introduction. A real route, not modal state: it
                    survives refresh and direct navigation, and it stays reachable
                    after completion so it can serve as Getting Started / replay.
                    Deliberately NOT redirected away for returning visitors — the
                    entrance decides who is sent here; opening it directly is
                    always honoured. */}
                <Route path="/welcome" element={<Suspense fallback={<StartupSurface pathname="/welcome" />}><AcademyWelcomePage /></Suspense>} />
                {/* Isolated preview of the legacy pre-Mogzy entry screen (src/pages/Index.tsx).
                    Ungated on purpose — inspection only, not a production route. */}
                <Route path="/dev/legacy-entry" element={<Suspense fallback={<RouteLoader />}><Index /></Suspense>} />
                {/* Dev-only V2 entrance concept. Full-screen and layout-free like the
                    original, so it sits outside <Layout /> alongside the legacy route. */}
                <Route path="/dev/mogzy-entry-v2" element={<Suspense fallback={<StartupSurface pathname="/dev/mogzy-entry-v2" />}><MogzyEntryV2 /></Suspense>} />
                <Route path="/auth" element={<Suspense fallback={<RouteLoader />}><Auth /></Suspense>} />
                <Route path="/auth/callback" element={<Suspense fallback={<RouteLoader />}><AuthCallback /></Suspense>} />
                <Route path="/reset-password" element={<Suspense fallback={<RouteLoader />}><ResetPassword /></Suspense>} />
                <Route element={<Layout />}>
                  <Route path="/home" element={leagueGate(<ProtectedRoute><Home /></ProtectedRoute>)} />
                  <Route path="/play" element={leagueGate(<ProtectedRoute><Play /></ProtectedRoute>)} />
                  <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/referral" element={leagueGate(<ProtectedRoute><Referral /></ProtectedRoute>)} />
                  <Route path="/swipe" element={leagueGate(<ProtectedRoute><SwipeHub /></ProtectedRoute>)} />
                  <Route path="/swipe-game" element={leagueGate(<ProtectedRoute><Swipe /></ProtectedRoute>)} />
                  <Route path="/leagues/:type" element={leagueGate(<ProtectedRoute><Leagues /></ProtectedRoute>)} />
                  <Route path="/leaderboard/:leagueId" element={leagueGate(<Leaderboard />)} />
                  <Route path="/swipe/preset/:leagueId" element={leagueGate(<SwipePreset />)} />
                  <Route path="/shop" element={leagueGate(<ProtectedRoute><Shop /></ProtectedRoute>)} />
                  <Route path="/swipe-leagues" element={leagueGate(<ProtectedRoute><SwipeLeagues /></ProtectedRoute>)} />
                  <Route path="/elo-check" element={leagueGate(<ProtectedRoute><EloCheck /></ProtectedRoute>)} />
                  {/* Authenticated-only: a signed-out visitor cannot read any
                      profile row under current RLS, so an unprotected route
                      could only ever render "Profile not found". */}
                  <Route path="/user/:profileId" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
                  {/* ---------------------------------------------------------------
                      The unified Admin application.

                      One layout route carries the shell for every /admin page, so
                      navigation is identical everywhere. The shell is wrapped in the
                      SAME <AdminRoute> the legacy dashboard used, so the set of people
                      who can see an admin page is exactly what it was.

                      Three destinations stay OUTSIDE this block on purpose:
                        · /admin/quiz-content   — a full-height workspace whose layout
                                                  assumes it owns the viewport
                        · /admin/knowledge/*    — carries its own sidebar shell
                        · /admin/quiz-broadcast/view — chrome-free window capture
                      Each keeps its own route and gate untouched and links back here.
                      --------------------------------------------------------------- */}
                  <Route path="/admin" element={<AdminRoute><Suspense fallback={<RouteFallback />}><AdminShell /></Suspense></AdminRoute>}>
                    <Route index element={<Suspense fallback={<RouteFallback />}><AdminOverviewPage /></Suspense>} />
                    <Route path="all-tools" element={<Suspense fallback={<RouteFallback />}><AdminAllToolsPage /></Suspense>} />
                    {/* /admin/directory kept as a permanent compatibility alias: it is
                        the only admin link the HUD has ever had, so bookmarks exist. */}
                    <Route path="directory" element={<Navigate to="/admin/all-tools" replace />} />
                    {/* The pre-reorganization directory page itself, preserved rather
                        than deleted. All Tools supersedes it; this stays reachable so
                        the migration removes nothing. */}
                    <Route path="legacy-directory" element={<Suspense fallback={<RouteFallback />}><AdminDirectory /></Suspense>} />
                    {/* The original 17-tab dashboard, preserved unchanged. Its tabs all
                        have canonical homes now; this stays so a mis-migration cannot
                        cost a capability. Retire only with owner approval. */}
                    <Route path="legacy-dashboard" element={<Admin />} />
                    <Route path="people" element={<Suspense fallback={<RouteFallback />}><AdminPeoplePage /></Suspense>} />
                    <Route path="users" element={<AdminRoute roles={["master_admin"]}><Suspense fallback={<RouteFallback />}><AdminUserDirectory /></Suspense></AdminRoute>} />
                    <Route path="leaguecraft" element={<Suspense fallback={<RouteFallback />}><AdminLeaguecraftPage /></Suspense>} />
                    <Route path="ranked" element={<Suspense fallback={<RouteFallback />}><AdminRankedPage /></Suspense>} />
                    <Route path="simulation" element={<Suspense fallback={<RouteFallback />}><AdminSimulationPage /></Suspense>} />
                    <Route path="game-data" element={<Suspense fallback={<RouteFallback />}><AdminGameDataPage /></Suspense>} />
                    <Route path="studio" element={<Suspense fallback={<RouteFallback />}><AdminStudioPage /></Suspense>} />
                    <Route path="operations" element={<Suspense fallback={<RouteFallback />}><AdminOperationsPage /></Suspense>} />
                    <Route path="developer" element={<Suspense fallback={<RouteFallback />}><AdminDeveloperPage /></Suspense>} />
                    <Route path="arena" element={<Suspense fallback={<RouteFallback />}><AdminArenaPage /></Suspense>} />
                    {/* Existing admin pages, unchanged except that they now render
                        inside the shell. Their own guards are redundant under the
                        layout gate and are therefore not repeated. */}
                    <Route path="play" element={<Suspense fallback={<RouteFallback />}><AdminPlay /></Suspense>} />
                    <Route path="data" element={<Suspense fallback={<RouteFallback />}><AdminData /></Suspense>} />
                    <Route path="demo" element={<Suspense fallback={<RouteFallback />}><AdminDemo /></Suspense>} />
                    <Route path="gaming" element={<Suspense fallback={<RouteFallback />}><AdminGaming /></Suspense>} />
                    <Route path="blog" element={<Suspense fallback={<RouteFallback />}><AdminBlog /></Suspense>} />
                    <Route path="blog/:id" element={<Suspense fallback={<RouteFallback />}><AdminBlogEditor /></Suspense>} />
                    <Route path="about" element={<Suspense fallback={<RouteFallback />}><AdminAbout /></Suspense>} />
                    <Route path="diagnostics" element={<Suspense fallback={<RouteFallback />}><AdminDiagnostics /></Suspense>} />
                    <Route path="platform-policies" element={<Suspense fallback={<RouteFallback />}><AdminPlatformPolicies /></Suspense>} />
                    <Route path="quiz-broadcast" element={<Suspense fallback={<RouteFallback />}><AdminQuizBroadcast /></Suspense>} />
                    <Route path="quiz-video-export" element={<Suspense fallback={<RouteFallback />}><AdminVideoExport /></Suspense>} />
                    <Route path="combat-battles" element={<Suspense fallback={<RouteFallback />}><CombatBattlesAdmin /></Suspense>} />
                    <Route path="mastery/:artifactDigest" element={<Suspense fallback={<RouteFallback />}><MasteryReviewerPage /></Suspense>} />
                  </Route>
                  <Route path="/moderator" element={<AdminRoute roles={["moderator", "admin", "master_admin"]}><Suspense fallback={<RouteFallback />}><Moderator /></Suspense></AdminRoute>} />
                  {/* Retired legacy team lobby. Previously leagueGate'd (which
                      already redirected in League-only mode); now an explicit
                      redirect so the intent is permanent rather than a side
                      effect of the flag. */}
                  <Route path="/multiplayer" element={<Navigate to={LEAGUE_HOME_ROUTE} replace />} />
                  <Route path="/multiplayer/game/:gameId" element={<Navigate to={LEAGUE_HOME_ROUTE} replace />} />
                  <Route path="/feedback" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><Feedback /></Suspense></ProtectedRoute>} />
                  <Route path="/blog" element={<Suspense fallback={<RouteFallback />}><BlogIndex /></Suspense>} />
                  <Route path="/blog/:slug" element={<Suspense fallback={<RouteFallback />}><BlogPost /></Suspense>} />
                  <Route path="/admin/quiz-content" element={<AdminRoute><Suspense fallback={<RouteFallback />}><AdminQuizWorkspace /></Suspense></AdminRoute>} />
                  {/* Legacy routes delegate into the unified workspace on the matching tab,
                      preserving any incoming query params (filters, ids, packs, pagination). */}
                  <Route path="/admin/quiz-review" element={<QuizContentRedirect tab="review" />} />
                  <Route path="/admin/quiz-builder" element={<QuizContentRedirect tab="builder" />} />
                  {/* Retain the earlier working name as a thin redirect so any bookmarks survive. */}
                  <Route path="/admin/workspace" element={<Navigate to="/admin/quiz-content" replace />} />
                  <Route
                    path="/admin/knowledge"
                    element={
                      <AdminRoute roles={["master_admin"]}>
                        <Suspense fallback={<RouteFallback />}>
                          <KnowledgeAdminLayout />
                        </Suspense>
                      </AdminRoute>
                    }
                  >
                    <Route index element={<Suspense fallback={<RouteFallback />}><KnowledgeDashboard /></Suspense>} />
                    <Route path="queue" element={<Suspense fallback={<RouteFallback />}><KnowledgeQueue /></Suspense>} />
                    <Route path="review/:id" element={<Suspense fallback={<RouteFallback />}><KnowledgeReviewPage /></Suspense>} />
                    <Route path="health" element={<Suspense fallback={<RouteFallback />}><KnowledgeHealth /></Suspense>} />
                    <Route path="health/:champion" element={<Suspense fallback={<RouteFallback />}><KnowledgeChampionDetail /></Suspense>} />
                    <Route path="rundown" element={<Suspense fallback={<RouteFallback />}><KnowledgeRundown /></Suspense>} />
                    <Route path="history" element={<Suspense fallback={<RouteFallback />}><KnowledgeHistory /></Suspense>} />
                    {/* Patch Ops operation detail. Reached from the dashboard card;
                        deliberately not a nav entry, because it is about ONE operation
                        rather than a section. Inherits the master_admin gate above. */}
                    <Route path="patch-ops/:operationId" element={<Suspense fallback={<RouteFallback />}><PatchOpsDetail /></Suspense>} />
                  </Route>
                  <Route path="/combat-lab" element={<Suspense fallback={<RouteFallback />}><CombatLab /></Suspense>} />
                  <Route path="/combat-lab/diagnostics" element={<Suspense fallback={<RouteFallback />}><CombatLabDiagnostics /></Suspense>} />
                  {/* SIM2 Phase 5A: the promoted, user-facing team simulator.
                      Registered ONLY when the flag is on, so the path 404s
                      like any other unknown route while the feature is off —
                      rather than existing and refusing, which would advertise
                      it. Not wrapped in ProtectedRoute, deliberately and to
                      match /combat-lab above: the surface is browsable and the
                      BACKEND is what requires a verified account, so an
                      unauthenticated visitor can read the assumptions and the
                      catalog but cannot spend anything. */}
                  {isTeamSimPublicRouteEnabled() ? (
                    <Route path={TEAM_SIM_ROUTE} element={teamSimElement} />
                  ) : null}
                  <Route path="/lol/combat-battles" element={<Suspense fallback={<RouteFallback />}><CombatBattlesIndex /></Suspense>} />
                  <Route path="/lol/combat-battles/:slug" element={<Suspense fallback={<RouteFallback />}><CombatBattleDetail /></Suspense>} />
                  <Route path="/onboarding/ranked-tutorial" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><RankedTutorialOnboardingPage /></Suspense></ProtectedRoute>} />
                  {/* Permanent Leaguecraft tutorial entry: any authenticated user may start
                      or replay the tutorial here, regardless of the auto-popup and
                      forced-tutorial policies. Same page component as the onboarding route,
                      and deliberately NOT wrapped in RequireRankedTutorial — guarding a
                      tutorial route with the tutorial gate is a redirect loop. */}
                  <Route path="/quiz/tutorial" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><RankedTutorialOnboardingPage /></Suspense></ProtectedRoute>} />
                  <Route path="/quiz" element={<RequireRankedTutorial><Suspense fallback={<RouteFallback />}><Quiz /></Suspense></RequireRankedTutorial>} />
                  <Route path="/quiz/daily" element={<RequireRankedTutorial><Suspense fallback={<RouteFallback />}><QuizDailyScoreAttack /></Suspense></RequireRankedTutorial>} />
                  <Route path="/quiz/ranked" element={<RequireRankedTutorial><Suspense fallback={<RouteFallback />}><QuizRankedPage /></Suspense></RequireRankedTutorial>} />
                  <Route path="/quiz/diagnostics" element={<Suspense fallback={<RouteFallback />}><QuizDiagnostics /></Suspense>} />
                  <Route path="/quiz/admin" element={<AdminRoute><Suspense fallback={<RouteFallback />}><QuizAdmin /></Suspense></AdminRoute>} />
                  {/* Layout is already mounted here and already painting the
                      League base colour, so the hub needs nothing but its height
                      held. Drawing the hub's geometry here made the visitor
                      watch the page assemble; a plain surface just resolves. */}
                  <Route path="/lol" element={<Suspense fallback={<RouteFallback />}><LolHub /></Suspense>} />
                  <Route path="/league-swipe" element={<Suspense fallback={<RouteFallback />}><LeagueSwipeHub /></Suspense>} />
                  <Route path="/league-swipe/stats" element={<Suspense fallback={<RouteFallback />}><LeagueSwipeStats /></Suspense>} />
                  <Route path="/league-swipe/:gameSlug" element={<Suspense fallback={<RouteFallback />}><LeagueSwipeGame /></Suspense>} />
                  <Route path="/lol/tier-list" element={<Suspense fallback={<RouteFallback />}><LolTierList /></Suspense>} />
                  <Route path="/lol/mechanics" element={<Suspense fallback={<RouteFallback />}><MechanicsExplorerPage /></Suspense>} />
                  <Route path="/lol/docs" element={<Suspense fallback={<RouteFallback />}><LeagueDocsLanding /></Suspense>} />
                  <Route path="/lol/docs/champions" element={<Suspense fallback={<RouteFallback />}><LeagueDocsChampionIndex /></Suspense>} />
                  <Route path="/lol/docs/champions/:slug" element={<Suspense fallback={<RouteFallback />}><LeagueDocsChampionDetail /></Suspense>} />
                  <Route path="/lol/docs/pro" element={<Suspense fallback={<RouteFallback />}><LeagueDocsProData /></Suspense>} />
                  <Route path="/lol/docs/pro/years/:year" element={<Suspense fallback={<RouteFallback />}><LeagueDocsProYear /></Suspense>} />
                  <Route path="/lol/docs/pro/champions" element={<Suspense fallback={<RouteFallback />}><LeagueDocsProChampionIndex /></Suspense>} />
                  <Route path="/lol/docs/pro/champions/:slug" element={<Suspense fallback={<RouteFallback />}><LeagueDocsProChampionDetail /></Suspense>} />
                  {/* Public roster wiki. Distinct from the paid /lol/pro product page below. */}
                  <Route path="/lol/docs/pro/rosters" element={<Suspense fallback={<RouteFallback />}><ProRosterLanding /></Suspense>} />
                  <Route path="/lol/docs/pro/players" element={<Suspense fallback={<RouteFallback />}><ProRosterPlayers /></Suspense>} />
                  <Route path="/lol/docs/pro/players/:lpPage" element={<Suspense fallback={<RouteFallback />}><ProRosterPlayerProfile /></Suspense>} />
                  <Route path="/lol/docs/pro/teams" element={<Suspense fallback={<RouteFallback />}><ProRosterTeams /></Suspense>} />
                  <Route path="/lol/docs/pro/teams/:lpPage" element={<Suspense fallback={<RouteFallback />}><ProRosterTeamProfile /></Suspense>} />
                  <Route path="/lol/dev-changelog" element={<Suspense fallback={<RouteFallback />}><LolDevChangelog /></Suspense>} />
                  <Route path="/lol/history" element={<Suspense fallback={<RouteFallback />}><LolHistory /></Suspense>} />
                  <Route path="/lol/missed-questions" element={<Suspense fallback={<RouteFallback />}><LolMissedQuestions /></Suspense>} />
                  <Route path="/lol/pro" element={<Suspense fallback={<RouteFallback />}><LolPro /></Suspense>} />
                  <Route path="/lol/glossary" element={<Suspense fallback={<RouteFallback />}><LolGlossary /></Suspense>} />
                  <Route path="/lol/patch-reports" element={<Suspense fallback={<RouteFallback />}><PatchReports /></Suspense>} />
                  <Route path="/about" element={<Suspense fallback={<RouteFallback />}><About /></Suspense>} />
                  <Route path="/privacy" element={<Suspense fallback={<RouteFallback />}><Privacy /></Suspense>} />
                  <Route path="/terms" element={<Suspense fallback={<RouteFallback />}><Terms /></Suspense>} />
                  <Route path="/security" element={<Suspense fallback={<RouteFallback />}><Security /></Suspense>} />
                  <Route path="/contact" element={<Suspense fallback={<RouteFallback />}><Contact /></Suspense>} />
                  <Route path="/dev/ranked-duel" element={<Suspense fallback={<RouteFallback />}><RankedDuelPrototype /></Suspense>} />
                  <Route path="/dev/stat-check" element={<Suspense fallback={<RouteFallback />}><StatCheckPage /></Suspense>} />
                  <Route path="/quiz/stat-check" element={<Suspense fallback={<RouteFallback />}><StatCheckModeSelectPage /></Suspense>} />
                  <Route path="/quiz/stat-check/bot" element={<Suspense fallback={<RouteFallback />}><StatCheckBotPage /></Suspense>} />
                  <Route path="/quiz/stat-check/private" element={<Suspense fallback={<RouteFallback />}><StatCheckRoomPage /></Suspense>} />
                  <Route path="/quiz/stat-check/room/:inviteCode" element={<Suspense fallback={<RouteFallback />}><StatCheckRoomPage /></Suspense>} />
                  <Route path="/dev/daily-score-attack" element={<Suspense fallback={<RouteFallback />}><DailyScoreAttackPage /></Suspense>} />
                  <Route path="/dev/ranked-tutorial" element={<Suspense fallback={<RouteFallback />}><RankedTutorialPage /></Suspense>} />
                  <Route path="/dev/ranked-arena-inspector" element={<Suspense fallback={<RouteFallback />}><RankedArenaInspector /></Suspense>} />
                  <Route path="/dev/lobby-preview" element={<Suspense fallback={<RouteFallback />}><LobbyPreviewPage /></Suspense>} />
                  <Route path="/dev/play-scroll" element={<Suspense fallback={<RouteFallback />}><PlayScrollPreviewPage /></Suspense>} />
                  <Route path="/dev/graph1" element={<Suspense fallback={<RouteFallback />}><Graph1RacePage /></Suspense>} />
                  <Route path="/dev/mechanics/xp" element={<Suspense fallback={<RouteFallback />}><MechanicsXpPage /></Suspense>} />
                  {/* The internal alias. Same element as the promoted route,
                      always registered, never linked from navigation — this is
                      how the feature stays reachable for internal work while
                      the public flag is off. */}
                  <Route path={TEAM_SIM_DEV_ROUTE} element={teamSimElement} />
                  <Route path="/esports/live" element={<Suspense fallback={<RouteFallback />}><EsportsLivePage /></Suspense>} />
                  <Route path="/quiz/mastery" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><MasteryJourneysPage /></Suspense></ProtectedRoute>} />
                  <Route path="/quiz/mastery/:masterySetId" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><MasteryJourneyPlayerPage /></Suspense></ProtectedRoute>} />
                  <Route path="/dev/mastery/ahri-vs-syndra" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><MasteryAhriVsSyndraPage /></Suspense></ProtectedRoute>} />
                  <Route path="/dev/mastery/syndra-progression" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><MasterySyndraProgressionPage /></Suspense></ProtectedRoute>} />
                  <Route path="/dev/mastery/syndra-branching" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><MasterySyndraBranchingPage /></Suspense></ProtectedRoute>} />
                  <Route path="/dev/mastery/lux-progression" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><MasteryLuxProgressionPage /></Suspense></ProtectedRoute>} />
                  <Route path="/dev/mastery/jarvan-progression" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><MasteryJarvanProgressionPage /></Suspense></ProtectedRoute>} />
                  <Route path="/dev/mastery/maokai-progression" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><MasteryMaokaiProgressionPage /></Suspense></ProtectedRoute>} />
                  <Route path="/dev/mastery/olaf-progression" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><MasteryOlafProgressionPage /></Suspense></ProtectedRoute>} />
                  <Route path="/dev/mastery/lux-cooldown-progression" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><MasteryLuxCooldownProgressionPage /></Suspense></ProtectedRoute>} />
                  <Route path="/dev/mastery/jarvan-cooldown-progression" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><MasteryJarvanCooldownProgressionPage /></Suspense></ProtectedRoute>} />
                  <Route path="/dev/mastery/olaf-cooldown-mana-progression" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><MasteryOlafCooldownManaProgressionPage /></Suspense></ProtectedRoute>} />
                </Route>
                <Route path="/secret-room" element={<Suspense fallback={<RouteLoader />}><SecretRoom /></Suspense>} />
                <Route path="/admin/quiz-broadcast/view" element={<AdminRoute><Suspense fallback={<RouteLoader />}><QuizBroadcastView /></Suspense></AdminRoute>} />
                <Route path="/broadcast/live-view" element={<Suspense fallback={<RouteLoader />}><BroadcastLiveView /></Suspense>} />
                <Route path="/dev/quiz-render" element={<Suspense fallback={<RouteLoader />}><QuizRenderPage /></Suspense>} />
                <Route path="/dev/content-studio" element={<Suspense fallback={<RouteLoader />}><ContentStudioPage /></Suspense>} />
                <Route path="/:slug" element={<Suspense fallback={<RouteLoader />}><CustomLink /></Suspense>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </SitewideThemeProvider>
      </AdminAuthProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
