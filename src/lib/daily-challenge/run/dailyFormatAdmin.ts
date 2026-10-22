/**
 * Daily formats — the owner's admin reads and writes (lane E).
 *
 * Two independent server settings, never mixed here:
 *  - the ADMIN TAKE format the owner launches from Creator Replay (Classic V1
 *    filming takes, or Three Acts V2 takes behind the server's owner flag);
 *  - the PUBLIC Daily format official runs play, an append-only schedule the
 *    server enforces (future UTC day only, exact confirmation, and no format
 *    the release cannot serve).
 *
 * Everything is parsed defensively: an unreadable answer is an error, never
 * a guessed state.
 */
import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";

export type DailyFormatId = "classic_v1" | "three_acts_v2";

export const DAILY_FORMAT_LABEL: Record<DailyFormatId, string> = {
  classic_v1: "Classic Daily V1",
  three_acts_v2: "Three Acts Daily V2",
};

export function isDailyFormatId(value: unknown): value is DailyFormatId {
  return value === "classic_v1" || value === "three_acts_v2";
}

export interface PublicFormatChange {
  changeId: number;
  format: DailyFormatId;
  effectiveDate: string;
  requestedBy: string;
  requestedAt: string;
  reason: string;
}

export interface PublicFormatState {
  today: string;
  publicFormat: DailyFormatId;
  officialRunsPlay: DailyFormatId;
  officialRunsSource: string;
  earliestEffectiveDate: string;
  formats: { id: DailyFormatId; label: string; publishRefusal: { code: string; message: string } | null }[];
  scheduled: PublicFormatChange[];
  history: PublicFormatChange[];
  officialRunsToday: Partial<Record<DailyFormatId, number>>;
}

export interface ThreeActsStatus {
  ownerTakesEnabled: boolean;
  certificationScope: string;
  composes: boolean | null;
}

export class DailyFormatError extends Error {
  constructor(message: string, readonly code: string | null = null, readonly status: number | null = null) {
    super(message);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function parseChange(v: unknown): PublicFormatChange | null {
  if (!isRecord(v) || typeof v.change_id !== "number" || !isDailyFormatId(v.format) || !isDate(v.effective_date)) return null;
  return {
    changeId: v.change_id,
    format: v.format,
    effectiveDate: v.effective_date,
    requestedBy: typeof v.requested_by === "string" ? v.requested_by : "",
    requestedAt: typeof v.requested_at === "string" ? v.requested_at : "",
    reason: typeof v.reason === "string" ? v.reason : "",
  };
}

export function parsePublicFormatState(v: unknown): PublicFormatState {
  if (!isRecord(v) || !isDate(v.today) || !isDailyFormatId(v.public_format)
      || !isDailyFormatId(v.official_runs_play) || !isDate(v.earliest_effective_date)
      || !Array.isArray(v.formats) || !Array.isArray(v.history) || !Array.isArray(v.scheduled)) {
    throw new DailyFormatError("The Daily service returned an unreadable public format.");
  }
  const changes = (list: unknown[]) => list.map(parseChange).filter((c): c is PublicFormatChange => c !== null);
  const formats = v.formats.flatMap((f) => {
    if (!isRecord(f) || !isDailyFormatId(f.id)) return [];
    const refusal = isRecord(f.publish_refusal) && typeof f.publish_refusal.code === "string"
      ? { code: f.publish_refusal.code, message: typeof f.publish_refusal.message === "string" ? f.publish_refusal.message : "" }
      : null;
    return [{ id: f.id, label: typeof f.label === "string" ? f.label : DAILY_FORMAT_LABEL[f.id], publishRefusal: refusal }];
  });
  const runs: Partial<Record<DailyFormatId, number>> = {};
  if (isRecord(v.official_runs_today)) {
    for (const [k, n] of Object.entries(v.official_runs_today)) {
      if (isDailyFormatId(k) && typeof n === "number") runs[k] = n;
    }
  }
  return {
    today: v.today,
    publicFormat: v.public_format,
    officialRunsPlay: v.official_runs_play,
    officialRunsSource: typeof v.official_runs_source === "string" ? v.official_runs_source : "",
    earliestEffectiveDate: v.earliest_effective_date,
    formats,
    scheduled: changes(v.scheduled),
    history: changes(v.history),
    officialRunsToday: runs,
  };
}

export function parseThreeActsStatus(v: unknown): ThreeActsStatus {
  if (!isRecord(v) || typeof v.owner_takes_enabled !== "boolean") {
    throw new DailyFormatError("The Daily service returned an unreadable three-act status.");
  }
  const readiness = isRecord(v.readiness) ? v.readiness : null;
  return {
    ownerTakesEnabled: v.owner_takes_enabled,
    certificationScope: typeof v.certification_scope === "string" ? v.certification_scope : "",
    composes: readiness && typeof readiness.composes === "boolean" ? readiness.composes : null,
  };
}

async function errorFrom(response: Response, fallback: string): Promise<DailyFormatError> {
  try {
    const payload: unknown = await response.json();
    if (isRecord(payload) && isRecord(payload.detail) && typeof payload.detail.message === "string") {
      return new DailyFormatError(payload.detail.message,
        typeof payload.detail.code === "string" ? payload.detail.code : null, response.status);
    }
  } catch { /* keep the status */ }
  return new DailyFormatError(`${fallback} (${response.status})`, null, response.status);
}

const PUBLIC_FORMAT_PATH = "/api/daily-run/admin/public-format";

export async function fetchPublicFormat(): Promise<PublicFormatState> {
  const url = `${ADMIN_API_BASE_URL}${PUBLIC_FORMAT_PATH}`;
  const response = await fetch(url, { headers: await buildAdminHeaders(url) });
  if (!response.ok) throw await errorFrom(response, "Unable to load the public Daily format");
  return parsePublicFormatState(await response.json());
}

export async function schedulePublicFormat(input: {
  format: DailyFormatId; effectiveDate: string; confirm: string; reason: string;
}): Promise<PublicFormatState> {
  const url = `${ADMIN_API_BASE_URL}${PUBLIC_FORMAT_PATH}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { ...(await buildAdminHeaders(url)), "Content-Type": "application/json" },
    body: JSON.stringify({
      format: input.format, effective_date: input.effectiveDate,
      confirm: input.confirm, reason: input.reason,
    }),
  });
  if (!response.ok) throw await errorFrom(response, "The public Daily format was not changed");
  const payload: unknown = await response.json();
  if (!isRecord(payload)) throw new DailyFormatError("The Daily service returned an unreadable answer.");
  return parsePublicFormatState(payload.state);
}

export async function fetchThreeActsStatus(): Promise<ThreeActsStatus> {
  const url = `${ADMIN_API_BASE_URL}/api/daily-run/admin/three-acts/status`;
  const response = await fetch(url, { headers: await buildAdminHeaders(url) });
  if (!response.ok) throw await errorFrom(response, "Unable to read the three-act status");
  return parseThreeActsStatus(await response.json());
}
