/**
 * Gated dev route: live Syndra v3 TRUE-BRANCHING Mastery player (G4 Pass B).
 *
 * Authenticated (ProtectedRoute), not linked from navigation and not in the
 * sitemap. It reuses the same backend-driven MasteryPlayerLive container as every
 * other Mastery set — the branching is entirely backend-resolved: the recall
 * build-choice step is a normal single-choice question, and after it is answered
 * the server projects only the SELECTED branch's steps/state. No branch-specific
 * player implementation exists on the client.
 *
 * v3 is registered non-default and addressable only through this explicit route;
 * the linear v2 prototype keeps the /dev/mastery/syndra-progression route, and the
 * public catalog stays Ahri-only.
 */
import { MasteryPlayerLive } from "@/features/mastery/live";

// Pinned branching prototype set id (mastery/publication/registry.py
// _EXPECTED_SYNDRA_V3_SET_ID).
const SYNDRA_BRANCHING_SET_ID =
  "mset_7ce81bc5d07af998d8873e277cd62e21ac66830e45c49366195bc6420fd2a86a";

export default function SyndraBranchingPage() {
  return (
    <div className="min-h-[60vh]">
      <MasteryPlayerLive masterySetId={SYNDRA_BRANCHING_SET_ID} />
    </div>
  );
}
