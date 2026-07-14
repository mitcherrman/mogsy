// ---------------------------------------------------------------------------
// Resolved-envelope adapter: strict five-field envelope validation, then the
// exact resolved payload flows into the EXISTING settlement adapter with the
// EXISTING explicit player-id mapping. No settlement mapping is duplicated —
// this file adds only the transport shell.
//
//   raw unknown envelope
//   -> validateResolvedRoundEnvelope (exact five fields, exact kind)
//   -> exact BackendResolvedRoundProjection payload
//   -> adaptBackendSettlement(payload, playerIdMapping)
//   -> AdaptedSettlement -> APPLY_BACKEND_SETTLEMENT (unchanged)
// ---------------------------------------------------------------------------

import {
  AdaptedSettlement,
  PlayerIdMapping,
  adaptBackendSettlement,
} from "../backend-adapter/adaptBackendSettlement";
import { validateResolvedRoundEnvelope } from "./rankedDuelEnvelopeValidation";

export function adaptResolvedRoundEnvelope(
  envelope: unknown,
  playerIdMapping: PlayerIdMapping,
): AdaptedSettlement {
  const validated = validateResolvedRoundEnvelope(envelope);
  return adaptBackendSettlement(validated.payload, playerIdMapping);
}
