/**
 * Gated dev route: live Ahri E vs Syndra E Mastery player (H1 / G7).
 *
 * Authenticated (route wrapped in ProtectedRoute). Not linked from navigation and
 * not present in the sitemap. Live-only: it renders the backend-driven
 * MasteryPlayerLive container (no fixtures).
 */
import { MasteryPlayerLive } from "@/features/mastery/live";

export default function AhriVsSyndraPage() {
  return (
    <div className="min-h-[60vh]">
      <MasteryPlayerLive />
    </div>
  );
}
