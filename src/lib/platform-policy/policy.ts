// ---------------------------------------------------------------------------
// Global platform policy — shared contract.
//
// Five admin-controlled global toggles stored as rows in the existing
// `public.app_settings` key/value table (public SELECT, admin-only writes via
// the has_role RLS policies). This module is pure: no React, no Supabase, so
// the parsing and the fail-closed defaults are trivially unit-testable and can
// be imported from hooks, guards, pages, the admin panel, and tests alike.
//
// IMPORTANT distinctions this file keeps separate:
//   - Global POLICY (here) is not user ENTITLEMENT (Pro status).
//   - Tutorial POLICY (here) is not tutorial COMPLETION state
//     (profiles.ranked_tutorial_completed_at — see lib/ranked-tutorial).
// ---------------------------------------------------------------------------

/** app_settings row keys. Server-validated: only these keys are ever written. */
export const POLICY_KEYS = {
  combatSimTokensRequiredForNonPro: "combat_sim_tokens_required_for_non_pro",
  tutorialAutoPopupEnabled: "tutorial_auto_popup_enabled",
  tutorialCompletionRequiredForNewUsers: "tutorial_completion_required_for_new_users",
  globalNavbarVisible: "global_navbar_visible",
  showBotLabels: "show_bot_labels",
} as const;

export interface PlatformPolicy {
  combatSim: {
    /** Non-Pro users must possess/spend Combat Sim tokens to run a simulation. */
    tokensRequiredForNonPro: boolean;
  };
  tutorial: {
    /** The tutorial popup appears automatically for new users. */
    autoPopupEnabled: boolean;
    /** New users must complete the tutorial before continuing. */
    completionRequiredForNewUsers: boolean;
  };
  navigation: {
    /**
     * The standard Mogzy navigation bar is displayed across public and
     * authenticated pages.
     *
     * Phase 1 establishes storage, parsing, and the admin control only — no
     * renderer reads this field yet, so the navbar is visible regardless of the
     * value. Consumption belongs to Phase 2, once replacement navigation for
     * Profile, Settings, notifications, and admin tools exists.
     */
    globalNavbarVisible: boolean;
  };
  community: {
    /**
     * Ordinary user-facing surfaces may display a visible "Bot" badge on bot
     * personas.
     *
     * PRESENTATION ONLY. This flag must never influence authorization,
     * `is_bot` filtering, analytics, SEO noindex behaviour, soft-disable
     * behaviour, or (in Phase B) the Stat Check bot runtime. Master-admin
     * surfaces always show the real bot state and ignore this value entirely.
     * `profiles.is_bot` remains authoritative internally in both states.
     */
    showBotLabels: boolean;
  };
}

/**
 * Fail-closed defaults, used whenever a row is missing, unreadable, or
 * malformed. Every default reproduces current production behaviour exactly, so
 * an unreadable settings table never silently changes how the platform behaves.
 *
 * For the navbar the same `true` default is fail-SAFE rather than fail-closed:
 * an outage or a malformed row must never strand users without navigation.
 * Both readings point the same way, so the rule stays "default true".
 *
 * `showBotLabels` is the ONE key that defaults to FALSE, and that is what
 * reproduces production. Do not "fix" it to true. There is no user-facing bot
 * label anywhere in the app today — `is_bot` is read only for the /user/:id SEO
 * noindex rule and for admin analytics filtering — so this toggle INTRODUCES
 * the "on" path rather than suppressing an existing one. False therefore cannot
 * be a regression, and a missing or malformed row correctly means "no badge".
 */
export const DEFAULT_PLATFORM_POLICY: PlatformPolicy = {
  combatSim: { tokensRequiredForNonPro: true },
  tutorial: { autoPopupEnabled: true, completionRequiredForNewUsers: true },
  navigation: { globalNavbarVisible: true },
  community: { showBotLabels: false },
};

export interface AppSettingRow {
  key: string;
  value: unknown;
}

/**
 * Read `{ "enabled": boolean }` out of an app_settings value. Anything else —
 * null, a bare boolean, a string, a missing field — is not a valid answer and
 * falls back to the caller's fail-closed default.
 */
