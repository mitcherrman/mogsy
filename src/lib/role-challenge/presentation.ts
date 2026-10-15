/**
 * RC8 — pure presentation rules for the Role Challenge centre parchment.
 *
 * Nothing here decides eligibility. `next_start` from
 * `GET /api/role-challenges/status` is the only authority on whether a start
 * is allowed; Premium here only chooses the WORDS for a state the server has
 * already stated (and the copy for a fresh day, which the server deliberately
 * does not resolve entitlement for).
 */
import type {
  RoleChallengeChampion,
  RoleChallengeStatus,
} from "./contracts";

/**
 * The Data Dragon folder a champion's art lives under on the backend
 * (`assets/champions/<Key>/icon.png`). The catalog's `riot_id` IS that key —
 * `MonkeyKing`, `KSante`, `Kaisa` — and Linux serves the folder
 * case-sensitively, so the lowercase catalog id (`monkeyking`) 404s.
 *
 * `riot_id` is nullable on the wire. The fallback strips the display name to
 * its letters, which is the Data Dragon rule for every champion except the
 * few whose key is not their name.
 */
const KEY_EXCEPTIONS: Readonly<Record<string, string>> = {
  wukong: "MonkeyKing",
  "nunu & willump": "Nunu",
  "renata glasc": "Renata",
  "kai'sa": "Kaisa",
  "kha'zix": "Khazix",
  "vel'koz": "Velkoz",
  "cho'gath": "Chogath",
  "bel'veth": "Belveth",
  leblanc: "Leblanc",
};

export function championAssetKey(champion: Pick<RoleChallengeChampion, "name" | "riotId">): string {
  if (champion.riotId) return champion.riotId;
  const exception = KEY_EXCEPTIONS[champion.name.trim().toLowerCase()];
  if (exception) return exception;
  return champion.name.replace(/[^A-Za-z0-9]/g, "");
}

export function championIconUrlPath(champion: Pick<RoleChallengeChampion, "name" | "riotId">): string {
  return `assets/champions/${championAssetKey(champion)}/icon.png`;
}

/** Case- and punctuation-insensitive champion search ("kai sa" finds Kai'Sa). */
export function filterChampions<T extends Pick<RoleChallengeChampion, "id" | "name">>(
  champions: readonly T[],
  query: string,
): T[] {
  const fold = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
  const needle = fold(query);
  if (!needle) return [...champions];
  return champions.filter((c) => fold(c.name).includes(needle) || fold(c.id).includes(needle));
}

/** "5h 12m" / "12m" / "under a minute" until the next UTC-day reset. */
export function resetCountdown(resetsAt: string, now: Date): string | null {
  const target = Date.parse(resetsAt);
  if (!Number.isFinite(target)) return null;
  const minutes = Math.max(0, Math.floor((target - now.getTime()) / 60_000));
  if (minutes < 1) return "under a minute";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export type RoleChallengePlan = "premium" | "free" | "unknown";

export interface EligibilityView {
  /** May the Play button start a new run right now (server says so)? */
  canStart: boolean;
  /** One short line for the plan chip. */
  planLabel: string;
  /** The explanatory line under the selection, or null when nothing needs saying. */
  message: string | null;
  /** Offer the Premium upgrade link. */
  offerUpgrade: boolean;
  /** Offer a Retry for a status the server could not resolve. */
  offerRetry: boolean;
}

/**
 * What the eligibility row says for a signed-in account. `plan` is the
 * session's Premium entitlement and only picks wording; `status.nextStart` is
 * what decides `canStart`.
 */
export function eligibilityView(
  status: RoleChallengeStatus,
  plan: RoleChallengePlan,
  now: Date,
): EligibilityView {
  const next = status.nextStart;
  const reset = resetCountdown(status.resetsAt, now);
  const resetText = reset ? ` Resets in ${reset} (UTC).` : "";
  const planLabel = plan === "premium"
    ? "Premium · Unlimited starts"
    : next.slotKind === "premium" && next.allowed === true
      ? "Premium · Unlimited starts"
      : "Free · 1 start per UTC day";

  if (status.activeRun) {
    return { canStart: false, planLabel, message: null, offerUpgrade: false, offerRetry: false };
  }
  if (next.reason === "active_match" || status.otherActiveMatch) {
    return {
      canStart: false, planLabel,
      message: "Finish your active match first, then start a Role Challenge.",
      offerUpgrade: false, offerRetry: false,
    };
  }
  if (next.allowed === true) {
    const message = next.slotKind === "premium"
      ? "Today's free start is used — Premium lets you start another."
      : plan === "premium" ? null : "Your free Role Challenge for today is ready.";
    return { canStart: true, planLabel, message, offerUpgrade: false, offerRetry: false };
  }
  if (next.allowed === false && next.reason === "daily_limit_reached") {
    return {
      canStart: false, planLabel,
      message: `Today's free Role Challenge is used.${resetText}`,
      offerUpgrade: true, offerRetry: false,
    };
  }
  return {
    canStart: false, planLabel,
    message: "We couldn't confirm your Premium access. Try again in a moment.",
    offerUpgrade: false, offerRetry: true,
  };
}

export type HubCentreMode = "daily" | "role" | "ranked";

/** `?mode=role|ranked|daily` on `/quiz`; Daily is the default, and a request
 *  to open the Ranked entry record lands on the Ranked mode. */
export function hubModeFromSearch(search: string, openPlay = false): HubCentreMode {
  const mode = new URLSearchParams(search).get("mode");
  if (mode === "role" || mode === "ranked" || mode === "daily") return mode;
  return openPlay ? "ranked" : "daily";
}
