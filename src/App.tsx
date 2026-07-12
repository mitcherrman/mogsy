import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LEAGUE_ONLY_MODE, LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import { AuthProvider } from "./hooks/useAuth";
import { SitewideThemeProvider } from "./hooks/useSitewideTheme";
import { useAuthQuerySync } from "./hooks/useAuthQuerySync";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import Layout from "./components/Layout";
import NotFound from "./pages/NotFound";
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
const AdminPlay = R.AdminPlay.Component;
const AdminData = R.AdminData.Component;
const AdminDemo = R.AdminDemo.Component;
const AdminGaming = R.AdminGaming.Component;
const SecretRoom = R.SecretRoom.Component;
const Moderator = R.Moderator.Component;
const CustomLink = R.CustomLink.Component;
const Multiplayer = R.Multiplayer.Component;
const MultiplayerGame = R.MultiplayerGame.Component;
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
const LolHistory = R.LolHistory.Component;
const LolMissedQuestions = R.LolMissedQuestions.Component;
const LolPro = R.LolPro.Component;
const AdminAbout = R.AdminAbout.Component;
const AdminDiagnostics = R.AdminDiagnostics.Component;
const AdminQuizBroadcast = R.AdminQuizBroadcast.Component;
const QuizBroadcastView = R.QuizBroadcastView.Component;
const BroadcastLiveView = R.BroadcastLiveView.Component;
const AdminQuizReview = R.AdminQuizReview.Component;
const QuizBuilderPro = R.QuizBuilderPro.Component;
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

/**
 * Subtle in-Layout fallback used while a lazy route chunk resolves.
 * The outer Layout (navbar, background, theme) stays mounted, so we only
 * need to hold the content area open with a transparent placeholder —
 * avoiding the full-screen logo "blink" between navigations.
 */