function readEnabled(value: unknown, fallback: boolean): boolean {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const enabled = (value as Record<string, unknown>).enabled;
    if (typeof enabled === "boolean") return enabled;
  }
  return fallback;
}

/** Build the policy from raw app_settings rows. Pure; never throws. */
export function parsePlatformPolicy(rows: AppSettingRow[] | null | undefined): PlatformPolicy {
  const policy: PlatformPolicy = {
    combatSim: { ...DEFAULT_PLATFORM_POLICY.combatSim },
    tutorial: { ...DEFAULT_PLATFORM_POLICY.tutorial },
    navigation: { ...DEFAULT_PLATFORM_POLICY.navigation },
    community: { ...DEFAULT_PLATFORM_POLICY.community },
  };
  if (!rows) return policy;

  for (const row of rows) {
    switch (row?.key) {
      case POLICY_KEYS.combatSimTokensRequiredForNonPro:
        policy.combatSim.tokensRequiredForNonPro = readEnabled(
          row.value, DEFAULT_PLATFORM_POLICY.combatSim.tokensRequiredForNonPro);
        break;
      case POLICY_KEYS.tutorialAutoPopupEnabled:
        policy.tutorial.autoPopupEnabled = readEnabled(
          row.value, DEFAULT_PLATFORM_POLICY.tutorial.autoPopupEnabled);
        break;
      case POLICY_KEYS.tutorialCompletionRequiredForNewUsers:
        policy.tutorial.completionRequiredForNewUsers = readEnabled(
          row.value, DEFAULT_PLATFORM_POLICY.tutorial.completionRequiredForNewUsers);
        break;
      case POLICY_KEYS.globalNavbarVisible:
        policy.navigation.globalNavbarVisible = readEnabled(
          row.value, DEFAULT_PLATFORM_POLICY.navigation.globalNavbarVisible);
        break;
      case POLICY_KEYS.showBotLabels:
        policy.community.showBotLabels = readEnabled(
          row.value, DEFAULT_PLATFORM_POLICY.community.showBotLabels);
        break;
    }
  }
  return policy;
}

// ---------------------------------------------------------------------------
// Tutorial presentation decision
// ---------------------------------------------------------------------------

export interface TutorialPresentationInput {
  /** Policy: show the popup automatically to new users. */
  autoPopupEnabled: boolean;
  /** Policy: new users must complete the tutorial before continuing. */
  completionRequiredForNewUsers: boolean;
  /** User state: the account already has a durable completion stamp. */
  completed: boolean;
  /** The visitor is eligible for first-visit onboarding (anonymous guest). */
  eligibleForFirstVisit: boolean;
}

export interface TutorialPresentation {
  /** Render the automatic first-visit popup. */
  showAutoPopup: boolean;
  /**
   * The popup may be dismissed. Only meaningful when `showAutoPopup` is true.
   * A popup shown while completion is NOT required must be escapable, or it
   * would be a trap: the route guard would let the user through, but the
   * overlay would not.
   */
  popupDismissible: boolean;
}

/**
 * Decide the automatic-popup experience from policy + user state.
 *
 * The two toggles stay genuinely independent — all four combinations are
 * distinct and coherent:
 *
 *   popup ON  / forced ON   → non-dismissible popup; the route guard also
 *                             redirects, so onboarding is blocking.
 *   popup ON  / forced OFF  → popup appears but can be dismissed/skipped;
 *                             the route guard lets the user through.
 *   popup OFF / forced ON   → no popup at all, but the route guard still
 *                             redirects an incomplete user straight into the
 *                             tutorial route (forced entry without the
 *                             optional popup). The two are NOT collapsed.
 *   popup OFF / forced OFF  → no popup and no blocking onboarding.
 *
 * A user who already completed the tutorial never sees the popup in any
 * combination.
 */
export function evaluateTutorialPresentation(
  input: TutorialPresentationInput,
): TutorialPresentation {
  const showAutoPopup =
    input.autoPopupEnabled && input.eligibleForFirstVisit && !input.completed;
  return {
    showAutoPopup,
    popupDismissible: !input.completionRequiredForNewUsers,
  };
}
