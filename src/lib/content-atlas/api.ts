import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";

export type AtlasCount = { value: number | null; status: string; method: string };
export type AtlasFamily = {
  family_id: string; display_name: string; description: string; semantic_target: string;
  domain: string; capability: { id: string; name: string }; canonical_sources: string[];
  construction: string; generated: boolean; source_authority_type: string; source_code: string | null;
  important_symbols: string[]; input_dimensions: string[]; answer_derivation: string;
  shape: { kind: string; parent: string | null }; semantic_ref_format: string; media_required: boolean;
  difficulty: { min: number; max: number }; readiness: string; blockers: string[];
  serving_authority: { kind: string; ids: string[] } | null; content_sets: string[];
  hosts: Record<string, boolean | null | string>; review: string; weak_areas: string; ownership: string;
  tests: string[]; history: string; supply: Record<string, AtlasCount>;
  preview: { supported: boolean; adapter: string | null; limitations: string | null };
};
export type AtlasPayload = {
  schema_version: string; generated_at: string; read_only: boolean;
  overview: Record<string, number>; count_help: Record<string, string>;
  capabilities: { id: string; name: string; family_ids: string[]; sources: string[] }[];
  complex_systems: { id: string; shape: string; owner: string; preview: string; reason: string }[];
  families: AtlasFamily[];
};
export type AtlasPreview = { family_id: string; supported: boolean; reason?: string; count?: number; candidates?: Array<Record<string, unknown>> };

async function get<T>(path: string): Promise<T> {
  const url = `${ADMIN_API_BASE_URL}${path}`;
  const response = await fetch(url, { headers: await buildAdminHeaders(url) });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? `Atlas request failed (${response.status})`);
  return response.json();
}
export const fetchAtlas = () => get<AtlasPayload>("/api/admin/content-atlas");
export const fetchAtlasPreview = (familyId: string, seed: number, subject = "") => {
  const query = new URLSearchParams({ limit: "8", seed: String(seed) });
  if (subject.trim()) query.set("subject", subject.trim());
  return get<AtlasPreview>(`/api/admin/content-atlas/families/${encodeURIComponent(familyId)}/preview?${query}`);
};
