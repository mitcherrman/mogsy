const API_BASE_URL =
  (import.meta.env.VITE_COMBAT_API_URL as string | undefined) ||
  "http://127.0.0.1:8000";

export type ChampionConfidence = {
  champion: string;
  confidence_tier: "high_confidence" | "medium_confidence" | "smoke_validated" | "needs_review";
  confidence_score?: number;
  status?: string;
  tested?: boolean;
  basic_attack_pass?: boolean;
  rotation_pass?: boolean;
  runtime_profile_count?: number;
  interactions?: number;
};

export type ChampionConfidenceResponse = {
  ok: boolean;
  summary: {
    total_champions: number;
    high_confidence: number;
    medium_confidence: number;
    smoke_validated: number;
    needs_review: number;
    basic_attack_pass: number;
    rotation_pass: number;
  };
  champions: ChampionConfidence[];
};

export type Champion = { id?: string; name: string; icon?: string };
export type Item = { id?: string; name: string; type?: string; gold?: number; icon?: string };
export type Rune = { id?: string; name: string; tree?: string; icon?: string };
export type TargetProfile = { id?: string; name: string; description?: string };
export type Summoner = { id?: string; name: string; icon?: string };

export const CRIT_MODES = ["none", "force", "expected"] as const;
export type CritMode = (typeof CRIT_MODES)[number];

export type OptionsMeta = {
  crit_modes?: string[];
  branches?: Record<string, string[]>;
  [k: string]: unknown;
};

export type DamageType = "physical" | "magic" | "true" | string;

export type SimulateRequest = {
  champion: string;
  sequence: string;
  items: string[];
  runes: string[];
  target_profile: string;
  stats?: Record<string, number>;
  ranks?: Record<string, number>;
  branches?: Record<string, string>;
  ad?: number;
  attack_speed?: number;
  crit_mode?: CritMode;
};

export type TimelineEvent = {
  // timestamps (backend uses `time`, accept legacy fields too)
  time?: number;
  t?: number;
  timestamp?: number;
  // labels
  event?: string;
  name?: string;
  // damage (backend uses `final_damage`)
  final_damage?: number;
  damage?: number;
  damage_type?: DamageType;
  source?: string;
  notes?: string;
  type?: string;
  icon?: string;
  [k: string]: unknown;
};

export type SimulationResult = {
  summary: {
    total_damage: number;
    duration: number;
    dps: number;
    lethal: boolean;
    remaining_hp: number;
  };
  timeline: TimelineEvent[];
  final_state: Record<string, unknown>;
};

export type SimulateResponse = {
  ok: boolean;
  request?: unknown;
  result: SimulationResult;
};

/* ─────────────── Interactive Sandbox types ─────────────── */

export type CombatAction = {
  id: string;
  label?: string;
  name?: string;
  champion?: string;
  champions?: string[];
  description?: string;
  requires?: string[];
  icon?: string;
  extra?: Record<string, unknown>;
  [k: string]: unknown;
};

export type TargetScopeInfo = {
  current_hp?: number;
  max_hp?: number;
  remaining_pct?: number;
  status?: string;
  [k: string]: unknown;
};

export type SandboxStepResponse = {
  ok?: boolean;
  state?: Record<string, unknown>;
  events?: TimelineEvent[];
  remaining_by_scope?: Record<string, TargetScopeInfo>;
  attacker_stats?: Record<string, number | string>;
  [k: string]: unknown;
};

/** Backend-aligned request shapes. */
export type CombatLabBasicAttackRequest = {
  champion_name: string;
  item_names: string[];
  rune_names: string[];
  attacker_stats: Record<string, number>;
  target_stats: Record<string, number>;
  state: Record<string, unknown>;
  current_time: number;
};

export type CombatLabActiveRequest = {
  champion_name: string;
  attacker_stats: Record<string, number>;
  target_stats: Record<string, number>;
  state: Record<string, unknown>;
  active_name: string;
  target_scope: string;
  piercing_arrow_charge_bonus_percent: number;
  [k: string]: unknown;
};

export type CombatLabInteractiveResponse = SandboxStepResponse;

export type CoverageChampion = {
  name: string;
  status?: string;
  tested?: boolean;
  special_notes?: string;
  runtime_profile_count?: number;
};

export type CoverageSummary = {
  champion_count: number;
  item_count: number;
  rune_count: number;
  champion_runtime_profile_count: number;
  item_effect_count: number;
  rune_effect_count: number;
  tested_champion_count: number;
  tested_item_count: number;
  tested_rune_count: number;
  special_champion_count: number;
  generic_champion_count: number;
};

