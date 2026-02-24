import { Outlet } from "react-router-dom";
import { useState, useEffect } from "react";
import Navbar from "./Navbar";
import { useTrackActivity } from "@/hooks/useTrackActivity";
import { useAuth } from "@/hooks/useAuth";

export default function Layout() {
  useTrackActivity();
  const { loading: authLoading } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!authLoading && !visible) {
      // Double rAF ensures the blank frame is actually painted before we fade in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    }
  }, [authLoading, visible]);

  return (
    <div
      className="min-h-screen bg-background transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <Navbar />
      <main className="pt-16">
        <Outlet />
      </main>
    </div>
  );
}
