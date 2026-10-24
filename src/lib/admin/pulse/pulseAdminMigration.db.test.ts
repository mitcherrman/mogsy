// @vitest-environment node
//
// PGlite loads its wasm build through fetch/Response; jsdom's shims break that.
/**
 * PULSE-2B — the STAGED migration, executed for real (PGlite, no Docker) under
 * the REAL OWN1 owner model: is_owner / assert_owner / log_owner_action are
 * read verbatim from supabase/own1-staged, not retyped.
 *
 * Proves the server, not the UI, protects every write:
 *   - anon and players can't read the tables, can't call the admin RPCs, and
 *     can't write the tables directly;
 *   - even the owner can't write the tables directly (RPCs only);
 *   - an unattested aal1 owner gets step_up_required; campaign decisions need
 *     a fresh MFA;
 *   - the public read applies every eligibility rule and leaks nothing.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const OWNER = "0aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLAYER = "0bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION = "5e550000-0000-4000-8000-000000000001";

const root = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const MIGRATION = read("supabase/pulse-p2b-staged/migrations/01_pulse_admin_workspace.sql");
const ROLLBACK = read("supabase/pulse-p2b-staged/rollback/01_pulse_admin_workspace_rollback.sql");
const OWN1_A = read("supabase/own1-staged/migrations/01_own1_a_owner_core.sql");

function fn(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  if (start < 0) throw new Error(`OWN1 SQL no longer defines ${name}`);
  const body = sql.indexOf("$$", start);
  const end = sql.indexOf("$$;", body + 2);
  return sql.slice(start, end + 3);
}

const FIXTURE = `
  CREATE ROLE anon; CREATE ROLE authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
  CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO anon, authenticated;
  CREATE TABLE public._ctx (uid uuid, claims jsonb);
  INSERT INTO public._ctx VALUES (NULL, NULL);
  GRANT SELECT ON public._ctx TO anon, authenticated;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT uid FROM public._ctx LIMIT 1 $$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(claims, '{}'::jsonb) FROM public._ctx LIMIT 1 $$;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE);
  CREATE TABLE public.admin_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id uuid, actor_profile_id uuid, action text NOT NULL,
    target_profile_id uuid, result text, detail jsonb, aal text, session_id uuid, created_at timestamptz NOT NULL DEFAULT now());
  CREATE SCHEMA private;
  CREATE TABLE private.owner_config (singleton boolean PRIMARY KEY DEFAULT true, owner_user_id uuid NOT NULL);
  CREATE TABLE private.owner_trusted_devices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL,
    expires_at timestamptz NOT NULL, revoked_at timestamptz);
  CREATE TABLE private.owner_device_attestations (session_id uuid PRIMARY KEY, device_id uuid NOT NULL,
    owner_user_id uuid NOT NULL, expires_at timestamptz NOT NULL);
  ${fn(OWN1_A, "private.configured_owner_id")}
  ${fn(OWN1_A, "private.jwt_aal")}
  ${fn(OWN1_A, "private.jwt_session_id")}
  ${fn(OWN1_A, "private.jwt_last_mfa_at")}
  ${fn(OWN1_A, "public.is_owner_user")}
  ${fn(OWN1_A, "private.has_device_attestation")}
  ${fn(OWN1_A, "public.is_owner_aal2")}
  ${fn(OWN1_A, "public.is_owner_fresh_aal2")}
  ${fn(OWN1_A, "public.is_owner")}
  ${fn(OWN1_A, "public.assert_owner")}
  ${fn(OWN1_A, "public.log_owner_action")}
  REVOKE ALL ON SCHEMA private FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.is_owner_user(uuid) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.assert_owner(text), public.log_owner_action(text, uuid, text, jsonb) FROM PUBLIC, anon;
  INSERT INTO private.owner_config (owner_user_id) VALUES ('${OWNER}');
  INSERT INTO public.profiles (user_id) VALUES ('${OWNER}'), ('${PLAYER}');
`;

let db: PGlite;

type Who =
  | { role: "anon" }
  | { role: "authenticated"; uid: string; aal?: "aal1" | "aal2"; mfaSecondsAgo?: number };

const OWNER_MFA: Who = { role: "authenticated", uid: OWNER, aal: "aal2", mfaSecondsAgo: 30 };
const OWNER_STALE_MFA: Who = { role: "authenticated", uid: OWNER, aal: "aal2", mfaSecondsAgo: 3600 };
const OWNER_AAL1: Who = { role: "authenticated", uid: OWNER, aal: "aal1" };
const PLAYER_AAL2: Who = { role: "authenticated", uid: PLAYER, aal: "aal2", mfaSecondsAgo: 30 };
const ANON: Who = { role: "anon" };

type Outcome = { ok: true; rows: Record<string, unknown>[] } | { ok: false; code?: string; message?: string; detail?: string };

async function run(who: Who, sql: string, params: unknown[] = []): Promise<Outcome> {
  if (who.role === "anon") {
    await db.query(`UPDATE public._ctx SET uid = NULL, claims = NULL`);
  } else {
    const amr = who.mfaSecondsAgo === undefined ? [] : [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) - who.mfaSecondsAgo }];
    await db.query(`UPDATE public._ctx SET uid = $1::uuid, claims = $2::jsonb`, [
      who.uid, JSON.stringify({ sub: who.uid, aal: who.aal ?? "aal1", session_id: SESSION, amr })]);
  }
  await db.exec(`SET ROLE ${who.role};`);
  try {
    return { ok: true, rows: (await db.query<Record<string, unknown>>(sql, params)).rows };
  } catch (e) {
    const err = e as { code?: string; message?: string; detail?: string };
    return { ok: false, code: err.code, message: err.message, detail: err.detail };
  } finally {
    await db.exec("RESET ROLE;");
  }
}

async function ok(who: Who, sql: string, params: unknown[] = []) {
  const r = await run(who, sql, params);
  if (!r.ok) throw new Error(`${sql}: ${r.code} ${r.message} ${r.detail ?? ""}`);
  return r.rows;
}

const one = async <T = Record<string, unknown>>(who: Who, sql: string, params: unknown[] = []) =>
  (await ok(who, sql, params))[0].r as T;

const news = (headline: string, extra: Record<string, unknown> = {}) => ({
  id: null, label: headline || "Untitled", publishAt: null, expiresAt: null, priority: 10, featured: false, campaignId: null, note: "secret internal note",
  payload: {
    id: "", kind: "news", category: "news", provenance: "live", title: headline, variant: "announcement", kicker: "Academy update",
    headline, summary: "s", body: ["b"], dateLabel: "Academy update", href: "/quiz", ctaLabel: "Read", ...extra,
  },
});

const saveItem = (who: Who, item: unknown, rev: number | null) =>
  run(who, `SELECT public.pulse_admin_save_item($1::jsonb, $2) AS r`, [JSON.stringify(item), rev]);
const publicCatalogue = async (who: Who = ANON) =>
  one<{ items: { item: Record<string, unknown>; disclosure: unknown }[]; fallbackToStatic: boolean; cadence: { slots: string[] } }>(
    who, `SELECT public.pulse_public_catalogue() AS r`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(MIGRATION);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("PULSE-2B staged migration: who can do what", () => {
  it("anon: no table reads, no admin RPCs; the public read works", async () => {
    for (const t of ["pulse_content_items", "pulse_campaigns", "pulse_category_settings", "pulse_schedule_settings"]) {
      const r = await run(ANON, `SELECT * FROM public.${t}`);
      expect(r.ok, t).toBe(false);
      expect(r.ok === false && r.code).toBe("42501");
    }
    const rpc = await run(ANON, `SELECT public.pulse_admin_snapshot()`);
    expect(rpc.ok).toBe(false);
    expect(rpc.ok === false && rpc.code).toBe("42501");
    expect((await publicCatalogue()).items).toEqual([]);
  });

  it("a player (even at aal2) is refused by assert_owner and sees no rows", async () => {
    const r = await saveItem(PLAYER_AAL2, news("Player headline"), null);
    expect(r.ok === false && r.message).toBe("owner_required");
    expect((await run(PLAYER_AAL2, `SELECT public.pulse_admin_set_kill(true, 'managed', 'x')`)).ok).toBe(false);
    expect(await ok(PLAYER_AAL2, `SELECT * FROM public.pulse_schedule_settings`)).toEqual([]);
  });

  it("no one writes the tables directly — not players, not the owner", async () => {
    for (const who of [PLAYER_AAL2, OWNER_MFA]) {
      const ins = await run(who, `INSERT INTO public.pulse_content_items (label, kind, category, payload) VALUES ('x', 'news', 'news', '{}')`);
      expect(ins.ok === false && ins.code).toBe("42501");
      const upd = await run(who, `UPDATE public.pulse_schedule_settings SET kill_active = false`);
      expect(upd.ok === false && upd.code).toBe("42501");
      const del = await run(who, `DELETE FROM public.pulse_category_settings`);
      expect(del.ok === false && del.code).toBe("42501");
    }
  });

  it("an owner on an unattested aal1 session must step up", async () => {
    const r = await run(OWNER_AAL1, `SELECT public.pulse_admin_snapshot()`);
    expect(r.ok === false && r.message).toBe("step_up_required");
  });

  it("owner reads the snapshot in the contract shape", async () => {
    const s = await one<{ contractVersion: string; categories: unknown[]; schedule: { slots: string[]; kill: { active: boolean } } }>(
      OWNER_MFA, `SELECT public.pulse_admin_snapshot() AS r`);
    expect(s.contractVersion).toBe("pulse-admin/1");
    expect(s.categories).toHaveLength(11);
    expect(s.schedule.slots).toHaveLength(12);
    expect(s.schedule.kill.active).toBe(false);
  });
});

describe("PULSE-2B staged migration: editorial lifecycle and the public read", () => {
  let newsId = "";
  let rev = 0;

  it("refuses unsafe payloads server-side", async () => {
    const bad = await saveItem(OWNER_MFA, news("Bad", { href: "javascript:alert(1)" }), null);
    expect(bad.ok === false && bad.message).toBe("pulse_invalid");
    expect(bad.ok === false && JSON.parse(bad.detail!)).toContainEqual(expect.objectContaining({ field: "href" }));
    const offsite = await saveItem(OWNER_MFA, news("Bad", { href: "//evil.example" }), null);
    expect(offsite.ok).toBe(false);
    const wrongKind = await saveItem(OWNER_MFA, { ...news("x"), payload: { ...news("x").payload, kind: "leaderboard" } }, null);
    expect(wrongKind.ok).toBe(false);
  });

  it("draft → not public; publish → public, without internal fields", async () => {
    const created = await one<{ id: string; revision: number; state: string }>(
      OWNER_MFA, `SELECT public.pulse_admin_save_item($1::jsonb, NULL) AS r`, [JSON.stringify(news("Halloween quiz week"))]);
    expect(created.state).toBe("draft");
    newsId = created.id;
    rev = created.revision;
    expect((await publicCatalogue()).items).toEqual([]);

    const pub = await one<{ revision: number; state: string }>(OWNER_MFA,
      `SELECT public.pulse_admin_transition_item($1::uuid, 'publish', NULL, $2) AS r`, [newsId, rev]);
    expect(pub.state).toBe("published");
    rev = pub.revision;
    const cat = await publicCatalogue();
    expect(cat.items).toHaveLength(1);
    expect(cat.items[0].item).toMatchObject({ id: newsId, provenance: "live", headline: "Halloween quiz week" });
    expect(JSON.stringify(cat)).not.toMatch(/secret internal note|label/);
  });

  it("stale revisions are conflicts", async () => {
    const r = await run(OWNER_MFA, `SELECT public.pulse_admin_transition_item($1::uuid, 'unpublish', NULL, $2)`, [newsId, rev - 1]);
    expect(r.ok === false && r.message).toBe("pulse_conflict");
  });

  it("live content can't be archived, and edits that would break it are refused", async () => {
    const a = await run(OWNER_MFA, `SELECT public.pulse_admin_transition_item($1::uuid, 'archive', NULL, $2)`, [newsId, rev]);
    expect(a.ok === false && a.message).toBe("pulse_invalid");
    const broken = await saveItem(OWNER_MFA, { ...news(""), id: newsId, label: "x" }, rev);
    expect(broken.ok === false && broken.message).toBe("pulse_invalid");
  });

  it("category disable / frequency / expiry apply to items and the cadence", async () => {
    // The owner's read policy: support reads go straight to the table.
    const s = { revision: await one<number>(OWNER_MFA, `SELECT revision AS r FROM public.pulse_category_settings WHERE category = 'news'`) };
    await ok(OWNER_MFA, `SELECT public.pulse_admin_save_category('news', false, NULL, NULL, $1)`, [s.revision]);
    let cat = await publicCatalogue();
    expect(cat.items).toEqual([]);
    expect(cat.cadence.slots).not.toContain("news");
    await ok(OWNER_MFA, `SELECT public.pulse_admin_save_category('news', true, NULL, NULL, $1)`, [s.revision + 1]);
    await ok(OWNER_MFA, `SELECT public.pulse_admin_save_category('mini-game', true, 0, NULL, 1)`);
    cat = await publicCatalogue();
    expect(cat.items).toHaveLength(1);
    expect(cat.cadence.slots).not.toContain("mini-game");
    expect(cat.cadence.slots).toContain("news");
  });

  it("cadence bounds are enforced by the server", async () => {
    const r = await run(OWNER_MFA, `SELECT public.pulse_admin_save_schedule(ARRAY['news'], 9, 3, 1)`);
    expect(r.ok === false && r.message).toBe("pulse_invalid");
    const bogus = await run(OWNER_MFA, `SELECT public.pulse_admin_save_schedule(ARRAY['not-a-category'], 2, 3, 1)`);
    expect(bogus.ok).toBe(false);
  });
});

describe("PULSE-2B staged migration: partners, approval and the emergency disable", () => {
  let campaign: { id: string; revision: number };
  let sponsor: { id: string; revision: number };

  it("sponsor disclosure is fixed by type; paid needs wording", async () => {
    const bad = await run(OWNER_MFA, `SELECT public.pulse_admin_save_campaign($1::jsonb, NULL)`, [JSON.stringify({
      id: null, type: "sponsor", partnerName: "Example Co", title: "Autumn", disclosure: "unpaid-spotlight", disclosureText: "",
      flightStart: null, flightEnd: null, contractRef: "" })]);
    expect(bad.ok === false && bad.message).toBe("pulse_invalid");
    campaign = await one(OWNER_MFA, `SELECT public.pulse_admin_save_campaign($1::jsonb, NULL) AS r`, [JSON.stringify({
      id: null, type: "sponsor", partnerName: "Example Co", title: "Autumn", disclosure: "sponsored", disclosureText: "Paid by Example Co",
      flightStart: null, flightEnd: null, contractRef: "INTERNAL-REF-42" })]);
  });

  it("a sponsor item can't publish until its campaign is approved — and approval needs a fresh MFA", async () => {
    sponsor = await one(OWNER_MFA, `SELECT public.pulse_admin_save_item($1::jsonb, NULL) AS r`, [JSON.stringify({
      id: null, label: "Autumn placement", publishAt: null, expiresAt: null, priority: 1, featured: false, campaignId: campaign.id, note: "",
      payload: { id: "", kind: "sponsor", category: "sponsor", provenance: "live", title: "Sponsored: Autumn", sponsorName: "Example Co",
        campaignTitle: "Autumn", tagline: "t", artUrl: null, ctaLabel: "Learn more", href: "https://example.com/autumn" } })]);
    const early = await run(OWNER_MFA, `SELECT public.pulse_admin_transition_item($1::uuid, 'publish', NULL, $2)`, [sponsor.id, sponsor.revision]);
    expect(early.ok === false && early.message).toBe("pulse_invalid");

    const stale = await run(OWNER_STALE_MFA, `SELECT public.pulse_admin_decide_campaign($1::uuid, 'approve', '', $2)`, [campaign.id, campaign.revision]);
    expect(stale.ok === false && stale.message).toBe("step_up_required");
    campaign = await one(OWNER_MFA, `SELECT public.pulse_admin_decide_campaign($1::uuid, 'approve', '', $2) AS r`, [campaign.id, campaign.revision]);

    sponsor = await one(OWNER_MFA, `SELECT public.pulse_admin_transition_item($1::uuid, 'publish', NULL, $2) AS r`, [sponsor.id, sponsor.revision]);
    const cat = await publicCatalogue();
    const entry = cat.items.find((i) => i.item.id === sponsor.id);
    expect(entry?.disclosure).toEqual({ kind: "sponsored", text: "Paid by Example Co", partner: "Example Co" });
    expect(JSON.stringify(cat)).not.toMatch(/INTERNAL-REF-42/);
  });

  it("ending the campaign takes its content off at once", async () => {
    const noNote = await run(OWNER_MFA, `SELECT public.pulse_admin_decide_campaign($1::uuid, 'end', '', $2)`, [campaign.id, campaign.revision]);
    expect(noNote.ok === false && noNote.message).toBe("pulse_invalid");
    campaign = await one(OWNER_MFA, `SELECT public.pulse_admin_decide_campaign($1::uuid, 'end', 'Flight over', $2) AS r`, [campaign.id, campaign.revision]);
    expect((await publicCatalogue()).items.some((i) => i.item.kind === "sponsor")).toBe(false);
    campaign = await one(OWNER_MFA, `SELECT public.pulse_admin_decide_campaign($1::uuid, 'approve', '', $2) AS r`, [campaign.id, campaign.revision])
      .catch(() => campaign);
  });

  it("hand-claimed Twitch LIVE is refused", async () => {
    const r = await saveItem(OWNER_MFA, {
      id: null, label: "Stream", publishAt: null, expiresAt: null, priority: 1, featured: false, campaignId: campaign.id, note: "",
      payload: { id: "", kind: "creator", category: "creator-spotlight", provenance: "live", title: "t", creatorName: "C", creatorTag: "",
        challenge: null, media: { platform: "twitch", channel: "realchan", title: "Live now", live: true, viewersLabel: "", thumbnailUrl: null } },
    }, null);
    expect(r.ok === false && r.message).toBe("pulse_invalid");
  });

  it("emergency disable: needs a reason; partners vs managed; restore", async () => {
    const noReason = await run(OWNER_MFA, `SELECT public.pulse_admin_set_kill(true, 'managed', '  ')`);
    expect(noReason.ok === false && noReason.message).toBe("pulse_invalid");

    await ok(OWNER_MFA, `SELECT public.pulse_admin_set_kill(true, 'managed', 'Wrong patch number')`);
    let cat = await publicCatalogue();
    expect(cat.items).toEqual([]);
    expect(cat.fallbackToStatic).toBe(true);

    await ok(OWNER_MFA, `SELECT public.pulse_admin_set_kill(true, 'partners', 'Brand-safety review')`);
    cat = await publicCatalogue();
    expect(cat.fallbackToStatic).toBe(false);
    expect(cat.items.length).toBeGreaterThan(0);
    expect(cat.items.every((i) => i.item.kind !== "sponsor" && i.item.kind !== "creator")).toBe(true);

    await ok(OWNER_MFA, `SELECT public.pulse_admin_set_kill(false, 'partners', 'Resolved')`);
    expect((await publicCatalogue()).fallbackToStatic).toBe(false);
  });

  it("every owner write left an audit row", async () => {
    await db.exec("RESET ROLE;");
    const actions = (await db.query<{ action: string }>(`SELECT action FROM public.admin_audit_log WHERE actor_user_id = $1`, [OWNER])).rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining([
      "pulse.save_item", "pulse.publish", "pulse.save_category", "pulse.save_campaign", "pulse.campaign_approve", "pulse.campaign_end",
      "pulse.kill_on", "pulse.kill_off",
    ]));
  });
});

describe("PULSE-2B staged migration: rollback", () => {
  it("removes everything it added and nothing else", async () => {
    await db.exec(ROLLBACK);
    const left = (await db.query<{ n: string }>(`
      SELECT c.relname AS n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
       WHERE s.nspname = 'public' AND c.relname LIKE 'pulse_%'
      UNION ALL
      SELECT p.proname FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
       WHERE s.nspname IN ('public', 'private') AND p.proname LIKE 'pulse_%'`)).rows;
    expect(left).toEqual([]);
    expect((await db.query(`SELECT 1 FROM public.admin_audit_log`)).rows.length).toBeGreaterThan(0);
    expect((await db.query(`SELECT public.is_owner_user($1::uuid) AS r`, [OWNER])).rows[0]).toEqual({ r: true });
  });
});
