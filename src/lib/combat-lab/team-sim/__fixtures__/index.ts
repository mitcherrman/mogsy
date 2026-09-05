/**
 * Real backend payloads, captured by driving the actual routes in-process
 * against the production `lol_calc.db` snapshot. The Phase 3C simulation and
 * error bodies came from `sim2/phase4a-simulation-catalog` (aef7341); the
 * catalog and every Phase 4C fixture (400/409/503, and the replay PAIR) were
 * re-captured from `sim2/phase4c-idempotency`. They are the byte-level contract
 * these tests assert against — nothing here is hand-authored, so a backend
 * shape change makes the frontend tests fail rather than pass against an
 * invented payload.
 *
 * Fights are short because the requests set `starting_hp`, a first-class
 * contract field — not because the responses were trimmed.
 *
 * `sim_2v2_calculation.json` was captured the same way, post CS2-2 (live
 * production commit 6287be2): the exact `sim_2v2.request.json` scenario
 * re-run with `limits.trace_detail: "calculation"`, which is what actually
 * carries `formula_bindings` on the wire.
 */
import catalogJson from "./catalog.json";
import catalogMeta from "./catalog.meta.json";
import err401Meta from "./err_401_auth_required.meta.json";
import err402Meta from "./err_402_insufficient_credits.meta.json";
import err402PremiumMeta from "./err_402_premium_required.meta.json";
import err403Meta from "./err_403_account_required.meta.json";
import err413Meta from "./err_413_request_too_large.meta.json";
import err422ItemMeta from "./err_422_unsupported_item.meta.json";
import err422SchemaMeta from "./err_422_schema.meta.json";
import err429Meta from "./err_429_rate_limited.meta.json";
import err500Meta from "./err_500_internal.meta.json";
import err400RequiredMeta from "./err_400_idempotency_key_required.meta.json";
import err400InvalidMeta from "./err_400_idempotency_key_invalid.meta.json";
import err409ConflictMeta from "./err_409_idempotency_conflict.meta.json";
import err409InProgressMeta from "./err_409_idempotency_in_progress.meta.json";
import err503Meta from "./err_503_idempotency_unavailable.meta.json";
import err503UnreadableMeta from "./err_503_idempotency_result_unreadable.meta.json";
import err503EntitlementMeta from "./err_503_entitlement_unavailable.meta.json";
import sim1v1 from "./sim_1v1.json";
import sim1v1Request from "./sim_1v1.request.json";
import sim1v2 from "./sim_1v2.json";
import sim1v2Request from "./sim_1v2.request.json";
import sim2v1 from "./sim_2v1.json";
import sim2v1Request from "./sim_2v1.request.json";
import sim2v2 from "./sim_2v2.json";
import sim2v2Request from "./sim_2v2.request.json";
import sim2v2Calculation from "./sim_2v2_calculation.json";
import sim2v2CalculationRequest from "./sim_2v2_calculation.request.json";
import sim2v2Truncated from "./sim_2v2_truncated.json";
import sim3v3 from "./sim_3v3.json";
import sim3v3Request from "./sim_3v3.request.json";
import sim4v4 from "./sim_4v4.json";
import sim4v4Request from "./sim_4v4.request.json";
import sim5v5 from "./sim_5v5.json";
import sim5v5Request from "./sim_5v5.request.json";
import simActionFailed from "./sim_1v1_action_failed.json";
import err401 from "./err_401_auth_required.json";
import err402 from "./err_402_insufficient_credits.json";
import err402Premium from "./err_402_premium_required.json";
import err403 from "./err_403_account_required.json";
import err413 from "./err_413_request_too_large.json";
import err422Item from "./err_422_unsupported_item.json";
import err422Schema from "./err_422_schema.json";
import err429 from "./err_429_rate_limited.json";
import err500 from "./err_500_internal.json";
import err400Required from "./err_400_idempotency_key_required.json";
import err400Invalid from "./err_400_idempotency_key_invalid.json";
import err409Conflict from "./err_409_idempotency_conflict.json";
import err409InProgress from "./err_409_idempotency_in_progress.json";
import err503 from "./err_503_idempotency_unavailable.json";
import err503Unreadable from "./err_503_idempotency_result_unreadable.json";
import err503Entitlement from "./err_503_entitlement_unavailable.json";
import sim1v1First from "./sim_1v1_first.json";
import sim1v1FirstMeta from "./sim_1v1_first.meta.json";
import sim1v1Replayed from "./sim_1v1_replayed.json";
import sim1v1ReplayedMeta from "./sim_1v1_replayed.meta.json";
import catalogPhase7a from "./catalog_phase7a.json";
import catalogPhase7aMeta from "./catalog_phase7a.meta.json";
import simTraceSummary from "./sim_1v1_trace_summary.json";
import simTraceStandard from "./sim_1v1_trace_standard.json";
import simTraceFull from "./sim_1v1_trace_full.json";
import simTraceSummaryRequest from "./sim_1v1_trace_summary.request.json";
import simTraceStandardRequest from "./sim_1v1_trace_standard.request.json";
import simTraceFullRequest from "./sim_1v1_trace_full.request.json";

