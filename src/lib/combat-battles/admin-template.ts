// A known-valid curated sample (Annie vs Brand — all verified applies_damage
// actions) used to seed the admin create form and document the snapshot shape.
export const SAMPLE_LEFT = {
  champion: "Annie",
  level: 11,
  items: ["Luden's Companion"],
  runes: [],
  ability_ranks: { Q: 5, W: 5, E: 5, R: 3 },
  crit_mode: "expected",
  actions: [
    { type: "active", slot: "Q", active_name: "Q" },
    { type: "active", slot: "W", active_name: "W" },
    { type: "basic_attack" },
  ],
};

export const SAMPLE_RIGHT = {
  champion: "Brand",
  level: 11,
  items: ["Luden's Companion"],
  runes: [],
  ability_ranks: { Q: 5, W: 5, E: 5, R: 3 },
  crit_mode: "expected",
  actions: [
    { type: "active", slot: "Q", active_name: "Q" },
    { type: "basic_attack" },
  ],
};

export const SNAPSHOT_HELP =
  "Each side is a JSON object: champion, level, items[], runes[], " +
  "ability_ranks{Q,W,E,R}, crit_mode, and actions[] " +
  "(each { type: 'active'|'basic_attack', slot?, active_name?, required_state? }). " +
  "Only actions the audit marks applies_damage (or valid required-state) will validate.";
