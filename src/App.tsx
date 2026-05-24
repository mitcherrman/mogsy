import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { SitewideThemeProvider } from "./hooks/useSitewideTheme";
import { useAuthQuerySync } from "./hooks/useAuthQuerySync";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import NotFound from "./pages/NotFound";
import { Suspense } from "react";
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
const LolHub = R.LolHub.Component;

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
                <Route path="/" element={<Suspense fallback={<RouteLoader />}><Index /></Suspense>} />
                <Route path="/auth" element={<Suspense fallback={<RouteLoader />}><Auth /></Suspense>} />
                <Route path="/reset-password" element={<Suspense fallback={<RouteLoader />}><ResetPassword /></Suspense>} />
                <Route element={<Layout />}>
                  <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                  <Route path="/play" element={<ProtectedRoute><Play /></ProtectedRoute>} />
                  <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/referral" element={<ProtectedRoute><Referral /></ProtectedRoute>} />
                  <Route path="/swipe" element={<ProtectedRoute><SwipeHub /></ProtectedRoute>} />
                  <Route path="/swipe-game" element={<ProtectedRoute><Swipe /></ProtectedRoute>} />
                  <Route path="/leagues/:type" element={<ProtectedRoute><Leagues /></ProtectedRoute>} />
                  <Route path="/leaderboard/:leagueId" element={<Leaderboard />} />
                  <Route path="/swipe/preset/:leagueId" element={<SwipePreset />} />
                  <Route path="/shop" element={<ProtectedRoute><Shop /></ProtectedRoute>} />
                  <Route path="/swipe-leagues" element={<ProtectedRoute><SwipeLeagues /></ProtectedRoute>} />
                  <Route path="/elo-check" element={<ProtectedRoute><EloCheck /></ProtectedRoute>} />
                  <Route path="/user/:profileId" element={<UserProfile />} />
                  <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
                  <Route path="/admin/play" element={<ProtectedRoute><Suspense fallback={<RouteLoader />}><AdminPlay /></Suspense></ProtectedRoute>} />
                  <Route path="/admin/data" element={<ProtectedRoute><Suspense fallback={<RouteLoader />}><AdminData /></Suspense></ProtectedRoute>} />
                  <Route path="/admin/demo" element={<ProtectedRoute><Suspense fallback={<RouteLoader />}><AdminDemo /></Suspense></ProtectedRoute>} />
                  <Route path="/admin/gaming" element={<ProtectedRoute><Suspense fallback={<RouteLoader />}><AdminGaming /></Suspense></ProtectedRoute>} />
                  <Route path="/moderator" element={<ProtectedRoute><Suspense fallback={<RouteLoader />}><Moderator /></Suspense></ProtectedRoute>} />
                  <Route path="/multiplayer" element={<ProtectedRoute><Suspense fallback={<RouteLoader />}><Multiplayer /></Suspense></ProtectedRoute>} />
                  <Route path="/multiplayer/game/:gameId" element={<ProtectedRoute><Suspense fallback={<RouteLoader />}><MultiplayerGame /></Suspense></ProtectedRoute>} />
                  <Route path="/feedback" element={<ProtectedRoute><Suspense fallback={<RouteLoader />}><Feedback /></Suspense></ProtectedRoute>} />
                  <Route path="/blog" element={<Suspense fallback={<RouteLoader />}><BlogIndex /></Suspense>} />
                  <Route path="/blog/:slug" element={<Suspense fallback={<RouteLoader />}><BlogPost /></Suspense>} />
                  <Route path="/admin/blog" element={<ProtectedRoute><Suspense fallback={<RouteLoader />}><AdminBlog /></Suspense></ProtectedRoute>} />
                  <Route path="/admin/blog/:id" element={<ProtectedRoute><Suspense fallback={<RouteLoader />}><AdminBlogEditor /></Suspense></ProtectedRoute>} />
                  <Route path="/combat-lab" element={<Suspense fallback={<RouteLoader />}><CombatLab /></Suspense>} />
                  <Route path="/lol" element={<Suspense fallback={<RouteLoader />}><LolHub /></Suspense>} />
                </Route>
                <Route path="/secret-room" element={<Suspense fallback={<RouteLoader />}><SecretRoom /></Suspense>} />
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
