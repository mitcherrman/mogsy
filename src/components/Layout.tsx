import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import { useTrackActivity } from "@/hooks/useTrackActivity";
import { useAuth } from "@/hooks/useAuth";

export default function Layout() {
  useTrackActivity();
  const { loading: authLoading } = useAuth();

  // Render nothing until auth resolves to prevent any navbar/content flash
  if (authLoading) {
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
