/**
 * COM1-1 / P0-3 — an admin-created bot obeys the AUTH3 public-name authority.
 *
 * ADM2 (20260803120000) predates AUTH3 (20260822120000) and wrote
 * `profiles.display_name` directly, checking only `'' < length <= 60`. With the
 * `profiles_display_name_unique_ci` backstop LIVE, that meant a colliding bot
 * name escaped as a raw `unique_violation` from a function whose contract is
 * `jsonb {ok, code}` — and reserved names ('Moderator', 'Mogzy') and 25–60
 * character names, which AUTH3 refuses every human, were accepted.
 *
 * The rules themselves are AUTH3's and are tested by the AUTH3 suite. What is
 * asserted here is that the bot path REUSES them rather than re-implementing
 * them, and that no failure mode escapes as an exception.
 */
import { describe, expect, it, vi } from "vitest";

// admin-users pulls in the real Supabase client, whose background auth lock
// rejects in jsdom and surfaces as an unhandled error. Nothing here talks to
// Supabase — this file reads SQL and pure mappers — so the client is stubbed.
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: async () => ({ data: null, error: null }) } }));
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { botNameMessage, isBotNameCode } from "@/lib/admin/admin-users";
import { USERNAME_MESSAGES } from "@/lib/identity/username";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260823121000_com1_bot_name_authority.sql"),
  "utf8",
);

describe("the bot RPCs reuse the AUTH3 functions", () => {
  it("validates through display_name_problem rather than a length check", () => {
    expect(sql).toContain("public.display_name_problem");
    // The ADM2 rule that let a bot hold a 60-character reserved name.
    expect(sql).not.toMatch(/length\(_name\)\s*>\s*60/);
  });

  it("stores the AUTH3 display form", () => {
    expect(sql).toContain("public.clean_display_name");
  });

  it("checks case-insensitive uniqueness the way set_display_name does", () => {
    expect(sql).toContain("public.normalize_display_name");
    expect(sql).toContain("public.is_claimed_display_name");
  });

  it("covers BOTH the create and the rename path", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_create_bot_profile");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_update_bot_profile");
  });

  it("exempts a bot from colliding with itself on rename", () => {
    expect(sql).toContain("_self_profile_id");
    expect(sql).toContain("public.bot_display_name_problem(_name, _profile_id)");
  });
});

describe("no raw unique_violation escapes", () => {
  it("traps it on both write paths and returns the friendly code", () => {
    const traps = sql.match(/WHEN unique_violation THEN/g) ?? [];
    expect(traps.length).toBe(2);
    // Each trap returns the envelope rather than re-raising.
    expect(sql).toContain("'code', 'taken'");
    expect(sql).not.toMatch(/RAISE\s+EXCEPTION[^;]*unique/i);
  });

  it("records the refusal in the audit log instead of losing it to a rollback", () => {
    const trapIndex = sql.indexOf("WHEN unique_violation THEN");
    const trap = sql.slice(trapIndex, trapIndex + 600);
    expect(trap).toContain("admin_audit_log");
  });
});

describe("the client renders every code the RPCs can now return", () => {
  const codes = [
    "invalid_display_name", "too_short", "too_long",
    "invalid_characters", "reserved", "taken",
  ] as const;

  it("recognises all of them", () => {
    for (const code of codes) expect(isBotNameCode(code)).toBe(true);
    expect(isBotNameCode("created")).toBe(false);
    expect(isBotNameCode("not_a_bot")).toBe(false);
  });

  it("gives each one a finished sentence, never a Postgres string", () => {
    for (const code of codes) {
      const message = botNameMessage(code);
      expect(message).toBeTruthy();
      expect(message).not.toContain("violates");
      expect(message).not.toContain("profiles_display_name_unique_ci");
      expect(message.endsWith(".")).toBe(true);
    }
  });

  it("says the same thing about a taken name as the player-facing field does", () => {
    expect(botNameMessage("taken")).toBe(USERNAME_MESSAGES.taken);
    expect(botNameMessage("reserved")).toBe(USERNAME_MESSAGES.reserved);
  });
});

describe("bot-specific behaviour is preserved", () => {
  it("still creates no auth.users row", () => {
    expect(sql).toContain("gen_random_uuid()");
    expect(sql).not.toMatch(/INSERT\s+INTO\s+auth\.users/i);
  });

  it("still writes is_bot and the auto-friend hand-off", () => {
    expect(sql).toContain("is_bot");
    expect(sql).toContain("public.admin_link_friendship(_new_profile)");
  });

  it("still requires master_admin on both RPCs", () => {
    const gates = sql.match(/is_master_admin\(_actor_uid\)/g) ?? [];
    expect(gates.length).toBe(2);
  });

  it("leaves the disable toggle able to call update without a name", () => {
    expect(sql).toContain("IF _display_name IS NOT NULL THEN");
  });
});
