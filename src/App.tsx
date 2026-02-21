import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import Swipe from "./pages/Swipe";
import Leagues from "./pages/Leagues";
import Leaderboard from "./pages/Leaderboard";
import Presets from "./pages/Presets";
import SwipePreset from "./pages/SwipePreset";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route element={<Layout />}>
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/swipe" element={<ProtectedRoute><Swipe /></ProtectedRoute>} />
              <Route path="/leagues" element={<ProtectedRoute><Leagues /></ProtectedRoute>} />
              <Route path="/leaderboard/:leagueId" element={<Leaderboard />} />
              <Route path="/presets" element={<Presets />} />
              <Route path="/swipe/preset/:leagueId" element={<SwipePreset />} />
              <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