import type {
  TeamSimCatalog,
  TeamSimulationResponse,
} from "../contract";

export const REAL_CATALOG = catalogJson as unknown as TeamSimCatalog;
export const REAL_CATALOG_ETAG = (catalogMeta as { etag: string }).etag;

/**
 * SIM2 Phase 7A. The catalog re-captured from the Phase 7A backend, which is
 * the first one to publish `trace_options`.
 *
 * REAL_CATALOG is deliberately NOT replaced. Keeping both is what lets the
 * suite exercise the compatibility path with a genuine artifact rather than a
 * constructed one: against REAL_CATALOG (no trace_options) the request builder
 * must OMIT `trace_detail` entirely, because a backend that does not publish
 * the levels does not accept the field and `extra="forbid"` would 422 the
 * simulation. Against REAL_CATALOG_PHASE7A it must send the selected level.
 */
export const REAL_CATALOG_PHASE7A = catalogPhase7a as unknown as TeamSimCatalog;
export const REAL_CATALOG_PHASE7A_ETAG =
  (catalogPhase7aMeta as { etag: string }).etag;

/**
 * SIM2 Phase 7A. ONE 1v1 scenario captured at all three trace levels — the
 * requests are identical apart from `limits.trace_detail`, so a difference
 * between these three responses can only be the level.
 *
 * The capture asserted, before writing, that termination, duration,
 * event_count, both summary blocks, final targets and the pair-ledger digest
 * are byte-identical across all three, and that the `standard` capture
 * actually carries repeat rows. A future capture that broke either property
 * fails at capture time rather than producing fixtures that would prove the
 * wrong thing.
 *
 *   summary   11 rows of 30 simulated events, 19 omitted, 0 grouped
 *   standard  24 rows of 30 simulated events,  6 omitted, 6 grouped (2 rows)
 *   full      30 rows of 30 simulated events,  0 omitted, not compacted
 */
export const REAL_TRACE_LEVELS = {
  summary: simTraceSummary as unknown as TeamSimulationResponse,
  standard: simTraceStandard as unknown as TeamSimulationResponse,
  full: simTraceFull as unknown as TeamSimulationResponse,
} as const;

export const REAL_TRACE_LEVEL_REQUESTS = {
  summary: simTraceSummaryRequest,
  standard: simTraceStandardRequest,
  full: simTraceFullRequest,
} as const;

export const REAL_1V1 = sim1v1 as unknown as TeamSimulationResponse;
export const REAL_1V2 = sim1v2 as unknown as TeamSimulationResponse;
export const REAL_2V1 = sim2v1 as unknown as TeamSimulationResponse;
export const REAL_2V2 = sim2v2 as unknown as TeamSimulationResponse;
export const REAL_2V2_TRUNCATED = sim2v2Truncated as unknown as TeamSimulationResponse;
/**
 * CS2-2 (live production commit 6287be2). Same scenario as REAL_2V2, at
 * `trace_detail: "calculation"` — the level that actually carries
 * `formula_bindings` on the wire. Lux's Q/E kernel events (`champion_ability`)
 * carry `formula_bindings` alongside `formula_text`; this is the fixture the
 * frontend calculator's formula-evidence rendering is asserted against.
 */
