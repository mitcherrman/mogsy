/**
 * CON1 Step 1E — the computed asset-completeness signal, as the backend states
 * it. PURE: types and description only. No fetch, no DOM, no React.
 *
 *   question / generator metadata
 *     -> canonical backend asset resolver (`ranked_public.question_media
 *        .canonical_asset_path` — case-exact, listing-based, disk-verifying)
 *     -> `quiz.asset_health.compute_asset_status`
 *     -> `asset_status` on every Admin Review row
 *     -> Admin Review badge  /  Content Factory gate
 *
 * This file is the ONE frontend definition of that shape, imported by both
 * consumers. There is deliberately no image lookup, family list or path map
 * anywhere on this side of the wire: the frontend never decides whether an
 * asset is required or whether it exists, it only reads what the backend
 * computed.
 */

/** What the production presentation contract says about one reference. */
export type AssetRequirement =
  /** The question does not work, or does not match its intended production
   *  representation, without it. A visual-recognition question's image is the
   *  tested object. */
  | "required"
  /** Drawn when available; production legitimately degrades to text without
   *  it. The prompt names the depicted subject independently. */
  | "optional"
  /** Production deliberately does NOT draw it in the question state — an
   *  audited answer-revealing family, a reveal-timed subject, or a family the
   *  media policy has not reviewed (text-only until it is). */
  | "withheld";

/** What the canonical resolver answered for one reference. */
export type AssetResolution =
  /** On disk, spelled exactly as stored. */
  | "match"
  /** On disk under a different case. It serves through the resolver's repair;
   *  the STORED string still 404s on a case-sensitive filesystem. */
  | "case_repaired"
  /** The resolver refused: absent, or ambiguous between spellings. */
  | "missing";

export type AssetReference = {
  /** Which channel declared it: `image_path`, `assets.subject.icon`, … */
  channel: string;
  path: string;
  requirement: AssetRequirement;
  /** `null` only when there was no asset tree to judge against. */
  resolution: AssetResolution | null;
  resolved_path: string | null;
  reason: string;
};

/**
 * The gate-relevant summary. Decided by REQUIRED references alone — which is
 * why an optional image that is missing, and a text-only question that
 * references nothing, are both `not_required` rather than a failure.
 */
export type AssetStatusValue =
  /** No required asset is declared. Ordinary text questions, illustration-only
   *  families and deliberately withheld artwork all land here. Never a
   *  failure. */
  | "not_required"
  /** Every required reference resolves. */
  | "resolved"
  /** A required reference does not resolve. THE ONLY FAILING STATUS. */
  | "unresolved"
  /** No asset tree in the serving checkout, so nothing is claimed either way. */
  | "unknown";

export type AssetStatus = {
  status: AssetStatusValue;
  /** Why, when `status` is `unresolved` or `unknown`. Empty otherwise. */
  reason: string;
  references: AssetReference[];
  /** The required references that did not resolve. Empty unless `unresolved`. */
  unresolved: AssetReference[];
  /** A reference exists but production withholds it in the question state.
   *  A real, deliberate text degradation — not a defect. */
  degraded_to_text: boolean;
  /** An OPTIONAL reference did not resolve. Worth showing; never a failure. */
  optional_unresolved: boolean;
  /** Something serves only through the resolver's case repair. */
  case_repaired: boolean;
};

/** The one predicate the Content Factory gate and the Admin badge share. */
export function assetIsUnresolved(status: AssetStatus | null | undefined): boolean {
  return status?.status === "unresolved";
}

export type AssetStatusDescription = {
  label: string;
  /** Short sentence for a `title` tooltip — says what was computed, and says
   *  it is computed, so an operator never confuses it with the manual flag. */
  help: string;
  tone: "ok" | "muted" | "warn" | "bad";
};

/**
 * Operator-facing wording for one computed status.
 *
 * Kept beside the type rather than inside the Admin page so the Content
 * Factory's failure text and the Admin badge describe the same states in the
 * same words.
 */
export function describeAssetStatus(
  status: AssetStatus | null | undefined,
): AssetStatusDescription {
  if (!status) {
    return {
      label: "Asset —",
      help: "This row carries no computed asset health.",
      tone: "muted",
    };
  }
  const notes: string[] = [];
  if (status.degraded_to_text) {
    notes.push(
      "It declares an image that production deliberately does not show in the " +
        "question state.",
    );
  }
  if (status.optional_unresolved) {
    notes.push("An optional/illustrative image is missing; the question still stands.");
  }
  if (status.case_repaired) {
    notes.push(
      "A path resolves only after case repair — the stored spelling 404s on a " +
        "case-sensitive filesystem.",
    );
  }
  const suffix = notes.length ? ` ${notes.join(" ")}` : "";

  switch (status.status) {
    case "resolved":
      return {
        label: "Asset OK",
        help:
          "Computed: every asset this question requires resolves on disk " +
          `through the canonical resolver.${suffix}`,
        tone: notes.length ? "warn" : "ok",
      };
    case "unresolved":
      return {
        label: "Asset unresolved",
        help:
          "Computed: this question requires an asset that does not resolve. " +
          `${status.reason}${suffix}`,
        tone: "bad",
      };
    case "unknown":
      return {
        label: "Asset unknown",
        help: `Computed: ${status.reason}`,
        tone: "muted",
      };
    case "not_required":
    default:
      return {
        label: "No asset required",
        help:
          "Computed: this question requires no visual asset to match its " +
          `production representation.${suffix}`,
        tone: notes.length ? "warn" : "muted",
      };
  }
}
