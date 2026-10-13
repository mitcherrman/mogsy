/**
 * UX3A — the Worlds experience as the production tournament page mounts it:
 * the shell at the Worlds URL plus each screen's document metadata.
 *
 * Loaded lazily by `ProPlayTournament` only when the build flag selects it,
 * so the published page's chunk carries none of the shell, its navigation
 * model or its SEO. Production data only: there is no badge, no data picker
 * and no `simulated` flag here; those belong to the development prototype.
 */
import { useLocation } from "react-router-dom";

import SEOHead from "@/components/SEOHead";
import type { TournamentResponseV2 } from "@/lib/pro-play/tournamentApi";
import { experienceSeo } from "@/lib/pro-play/worldsExperience/experienceSeo";
import { WORLDS_EXPERIENCE_BASE } from "@/lib/pro-play/worldsExperience/productionGate";

import WorldsExperience from "./WorldsExperience";

export default function ProductionExperience({ data, now, onRetry, retrying, refreshFailed }: {
  data: TournamentResponseV2;
  now: number;
  onRetry: () => void;
  retrying: boolean;
  refreshFailed: boolean;
}) {
  const location = useLocation();
  const seo = experienceSeo(data, WORLDS_EXPERIENCE_BASE, location.pathname, location.search);
  return (
    <>
      <SEOHead title={seo.title} description={seo.description} path={seo.path} />
      <WorldsExperience
        data={data}
        now={now}
        base={WORLDS_EXPERIENCE_BASE}
        onRetry={onRetry}
        retrying={retrying}
        refreshFailed={refreshFailed}
      />
    </>
  );
}
