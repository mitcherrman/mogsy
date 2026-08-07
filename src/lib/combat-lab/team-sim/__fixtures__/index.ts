/**
 * Real Phase 4A / 3C payloads, captured by driving the actual backend routes
 * in-process against the production `lol_calc.db` snapshot (SIM2 branch
 * `sim2/phase4a-simulation-catalog`, commit aef7341). They are the byte-level
 * contract these tests assert against — nothing here is hand-authored, so a
 * backend shape change makes the frontend tests fail rather than pass against
 * an invented payload.
 *
 * Fights are short because the requests set `starting_hp`, a first-class
 * contract field — not because the responses were trimmed.
 */
import catalogJson from "./catalog.json";
import catalogMeta from "./catalog.meta.json";
import err401Meta from "./err_401_auth_required.meta.json";
import err402Meta from "./err_402_insufficient_credits.meta.json";
import err403Meta from "./err_403_account_required.meta.json";
import err413Meta from "./err_413_request_too_large.meta.json";
import err422ItemMeta from "./err_422_unsupported_item.meta.json";
import err422SchemaMeta from "./err_422_schema.meta.json";
import err429Meta from "./err_429_rate_limited.meta.json";
import err500Meta from "./err_500_internal.meta.json";
import sim1v1 from "./sim_1v1.json";
import sim1v1Request from "./sim_1v1.request.json";
import sim1v2 from "./sim_1v2.json";
import sim1v2Request from "./sim_1v2.request.json";
import sim2v1 from "./sim_2v1.json";
import sim2v1Request from "./sim_2v1.request.json";
import sim2v2 from "./sim_2v2.json";
import sim2v2Request from "./sim_2v2.request.json";
import sim2v2Truncated from "./sim_2v2_truncated.json";
import simActionFailed from "./sim_1v1_action_failed.json";
import err401 from "./err_401_auth_required.json";
import err402 from "./err_402_insufficient_credits.json";
import err403 from "./err_403_account_required.json";
import err413 from "./err_413_request_too_large.json";
import err422Item from "./err_422_unsupported_item.json";
import err422Schema from "./err_422_schema.json";
import err429 from "./err_429_rate_limited.json";
import err500 from "./err_500_internal.json";

import type {
  TeamSimCatalog,
  TeamSimulationResponse,
} from "../contract";

export const REAL_CATALOG = catalogJson as unknown as TeamSimCatalog;
export const REAL_CATALOG_ETAG = (catalogMeta as { etag: string }).etag;

export const REAL_1V1 = sim1v1 as unknown as TeamSimulationResponse;
export const REAL_1V2 = sim1v2 as unknown as TeamSimulationResponse;
export const REAL_2V1 = sim2v1 as unknown as TeamSimulationResponse;
export const REAL_2V2 = sim2v2 as unknown as TeamSimulationResponse;
export const REAL_2V2_TRUNCATED = sim2v2Truncated as unknown as TeamSimulationResponse;
export const REAL_ACTION_FAILED = simActionFailed as unknown as TeamSimulationResponse;

export const REAL_REQUESTS = {
  "1v1": sim1v1Request,
  "1v2": sim1v2Request,
  "2v1": sim2v1Request,
  "2v2": sim2v2Request,
} as const;

export const REAL_ERRORS = {
  401: err401,
  402: err402,
  403: err403,
  413: err413,
  "422_item": err422Item,
  "422_schema": err422Schema,
  429: err429,
  500: err500,
} as const;

/**
 * The HTTP status (and, for 429, the Retry-After) each error body was actually
 * served with. Tests read these rather than restating the numbers, so a
 * captured status and the assertion about it cannot drift apart.
 */
export const REAL_ERROR_META = {
  401: err401Meta,
  402: err402Meta,
  403: err403Meta,
  413: err413Meta,
  "422_item": err422ItemMeta,
  "422_schema": err422SchemaMeta,
  429: err429Meta,
  500: err500Meta,
} as const;
