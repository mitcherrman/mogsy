import { matchResultPointsV1, privatePlayerV2, publicRoundV2, withPointsScoring } from "../../lib/ranked-public/fixtures";

/** Deterministic terminal transport shared by router and real-browser tests. */
export function rankedTerminalResponse(path: string, newDiscoveries = true): unknown {
  const time = "2026-09-26T00:00:00Z";
  const shape = (env: { payload: Record<string, unknown> }) => {
    Object.assign(env.payload, {
      match_status: "complete", match_over: true, active_round: null,
      completed_rounds: 0, winner_id: "userA", completion_reason: "segments_complete",
    });
    return withPointsScoring(env, { modulesCompleted: 0, scores: { userA: 3, userB: 1 } });
  };
  const result = matchResultPointsV1({ userA: 3, userB: 1 }, { modulesPlayed: 0 });
  if (path.endsWith("/resume")) return {
    schema_version: "ranked_duel.resume.v1", projection_type: "resume",
    match_id: "m1", round_number: 0, server_time: time,
    payload: { match_status: "complete", match_over: true,
      public: shape(publicRoundV2(true)), private: shape(privatePlayerV2("userA")),
      latest_resolved_round: null, result },
  };
  if (path.endsWith("/private")) return shape(privatePlayerV2("userA"));
  if (path.endsWith("/result")) return result;
  if (path.endsWith("/presence")) return { status: "complete", match_id: "m1", active: false };
  if (path.endsWith("/discoveries")) return {
    schema_version: "ranked_duel.match_discoveries.v1", projection_type: "match_discoveries",
    match_id: "m1", round_number: null, server_time: time,
    payload: { match_id: "m1", scope: "ranked_discoveries", includes_default_library: false,
      new_discoveries: newDiscoveries ? [{ canonical_question_ref: "ranked:nav1", first_seen_at: time,
        first_round_number: 1, metadata_status: "resolved", metadata_source: "frozen_round",
        question: { prompt: "A discovered question", category: "Items" } }] : [],
      new_count: newDiscoveries ? 1 : 0, collection_total: 42, collection_total_before: newDiscoveries ? 41 : 42,
      truncated: false },
  };
  if (path.endsWith("/matches/m1")) return shape(publicRoundV2(true));
  if (path.endsWith("/active-match")) return { active_match: null };
  return {};
}
