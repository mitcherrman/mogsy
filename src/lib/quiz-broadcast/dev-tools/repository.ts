/**
 * Developer Tools data layer.
 *
 * The UI never talks to localStorage directly — it goes through the
 * `DevToolsRepository` interface so we can swap in a backend-backed
 * implementation later (shared docs, team changelog, cloud presets, etc.)
 * without touching the components.
 */
import type { BroadcastConfig, BroadcastPlaylist } from "../types";

export type EventLogLevel = "info" | "success" | "warn" | "error";

export type EventLogEntry = {
  id: string;
  ts: number;
  level: EventLogLevel;
  source: string;
  message: string;
  data?: Record<string, unknown>;
};

export type ChangelogEntry = {
  id: string;
  version: string;
  ts: number;
  title: string;
  notes: string[];
  kind?: "feature" | "fix" | "refactor" | "docs" | "chore";
};

export type DocsSection = {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
};

export type BroadcastPreset = {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  config: BroadcastConfig;
  playlistId?: string | null;
  filters?: { category?: string; difficulty?: string; search?: string };
};

export interface DevToolsRepository {
  listEvents(): EventLogEntry[];
  appendEvent(e: Omit<EventLogEntry, "id" | "ts"> & { ts?: number }): EventLogEntry;
  clearEvents(): void;
  subscribeEvents(fn: () => void): () => void;

  listChangelog(): ChangelogEntry[];
  prependChangelog(e: Omit<ChangelogEntry, "id" | "ts"> & { ts?: number }): ChangelogEntry;
  deleteChangelog(id: string): void;

  listDocs(): DocsSection[];
  upsertDoc(d: Omit<DocsSection, "updatedAt"> & { updatedAt?: number }): DocsSection;
  deleteDoc(id: string): void;

  listPresets(): BroadcastPreset[];
  upsertPreset(p: BroadcastPreset): BroadcastPreset[];
  deletePreset(id: string): BroadcastPreset[];

  // Metadata
  getLastExportAt(): number | null;
  setLastExportAt(ts: number): void;
}

const KEY_EVENTS = "mogsy.quizBroadcast.devtools.events.v1";
const KEY_CHANGELOG = "mogsy.quizBroadcast.devtools.changelog.v1";
const KEY_DOCS = "mogsy.quizBroadcast.devtools.docs.v1";
const KEY_PRESETS = "mogsy.quizBroadcast.devtools.presets.v1";
const KEY_LAST_EXPORT = "mogsy.quizBroadcast.devtools.lastExportAt.v1";
const MAX_EVENTS = 500;

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function writeJSON<T>(key: string, val: T) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* quota */
  }
}
function rid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const SEED_CHANGELOG: ChangelogEntry[] = [
  {
    id: "seed-v0.2",
    version: "0.2.0",
    ts: Date.now(),
    title: "Developer Tools tab",
    kind: "feature",
    notes: [
      "Added Developer Tools tab with Diagnostics, API Inspector, Database Inspector, Event Log, Changelog, Documentation, Export Context and OBS Help.",
      "Introduced DevToolsRepository abstraction so docs/changelog/presets can later move to a backend without UI changes.",
      "Added Broadcast Presets with a starter set (Beginner Quiz, Champion Abilities, TikTok Vertical, YouTube Horizontal).",
      "Added 'Broadcast Studio' shortcut in Quiz Admin header.",
    ],
  },
  {
    id: "seed-v0.1",
    version: "0.1.0",
    ts: Date.now() - 86_400_000,
    title: "Initial Broadcast Studio",
    kind: "feature",
    notes: [
      "Engine / Studio / Renderer split.",
      "BroadcastChannel sync between Studio and Broadcast Window.",
      "Mock question fallback when the quiz API is unreachable.",
    ],
  },
];

