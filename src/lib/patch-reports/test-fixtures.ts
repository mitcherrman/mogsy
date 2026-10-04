import type { PatchReportCard, PatchReportChange } from "./api";

/** Shared builders for Patch Hub contract tests (not production code). */
export const mkChange = (o: Partial<PatchReportChange> = {}): PatchReportChange => ({
  group_title: "Base Stats",
  ability_slot: null,
  ability_icon_url: null,
  property_name: "Base attack damage",
  change_kind: "numeric",
  is_new: false,
  before_raw: "58",
  after_raw: "61",
  detail_text: null,
  mogzy_property: null,
  mogzy_current_raw: null,
  mogzy_status: "matches",
  proposal_id: null,
  proposal_status: null,
  ...o,
});

let nextId = 1;
export const mkCard = (name: string, o: Partial<PatchReportCard> = {}): PatchReportCard => ({
  id: nextId++,
  entity_type: "champion",
  entity_name: name,
  entity_slug: null,
  section_id: "patch-champions",
  section_title: "Champions",
  official_image_url: null,
  mogzy_image_path: null,
  mogzy_entity_ref: name,
  context_text: null,
  aggregate_status: "matches",
  changes: [mkChange()],
  ...o,
});
