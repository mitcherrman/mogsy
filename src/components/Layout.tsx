import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import { useTrackActivity } from "@/hooks/useTrackActivity";

export default function Layout() {
  useTrackActivity();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-16 animate-page-fade-in">
        <Outlet />
      </main>
    </div>
  );
}