const RouteFallback = () => <div aria-hidden className="min-h-[50vh]" />;

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
      <SitewideThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
              <Routes>
                <Route path="/" element={leagueGate(<Suspense fallback={<RouteLoader />}><Index /></Suspense>)} />
                <Route path="/auth" element={<Suspense fallback={<RouteLoader />}><Auth /></Suspense>} />
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
                  <Route path="/user/:profileId" element={<UserProfile />} />
                  <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
                  <Route path="/admin/play" element={<AdminRoute><Suspense fallback={<RouteFallback />}><AdminPlay /></Suspense></AdminRoute>} />
                  <Route path="/admin/data" element={<AdminRoute><Suspense fallback={<RouteFallback />}><AdminData /></Suspense></AdminRoute>} />
                  <Route path="/admin/demo" element={<AdminRoute><Suspense fallback={<RouteFallback />}><AdminDemo /></Suspense></AdminRoute>} />
                  <Route path="/admin/gaming" element={<AdminRoute><Suspense fallback={<RouteFallback />}><AdminGaming /></Suspense></AdminRoute>} />
                  <Route path="/moderator" element={<AdminRoute roles={["moderator", "admin", "master_admin"]}><Suspense fallback={<RouteFallback />}><Moderator /></Suspense></AdminRoute>} />
                  <Route path="/multiplayer" element={leagueGate(<ProtectedRoute><Suspense fallback={<RouteFallback />}><Multiplayer /></Suspense></ProtectedRoute>)} />
                  <Route path="/multiplayer/game/:gameId" element={leagueGate(<ProtectedRoute><Suspense fallback={<RouteFallback />}><MultiplayerGame /></Suspense></ProtectedRoute>)} />
                  <Route path="/feedback" element={<ProtectedRoute><Suspense fallback={<RouteFallback />}><Feedback /></Suspense></ProtectedRoute>} />
                  <Route path="/blog" element={<Suspense fallback={<RouteFallback />}><BlogIndex /></Suspense>} />
                  <Route path="/blog/:slug" element={<Suspense fallback={<RouteFallback />}><BlogPost /></Suspense>} />
                  <Route path="/admin/blog" element={<AdminRoute><Suspense fallback={<RouteFallback />}><AdminBlog /></Suspense></AdminRoute>} />
                  <Route path="/admin/blog/:id" element={<AdminRoute><Suspense fallback={<RouteFallback />}><AdminBlogEditor /></Suspense></AdminRoute>} />
                  <Route path="/admin/about" element={<AdminRoute><Suspense fallback={<RouteFallback />}><AdminAbout /></Suspense></AdminRoute>} />
                  <Route path="/admin/diagnostics" element={<AdminRoute><Suspense fallback={<RouteFallback />}><AdminDiagnostics /></Suspense></AdminRoute>} />
                  <Route path="/admin/quiz-broadcast" element={<AdminRoute><Suspense fallback={<RouteFallback />}><AdminQuizBroadcast /></Suspense></AdminRoute>} />
                  <Route path="/admin/quiz-review" element={<AdminRoute><Suspense fallback={<RouteFallback />}><AdminQuizReview /></Suspense></AdminRoute>} />
                  <Route path="/admin/quiz-builder" element={<AdminRoute><Suspense fallback={<RouteFallback />}><QuizBuilderPro /></Suspense></AdminRoute>} />
                  <Route path="/admin/quiz-video-export" element={<AdminRoute><Suspense fallback={<RouteFallback />}><AdminVideoExport /></Suspense></AdminRoute>} />
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
                  </Route>
                  <Route path="/combat-lab" element={<Suspense fallback={<RouteFallback />}><CombatLab /></Suspense>} />
                  <Route path="/combat-lab/diagnostics" element={<Suspense fallback={<RouteFallback />}><CombatLabDiagnostics /></Suspense>} />
                  <Route path="/quiz" element={<Suspense fallback={<RouteFallback />}><Quiz /></Suspense>} />
                  <Route path="/quiz/diagnostics" element={<Suspense fallback={<RouteFallback />}><QuizDiagnostics /></Suspense>} />
                  <Route path="/quiz/admin" element={<AdminRoute><Suspense fallback={<RouteFallback />}><QuizAdmin /></Suspense></AdminRoute>} />
                  <Route path="/lol" element={<Suspense fallback={<RouteFallback />}><LolHub /></Suspense>} />
                  <Route path="/league-swipe" element={<Suspense fallback={<RouteFallback />}><LeagueSwipeHub /></Suspense>} />
                  <Route path="/league-swipe/stats" element={<Suspense fallback={<RouteFallback />}><LeagueSwipeStats /></Suspense>} />
                  <Route path="/league-swipe/:gameSlug" element={<Suspense fallback={<RouteFallback />}><LeagueSwipeGame /></Suspense>} />
                  <Route path="/lol/tier-list" element={<Suspense fallback={<RouteFallback />}><LolTierList /></Suspense>} />
                  <Route path="/lol/docs" element={<Suspense fallback={<RouteFallback />}><LeagueDocsLanding /></Suspense>} />
                  <Route path="/lol/docs/champions" element={<Suspense fallback={<RouteFallback />}><LeagueDocsChampionIndex /></Suspense>} />
                  <Route path="/lol/docs/champions/:slug" element={<Suspense fallback={<RouteFallback />}><LeagueDocsChampionDetail /></Suspense>} />
                  <Route path="/lol/docs/pro" element={<Suspense fallback={<RouteFallback />}><LeagueDocsProData /></Suspense>} />
                  <Route path="/lol/docs/pro/years/:year" element={<Suspense fallback={<RouteFallback />}><LeagueDocsProYear /></Suspense>} />
                  <Route path="/lol/docs/pro/champions" element={<Suspense fallback={<RouteFallback />}><LeagueDocsProChampionIndex /></Suspense>} />
                  <Route path="/lol/docs/pro/champions/:slug" element={<Suspense fallback={<RouteFallback />}><LeagueDocsProChampionDetail /></Suspense>} />
                  <Route path="/lol/dev-changelog" element={<Suspense fallback={<RouteFallback />}><LolDevChangelog /></Suspense>} />
                  <Route path="/lol/history" element={<Suspense fallback={<RouteFallback />}><LolHistory /></Suspense>} />
                  <Route path="/lol/missed-questions" element={<Suspense fallback={<RouteFallback />}><LolMissedQuestions /></Suspense>} />
                  <Route path="/lol/pro" element={<Suspense fallback={<RouteFallback />}><LolPro /></Suspense>} />
                  <Route path="/about" element={<Suspense fallback={<RouteFallback />}><About /></Suspense>} />
                  <Route path="/privacy" element={<Suspense fallback={<RouteFallback />}><Privacy /></Suspense>} />
                  <Route path="/terms" element={<Suspense fallback={<RouteFallback />}><Terms /></Suspense>} />
                  <Route path="/security" element={<Suspense fallback={<RouteFallback />}><Security /></Suspense>} />
                  <Route path="/contact" element={<Suspense fallback={<RouteFallback />}><Contact /></Suspense>} />
                </Route>
                <Route path="/secret-room" element={<Suspense fallback={<RouteLoader />}><SecretRoom /></Suspense>} />
                <Route path="/admin/quiz-broadcast/view" element={<AdminRoute><Suspense fallback={<RouteLoader />}><QuizBroadcastView /></Suspense></AdminRoute>} />
                <Route path="/broadcast/live-view" element={<Suspense fallback={<RouteLoader />}><BroadcastLiveView /></Suspense>} />
                <Route path="/:slug" element={<Suspense fallback={<RouteLoader />}><CustomLink /></Suspense>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </SitewideThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
