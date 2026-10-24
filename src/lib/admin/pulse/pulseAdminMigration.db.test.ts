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
 *     can't write the tables directly; even the owner can't write directly;
 *   - the assurance policy (policy.ts) row by row: each action is attempted at
 *     "trusted" (owner at aal2 whose MFA is an hour old) and at "fresh"
 *     (MFA 30 s ago), and the database must demand exactly what policy.ts says;
 *   - partner records are stored and emitted in PULSE-2C's shape, behind the
 *     host allowlist and the migration-only release gates;
 *   - the public read applies every rule and leaks nothing.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

import type { OwnerActionLevel } from "@/lib/admin-auth/ownerAction";

import type { PulsePublicCatalogue } from "./contract";
import { hostAllowlistLevel, killLevel, partnerSaveLevel, partnerTransitionLevel } from "./policy";

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

/** Owner, MFA 30 s ago: passes 'fresh_aal2'. */
const FRESH: Who = { role: "authenticated", uid: OWNER, aal: "aal2", mfaSecondsAgo: 30 };
/** Owner at aal2 whose MFA is an hour old: passes 'trusted', fails 'fresh_aal2'. */
const TRUSTED: Who = { role: "authenticated", uid: OWNER, aal: "aal2", mfaSecondsAgo: 3600 };
const OWNER_AAL1: Who = { role: "authenticated", uid: OWNER, aal: "aal1" };
const PLAYER_AAL2: Who = { role: "authenticated", uid: PLAYER, aal: "aal2", mfaSecondsAgo: 30 };
const ANON: Who = { role: "anon" };

// Flat (tsconfig.app.json is strict:false, so `!r.ok` would not narrow a union).
type Outcome = { ok: boolean; rows?: Record<string, unknown>[]; code?: string; message?: string; detail?: string };

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
  return r.rows ?? [];
}

const one = async <T = Record<string, unknown>>(who: Who, sql: string, params: unknown[] = []) =>
  (await ok(who, sql, params))[0].r as T;

/** Superuser view, bypassing RLS (what the database actually holds). */
const peek = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
  await db.exec("RESET ROLE;");
  return (await db.query<T>(sql, params)).rows;
};

const publicCatalogue = (who: Who = ANON) => one<PulsePublicCatalogue>(who, `SELECT public.pulse_public_catalogue() AS r`);

const news = (headline: string, extra: Record<string, unknown> = {}) => ({
  id: null, label: headline || "Untitled", publishAt: null, expiresAt: null, priority: 10, featured: false, note: "secret internal note",
  payload: {
    id: "", kind: "news", category: "news", provenance: "live", title: headline, variant: "announcement", kicker: "Academy update",
    headline, summary: "s", body: ["b"], dateLabel: "Academy update", href: "/quiz", ctaLabel: "Read", ...extra,
  },
});
const saveItem = (who: Who, item: unknown, rev: number | null) =>
  run(who, `SELECT public.pulse_admin_save_item($1::jsonb, $2) AS r`, [JSON.stringify(item), rev]);

const iso = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

