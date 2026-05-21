const API_BASE_URL =
  (import.meta.env.VITE_COMBAT_API_URL as string | undefined) ||
  "http://127.0.0.1:8000";

export type Champion = { id?: string; name: string; icon?: string };
export type Item = { id?: string; name: string; type?: string; gold?: number };
export type Rune = { id?: string; name: string; tree?: string };
export type TargetProfile = { id?: string; name: string; description?: string };
export type Summoner = { id?: string; name: string };
export type OptionsMeta = {
  crit_modes?: string[];
  branches?: Record<string, string[]>;
  [k: string]: unknown;
};

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
  crit_mode?: string;
};

export type TimelineEvent = {
  t?: number;
  timestamp?: number;
  event?: string;
  name?: string;
  damage?: number;
  notes?: string;
  type?: string;
  [k: string]: unknown;
};

export type SimulateResponse = {
  ok: boolean;
  request?: unknown;
  result: {
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
};

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
  if (Array.isArray(data)) return data as T[];
  if (data && Array.isArray(data.items)) return data.items as T[];
  if (data && Array.isArray(data.data)) return data.data as T[];
  if (data && typeof data === "object") {
    // grouped object: { Precision: [...], Domination: [...] }
    const flat: T[] = [];
    for (const [group, arr] of Object.entries(data)) {
      if (Array.isArray(arr)) {
        for (const it of arr as any[]) {
          if (typeof it === "string") flat.push({ name: it, tree: group } as any);
          else flat.push({ ...it, tree: it.tree || group } as any);
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