export type CoverageResponse = {
  ok: boolean;
  summary: CoverageSummary;
  tested_systems?: string[];
  champions?: {
    special_attention?: CoverageChampion[];
    generic_or_formula_driven?: CoverageChampion[];
  };
  items?: {
    all?: string[];
    tested?: string[];
    effects?: string[];
  };
  runes?: {
    all?: string[];
    tested?: string[];
    effects?: string[];
  };
};

/* ─────────────── Target System (defenses, previews, entities) ─────────────── */

export type TargetDefense = {
  name: string;
  champion?: string;
  /** e.g. "physical" | "magic" | "all" | "shield" */
  category?: string;
  description?: string;
  rank_count?: number;
  [k: string]: unknown;
};

export type TargetDefenseMetaResponse = {
  ok?: boolean;
  defenses?: TargetDefense[];
  [k: string]: unknown;
};

export type TargetDefensePreviewRequest = {
  target_champion: string;
  active_name: string;
  rank?: number;
  target_stats?: Record<string, number>;
  state?: Record<string, unknown>;
  [k: string]: unknown;
};

export type TargetDefenseMetadata = {
  active_name?: string;
  target_champion?: string;
  damage_reduction_percent?: number;
  physical_damage_reduction_percent?: number;
  magic_damage_reduction_percent?: number;
  shield_amount?: number;
  armor_bonus?: number;
  mr_bonus?: number;
  duration?: number;
  [k: string]: unknown;
};

export type TargetDefensePreviewResponse = {
  ok: boolean;
  result?: {
    target_champion?: string;
    active_name?: string;
    rank?: number;
    metadata?: TargetDefenseMetadata;
    target_stats?: Record<string, number>;
    state?: Record<string, unknown>;
    [k: string]: unknown;
  };
  metadata?: TargetDefenseMetadata;
  [k: string]: unknown;
};

export type TargetChampionEntity = {
  name?: string;
  stats?: Record<string, number>;
  state?: Record<string, unknown>;
  [k: string]: unknown;
};

export const normalizeTargetDefensesResponse = (data: any): TargetDefense[] =>
  normalizeList<TargetDefense>(
    data,
    ["target_defenses", "defenses"],
    ["name", "active_name", "defense_name", "id"],
    (raw, name) =>
      typeof raw === "string"
        ? { name }
        : {
            ...raw,
            name,
            champion: raw.champion ?? raw.champion_name,
            category: raw.category ?? raw.type ?? raw.damage_type,
          }
  );

/** Build Explorer / Live Stats endpoint. */
export type CombatLabBuildPreviewRequest = {
  champion_name: string;
  level: number;
  item_names: string[];
  rune_names: string[];
  summoner_names: string[];
  base_stats: Record<string, unknown>;
  state: Record<string, unknown>;
};

export type CombatLabBuildPreviewResult = {
  champion_name: string;
  level: number;
  item_names: string[];
  rune_names: string[];
  summoner_names: string[];
  base_stats: Record<string, number>;
  loadout_stats: Record<string, number>;
  build_stats: Record<string, number>;
  runtime_stats: Record<string, number>;
  state: Record<string, unknown>;
  loadout: Record<string, unknown>;
};

export type CombatLabBuildPreviewResponse = {
  ok: boolean;
  result: CombatLabBuildPreviewResult;
};

/** Default diagnostic stat shapes. */
export const DEFAULT_ATTACKER_STATS: Record<string, number> = {
  LEVEL: 18,
  AD: 100,
  AP: 300,
  BONUS_AD: 100,
  W_RANK: 5,
  E_RANK: 5,
  ATTACK_SPEED_RATIO: 0.658,
};

export const DEFAULT_TARGET_STATS: Record<string, number> = {
  HP: 4000,
  ARMOR: 0,
  MR: 0,
};

/** Throws if the simulate response is malformed. */
export function assertSimulationResponse(
  res: unknown
): asserts res is SimulateResponse {
  const r = res as any;
  if (!r || typeof r !== "object") {
    throw new Error("Empty simulation response");
  }
  if (!r.result || typeof r.result !== "object") {
    throw new Error("Malformed simulation response (missing result)");
  }
  const s = r.result.summary;
  if (!s || typeof s !== "object") {
    throw new Error("Malformed simulation response (missing summary)");
  }
  if (typeof s.total_damage !== "number" || typeof s.dps !== "number") {
    throw new Error("Malformed simulation response (invalid summary fields)");
  }
}

