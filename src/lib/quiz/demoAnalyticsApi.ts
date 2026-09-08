/**
 * PT1.9 — the master-admin demo analytics client.
 *
 * WHAT THIS IS FOR
 * ────────────────
 * PT1.8's Free/Premium analytics split is PROVISIONAL. Deciding whether it is
 * the right split means seeing the two presentations of the same record side
 * by side, and the owner cannot do that with their own account: it holds both
 * `is_pro` and the playtest grant, so a Free reading cannot be produced
 * without revoking their own access, and their real record is under a hundred
 * answers deep. This reads ONE fabricated account instead.
 *
 * IT IS NOT AN "ACT AS USER" CLIENT
 * ─────────────────────────────────
 * The only ids it will ever send are the demo subjects the SERVER lists from
 * its own registry, and every one of them is in a namespace a Supabase auth
 * uuid cannot occupy. There is no code path here that takes a user id from
 * anywhere else, and the server refuses one anyway. The real analytics API
 * (`analyticsApi`) still accepts no id at all and is untouched by this file.
 *
 * WHY IT SHAPES ITSELF LIKE `analyticsApi`
 * ────────────────────────────────────────
 * So that `PerformanceTrendsPane` — the actual shipped pane, with its actual
 * paywall, error branch and window picker — can render it unchanged. A preview
 * built from a second component would be a preview of a component that is not
 * the product.
 */
import { getBackendAuthHeaders } from "@/lib/backend-auth";
import { getAdminKey } from "@/lib/knowledge-admin/key";

/** Same origin resolution `quizApi` uses. Declared here rather than exported
 *  from there so this admin-only module adds no export to the consumer API. */
const API_BASE_URL =
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) ||
  "http://127.0.0.1:8000";
import type {
  AnalyticsCapability,
  TrendReport,
} from "@/lib/quiz/analyticsApi";

/** Which presentation of the same record to render. */
export type DemoPreview = "free" | "premium";

export type DemoTarget = {
  user_id: string;
  slug: string;
  label: string;
  note: string;
  seeded: { attempts: number; sessions: number };
  is_seeded: boolean;
};

export type DemoTargetList = {
  ok: boolean;
  demo: true;
  banner: string;
  previews: DemoPreview[];
  targets: DemoTarget[];
};

/** A refusal, carrying no report.
 *
 *  PT1.10 made this unreachable for either preview: Free is now answered with
 *  the snapshot, exactly as the live route answers it. The shape stays because
 *  the server can still emit it for a tier with no snapshot right at all, and
 *  because a client that stopped being able to recognise a refusal would render
 *  one as an empty record. */
export type DemoRefusal = {
  ok: boolean;
  demo: true;
  banner: string;
  preview: DemoPreview;
  capability: AnalyticsCapability;
  windows: number[];
  target: DemoTarget;
  refusal: { code: string; message: string };
};

export type DemoTrendReport = TrendReport & {
  demo: true;
  banner: string;
  preview: DemoPreview;
  target: DemoTarget;
};

export class DemoPreviewError extends Error {}

/**
 * Admin-credentialed fetch, same shape as `quizApi`'s own admin path: the
 * Supabase bearer token is the normal browser route for an allowlisted owner,
 * and an explicit fallback key is attached as `X-Admin-Key` when one is set.
 * Nothing here holds a credential of its own.
 */
async function adminGet<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { ...(await getBackendAuthHeaders()) };
  const key = getAdminKey();
  if (key) headers["X-Admin-Key"] = key;
  const response = await fetch(`${API_BASE_URL}${path}`, { headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new DemoPreviewError(
      `Demo preview ${response.status}: ${detail || response.statusText}`,
    );
  }
  return (await response.json()) as T;
}

const query = (target: string, preview: DemoPreview, windowDays?: number) =>
  `/api/admin/demo-analytics/trends?target=${encodeURIComponent(target)}` +
  `&preview=${encodeURIComponent(preview)}` +
  (windowDays == null ? "" : `&window=${windowDays}`);

export const demoAnalyticsApi = {
  targets: () => adminGet<DemoTargetList>("/api/admin/demo-analytics/targets"),
  read: (target: string, preview: DemoPreview, windowDays?: number) =>
    adminGet<DemoTrendReport | DemoRefusal>(query(target, preview, windowDays)),
};

/**
 * A `TrendsSource` over one demo subject and one presentation.
 *
 * The shape it returns is deliberately identical to the real API's, including
 * the Free case: since PT1.10 that means the Free SNAPSHOT — the figures with
 * the interpretation projected away — reached through the same hook, the same
 * pane and the same server-side projection a real Free reader gets. What the
 * owner compares is therefore the shipped product, not a drawing of it, which
 * is the property that made the PT1.9 review worth acting on.
 *
 * Built fresh per (target, preview) by the page below, and passed as a
 * dependency, so moving the toggle re-reads both answers rather than leaving
 * a Premium report on screen under a Free capability.
 */
export function demoTrendsSource(target: string, preview: DemoPreview) {
  return {
    capability: async () => {
      const body = await demoAnalyticsApi.read(target, preview);
      return { capability: body.capability };
    },
    trends: async (windowDays: number) => {
      const body = await demoAnalyticsApi.read(target, preview, windowDays);
      if (!("current" in body)) {
        // A server that answered a refusal here must not be silently rendered
        // as an empty record — "you have studied nothing" is a false statement
        // about the reader, where "this could not be loaded" is a true one.
        throw new DemoPreviewError(
          "The demo preview refused to serve a report for this presentation.",
        );
      }
      return body as TrendReport;
    },
  };
}
