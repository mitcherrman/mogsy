/**
 * RC0 — Worlds Dynasty, the owner-only campaign at `/admin/dynasty` (AdminRoute).
 *
 * The same UX-7 campaign as `/dev/dynasty-v2?view=campaign`, mounted for a
 * production build: every result, progression and Baron grade comes from the E3B
 * backend (`/api/admin/dynasty/v2`, `DYNASTY_ENABLED` + `require_admin`), and the
 * bearer is the owner's Supabase session (`buildAdminHeaders`).
 *
 * The ROG1-D1 run page (`DynastyRunPage`) needs the v1 `/api/admin/dynasty/runs`
 * routes, which the E3B backend does not serve; it stays reachable only through
 * its DEV fixture preview (`/dev/dynasty`).
 */
import { Suspense } from "react";
import "@/pages/dev/dynasty-v2/vis.css";
import "@/pages/dev/dynasty-v2/vis-f2.css";
import "@/pages/dev/dynasty-v2/vis-f3.css";
import "@/pages/dev/dynasty-v2/vis-f4.css";
import { StingerHost } from "@/pages/dev/dynasty-v2/broadcast";
import { CampaignRoute } from "@/pages/dev/dynasty-v2/campaign/CampaignFlow";

export default function DynastyCampaignPage() {
  return (
    <StingerHost>
      <Suspense fallback={<div className="dyn min-h-screen pt-11" data-testid="campaign-boot" />}>
        <CampaignRoute />
      </Suspense>
    </StingerHost>
  );
}