/** Normalized accessors so the UI never depends on a single field name. */
export function getEventTime(e: TimelineEvent): number {
  return (
    (typeof e.time === "number" ? e.time : undefined) ??
    (typeof e.t === "number" ? e.t : undefined) ??
    (typeof e.timestamp === "number" ? e.timestamp : undefined) ??
    0
  );
}

export function getEventDamage(e: TimelineEvent): number | null {
  if (typeof e.final_damage === "number") return e.final_damage;
  if (typeof e.damage === "number") return e.damage;
  return null;
}

export function getEventLabel(e: TimelineEvent): string {
  return e.event || e.name || e.type || "Event";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {}
    throw new Error(`API ${res.status}: ${detail || res.statusText}`);
  }
  return (await res.json()) as T;
}

/**
 * Generic metadata normalizer.
 *
 * Handles all common Combat Lab backend response shapes:
 *   - bare array:                     [ ... ]
 *   - wrapped:                        { items|data|results|<key>: [ ... ] }
 *   - grouped (rune-tree style):      { Precision: [...], Domination: [...] }
 *
 * Each item may be a string, or an object whose name lives under one of several
 * aliases (`name`, `<entity>_name`, `id`, `label`, `title`, etc.).
 */
function extractArray(data: any, wrapperKeys: string[]): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const tryKeys = [...wrapperKeys, "items", "data", "results"];
  for (const k of tryKeys) {
    if (Array.isArray(data[k])) return data[k];
  }
  // grouped object → flatten array values, tagging each with its group key
  const grouped: any[] = [];
  let hasArray = false;
  for (const [group, arr] of Object.entries(data)) {
    if (Array.isArray(arr)) {
      hasArray = true;
      for (const it of arr as any[]) {
        if (it && typeof it === "object") grouped.push({ ...it, _group: group });
        else grouped.push(it);
      }
    }
  }
  return hasArray ? grouped : [];
}

function pickName(it: any, nameAliases: string[]): string | null {
  if (typeof it === "string") return it;
  if (!it || typeof it !== "object") return null;
  for (const k of nameAliases) {
    if (typeof it[k] === "string" && it[k].trim()) return it[k];
  }
  return null;
}

function normalizeList<T extends { name: string }>(
  data: any,
  wrapperKeys: string[],
  nameAliases: string[],
  shape: (raw: any, name: string) => T = (raw, name) =>
    (typeof raw === "string" ? { name } : { ...raw, name }) as T
): T[] {
  const arr = extractArray(data, wrapperKeys);
  const out: T[] = [];
  for (const it of arr) {
    const name = pickName(it, nameAliases);
    if (!name) continue;
    out.push(shape(it, name));
  }
  return out;
}

/* Per-endpoint normalizers (exported for diagnostics use) */
export const normalizeChampionsResponse = (data: any): Champion[] =>
  normalizeList<Champion>(data, ["champions"], ["name", "champion_name", "id"]);

export const normalizeItemsResponse = (data: any): Item[] =>
  normalizeList<Item>(
    data,
    ["items"],
    ["name", "item_name", "id"],
    (raw, name) =>
      typeof raw === "string"
        ? { name }
        : {
            ...raw,
            name,
            type: raw.type ?? raw.item_type,
            gold: raw.gold ?? raw.cost,
          }
  );

export const normalizeRunesResponse = (data: any): Rune[] =>
  normalizeList<Rune>(
    data,
    ["runes"],
    ["name", "rune_name", "id"],
    (raw, name) =>
      typeof raw === "string"
        ? { name }
        : { ...raw, name, tree: raw.tree ?? raw.tree_name ?? raw._group }
  );

export const normalizeTargetsResponse = (data: any): TargetProfile[] =>
  normalizeList<TargetProfile>(
    data,
    ["target_profiles", "targets", "profiles"],
    ["name", "profile_name", "id"]
  );

export const normalizeSummonersResponse = (data: any): Summoner[] =>
  normalizeList<Summoner>(data, ["summoners"], ["name", "summoner_name", "id"]);

export const normalizeActionsResponse = (data: any): CombatAction[] => {
  const arr = extractArray(data, ["actions", "combat_lab_actions"]);
  const out: CombatAction[] = [];
  for (const a of arr) {
    if (!a || typeof a !== "object") continue;
    const id = a.id || a.action_id || a.key || a.name;
    if (!id) continue;
    out.push({ ...a, id, label: a.label || a.name || id });
  }
  return out;
};

