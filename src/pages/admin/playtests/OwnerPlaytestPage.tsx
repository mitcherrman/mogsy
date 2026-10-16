/**
 * UGMP — `/admin/playtests/:mode`: where the owner plays a lab mode launched
 * from Admin → Leaguecraft → Ranked → Playtests.
 *
 *   rangefinder      GM-R1, server-dealt and server-graded (prototype rules)
 *   glyph-press      WP1.1, server-dealt, server-sounded and server-graded
 *   stat-drop        MIG1.2, historical value released after Lock, no grading
 *   combat-estimate  CE1 two-beam balance, captured value released, no grading
 *   perfect-timing   PT4 Start/Stop, server-dealt and server-graded against the
 *                    current base cooldown (browser-measured time; PT4.1)
 *
 * `AdminRoute` wraps this page (UX only). Every round and every answer comes
 * from the backend behind `require_admin`; this chunk carries none. Each mode's
 * chrome row starts with the way back to Playtests.
 */
import { lazy, Suspense } from "react";
import { Link, useParams } from "react-router-dom";
import { isLabModeId, PLAYTESTS_HUB_ROUTE } from "@/lib/playtests/modes";
import { PlaytestLead } from "./ownerArena";

const RangefinderOwnerPlaytest = lazy(() => import("./RangefinderOwnerPlaytest"));
const GlyphPressOwnerPlaytest = lazy(() => import("./GlyphPressOwnerPlaytest"));
const NumericLabPage = lazy(() => import("@/pages/admin/numeric-lab/NumericLabPage"));
const PerfectTimingPage = lazy(() => import("@/pages/admin/perfect-timing/PerfectTimingPage"));

export default function OwnerPlaytestPage() {
  const { mode } = useParams();
  if (!isLabModeId(mode)) {
    return (
      <main data-testid="owner-playtest-unknown" className="mx-auto max-w-xl px-4 py-10 text-sm">
        <p className="mb-3">There is no playtest called “{mode}”.</p>
        <Link to={PLAYTESTS_HUB_ROUTE} className="inline-flex min-h-[44px] items-center underline">Back to Playtests</Link>
      </main>
    );
  }
  const lead = <PlaytestLead mode={mode} />;
  return (
    <div data-testid="owner-playtest-page" data-mode={mode}>
      <Suspense fallback={<div aria-hidden className="min-h-screen w-full bg-[#050b15]" />}>
        {mode === "rangefinder" ? <RangefinderOwnerPlaytest lead={lead} />
          : mode === "glyph-press" ? <GlyphPressOwnerPlaytest lead={lead} />
          : mode === "perfect-timing" ? <PerfectTimingPage lead={lead} />
          : <NumericLabPage mode={mode} lead={lead} />}
      </Suspense>
    </div>
  );
}
