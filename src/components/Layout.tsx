import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import { useTrackActivity } from "@/hooks/useTrackActivity";
import { useAuth } from "@/hooks/useAuth";

export default function Layout() {
  useTrackActivity();
  const { loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="animate-page-fade-in">
        <Navbar />
        <main className="pt-14">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