const sponsorRecord = (id: string, extra: Record<string, unknown> = {}) => ({
  id, sponsorName: "Example Co", campaignTitle: "Autumn", tagline: "Autumn at Example Co", ctaLabel: "Learn more",
  artwork: { url: "/placeholder.svg", alt: "Example Co autumn art" },
  destinationUrl: "https://example.com/autumn", approvedHosts: ["example.com"],
  disclosure: { label: "Sponsored", advertiser: "Example Co" },
  window: { startsAt: iso(-24), endsAt: iso(24 * 20) }, placement: { surfaces: ["academy-pulse"] }, ...extra,
});
const creatorRecord = (id: string, extra: Record<string, unknown> = {}) => ({
  id, creatorName: "Example Creator", creatorTag: "Creator",
  media: { platform: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Five Daily habits" }, ...extra,
});

type Partner = { record: { id: string; status: string }; revision: number; type: "sponsor" | "creator"; compensation: string | null };
const savePartner = (who: Who, type: string, record: unknown, compensation: string | null, rev: number | null) =>
  run(who, `SELECT public.pulse_admin_save_partner($1, $2::jsonb, $3, 'internal contract ref 42', $4) AS r`,
    [type, JSON.stringify(record), compensation, rev]);
const partnerAct = (who: Who, id: string, action: string, note: string, rev: number) =>
  run(who, `SELECT public.pulse_admin_transition_partner($1, $2, $3, $4) AS r`, [id, action, note, rev]);
const partnerNow = async (id: string): Promise<Partner> =>
  one<Partner>(FRESH, `SELECT (public.pulse_admin_snapshot()->'partners') @? '$[*]' AS x, (
      SELECT p FROM jsonb_array_elements(public.pulse_admin_snapshot()->'partners') p WHERE p#>>'{record,id}' = $1) AS r`, [id]);

/** Did the database demand a fresh MFA? (trusted attempt refused with step_up_required, nothing changed) */
const isStepUp = (r: Outcome) => !r.ok && r.message === "step_up_required";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(MIGRATION);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("who can do what", () => {
  it("anon: no table reads, no admin RPCs; the public read works and is empty", async () => {
    for (const t of ["pulse_content_items", "pulse_partner_records", "pulse_sponsor_host_allowlist", "pulse_category_settings", "pulse_schedule_settings"]) {
      const r = await run(ANON, `SELECT * FROM public.${t}`);
      expect(r.ok, t).toBe(false);
      expect(r.code, t).toBe("42501");
    }
    const rpc = await run(ANON, `SELECT public.pulse_admin_snapshot()`);
    expect(rpc.code).toBe("42501");
    const cat = await publicCatalogue();
    expect(cat.contractVersion).toBe("pulse-public/2");
    expect(cat.items).toEqual([]);
    expect(cat.partners).toEqual({ creators: [], sponsors: [] });
  });

  it("release gates are unreadable and unwritable from any client role", async () => {
    for (const who of [ANON, PLAYER_AAL2, FRESH]) {
      expect((await run(who, `SELECT * FROM private.pulse_release_gates`)).code).toBe("42501");
      expect((await run(who, `UPDATE private.pulse_release_gates SET sponsor_disclosure_rendered = true`)).code).toBe("42501");
    }
  });

  it("a player (even at aal2) is refused by assert_owner and sees no rows", async () => {
    expect((await saveItem(PLAYER_AAL2, news("Player headline"), null)).message).toBe("owner_required");
    expect((await savePartner(PLAYER_AAL2, "sponsor", sponsorRecord("p1"), null, null)).message).toBe("owner_required");
    expect((await run(PLAYER_AAL2, `SELECT public.pulse_admin_set_kill(true, 'managed', 'x')`)).message).toBe("owner_required");
    expect(await ok(PLAYER_AAL2, `SELECT * FROM public.pulse_schedule_settings`)).toEqual([]);
  });

  it("no one writes the tables directly — not players, not the owner", async () => {
    for (const who of [PLAYER_AAL2, FRESH]) {
      for (const sql of [
        `INSERT INTO public.pulse_content_items (label, kind, category, payload) VALUES ('x', 'news', 'news', '{}')`,
        `INSERT INTO public.pulse_partner_records (id, type, record) VALUES ('x', 'sponsor', '{"id":"x"}')`,
        `INSERT INTO public.pulse_sponsor_host_allowlist (host) VALUES ('evil.example')`,
        `UPDATE public.pulse_schedule_settings SET kill_active = false`,
        `DELETE FROM public.pulse_category_settings`,
      ]) expect((await run(who, sql)).code, sql).toBe("42501");
    }
  });

  it("an owner on an unattested aal1 session must step up for anything", async () => {
    expect((await run(OWNER_AAL1, `SELECT public.pulse_admin_snapshot()`)).message).toBe("step_up_required");
    expect((await run(OWNER_AAL1, `SELECT public.pulse_admin_set_kill(true, 'managed', 'x')`)).message).toBe("step_up_required");
  });
});

describe("editorial lifecycle (trusted)", () => {
  let newsId = "";
  let rev = 0;

  it("refuses unsafe payloads and partner kinds as editorial", async () => {
    const bad = await saveItem(TRUSTED, news("Bad", { href: "javascript:alert(1)" }), null);
    expect(bad.message).toBe("pulse_invalid");
    expect(JSON.parse(bad.detail!)).toContainEqual(expect.objectContaining({ field: "href" }));
    expect((await saveItem(TRUSTED, news("Bad", { href: "//evil.example" }), null)).ok).toBe(false);
    const sponsorAsItem = { ...news("x"), payload: { ...news("x").payload, kind: "sponsor", category: "sponsor" } };
    expect((await saveItem(TRUSTED, sponsorAsItem, null)).message).toBe("pulse_invalid");
  });

  it("draft → not public; publish at TRUSTED (no paid promotion) → public, without internal fields", async () => {
    const created = await one<{ id: string; revision: number; state: string }>(
      TRUSTED, `SELECT public.pulse_admin_save_item($1::jsonb, NULL) AS r`, [JSON.stringify(news("Halloween quiz week"))]);
    expect(created.state).toBe("draft");
    newsId = created.id;
    expect((await publicCatalogue()).items).toEqual([]);
    const pub = await one<{ revision: number; state: string }>(TRUSTED,
      `SELECT public.pulse_admin_transition_item($1::uuid, 'publish', NULL, $2) AS r`, [newsId, created.revision]);
    expect(pub.state).toBe("published");
    rev = pub.revision;
    const cat = await publicCatalogue();
    expect(cat.items).toHaveLength(1);
    expect(cat.items[0]).toMatchObject({ id: newsId, provenance: "live", headline: "Halloween quiz week" });
    expect(JSON.stringify(cat)).not.toMatch(/secret internal note|"label"/);
  });

  it("an event publishes at TRUSTED too", async () => {
    const ev = news("Showcase night", { variant: "event", startsAt: iso(48) });
    const created = await one<{ id: string; revision: number }>(TRUSTED, `SELECT public.pulse_admin_save_item($1::jsonb, NULL) AS r`,
      [JSON.stringify({ ...ev, payload: { ...ev.payload, category: "event" } })]);
    const pub = await run(TRUSTED, `SELECT public.pulse_admin_transition_item($1::uuid, 'publish', NULL, $2)`, [created.id, created.revision]);
    expect(pub.ok).toBe(true);
  });

  it("stale revisions are conflicts; live content can't be archived or broken by an edit", async () => {
    expect((await run(TRUSTED, `SELECT public.pulse_admin_transition_item($1::uuid, 'unpublish', NULL, $2)`, [newsId, rev - 1])).message).toBe("pulse_conflict");
    expect((await run(TRUSTED, `SELECT public.pulse_admin_transition_item($1::uuid, 'archive', NULL, $2)`, [newsId, rev])).message).toBe("pulse_invalid");
    expect((await saveItem(TRUSTED, { ...news(""), id: newsId, label: "x" }, rev)).message).toBe("pulse_invalid");
  });

  it("category disable / frequency apply to items and the cadence; cadence bounds are enforced", async () => {
    const r = await one<number>(FRESH, `SELECT revision AS r FROM public.pulse_category_settings WHERE category = 'news'`);
    await ok(TRUSTED, `SELECT public.pulse_admin_save_category('news', false, NULL, NULL, $1)`, [r]);
    let cat = await publicCatalogue();
    expect(cat.items.some((i) => i.category === "news")).toBe(false);
    expect(cat.cadence.slots).not.toContain("news");
    await ok(TRUSTED, `SELECT public.pulse_admin_save_category('news', true, NULL, NULL, $1)`, [r + 1]);
    await ok(TRUSTED, `SELECT public.pulse_admin_save_category('mini-game', true, 0, NULL, 1)`);
    cat = await publicCatalogue();
    expect(cat.cadence.slots).not.toContain("mini-game");
    expect(cat.cadence.slots).toContain("news");
    expect((await run(TRUSTED, `SELECT public.pulse_admin_save_schedule(ARRAY['news'], 9, 3, 1)`)).message).toBe("pulse_invalid");
  });
});

describe("partner records: PULSE-2C contract", () => {
  it("only 2C's owner-editable keys are accepted: no status, approval, LIVE, viewers or challenge scores", async () => {
    const forged = [
      ["sponsor", sponsorRecord("forge-1", { status: "approved" })],
      ["sponsor", sponsorRecord("forge-2", { approval: { approvedBy: "x", approvedAt: iso(-1) } })],
      ["creator", creatorRecord("forge-3", { media: { platform: "twitch", channelUrl: "https://www.twitch.tv/realchan", title: "t", live: true } })],
      ["creator", creatorRecord("forge-4", { media: { platform: "twitch", channelUrl: "https://www.twitch.tv/realchan", title: "t", viewerCount: 9000 } })],
      ["creator", creatorRecord("forge-5", { challenge: { title: "t", detail: "d", ref: { source: "daily-challenge", key: "k" }, score: { source: "daily-challenge", attemptId: "a", value: 9, verifiedAt: iso(-1) } } })],
    ] as const;
    for (const [type, rec] of forged) {
      const r = await savePartner(TRUSTED, type, rec, type === "creator" ? "unpaid" : null, null);
      expect(r.message, JSON.stringify(rec)).toBe("pulse_invalid");
    }
  });

  it("refuses unsafe destinations and artwork at save time", async () => {
    for (const rec of [
      sponsorRecord("bad-1", { destinationUrl: "http://example.com/x" }),
      sponsorRecord("bad-2", { destinationUrl: "https://evil.example/x" }),
      sponsorRecord("bad-3", { destinationUrl: "https://user:pw@example.com/x" }),
      sponsorRecord("bad-4", { destinationUrl: "https://example.com:8443/x" }),
      sponsorRecord("bad-5", { artwork: { url: "https://evil.example/a.png", alt: "a" } }),
      sponsorRecord("bad-6", { disclosure: { label: "Ad", advertiser: "Example Co" } }),
    ]) expect((await savePartner(TRUSTED, "sponsor", rec, null, null)).message, rec.id).toBe("pulse_invalid");
  });
});

describe("assurance policy, row by row (database vs policy.ts)", () => {
  /** Attempt at TRUSTED; if the DB demands fresh, retry at FRESH. Returns the level the DB required. */
  async function required(sql: string, params: unknown[]): Promise<{ level: OwnerActionLevel; result: Outcome }> {
    const trusted = await run(TRUSTED, sql, params);
    if (!isStepUp(trusted)) return { level: "trusted", result: trusted };
    return { level: "fresh", result: await run(FRESH, sql, params) };
  }
  const expectOk = (r: Outcome) => expect(r.ok, `${r.code} ${r.message} ${r.detail ?? ""}`).toBe(true);

  it("emergency disable: trusted; restore: FRESH; narrowing managed → partners: FRESH; widening: trusted", async () => {
    const kill = (active: boolean, scope: string, reason: string) => required(`SELECT public.pulse_admin_set_kill($1, $2, $3)`, [active, scope, reason]);
    const cases: { cur: { active: boolean; scope: "partners" | "managed" }; next: { active: boolean; scope: "partners" | "managed"; reason: string } }[] = [
      { cur: { active: false, scope: "partners" }, next: { active: true, scope: "partners", reason: "brand safety" } },
      { cur: { active: true, scope: "partners" }, next: { active: true, scope: "managed", reason: "wider incident" } },
      { cur: { active: true, scope: "managed" }, next: { active: true, scope: "partners", reason: "narrowing" } },
      { cur: { active: true, scope: "partners" }, next: { active: false, scope: "partners", reason: "resolved" } },
    ];
    for (const c of cases) {
      const { level, result } = await kill(c.next.active, c.next.scope, c.next.reason);
      expectOk(result);
      expect(level, JSON.stringify(c)).toBe(killLevel(c.cur, c.next));
    }
    expect(cases.map((c) => killLevel(c.cur, c.next))).toEqual(["trusted", "trusted", "fresh", "fresh"]);
  });

  it("sponsor host allowlist: add FRESH, remove trusted; approval needs an allowlisted host", async () => {
    let p = await one<Partner>(TRUSTED, `SELECT public.pulse_admin_save_partner('sponsor', $1::jsonb, NULL, '', NULL) AS r`, [JSON.stringify(sponsorRecord("autumn"))]);
    p = await one<Partner>(TRUSTED, `SELECT public.pulse_admin_transition_partner('autumn', 'submit', '', $1) AS r`, [p.revision])
      .catch(() => p);
    // submit is refused while example.com is not allowlisted
    expect(p.record.status).toBe("draft");
    const submit = await partnerAct(FRESH, "autumn", "submit", "", p.revision);
    expect(submit.message).toBe("pulse_invalid");
    expect(submit.detail).toMatch(/not on the sponsor host allowlist/);

    const add = await required(`SELECT public.pulse_admin_set_sponsor_host('example.com', 'add') AS r`, []);
    expectOk(add.result);
    expect(add.level).toBe(hostAllowlistLevel("add"));
    expect(add.level).toBe("fresh");
    const remove = await required(`SELECT public.pulse_admin_set_sponsor_host('other.example', 'remove') AS r`, []);
    expect(remove.level).toBe(hostAllowlistLevel("remove"));
    expect((await run(FRESH, `SELECT public.pulse_admin_set_sponsor_host('10.0.0.1', 'add')`)).message).toBe("pulse_invalid");
  });

  it("sponsor: submit trusted, approve FRESH, pause trusted, resume FRESH, end trusted", async () => {
    let p = await partnerNow("autumn");
    for (const action of ["submit", "approve", "pause", "resume", "end"] as const) {
      const note = action === "pause" || action === "end" ? "flight change" : "";
      const { level, result } = await required(`SELECT public.pulse_admin_transition_partner('autumn', $1, $2, $3) AS r`, [action, note, p.revision]);
      expectOk(result);
      expect(level, action).toBe(partnerTransitionLevel(p, action));
      p = result.rows![0].r as Partner;
    }
    expect(p.record.status).toBe("ended");
  });

  it("editing an approved sponsor is FRESH and sends it back to review; editing a draft is trusted", async () => {
    let p = await one<Partner>(TRUSTED, `SELECT public.pulse_admin_save_partner('sponsor', $1::jsonb, NULL, '', NULL) AS r`, [JSON.stringify(sponsorRecord("winter"))]);
    const draftEdit = await required(`SELECT public.pulse_admin_save_partner('sponsor', $1::jsonb, NULL, '', $2) AS r`,
      [JSON.stringify(sponsorRecord("winter", { tagline: "Winter at Example Co" })), p.revision]);
    expect(draftEdit.level).toBe(partnerSaveLevel(p as never, { type: "sponsor", compensation: null }));
    expect(draftEdit.level).toBe("trusted");
    p = draftEdit.result.rows![0].r as Partner;
    p = await one<Partner>(TRUSTED, `SELECT public.pulse_admin_transition_partner('winter', 'submit', '', $1) AS r`, [p.revision]);
    p = await one<Partner>(FRESH, `SELECT public.pulse_admin_transition_partner('winter', 'approve', '', $1) AS r`, [p.revision]);
    expect(p.record.status).toBe("approved");

    const edit = await required(`SELECT public.pulse_admin_save_partner('sponsor', $1::jsonb, NULL, '', $2) AS r`,
      [JSON.stringify(sponsorRecord("winter", { destinationUrl: "https://example.com/other" })), p.revision]);
    expectOk(edit.result);
    expect(edit.level).toBe(partnerSaveLevel(p as never, { type: "sponsor", compensation: null }));
    expect(edit.level).toBe("fresh");
    expect((edit.result.rows![0].r as Partner).record.status).toBe("pending-review");
  });

  it("creators: unpaid approve trusted; paid / affiliate approve FRESH; editing approved paid FRESH, approved unpaid trusted", async () => {
    for (const comp of ["unpaid", "paid", "affiliate"] as const) {
      const id = `creator-${comp}`;
      let p = await one<Partner>(TRUSTED, `SELECT public.pulse_admin_save_partner('creator', $1::jsonb, $2, '', NULL) AS r`, [JSON.stringify(creatorRecord(id)), comp]);
      p = await one<Partner>(TRUSTED, `SELECT public.pulse_admin_transition_partner($1, 'submit', '', $2) AS r`, [id, p.revision]);
      const approve = await required(`SELECT public.pulse_admin_transition_partner($1, 'approve', '', $2) AS r`, [id, p.revision]);
      expectOk(approve.result);
      expect(approve.level, comp).toBe(partnerTransitionLevel(p, "approve"));
      expect(approve.level, comp).toBe(comp === "unpaid" ? "trusted" : "fresh");
      p = approve.result.rows![0].r as Partner;
      if (comp === "affiliate") continue; // stays approved for the public-read checks below
      const edit = await required(`SELECT public.pulse_admin_save_partner('creator', $1::jsonb, $2, '', $3) AS r`,
        [JSON.stringify(creatorRecord(id, { creatorTag: "Partner" })), comp, p.revision]);
      expectOk(edit.result);
      expect(edit.level, comp).toBe(partnerSaveLevel(p as never, { type: "creator", compensation: comp }));
      // re-approve so the public-read checks below have an approved unpaid + paid creator
      const back = edit.result.rows![0].r as Partner;
      await ok(FRESH, `SELECT public.pulse_admin_transition_partner($1, 'approve', '', $2)`, [id, back.revision]);
    }
    // Switching an approved unpaid creator to paid is approval-sensitive too.
    const p = await partnerNow("creator-unpaid");
    const toPaid = await required(`SELECT public.pulse_admin_save_partner('creator', $1::jsonb, 'paid', '', $2) AS r`,
      [JSON.stringify(creatorRecord("creator-unpaid")), p.revision]);
    expect(toPaid.level).toBe("fresh");
    expect(toPaid.level).toBe(partnerSaveLevel(p as never, { type: "creator", compensation: "paid" }));
    const restored = toPaid.result.rows![0].r as Partner;
    const unpaid = await one<Partner>(TRUSTED, `SELECT public.pulse_admin_save_partner('creator', $1::jsonb, 'unpaid', '', $2) AS r`,
      [JSON.stringify(creatorRecord("creator-unpaid")), restored.revision]);
    await ok(TRUSTED, `SELECT public.pulse_admin_transition_partner('creator-unpaid', 'approve', '', $1)`, [unpaid.revision]);
  });

  it("a cancelled/refused fresh attempt changed nothing", async () => {
    const before = await peek(`SELECT status, revision FROM public.pulse_partner_records WHERE id = 'winter'`);
    const r = await partnerAct(TRUSTED, "winter", "approve", "", (before[0] as { revision: number }).revision);
    expect(isStepUp(r)).toBe(true);
    expect(await peek(`SELECT status, revision FROM public.pulse_partner_records WHERE id = 'winter'`)).toEqual(before);
  });
});

describe("public read: release gates, windows, emergency disable", () => {
  it("approved sponsors and paid creators stay in the database while their release gate is closed", async () => {
    await ok(FRESH, `SELECT public.pulse_admin_set_kill(false, 'partners', 'clear')`);
    const winter = await partnerNow("winter");
    await ok(FRESH, `SELECT public.pulse_admin_transition_partner('winter', 'approve', '', $1)`, [winter.revision]);
    const cat = await publicCatalogue();
    expect(cat.partners.sponsors).toEqual([]);
    expect(cat.partners.creators.map((c) => c.id)).toEqual(["creator-unpaid"]);
  });

  it("opening the gates (a reviewed migration, simulated as superuser) emits records in PULSE-2C's exact shape", async () => {
    await peek(`UPDATE private.pulse_release_gates SET sponsor_disclosure_rendered = true, paid_creator_disclosure_rendered = true`);
    const cat = await publicCatalogue();
    expect(cat.partners.sponsors.map((s) => s.id)).toEqual(["winter"]);
    expect(cat.partners.creators.map((c) => c.id).sort()).toEqual(["creator-affiliate", "creator-paid", "creator-unpaid"]);

    const s = cat.partners.sponsors[0];
    expect(Object.keys(s).sort()).toEqual([
      "approval", "approvedHosts", "artwork", "campaignTitle", "ctaLabel", "destinationUrl", "disclosure", "id", "placement",
      "provenance", "sponsorName", "status", "tagline", "window"]);
    expect(s.status).toBe("approved");
    expect(s.approval?.approvedBy).toBe("owner");
    expect(s.approval?.approvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(s.provenance).toMatchObject({ source: "owner-entry", recordedBy: "owner" });
    const c = cat.partners.creators[0];
    expect(Object.keys(c).sort()).toEqual(["approval", "creatorName", "creatorTag", "id", "media", "provenance", "status"]);
    // nothing admin-side or identifying leaks
    expect(JSON.stringify(cat)).not.toMatch(new RegExp(`${OWNER}|internal contract ref|compensation|decisionNote|revision`));
  });

  it("a sponsor outside its flight is not emitted", async () => {
    const all = await peek<{ id: string }>(`SELECT id FROM public.pulse_partner_records WHERE type = 'sponsor' AND status = 'approved'`);
    expect(all.map((r) => r.id)).toEqual(["winter"]);
    await peek(`UPDATE public.pulse_partner_records SET record = jsonb_set(record, '{window,startsAt}', to_jsonb($1::text)) WHERE id = 'winter'`, [iso(5)]);
    expect((await publicCatalogue()).partners.sponsors).toEqual([]);
    await peek(`UPDATE public.pulse_partner_records SET record = jsonb_set(record, '{window,startsAt}', to_jsonb($1::text)) WHERE id = 'winter'`, [iso(-5)]);
    expect((await publicCatalogue()).partners.sponsors).toHaveLength(1);
  });

  it("a host removed from the allowlist takes its sponsor off at once", async () => {
    await ok(TRUSTED, `SELECT public.pulse_admin_set_sponsor_host('example.com', 'remove')`);
    expect((await publicCatalogue()).partners.sponsors).toEqual([]);
    await ok(FRESH, `SELECT public.pulse_admin_set_sponsor_host('example.com', 'add')`);
    expect((await publicCatalogue()).partners.sponsors).toHaveLength(1);
  });

  it("emergency disable: partners → no partner records, editorial stays; managed → empty + fallback", async () => {
    await ok(TRUSTED, `SELECT public.pulse_admin_set_kill(true, 'partners', 'Brand-safety review')`);
    let cat = await publicCatalogue();
    expect(cat.partners).toEqual({ creators: [], sponsors: [] });
    expect(cat.items.length).toBeGreaterThan(0);
    expect(cat.fallbackToStatic).toBe(false);
    await ok(TRUSTED, `SELECT public.pulse_admin_set_kill(true, 'managed', 'Wrong patch number')`);
    cat = await publicCatalogue();
    expect(cat.items).toEqual([]);
    expect(cat.fallbackToStatic).toBe(true);
    expect((await run(TRUSTED, `SELECT public.pulse_admin_set_kill(false, 'managed', 'resolved')`)).message).toBe("step_up_required");
    expect((await publicCatalogue()).fallbackToStatic).toBe(true);
    await ok(FRESH, `SELECT public.pulse_admin_set_kill(false, 'managed', 'resolved')`);
    expect((await publicCatalogue()).fallbackToStatic).toBe(false);
  });

  it("every owner write left an audit row, restores and host changes included", async () => {
    const actions = (await peek<{ action: string }>(`SELECT action FROM public.admin_audit_log WHERE actor_user_id = $1`, [OWNER])).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining([
      "pulse.save_item", "pulse.publish", "pulse.save_category", "pulse.partner_create", "pulse.partner_save", "pulse.partner_submit",
      "pulse.partner_approve", "pulse.partner_pause", "pulse.partner_resume", "pulse.partner_end", "pulse.sponsor_host_add",
      "pulse.sponsor_host_remove", "pulse.kill_on", "pulse.kill_restore",
    ]));
    // A refused fresh attempt is not an audited action.
    const audited = (await peek<{ n: string }>(`SELECT count(*)::text AS n FROM public.admin_audit_log WHERE action = 'pulse.kill_restore'`))[0].n;
    expect(Number(audited)).toBe(3);
  });
});

describe("rollback", () => {
  it("removes everything it added and nothing else", async () => {
    await db.exec(ROLLBACK);
    const left = await peek<{ n: string }>(`
      SELECT c.relname AS n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
       WHERE s.nspname IN ('public', 'private') AND c.relname LIKE 'pulse_%'
      UNION ALL
      SELECT p.proname FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
       WHERE s.nspname IN ('public', 'private') AND p.proname LIKE 'pulse_%'`);
    expect(left).toEqual([]);
    expect((await peek(`SELECT 1 FROM public.admin_audit_log`)).length).toBeGreaterThan(0);
    expect((await peek(`SELECT public.is_owner_user($1::uuid) AS r`, [OWNER]))[0]).toEqual({ r: true });
  });
});
