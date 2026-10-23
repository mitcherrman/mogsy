/**
 * Atlas cross-section — wire constants shared by the request encoder, the
 * response mapper and the server adapter.
 *
 * Source of truth: League_Combat_Simulator draft PR #93 (ATL-CS-BE-001),
 * `routes/atlas_questions.py` + `atlas_questions/{taxonomy,query}.py` at
 * 5319bbf7. Nothing here performs I/O.
 */

export const WIRE_CONTRACT_VERSION = "atlas_questions.v0" as const;

/** The only two routes this lane knows. No admin route is ever called. */
export const WIRE_SEARCH_PATH = "/api/atlas/questions/search" as const;
export const WIRE_COVERAGE_PATH = "/api/atlas/questions/coverage" as const;

/**
 * Every query parameter the server's `parse_query` documents and this client
 * may send. The encoder emits a subset of this list and a test asserts it;
 * `family`, `mode` and `difficulty` are valid on the wire but the view has no
 * control for them, so they are deliberately absent from the encoder.
 */
export const WIRE_SEARCH_PARAMS = ["collection", "a_kind", "a_id", "b_kind", "b_id", "b1_item_id", "topic", "ability_slot", "ability_rank", "champion_level", "patch", "cursor", "limit"] as const;

/** Server-side bounds, mirrored so the encoder fails before the network does. */
export const WIRE_LIMITS = {
  limitMin: 1,
  limitMax: 50,
  repeatMax: 12,
  levelMin: 1,
  levelMax: 18,
  rankMin: 1,
  rankMax: 6,
} as const;

/** `identity.py` patterns, mirrored. */
export const ITEM_ID_PATTERN = /^[0-9]{1,7}$/;
export const CHAMPION_ID_PATTERN = /^[A-Za-z0-9 '.&-]{1,40}$/;
/** An opaque server cursor is base64url; the fixture cursor is a number. */
export const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;

export type WireErrorKind =
  /** The request could not be encoded: refuse before any network call. */
  | "encode"
  /** Body is not a well-formed `atlas_questions.v0` envelope. */
  | "malformed"
  /** `contract_version` is not the one this client understands. */
  | "contract_mismatch"
  /** A status / enum value this client does not know (fails closed). */
  | "unknown_state"
  /** An answer-bearing or raw-identifier key appeared in a payload. */
  | "forbidden_key"
  /** HTTP status, access state and payload disagree with one another. */
  | "inconsistent"
  /** HTTP status the contract does not define for this route. */
  | "unexpected_status"
  /** 429; `retryAfterSeconds` says when to try again. */
  | "rate_limited"
  /** The injected transport itself failed (offline, aborted). */
  | "transport";

/**
 * The single failure type of the wire boundary. `path` names the offending
 * JSON location by KEY only. A message never contains a value from the body:
 * a body can hold prompts, handles or (when it is wrong) answers.
 */
export class AtlasWireError extends Error {
  readonly kind: WireErrorKind;
  readonly path: string;
  readonly retryAfterSeconds: number | null;

  constructor(kind: WireErrorKind, path: string, reason: string, retryAfterSeconds: number | null = null) {
    super(`atlas wire ${kind} at ${path || "(root)"}: ${reason}`);
    this.name = "AtlasWireError";
    this.kind = kind;
    this.path = path;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function fail(kind: WireErrorKind, path: string, reason: string): never {
  throw new AtlasWireError(kind, path, reason);
}

/** A request as data. The transport turns it into a real call; nothing here does. */
export interface WireRequest {
  readonly method: "GET";
  readonly path: typeof WIRE_SEARCH_PATH | typeof WIRE_COVERAGE_PATH;
  readonly params: ReadonlyArray<readonly [string, string]>;
}

export interface WireHttpResponse {
  status: number;
  /** Parsed JSON, or whatever the transport could parse. Treated as hostile. */
  body: unknown;
  /** Raw `Retry-After` header, when present. */
  retryAfter?: string | null;
}

/** Injected by the owner of the (future) live wiring. This module never fetches. */
export type WireTransport = (request: WireRequest) => Promise<WireHttpResponse>;
