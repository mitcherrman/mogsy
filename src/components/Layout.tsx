import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import { useTrackActivity } from "@/hooks/useTrackActivity";
import { useAuth } from "@/hooks/useAuth";

export default function Layout() {
  useTrackActivity();
  const { loading } = useAuth();

  return (
      <Navbar />
      <main className="pt-14 animate-page-fade-in">
        <Outlet />
      </main>
    </div>
  );
}