export const REAL_2V2_CALCULATION = sim2v2Calculation as unknown as TeamSimulationResponse;
export const REAL_2V2_CALCULATION_REQUEST = sim2v2CalculationRequest;
/**
 * SIM2 Phase 6A. A REAL six-champion run captured from the Phase 6A backend:
 * Ashe/Lux/Jinx vs Garen/Malphite/Ornn, three targeting policies (one of them
 * a fixed list covering all three opponents), terminating in a full team
 * elimination with all three defenders dead, 219 events, charged 5 credits.
 *
 * Captured rather than hand-written for the reason every fixture here is: a
 * result the UI renders has to be one the simulator can actually produce.
 */
export const REAL_3V3 = sim3v3 as unknown as TeamSimulationResponse;

/**
 * SIM2 Phase 6B. REAL eight- and ten-champion runs captured from the Phase 6B
 * backend, built the same way REAL_3V3 was so the three are comparable:
 * distinct champions on both sides, per-combatant items/runes/ranks/crit modes,
 * four targeting policies in play, and A1 on a fixed priority chain covering
 * EVERY opponent in a deliberately non-slot order.
 *
 *   REAL_4V4  Ashe/Lux/Jinx/Caitlyn vs Garen/Malphite/Ornn/Darius,
 *             team elimination (all four defenders dead), 228 events, 7 credits.
 *   REAL_5V5  the above plus Ezreal vs Nasus,
 *             team elimination (all five defenders dead), 284 events, 9 credits.
 *
 * Neither contains an inert combatant: every one of the eight/ten executed at
 * least one action, which is what makes them usable as the "does the results UI
 * render N of everything" fixture rather than merely large.
 */
export const REAL_4V4 = sim4v4 as unknown as TeamSimulationResponse;
export const REAL_5V5 = sim5v5 as unknown as TeamSimulationResponse;
export const REAL_ACTION_FAILED = simActionFailed as unknown as TeamSimulationResponse;

export const REAL_REQUESTS = {
  "1v1": sim1v1Request,
  "1v2": sim1v2Request,
  "2v1": sim2v1Request,
  "2v2": sim2v2Request,
  "3v3": sim3v3Request,
  "4v4": sim4v4Request,
  "5v5": sim5v5Request,
} as const;

/**
 * The same 1v1 request, sent twice with ONE idempotency key (Phase 4C). The
 * capture asserted the two bodies were byte-identical before writing them, so
 * a future capture that broke replay identity would show up here as a diff.
 */
export const REAL_REPLAY_PAIR = {
  first: sim1v1First as unknown as TeamSimulationResponse,
  replayed: sim1v1Replayed as unknown as TeamSimulationResponse,
  firstMeta: sim1v1FirstMeta as { status: number; idempotency_replayed: string },
  replayedMeta: sim1v1ReplayedMeta as {
    status: number;
    idempotency_replayed: string;
  },
} as const;

export const REAL_ERRORS = {
  400: err400Required,
  "400_invalid": err400Invalid,
  401: err401,
  402: err402,
  403: err403,
  409: err409Conflict,
  "409_in_progress": err409InProgress,
  413: err413,
  "422_item": err422Item,
  "422_schema": err422Schema,
  429: err429,
  500: err500,
  503: err503,
  "503_unreadable": err503Unreadable,
  // COMBAT1, captured the same way: driven through the real route with a
  // verified Free identity, and with the entitlement authority raising.
  "402_premium": err402Premium,
  "503_entitlement": err503Entitlement,
} as const;

/**
 * The HTTP status (and, for 429, the Retry-After) each error body was actually
 * served with. Tests read these rather than restating the numbers, so a
 * captured status and the assertion about it cannot drift apart.
 */
export const REAL_ERROR_META = {
  400: err400RequiredMeta,
  "400_invalid": err400InvalidMeta,
  401: err401Meta,
  402: err402Meta,
  403: err403Meta,
  409: err409ConflictMeta,
  "409_in_progress": err409InProgressMeta,
  413: err413Meta,
  "422_item": err422ItemMeta,
  "422_schema": err422SchemaMeta,
  429: err429Meta,
  500: err500Meta,
  503: err503Meta,
  "503_unreadable": err503UnreadableMeta,
  "402_premium": err402PremiumMeta,
  "503_entitlement": err503EntitlementMeta,
} as const;
