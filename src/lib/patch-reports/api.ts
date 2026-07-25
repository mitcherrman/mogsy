import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";

export type MogzyStatus =
  | "matches"
  | "applied"
  | "pending"
  | "mismatch"
  | "unresolved"
  | "needs_interpretation"
  | "not_represented";

export type PatchEntityType = "champion" | "item" | "rune" | "system";

export type PatchReportChange = {
  group_title: string;
  ability_slot: string | null;
  ability_icon_url: string | null;
  property_name: string;
  change_kind: "numeric" | "mechanical";
  is_new: boolean;
  before_raw: string | null;
  after_raw: string | null;
  detail_text: string | null;
  mogzy_property: string | null;
  mogzy_current_raw: string | null;
  mogzy_status: MogzyStatus;
  proposal_id: number | null;
  proposal_status: string | null;
};

export type PatchReportCard = {
  id: number;
  entity_type: PatchEntityType;
  entity_name: string;
  entity_slug: string | null;
  section_id: string;
  section_title: string;
  official_image_url: string | null;
  mogzy_image_path: string | null;
  mogzy_entity_ref: string | null;
  context_text: string | null;
  aggregate_status: MogzyStatus;
  changes: PatchReportChange[];
};

export type PatchReportSummary = {
  patch_version: string;
  source_url: string;
  built_at: string;
  section_titles: string[];
  card_count: number;
  change_count: number;
  cards_by_type: Partial<Record<PatchEntityType, number>>;
  cards_by_status: Partial<Record<MogzyStatus, number>>;
};

export type PatchReportDetail = {
  patch_version: string;
  source_url: string;
  built_at: string;
  section_titles: string[];
  skipped_sections: string[];
  cards: PatchReportCard[];
};

export function resolvePatchReportAsset(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${COMBAT_API_BASE_URL}/${path.replace(/^\/+/, "")}`;
}

export async function fetchPatchReports(): Promise<{ patches: PatchReportSummary[] }> {
  const res = await fetch(`${COMBAT_API_BASE_URL}/api/patch-reports`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Patch reports request failed (${res.status})`);
  return res.json();
}

export async function fetchPatchReport(version: string): Promise<PatchReportDetail> {
  const res = await fetch(
    `${COMBAT_API_BASE_URL}/api/patch-reports/${encodeURIComponent(version)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`Patch report ${version} request failed (${res.status})`);
  return res.json();
}
