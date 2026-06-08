const API_BASE_URL =
  (import.meta.env.VITE_COMBAT_API_URL as string | undefined) ||
  "http://127.0.0.1:8000";

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
  description?: string;
  requires?: string[];
  icon?: string;
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
};

export type CombatLabInteractiveResponse = SandboxStepResponse;

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

function asNameList<T extends { name?: string }>(data: any): T[] {
  const normalize = (arr: any[]): T[] =>
    arr
      .map((it) => {
        if (typeof it === "string") return { name: it } as any;
        if (it && typeof it === "object") {
          if (typeof it.name === "string") return it as T;
          // Try common fallback fields
          const fallback = it.id || it.key || it.label || it.title;
          if (typeof fallback === "string") return { ...it, name: fallback } as T;
        }
        return null;
      })
      .filter((x): x is T => x !== null);
  if (Array.isArray(data)) return normalize(data);
  if (data && Array.isArray(data.items)) return normalize(data.items);
  if (data && Array.isArray(data.data)) return normalize(data.data);
  if (data && typeof data === "object") {
    // grouped object: { Precision: [...], Domination: [...] }
    const flat: T[] = [];
    for (const [group, arr] of Object.entries(data)) {
      if (Array.isArray(arr)) {
        for (const it of arr as any[]) {
          if (typeof it === "string") flat.push({ name: it, tree: group } as any);
          else if (it && typeof it === "object") {
            const name =
              typeof it.name === "string"
                ? it.name
                : it.id || it.key || it.label || it.title;
            if (typeof name === "string") {
              flat.push({ ...it, name, tree: it.tree || group } as any);
            }
          }
        }
      }
    }
    if (flat.length) return flat;
  }
  return [];
}

export const combatApi = {
  baseUrl: API_BASE_URL,
  health: () => request<{ ok?: boolean; status?: string }>("/api/health"),
  champions: async () => asNameList<Champion>(await request<any>("/api/meta/champions")),
  items: async () => asNameList<Item>(await request<any>("/api/meta/items")),
  runes: async () => asNameList<Rune>(await request<any>("/api/meta/runes")),
  targetProfiles: async () =>
    asNameList<TargetProfile>(await request<any>("/api/meta/target-profiles")),
  summoners: async () => asNameList<Summoner>(await request<any>("/api/meta/summoners")),
  options: () => request<OptionsMeta>("/api/meta/options"),
  simulate: (payload: SimulateRequest) =>
    request<SimulateResponse>("/api/combat/simulate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  combatLabActions: async (): Promise<CombatAction[]> => {
    const data = await request<any>("/api/meta/combat-lab-actions");
    const arr = Array.isArray(data)
      ? data
      : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.actions)
      ? data.actions
      : Array.isArray(data?.data)
      ? data.data
      : [];
    return arr
      .map((a: any) => {
        if (!a || typeof a !== "object") return null;
        const id = a.id || a.action_id || a.key || a.name;
        if (!id) return null;
        return { ...a, id, label: a.label || a.name || id } as CombatAction;
      })
      .filter(Boolean) as CombatAction[];
  },
  basicAttack: (payload: CombatLabBasicAttackRequest) =>
    request<CombatLabInteractiveResponse>("/api/combat-lab/basic-attack", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  active: (payload: CombatLabActiveRequest) =>
    request<CombatLabInteractiveResponse>("/api/combat-lab/active", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

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