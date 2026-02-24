import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
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

const queryClient = new QueryClient();

const LazyFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<LazyFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route element={<Layout />}>
                <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                <Route path="/play" element={<ProtectedRoute><Play /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/referral" element={<ProtectedRoute><Referral /></ProtectedRoute>} />
                <Route path="/swipe" element={<ProtectedRoute><Swipe /></ProtectedRoute>} />
                <Route path="/leagues" element={<ProtectedRoute><Leagues /></ProtectedRoute>} />
                <Route path="/leaderboard/:leagueId" element={<Leaderboard />} />
                <Route path="/swipe/preset/:leagueId" element={<SwipePreset />} />
                <Route path="/shop" element={<ProtectedRoute><Shop /></ProtectedRoute>} />
                <Route path="/swipe-leagues" element={<ProtectedRoute><SwipeLeagues /></ProtectedRoute>} />
                <Route path="/elo-check" element={<ProtectedRoute><EloCheck /></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
