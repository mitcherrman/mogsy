/**
 * FUNNEL1B1 — the typed seam between the analytics tables and the generated
 * Supabase types.
 *
 * WHY THIS FILE EXISTS, AND WHEN IT SHOULD STOP EXISTING.
 *
 * src/integrations/supabase/types.ts is generated from the live database and
 * says so at the top of its sibling client.ts. The three analytics tables do
 * not exist in the live database until
 * 20260920120000_funnel1b1_analytics_foundation.sql is applied by hand through
 * the Lovable SQL Editor, so they cannot appear in a regeneration yet. Editing
 * the generated file by hand would be overwritten by the next `supabase gen
 * types` and would leave no trace of why.
 *
 * The old emitter solved the same problem with `(supabase as any).from(...)`,
 * which removed the types from the CALL SITE — the insert object was unchecked,
 * so a typo in a column name compiled, shipped, and failed silently forever.
 *
 * This file solves it the other way round. The row shapes are declared
 * explicitly and exactly once; the structural cast happens exactly once, here,
 * on the client rather than on the data; and every caller upstream is fully
 * checked against the real column set. There is no `as any` in the emitter and
 * none at any call site.
 *
 * TO REMOVE THIS FILE: apply the migration, run the type generator, confirm
 * the three tables appear in types.ts, then delete AnalyticsDatabase and point
 * `analyticsDb` at `supabase` directly. The row types below should be
 * structurally identical to the generated ones; if they are not, the
 * difference is a bug in one of them and worth knowing about.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** public.analytics_events — see the migration for the reasoning on each column. */
export type AnalyticsEventInsert = {
  event_name: string;
  event_version?: number;
  occurred_at?: string;
  /** received_at is DB-defaulted and deliberately not writable from here. */
  route?: string | null;
  visitor_id?: string | null;
  session_id?: string | null;
  user_id?: string | null;
  is_guest?: boolean | null;
  source_system?: "web" | "railway" | "supabase";
  source_entity_type?: string | null;
  source_entity_id?: string | null;
  verification_type?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AnalyticsEventRow = Required<
  Omit<AnalyticsEventInsert, "metadata">
> & {
  id: string;
  received_at: string;
  metadata: Record<string, unknown> | null;
};

/** public.analytics_visitors — first touch, insert-once, immutable. */
export type AnalyticsVisitorInsert = {
  visitor_id: string;
  first_landing_path?: string | null;
  first_referrer?: string | null;
  first_utm_source?: string | null;
  first_utm_medium?: string | null;
  first_utm_campaign?: string | null;
  first_utm_content?: string | null;
  first_utm_term?: string | null;
};

export type AnalyticsVisitorRow = Required<AnalyticsVisitorInsert> & {
  first_seen_at: string;
};

/** public.analytics_sessions — current touch, insert-once. */
export type AnalyticsSessionInsert = {
  session_id: string;
  visitor_id: string;
  landing_path?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  /**
   * USERS1. The session's traffic class, written once at insert. A client may
   * write 'automation', 'internal' or 'unknown'; the RLS WITH CHECK refuses
   * 'human', which is reachable only through analytics_promote_session_human.
   */
  traffic_class?: "automation" | "internal" | "unknown";
  traffic_source?: string | null;
  classification_reason?: string | null;
  frontend_release?: string | null;
};

export type AnalyticsSessionRow = Required<
  Omit<AnalyticsSessionInsert, "traffic_class">
> & {
  started_at: string;
  /**
   * Wider than the Insert type on purpose: 'human' is a value the database can
   * hold and a client can never write. The asymmetry IS the integrity rule
   * (see the USERS1 migration §2), so it is expressed in the types too.
   */
  traffic_class: "human" | "automation" | "internal" | "unknown";
  active_ms: number;
  last_active_at: string | null;
  session_end_reason: "explicit_end" | "inactivity_timeout" | null;
  session_end_observed_at: string | null;
  last_browser_boundary: "page_hidden" | "pagehide" | null;
  last_browser_boundary_observed_at: string | null;
};

export type AnalyticsVisitorUserLinkRow = {
  visitor_id: string;
  user_id: string;
  first_observed_at: string;
  last_observed_at: string;
  observation_count: number;
};

/**
 * public.analytics_traffic_overrides — USERS1.
 *
 * The operator's correction to a visitor's derived class, kept in its own
 * table so the observation (on the session rows) is never edited. Admin-only,
 * both ways.
 */
export type AnalyticsTrafficOverrideInsert = {
  visitor_id: string;
  traffic_class: "human" | "automation" | "internal" | "unknown";
  traffic_source?: string | null;
  reason?: string | null;
  set_by?: string | null;
};

export type AnalyticsTrafficOverrideRow = Required<AnalyticsTrafficOverrideInsert> & {
  set_at: string;
};

export type AnalyticsDatabase = {
  public: {
    Tables: {
      analytics_events: {
        Row: AnalyticsEventRow;
        Insert: AnalyticsEventInsert;
        Update: never;
        Relationships: [];
      };
      analytics_visitors: {
        Row: AnalyticsVisitorRow;
        Insert: AnalyticsVisitorInsert;
        Update: never;
        Relationships: [];
      };
      analytics_sessions: {
        Row: AnalyticsSessionRow;
        Insert: AnalyticsSessionInsert;
        Update: never;
        Relationships: [];
      };
      analytics_traffic_overrides: {
        Row: AnalyticsTrafficOverrideRow;
        Insert: AnalyticsTrafficOverrideInsert;
        Update: Partial<AnalyticsTrafficOverrideInsert>;
        Relationships: [];
      };
      analytics_visitor_user_links: {
        Row: AnalyticsVisitorUserLinkRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      /** USERS1 — the only write path to traffic_class = 'human'. */
      analytics_promote_session_human: {
        Args: { p_session_id: string; p_reason?: string | null };
        Returns: boolean;
      };
      analytics_record_session_activity: {
        Args: {
          p_session_id: string;
          p_visitor_id: string;
          p_active_ms: number;
          p_last_active_at?: string | null;
          p_end_reason?: string | null;
          p_browser_boundary?: string | null;
        };
        Returns: boolean;
      };
      analytics_link_visitor_user: {
        Args: { p_visitor_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

/**
 * The one cast. It re-describes the client's schema, not any row: the runtime
 * object is unchanged and every `.insert()` below it is checked against the
 * types above.
 */
export const analyticsDb = supabase as unknown as SupabaseClient<AnalyticsDatabase>;

export const ANALYTICS_EVENTS_TABLE = "analytics_events" as const;
export const ANALYTICS_VISITORS_TABLE = "analytics_visitors" as const;
export const ANALYTICS_SESSIONS_TABLE = "analytics_sessions" as const;
export const ANALYTICS_TRAFFIC_OVERRIDES_TABLE = "analytics_traffic_overrides" as const;
