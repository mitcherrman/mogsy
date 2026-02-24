import { Outlet } from "react-router-dom";
import { useState, useEffect } from "react";
import Navbar from "./Navbar";
import { useTrackActivity } from "@/hooks/useTrackActivity";
import { useAuth } from "@/hooks/useAuth";

export default function Layout() {
  useTrackActivity();
  const { loading: authLoading } = useAuth();
  const [mounted, setMounted] = useState(false);

  // Only show content after auth resolves AND after the first paint cycle,
  // guaranteeing a blank frame is painted before the navbar appears.
  useEffect(() => {
    if (!authLoading) {
      requestAnimationFrame(() => setMounted(true));
    }
  }, [authLoading]);

  if (!mounted) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background animate-page-fade-in">
      <Navbar />
      <main className="pt-16">
        <Outlet />
      </main>
    </div>
  );
}