const SEED_DOCS: DocsSection[] = [
  {
    id: "architecture",
    title: "Architecture Overview",
    updatedAt: Date.now(),
    body: [
      "Three-layer split:",
      "• Engine (src/lib/quiz-broadcast/engine.ts) — pure state machine. Owns phase, timers, playlist progression and reveal fetching.",
      "• Studio (src/pages/admin/AdminQuizBroadcast.tsx + src/components/quiz-broadcast/*) — control room. Configures the engine and previews the renderer.",
      "• Renderer (src/components/quiz-broadcast/BroadcastRenderer.tsx) — pure presentation. Same component is reused by the Studio preview and the OBS-capture window.",
      "",
      "Sync: BroadcastChannel('mogsy-quiz-broadcast') ferries EngineSnapshot from Studio to /admin/quiz-broadcast/view.",
    ].join("\n"),
  },
  {
    id: "workflow",
    title: "Broadcast Workflow",
    updatedAt: Date.now(),
    body: [
      "1. Build a playlist in the Question Browser (or load a saved one).",
      "2. Pick a playback mode and tweak timing/visuals.",
      "3. Click 'Open Broadcast Window' — a clean popup at /admin/quiz-broadcast/view.",
      "4. Capture that window in OBS (Window Capture).",
      "5. Hit Start. The Studio keeps the popup in sync via BroadcastChannel.",
    ].join("\n"),
  },
  {
    id: "responsibilities",
    title: "Layer Responsibilities",
    updatedAt: Date.now(),
    body: [
      "Engine:",
      "• Single source of truth for phase, currentIndex, timing, playlist progression.",
      "• Calls quizApi.submitAnswer to resolve reveal data when metadata.correct_answer is absent.",
      "",
      "Studio:",
      "• Owns the BroadcastEngine instance, publishes snapshots over BroadcastChannel.",
      "• Persists config + playlists to localStorage.",
      "",
      "Renderer:",
      "• Stateless. Given a snapshot, draws the current phase.",
      "• Honors aspect ratio, theme, toggles and countdown style.",
    ].join("\n"),
  },
  {
    id: "limitations",
    title: "Known Limitations",
    updatedAt: Date.now(),
    body: [
      "• Question pool size is capped by the quiz API limit per set (currently 200/set). If the database has more, increase the per-set limit or paginate.",
      "• BroadcastChannel is same-origin only; OBS must capture a window from the same browser profile.",
      "• Dev Tools data (docs, changelog, presets, events) lives in localStorage and is per-browser.",
    ].join("\n"),
  },
  {
    id: "roadmap",
    title: "Future Roadmap",
    updatedAt: Date.now(),
    body: [
      "• Backend-backed DevToolsRepository for shared docs/changelog/presets and team collaboration.",
      "• Persistent project snapshots and version history.",
      "• Export/import of developer data as JSON bundle.",
      "• Paginated question loading + server-side filters.",
      "• Per-question telemetry (impressions, correct rate, skipped).",
    ].join("\n"),
  },
];

class LocalDevToolsRepository implements DevToolsRepository {
  private eventListeners = new Set<() => void>();

  listEvents() { return readJSON<EventLogEntry[]>(KEY_EVENTS, []); }
  appendEvent(e: Omit<EventLogEntry, "id" | "ts"> & { ts?: number }) {
    const entry: EventLogEntry = { id: rid(), ts: e.ts ?? Date.now(), ...e };
    const next = [entry, ...this.listEvents()].slice(0, MAX_EVENTS);
    writeJSON(KEY_EVENTS, next);
    this.eventListeners.forEach((fn) => fn());
    return entry;
  }
  clearEvents() {
    writeJSON<EventLogEntry[]>(KEY_EVENTS, []);
    this.eventListeners.forEach((fn) => fn());
  }
  subscribeEvents(fn: () => void) {
    this.eventListeners.add(fn);
    return () => { this.eventListeners.delete(fn); };
  }

  listChangelog(): ChangelogEntry[] {
    const raw = readJSON<ChangelogEntry[] | null>(KEY_CHANGELOG, null);
    if (!raw) { writeJSON(KEY_CHANGELOG, SEED_CHANGELOG); return SEED_CHANGELOG; }
    return raw;
  }
  prependChangelog(e: Omit<ChangelogEntry, "id" | "ts"> & { ts?: number }) {
    const entry: ChangelogEntry = { id: rid(), ts: e.ts ?? Date.now(), ...e };
    writeJSON(KEY_CHANGELOG, [entry, ...this.listChangelog()]);
    return entry;
  }
  deleteChangelog(id: string) {
    writeJSON(KEY_CHANGELOG, this.listChangelog().filter((x) => x.id !== id));
  }

  listDocs(): DocsSection[] {
    const raw = readJSON<DocsSection[] | null>(KEY_DOCS, null);
    if (!raw) { writeJSON(KEY_DOCS, SEED_DOCS); return SEED_DOCS; }
    return raw;
  }
  upsertDoc(d: Omit<DocsSection, "updatedAt"> & { updatedAt?: number }) {
    const list = this.listDocs();
    const idx = list.findIndex((x) => x.id === d.id);
    const entry: DocsSection = { ...d, updatedAt: Date.now() };
    if (idx >= 0) list[idx] = entry; else list.push(entry);
    writeJSON(KEY_DOCS, list);
    return entry;
  }
  deleteDoc(id: string) {
    writeJSON(KEY_DOCS, this.listDocs().filter((x) => x.id !== id));
  }

  listPresets(): BroadcastPreset[] { return readJSON<BroadcastPreset[]>(KEY_PRESETS, []); }
  upsertPreset(p: BroadcastPreset) {
    const list = this.listPresets();
    const idx = list.findIndex((x) => x.id === p.id);
    if (idx >= 0) list[idx] = p; else list.unshift(p);
    writeJSON(KEY_PRESETS, list);
    return list;
  }
  deletePreset(id: string) {
    const list = this.listPresets().filter((x) => x.id !== id);
    writeJSON(KEY_PRESETS, list);
    return list;
  }

  getLastExportAt(): number | null {
    return readJSON<number | null>(KEY_LAST_EXPORT, null);
  }
  setLastExportAt(ts: number): void {
    writeJSON(KEY_LAST_EXPORT, ts);
  }
}

export const devToolsRepository: DevToolsRepository = new LocalDevToolsRepository();

export type SavedPlaylistRef = Pick<BroadcastPlaylist, "id" | "name">;
