/**
 * PT1.7B — the Premium Practice Builder's client.
 *
 * Every call is `authedRequest`: these endpoints are account-bound and the
 * backend resolves capability from the verified JWT, so a request that has not
 * yet established a session must fail loudly rather than arrive unauthenticated
 * and read as Free.
 *
 * THIS FILE CARRIES NO ENTITLEMENT RULES AND NO VALIDATION RULES.
 * It does not decide what a legal configuration is, which pools exist, or
 * whether the caller may build — the backend answers all three, and a second
 * copy here would be a second answer that can disagree with the one the server
 * actually enforces. What this file does instead is carry the backend's
 * capability and its refusals back to the screen intact. The paywall the UI
 * draws is presentation; the gate is on the server.
 *
 * It also never imports an admin credential helper. The Builder is a consumer
 * surface reusing an admin *pattern* (a backend-published field catalog), never
 * admin authority.
 */
import { authedRequest, type QuizQuestion } from "@/lib/quiz/api";

/** Which subset of the bank a session draws from. */
export type BuilderPool = "bank" | "owned" | "missed" | "weak";

/**
 * What this account may do — resolved server-side from PT1.4 effective
 * entitlement, and deliberately NOT a tier name. The UI renders from these
 * fields so that a future achievement-earned Free capability needs no second
 * frontend branch: a Free player who has earned one build slot simply arrives
 * with `can_build: true` and a narrower `allowed_pools`.
 */
export type BuilderCapability = {
  can_build: boolean;
  can_save: boolean;
  max_saved_sets: number;
  allowed_pools: BuilderPool[];
  max_length: number;
  allowed_lengths: number[];
  reason: string;
};

export type BuilderConfig = {
  pool: BuilderPool;
  category: string | null;
  source_type: string | null;
  difficulty_min: number;
  difficulty_max: number;
  length: number;
  include_pro_play: boolean;
};

export type CatalogOption = {
  value: string;
  label: string;
  count?: number;
  /** Held back from a default build until the reader asks for it by name. */
  opt_in?: boolean;
};

export type OwnedCompatibility = {
  total_owned: number;
  runnable: number;
  namespace: string;
};

export type BuilderCatalog = {
  ok: boolean;
  capability: BuilderCapability;
  pools: Array<{ value: BuilderPool; label: string; owned?: OwnedCompatibility }>;
  categories: CatalogOption[];
  source_types: CatalogOption[];
  difficulty: { min: number; max: number };
  lengths: number[];
  pro_play_category: string;
  /** Filters the product does not offer, named so the UI can say why rather
   *  than leaving a reader to wonder where the champion picker went. */
  unsupported_filters: string[];
};

/** A build either produced a session, or honestly did not. Never a short set
 *  padded from elsewhere. */
export type BuildResult = {
  ok: boolean;
  status: "ready" | "insufficient_pool";
  config: BuilderConfig;
  requested: number;
  available: number;
  questions?: QuizQuestion[];
  narrowed_by?: string[];
  set?: { id: number; name: string };
};

export type WeaknessCategory = {
  category: string;
  attempts: number;
  correct: number;
  accuracy: number;
  eligible: boolean;
  is_weak: boolean;
};

export type WeaknessReport = {
  ok: boolean;
  window_days: number;
  min_attempts: number;
  total_attempts: number;
  overall_accuracy: number;
  categories: WeaknessCategory[];
  weak_categories: string[];
  counts_modes: string[];
  excludes_modes: string[];
};

export type SavedSet = {
  id: number;
  name: string;
  config: BuilderConfig | null;
  config_version: number;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  run_count: number;
};

/** The default a freshly opened Builder starts from. Pro Play is off, which is
 *  the product rule expressed as the initial state rather than as a warning. */
export const DEFAULT_CONFIG: BuilderConfig = {
  pool: "bank",
  category: null,
  source_type: null,
  difficulty_min: 1,
  difficulty_max: 5,
  length: 10,
  include_pro_play: false,
};

/** The wire code the backend refuses with. Presence of this string in an error
 *  means "you may not", as distinct from "something broke". */
export const PREMIUM_REQUIRED = "PREMIUM_REQUIRED";

export const isPremiumRefusal = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(PREMIUM_REQUIRED);

export const builderApi = {
  catalog: () => authedRequest<BuilderCatalog>("/api/quiz/builder/catalog"),

  preview: (config: Partial<BuilderConfig>) =>
    authedRequest<BuildResult>("/api/quiz/builder/preview", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  session: (config: Partial<BuilderConfig>) =>
    authedRequest<BuildResult>("/api/quiz/builder/session", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  weakness: () => authedRequest<WeaknessReport>("/api/quiz/builder/weakness"),

  listSets: () =>
    authedRequest<{ ok: boolean; sets: SavedSet[]; capability: BuilderCapability }>(
      "/api/quiz/builder/sets",
    ),

  createSet: (name: string, config: Partial<BuilderConfig>) =>
    authedRequest<{ ok: boolean; set: SavedSet }>("/api/quiz/builder/sets", {
      method: "POST",
      body: JSON.stringify({ name, config }),
    }),

  patchSet: (id: number, patch: { name?: string; config?: Partial<BuilderConfig> }) =>
    authedRequest<{ ok: boolean; set: SavedSet }>(`/api/quiz/builder/sets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteSet: (id: number) =>
    authedRequest<{ ok: boolean; deleted: number }>(`/api/quiz/builder/sets/${id}`, {
      method: "DELETE",
    }),

  runSet: (id: number) =>
    authedRequest<BuildResult>(`/api/quiz/builder/sets/${id}/run`, {
      method: "POST",
    }),
};

/**
 * Why a pool came back short, in the reader's words.
 *
 * The backend names the constraints that were in play; this turns them into
 * one sentence that says what to loosen. It never suggests widening a filter
 * on the reader's behalf — that is their decision, and making it for them is
 * exactly the silent substitution this phase forbids.
 */
export function shortfallReason(result: BuildResult): string {
  const reasons = result.narrowed_by ?? [];
  const parts: string[] = [];
  if (reasons.includes("pool")) {
    parts.push(
      result.config.pool === "weak"
        ? "no category has enough recent attempts to count as a weak spot yet"
        : `your ${result.config.pool} pool`,
    );
  }
  if (reasons.includes("category")) parts.push(`the ${result.config.category} category`);
  if (reasons.includes("source_type")) parts.push(`the ${result.config.source_type} subject`);
  if (reasons.includes("difficulty")) parts.push("the difficulty range");
  if (reasons.includes("pro_play_excluded")) parts.push("Pro Play being left out");
  if (parts.length === 0) return "There are not enough questions for this set.";
  return `Only ${result.available} of the ${result.requested} you asked for are available — ${parts.join(", ")} narrowed it.`;
}
