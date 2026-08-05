/**
 * Family scenario band (RA7) — the third presentation of the scenario band.
 *
 * `InteractiveScenarioSurface` chose between two presentations by content
 * CAPABILITY: a cinematic Broadcast card when the payload resolves real premium
 * art, the short CompactScenarioBand otherwise. Both are subject-shaped. This
 * adds a third for the payloads that describe a RELATION or a TRANSACTION
 * rather than a subject, and it is chosen the same way — by what the payload
 * can support, never by mode identity, category string or prompt text.
 *
 * It is strictly additive. `selectFamilyLayout` returns null for anything it
 * cannot fully support, and this component renders nothing in that case, so the
 * surface falls through to exactly the cinematic/compact decision it made
 * before. Old frozen payloads, incomplete premises and every family without a
 * dedicated layout are unaffected.
 *
 * The Broadcast pipeline is untouched: `selectScenario`, `ScenarioCard` and the
 * scenario-card components are not modified and not consulted here, so the
 * broadcast and screenshot renderers keep rendering exactly what they did.
 */

import type { FamilyLayout } from "@/lib/question-surface/familyLayout";
import { ItemLifecycleBand } from "./ItemLifecycleBand";
import { PostMitigationBand } from "./PostMitigationBand";

export function FamilyScenarioBand({ layout }: { layout: FamilyLayout }) {
  switch (layout.kind) {
    case "combat":
      return <PostMitigationBand layout={layout} />;
    case "lifecycle":
      return <ItemLifecycleBand layout={layout} />;
  }
}