export const combatApi = {
  baseUrl: API_BASE_URL,
  health: () => request<{ ok?: boolean; status?: string }>("/api/health"),
  champions: async () => normalizeChampionsResponse(await request<any>("/api/meta/champions")),
  items: async () => normalizeItemsResponse(await request<any>("/api/meta/items")),
  runes: async () => normalizeRunesResponse(await request<any>("/api/meta/runes")),
  targetProfiles: async () =>
    normalizeTargetsResponse(await request<any>("/api/meta/target-profiles")),
  summoners: async () => normalizeSummonersResponse(await request<any>("/api/meta/summoners")),
  options: () => request<OptionsMeta>("/api/meta/options"),
  simulate: (payload: SimulateRequest) =>
    request<SimulateResponse>("/api/combat/simulate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  combatLabActions: async (): Promise<CombatAction[]> =>
    normalizeActionsResponse(await request<any>("/api/meta/combat-lab-actions")),
  basicAttack: async (payload: CombatLabBasicAttackRequest) =>
    unwrapInteractive(
      await request<any>("/api/combat-lab/basic-attack", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    ),
  active: async (payload: CombatLabActiveRequest) =>
    unwrapInteractive(
      await request<any>("/api/combat-lab/active", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    ),
  buildPreview: (payload: CombatLabBuildPreviewRequest) =>
    request<CombatLabBuildPreviewResponse>("/api/combat-lab/build-preview", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  coverage: () => request<CoverageResponse>("/api/combat-lab/audit/coverage"),
  championConfidence: () => request<ChampionConfidenceResponse>("/api/combat-lab/audit/champion-confidence"),
  targetDefenses: async (): Promise<TargetDefense[]> =>
    normalizeTargetDefensesResponse(await request<any>("/api/meta/target-defenses")),
  targetDefensePreview: (payload: TargetDefensePreviewRequest) =>
    request<TargetDefensePreviewResponse>("/api/combat-lab/target-defense-preview", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

/**
 * Normalize Combat Lab interactive responses.
 * Backend may return either:
 *   { ok, result: { state, events, remaining_by_scope, ... } }
 * or a flat shape with state/events at the top.
 * Throws if ok === false.
 */
function unwrapInteractive(raw: any): CombatLabInteractiveResponse {
  if (!raw || typeof raw !== "object") {
    throw new Error("Empty response from combat engine");
  }
  if (raw.ok === false) {
    const msg =
      (typeof raw.error === "string" && raw.error) ||
      (raw.error && typeof raw.error.message === "string" && raw.error.message) ||
      "Backend reported ok=false";
    throw new Error(msg);
  }
  const inner = raw.result && typeof raw.result === "object" ? raw.result : raw;
  return {
    ok: raw.ok ?? true,
    state: inner.state ?? {},
    events: Array.isArray(inner.events) ? inner.events : [],
    remaining_by_scope:
      inner.remaining_by_scope && typeof inner.remaining_by_scope === "object"
        ? inner.remaining_by_scope
        : {},
    attacker_stats:
      inner.attacker_stats && typeof inner.attacker_stats === "object"
        ? inner.attacker_stats
        : {},
    ...inner,
  };
}

export const COMBAT_API_BASE_URL = API_BASE_URL;

export const PRESETS: Record<string, SimulateRequest> = {
  "akali-burst": {
    champion: "Akali",
    sequence: "Q,AA,E,IGNITE,AA,R",
    items: ["Rabadon's Deathcap", "Lich Bane", "Void Staff", "Shadowflame"],
    runes: ["Electrocute", "Sudden Impact"],
    target_profile: "ADC",
    stats: { LEVEL: 18, "BONUS AD": 100 },
    ranks: { Q: 5, E: 5, R: 3 },
    branches: { R: "maximum" },
    ad: 100,
    attack_speed: 1.2,
    crit_mode: "none",
  },
  "ashe-onhit": {
    champion: "Ashe",
    sequence: "AA,AA,AA,AA",
    items: [
      "Blade of the Ruined King",
      "Guinsoo's Rageblade",
      "Kraken Slayer",
      "Infinity Edge",
    ],
    runes: ["Lethal Tempo", "Press the Attack", "Conqueror"],
    target_profile: "Tank",
    stats: { LEVEL: 18, "BONUS AD": 45 },
    ad: 100,
    attack_speed: 1.2,
    crit_mode: "expected",
  },
};