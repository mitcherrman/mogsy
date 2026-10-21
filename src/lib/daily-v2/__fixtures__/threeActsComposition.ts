/**
 * Daily three acts (V2) — the server's `v2_launch.stage_shape()` as it
 * serializes today (backend `daily-v2/e-integration`). Shape only.
 */
export const THREE_ACTS_COMPOSITION = {
  recipe: "three_acts",
  recipe_id: "daily-v2-three-acts-1",
  format_id: "daily_three_acts_v2",
  acts: ["early", "mid", "late"],
  segments: 19,
  answers: 21,
  modules: 19,
  meta_reflex_blocks: 1,
  meta_reflex_cards: 3,
  units: [
    { kind: "set", act_id: "early", set_id: "early.1", bands: ["E", "M", "H"], timer_seconds: [18, 33, 48] },
    { kind: "set", act_id: "early", set_id: "early.2", bands: ["E", "M", "H"], timer_seconds: [18, 33, 48] },
    { kind: "meta_reflex", cards: 3, card_timer_seconds: 6 },
    { kind: "set", act_id: "mid", set_id: "mid.1", bands: ["E", "M", "H"], timer_seconds: [18, 33, 48] },
    { kind: "set", act_id: "mid", set_id: "mid.2", bands: ["E", "M", "H"], timer_seconds: [18, 33, 48] },
    { kind: "set", act_id: "late", set_id: "late.1", bands: ["E", "M", "H"], timer_seconds: [18, 33, 48] },
    { kind: "set", act_id: "late", set_id: "late.2", bands: ["E", "M", "H"], timer_seconds: [18, 33, 48] },
  ],
};
