import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { SitewideThemeProvider } from "./hooks/useSitewideTheme";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { lazy, Suspense } from "react";

// Lazy-load all non-landing routes to reduce initial JS bundle
const Home = lazy(() => import("./pages/Home"));
const Auth = lazy(() => import("./pages/Auth"));
const Play = lazy(() => import("./pages/Play"));
const Profile = lazy(() => import("./pages/Profile"));
const Swipe = lazy(() => import("./pages/Swipe"));
const Leagues = lazy(() => import("./pages/Leagues"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const SwipePreset = lazy(() => import("./pages/SwipePreset"));
const Settings = lazy(() => import("./pages/Settings"));
const Referral = lazy(() => import("./pages/Referral"));
const Admin = lazy(() => import("./pages/Admin"));
const Shop = lazy(() => import("./pages/Shop"));
const EloCheck = lazy(() => import("./pages/EloCheck"));
const SwipeLeagues = lazy(() => import("./pages/SwipeLeagues"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AdminPlay = lazy(() => import("./pages/AdminPlay"));
const AdminData = lazy(() => import("./pages/AdminData"));
const AdminDemo = lazy(() => import("./pages/AdminDemo"));
const SecretRoom = lazy(() => import("./pages/SecretRoom"));
const Moderator = lazy(() => import("./pages/Moderator"));

const queryClient = new QueryClient();

const LazyFallback = () => (
  <div className="min-h-screen bg-background" />
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <SitewideThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Suspense fallback={<LazyFallback />}><Auth /></Suspense>} />
                <Route path="/reset-password" element={<Suspense fallback={<LazyFallback />}><ResetPassword /></Suspense>} />
                <Route element={<Layout />}>
                  <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                  <Route path="/play" element={<ProtectedRoute><Play /></ProtectedRoute>} />
                  <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/referral" element={<ProtectedRoute><Referral /></ProtectedRoute>} />
                  <Route path="/swipe" element={<ProtectedRoute><Swipe /></ProtectedRoute>} />
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
                </Route>
                <Route path="/secret-room" element={<Suspense fallback={<LazyFallback />}><SecretRoom /></Suspense>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </SitewideThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
