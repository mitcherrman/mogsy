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
import { lazy, Suspense } from "react";

/**
 * Wraps dynamic imports so a stale chunk (after a redeploy, when the cached
 * index.html references an old asset hash that no longer exists) triggers a
 * one-time hard reload instead of a blank screen.
 */
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err: any) {
      const msg = String(err?.message || err);
      const isChunkError =
        /dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
          msg
        );
      if (isChunkError && typeof window !== "undefined") {
        const key = "__lov_chunk_reloaded__";
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          window.location.reload();
          // Return a never-resolving promise so Suspense keeps the fallback
          // until the reload kicks in.
          return new Promise(() => {}) as any;
        }
      }
      throw err;
    }
  });
}

const Index = lazyWithRetry(() => import("./pages/Index"));

// Lazy-load all non-landing routes to reduce initial JS bundle
const Home = lazyWithRetry(() => import("./pages/Home"));
const Auth = lazyWithRetry(() => import("./pages/Auth"));
const Play = lazyWithRetry(() => import("./pages/Play"));
const Profile = lazyWithRetry(() => import("./pages/Profile"));
const Swipe = lazyWithRetry(() => import("./pages/Swipe"));
const SwipeHub = lazyWithRetry(() => import("./pages/SwipeHub"));
const Leagues = lazyWithRetry(() => import("./pages/Leagues"));
const Leaderboard = lazyWithRetry(() => import("./pages/Leaderboard"));
const SwipePreset = lazyWithRetry(() => import("./pages/SwipePreset"));
const Settings = lazyWithRetry(() => import("./pages/Settings"));
const Referral = lazyWithRetry(() => import("./pages/Referral"));
const Admin = lazyWithRetry(() => import("./pages/Admin"));
const Shop = lazyWithRetry(() => import("./pages/Shop"));
const EloCheck = lazyWithRetry(() => import("./pages/EloCheck"));
const SwipeLeagues = lazyWithRetry(() => import("./pages/SwipeLeagues"));
const UserProfile = lazyWithRetry(() => import("./pages/UserProfile"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const AdminPlay = lazyWithRetry(() => import("./pages/AdminPlay"));
const AdminData = lazyWithRetry(() => import("./pages/AdminData"));
const AdminDemo = lazyWithRetry(() => import("./pages/AdminDemo"));
const AdminGaming = lazyWithRetry(() => import("./pages/AdminGaming"));
const SecretRoom = lazyWithRetry(() => import("./pages/SecretRoom"));
const Moderator = lazyWithRetry(() => import("./pages/Moderator"));
const CustomLink = lazyWithRetry(() => import("./pages/CustomLink"));
const Multiplayer = lazyWithRetry(() => import("./pages/Multiplayer"));
const MultiplayerGame = lazyWithRetry(() => import("./pages/MultiplayerGame"));
const Feedback = lazyWithRetry(() => import("./pages/Feedback"));

const queryClient = new QueryClient();

const LazyFallback = () => (
  <div className="min-h-screen bg-background" />
);

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
                <Route path="/" element={<Suspense fallback={<LazyFallback />}><Index /></Suspense>} />
                <Route path="/auth" element={<Suspense fallback={<LazyFallback />}><Auth /></Suspense>} />
                <Route path="/reset-password" element={<Suspense fallback={<LazyFallback />}><ResetPassword /></Suspense>} />
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
                  <Route path="/admin/play" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><AdminPlay /></Suspense></ProtectedRoute>} />
                  <Route path="/admin/data" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><AdminData /></Suspense></ProtectedRoute>} />
                  <Route path="/admin/demo" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><AdminDemo /></Suspense></ProtectedRoute>} />
                  <Route path="/admin/gaming" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><AdminGaming /></Suspense></ProtectedRoute>} />
                  <Route path="/moderator" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><Moderator /></Suspense></ProtectedRoute>} />
                  <Route path="/multiplayer" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><Multiplayer /></Suspense></ProtectedRoute>} />
                  <Route path="/multiplayer/game/:gameId" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><MultiplayerGame /></Suspense></ProtectedRoute>} />
                  <Route path="/feedback" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><Feedback /></Suspense></ProtectedRoute>} />
                </Route>
                <Route path="/secret-room" element={<Suspense fallback={<LazyFallback />}><SecretRoom /></Suspense>} />
                <Route path="/:slug" element={<Suspense fallback={<LazyFallback />}><CustomLink /></Suspense>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </SitewideThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
