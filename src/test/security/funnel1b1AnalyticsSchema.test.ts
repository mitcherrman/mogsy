// @vitest-environment node
//
// PGlite loads its wasm build through fetch/Response; jsdom's shims break that,
// so this suite runs on the node environment. It touches no DOM.
/**
 * FUNNEL1B1 — the analytics schema, proved rather than grepped.
 *
 * This suite RUNS 20260920120000_funnel1b1_analytics_foundation.sql verbatim on
 * a real Postgres (PGlite — the same engine compiled to wasm) and then tries to
 * break it, as anon, as authenticated, and as the service role. It asserts the
 * three things a text-level check cannot:
 *
 *   1. the idempotency index actually rejects a duplicate authoritative event,
 *      and actually permits a repeated web event;
 *   2. the RLS WITH CHECK actually stops a browser claiming to be Railway, or
 *      claiming another account's uid;
 *   3. first-touch attribution is immutable as a DATABASE fact, not as a
 *      promise the frontend makes.
 *
 * The fixture provides only what the migration reads and PGlite has no
 * Supabase to supply: the anon/authenticated roles, Supabase's default table
 * grants, the app_role enum, and stand-ins for auth.uid(), has_role() and
 * is_master_admin(). Everything else is the migration's own DDL.
 *
 * The one thing PGlite is not is Supabase's connection pooler, so "service
 * role bypasses RLS" is modelled as the superuser session the migration runs
 * in — which is the same privilege shape, and is what the Lovable SQL Editor
 * applies the migration as.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260920120000_funnel1b1_analytics_foundation.sql",
);
const TOMBSTONE = join(
  process.cwd(),
  "supabase/migrations/20260710130000_funnel_events.sql",
);

const VISITOR = "11111111-1111-4111-8111-111111111111";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION = "55555555-5555-4555-8555-555555555555";

/** Only what the migration reads and PGlite cannot provide. */
const FIXTURE = `
  CREATE ROLE anon;
  CREATE ROLE authenticated;

  -- Supabase grants anon/authenticated the table privilege bits by default
  -- privilege, at CREATE TABLE time. Without this the migration's REVOKEs and
  -- its INSERT policies would both be testing nothing.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;

  CREATE SCHEMA auth;
  CREATE TYPE public.app_role AS ENUM ('master_admin', 'admin', 'moderator');

  CREATE TABLE public._ctx (uid uuid, is_admin boolean, is_master boolean);
  INSERT INTO public._ctx VALUES (NULL, false, false);
  GRANT SELECT ON public._ctx TO anon, authenticated;

  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT uid FROM public._ctx LIMIT 1 $$;
  CREATE FUNCTION public.has_role(_uid uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ SELECT COALESCE((SELECT is_admin FROM public._ctx LIMIT 1), false) $$;
  CREATE FUNCTION public.is_master_admin(_uid uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ SELECT COALESCE((SELECT is_master FROM public._ctx LIMIT 1), false) $$;
`;

let db: PGlite;

/** Impersonate a Supabase role with a given auth context. */
async function as(
  role: "anon" | "authenticated" | "service",
  ctx: { uid?: string | null; admin?: boolean; master?: boolean },
  work: () => Promise<void>,
) {
  await db.exec(
    `UPDATE public._ctx SET uid = ${ctx.uid ? `'${ctx.uid}'::uuid` : "NULL"},
       is_admin = ${ctx.admin ? "true" : "false"},
       is_master = ${ctx.master ? "true" : "false"};`,
  );
  if (role !== "service") await db.exec(`SET ROLE ${role};`);
  try {
    await work();
  } finally {
    await db.exec("RESET ROLE;");
  }
}

async function expectRejected(fn: () => Promise<unknown>, matching: RegExp) {
  let message = "";
  try {
    await fn();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  expect(message, "expected the database to reject this").not.toBe("");
  expect(message).toMatch(matching);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(FIXTURE);
  // The migration, verbatim. If it does not apply cleanly, nothing below runs.
  await db.exec(readFileSync(MIGRATION, "utf8"));
}, 120_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`
    DELETE FROM public.analytics_events;
    DELETE FROM public.analytics_sessions;
    DELETE FROM public.analytics_visitors;
  `);
});

// ---------------------------------------------------------------------------

describe("the migration applies", () => {
  it("creates exactly the three intended tables and no funnel_events", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name LIKE '%event%' OR
             (table_schema = 'public' AND table_name LIKE 'analytics%')
       ORDER BY table_name`,
    );
    const names = rows.map((r) => r.table_name);

    expect(names).toEqual([
      "analytics_events",
      "analytics_sessions",
      "analytics_visitors",
    ]);
    expect(names).not.toContain("funnel_events");
  });

  it("leaves the superseded funnel_events migration inert", async () => {
    const sql = readFileSync(TOMBSTONE, "utf8");

    // Every non-blank line is a comment: replaying it can create nothing.
    const executable = sql
      .split("\n")
      .filter((line) => line.trim() && !line.trim().startsWith("--"));
    expect(executable).toEqual([]);

    // And prove it, by running it against the live schema.
    await db.exec(sql);
    const { rows } = await db.query(
      `SELECT to_regclass('public.funnel_events') AS t`,
    );
    expect((rows[0] as { t: string | null }).t).toBeNull();
  });

  it("enables RLS on all three tables", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class
       WHERE relname LIKE 'analytics_%' AND relkind = 'r' ORDER BY relname`,
    );
    expect(rows).toEqual([
      { relname: "analytics_events", relrowsecurity: true },
      { relname: "analytics_sessions", relrowsecurity: true },
      { relname: "analytics_visitors", relrowsecurity: true },
    ]);
  });
});

// ---------------------------------------------------------------------------

describe("idempotency for authoritative events", () => {
  const railway = (entityId: string, eventName = "ranked_completed") =>
    db.query(
      `INSERT INTO public.analytics_events
         (event_name, source_system, source_entity_type, source_entity_id, user_id)
       VALUES ($1, 'railway', 'ranked_match', $2, $3)`,
      [eventName, entityId, USER_A],
    );

  it("rejects a retried Railway completion for the same match", async () => {
    await railway("match-42");
    await expectRejected(() => railway("match-42"), /duplicate key|unique/i);

    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.analytics_events`,
    );
    expect(rows[0].n).toBe(1);
  });

  it("permits different matches, and different events for the same match", async () => {
    await railway("match-42");
    await railway("match-43");
    await railway("match-42", "ranked_started");

    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.analytics_events`,
    );
    expect(rows[0].n).toBe(3);
  });

  it("permits one row per participant when the entity is the participant", async () => {
    for (const participant of ["p1", "p2", "p3", "p4", "p5"]) {
      await db.query(
        `INSERT INTO public.analytics_events
           (event_name, source_system, source_entity_type, source_entity_id)
         VALUES ('ranked_started', 'railway', 'ranked_participant', $1)`,
        [participant],
      );
    }
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.analytics_events`,
    );
    expect(rows[0].n).toBe(5);
  });

  it("does NOT constrain web events — a visitor may repeat one freely", async () => {
    for (let i = 0; i < 9; i += 1) {
      await db.query(
        `INSERT INTO public.analytics_events (event_name, source_system, visitor_id)
         VALUES ('leaguecraft_opened', 'web', $1)`,
        [VISITOR],
      );
    }
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.analytics_events`,
    );
    expect(rows[0].n).toBe(9);
  });

  it("does not constrain an authoritative event that declares no entity", async () => {
    for (let i = 0; i < 3; i += 1) {
      await db.query(
        `INSERT INTO public.analytics_events (event_name, source_system)
         VALUES ('mastery_completed', 'railway')`,
      );
    }
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.analytics_events`,
    );
    expect(rows[0].n).toBe(3);
  });
});

// ---------------------------------------------------------------------------

describe("RLS — what a browser may write", () => {
  it("lets anon insert a web event before any auth session exists", async () => {
    await as("anon", { uid: null }, async () => {
      await db.query(
        `INSERT INTO public.analytics_events (event_name, visitor_id, session_id, user_id)
         VALUES ('landing_viewed', $1, $2, NULL)`,
        [VISITOR, SESSION],
      );
    });
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.analytics_events`,
    );
    expect(rows[0].n).toBe(1);
  });

  it("stops a browser claiming to be Railway", async () => {
    await as("authenticated", { uid: USER_A }, async () => {
      await expectRejected(
        () =>
          db.query(
            `INSERT INTO public.analytics_events (event_name, source_system, user_id)
             VALUES ('ranked_completed', 'railway', $1)`,
            [USER_A],
          ),
        /row-level security/i,
      );
    });
  });

  it("stops a browser writing the idempotency fields", async () => {
    await as("authenticated", { uid: USER_A }, async () => {
      await expectRejected(
        () =>
          db.query(
            `INSERT INTO public.analytics_events
               (event_name, source_system, source_entity_type, source_entity_id, user_id)
             VALUES ('ranked_completed', 'web', 'ranked_match', 'match-42', $1)`,
            [USER_A],
          ),
        /row-level security/i,
      );
    });
  });

  it("stops a browser attributing an event to another account", async () => {
    await as("authenticated", { uid: USER_A }, async () => {
      await expectRejected(
        () =>
          db.query(
            `INSERT INTO public.analytics_events (event_name, user_id)
             VALUES ('signup_completed', $1)`,
            [USER_B],
          ),
        /row-level security/i,
      );
    });
  });

  it("allows an authenticated user to attribute an event to itself", async () => {
    await as("authenticated", { uid: USER_A }, async () => {
      await db.query(
        `INSERT INTO public.analytics_events (event_name, user_id, is_guest)
         VALUES ('signup_completed', $1, false)`,
        [USER_A],
      );
    });
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.analytics_events`,
    );
    expect(rows[0].n).toBe(1);
  });
});

describe("RLS — what a browser may read and change", () => {
  beforeEach(async () => {
    await db.query(
      `INSERT INTO public.analytics_events (event_name, visitor_id, user_id)
       VALUES ('hub_entered', $1, $2)`,
      [VISITOR, USER_A],
    );
    await db.query(
      `INSERT INTO public.analytics_visitors (visitor_id, first_utm_source)
       VALUES ($1, 'tiktok')`,
      [VISITOR],
    );
  });

  it("returns nothing to anon", async () => {
    await as("anon", { uid: null }, async () => {
      const { rows } = await db.query(`SELECT * FROM public.analytics_events`);
      expect(rows).toEqual([]);
    });
  });

  it("returns nothing to a normal user — not even their own rows", async () => {
    await as("authenticated", { uid: USER_A }, async () => {
      const { rows } = await db.query(`SELECT * FROM public.analytics_events`);
      expect(rows).toEqual([]);
    });
  });

  it("returns rows to an admin", async () => {
    await as("authenticated", { uid: USER_A, admin: true }, async () => {
      const { rows } = await db.query(`SELECT * FROM public.analytics_events`);
      expect(rows).toHaveLength(1);
    });
  });

  it("returns rows to a master_admin", async () => {
    await as("authenticated", { uid: USER_A, master: true }, async () => {
      const { rows } = await db.query(`SELECT * FROM public.analytics_visitors`);
      expect(rows).toHaveLength(1);
    });
  });

  it("is append-only — even an admin cannot update or delete", async () => {
    await as("authenticated", { uid: USER_A, admin: true }, async () => {
      await expectRejected(
        () => db.query(`UPDATE public.analytics_events SET event_name = 'x'`),
        /permission denied|row-level security/i,
      );
      await expectRejected(
        () => db.query(`DELETE FROM public.analytics_events`),
        /permission denied|row-level security/i,
      );
    });
  });
});

describe("first-touch immutability is a database fact", () => {
  it("cannot be revised by the client that wrote it", async () => {
    await as("anon", { uid: null }, async () => {
      await db.query(
        `INSERT INTO public.analytics_visitors (visitor_id, first_utm_source, first_utm_campaign)
         VALUES ($1, 'tiktok', 'launch')`,
        [VISITOR],
      );

      await expectRejected(
        () =>
          db.query(
            `UPDATE public.analytics_visitors SET first_utm_source = 'youtube'`,
          ),
        /permission denied|row-level security/i,
      );
      await expectRejected(
        () => db.query(`DELETE FROM public.analytics_visitors`),
        /permission denied|row-level security/i,
      );
    });

    const { rows } = await db.query<{ first_utm_source: string }>(
      `SELECT first_utm_source FROM public.analytics_visitors`,
    );
    expect(rows[0].first_utm_source).toBe("tiktok");
  });

  it("reports a re-write as a plain unique violation, which the client treats as success", async () => {
    let code = "";
    await as("anon", { uid: null }, async () => {
      await db.query(
        `INSERT INTO public.analytics_visitors (visitor_id, first_utm_source)
         VALUES ($1, 'tiktok')`,
        [VISITOR],
      );
      try {
        await db.query(
          `INSERT INTO public.analytics_visitors (visitor_id, first_utm_source)
           VALUES ($1, 'youtube')`,
          [VISITOR],
        );
      } catch (error) {
        code = (error as { code?: string }).code ?? "";
      }
    });

    // 23505 is the code track.ts's insertOnce() swallows. If this ever becomes
    // something else, first touch starts logging phantom failures.
    expect(code).toBe("23505");

    const { rows } = await db.query<{ first_utm_source: string }>(
      `SELECT first_utm_source FROM public.analytics_visitors`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].first_utm_source).toBe("tiktok");
  });

  /**
   * The trap documented in the migration's RLS section. Both halves are
   * asserted because the failing half is the one that looks like a policy bug,
   * and the passing half is the reason it is not.
   */
  it("rejects a TARGETED ON CONFLICT because the arbiter read needs a SELECT policy", async () => {
    await as("anon", { uid: null }, async () => {
      await expectRejected(
        () =>
          db.query(
            `INSERT INTO public.analytics_visitors (visitor_id)
             VALUES ($1) ON CONFLICT (visitor_id) DO NOTHING`,
            [VISITOR],
          ),
        /row-level security/i,
      );
    });
    // Nothing conflicted. The table is empty; the target alone was the problem.
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.analytics_visitors`,
    );
    expect(rows[0].n).toBe(0);
  });

  it("accepts a TARGETLESS ON CONFLICT DO NOTHING", async () => {
    await as("anon", { uid: null }, async () => {
      await db.query(
        `INSERT INTO public.analytics_visitors (visitor_id, first_utm_source)
         VALUES ($1, 'tiktok') ON CONFLICT DO NOTHING`,
        [VISITOR],
      );
      await db.query(
        `INSERT INTO public.analytics_visitors (visitor_id, first_utm_source)
         VALUES ($1, 'youtube') ON CONFLICT DO NOTHING`,
        [VISITOR],
      );
    });

    const { rows } = await db.query<{ first_utm_source: string }>(
      `SELECT first_utm_source FROM public.analytics_visitors`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].first_utm_source).toBe("tiktok");
  });
});

// ---------------------------------------------------------------------------

describe("column constraints", () => {
  it("rejects an event name the contract would not produce", async () => {
    for (const bad of ["Ranked Opened", "a", "UPPER_CASE", "has-dash", "1leading"]) {
      await expectRejected(
        () =>
          db.query(`INSERT INTO public.analytics_events (event_name) VALUES ($1)`, [
            bad,
          ]),
        /event_name_shape/,
      );
    }
  });

  it("rejects an unknown source system", async () => {
    await expectRejected(
      () =>
        db.query(
          `INSERT INTO public.analytics_events (event_name, source_system)
           VALUES ('hub_entered', 'sqlite')`,
        ),
      /source_system_known/,
    );
  });

  it("caps metadata so the public write path cannot fill the table", async () => {
    await expectRejected(
      () =>
        db.query(
          `INSERT INTO public.analytics_events (event_name, metadata)
           VALUES ('hub_entered', jsonb_build_object('blob', repeat('x', 9000)))`,
        ),
      /metadata_size/,
    );
    // …while an ordinary payload is fine.
    await db.query(
      `INSERT INTO public.analytics_events (event_name, metadata)
       VALUES ('hub_entered', '{"entry":"hub_tile","slot":3}'::jsonb)`,
    );
  });

  it("accepts any verification_type, including one that does not exist yet", async () => {
    for (const t of ["email", "discord", "league_ign", "steam", "phone"]) {
      await db.query(
        `INSERT INTO public.analytics_events (event_name, verification_type)
         VALUES ('verification_completed', $1)`,
        [t],
      );
    }
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(DISTINCT verification_type)::int AS n FROM public.analytics_events`,
    );
    expect(rows[0].n).toBe(5);
  });

  it("stamps received_at from the database clock, not the caller", async () => {
    await db.query(
      `INSERT INTO public.analytics_events (event_name, occurred_at)
       VALUES ('hub_entered', '2001-01-01T00:00:00Z')`,
    );
    const { rows } = await db.query<{ drift: number }>(
      `SELECT EXTRACT(EPOCH FROM (received_at - occurred_at))::int AS drift
       FROM public.analytics_events`,
    );
    // A lying client clock is visible rather than authoritative.
    expect(rows[0].drift).toBeGreaterThan(60 * 60 * 24 * 365);
  });
});

// ---------------------------------------------------------------------------

describe("the indexes the reporting queries need", () => {
  it("exist, and there are no more than the ones designed", async () => {
    const { rows } = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename LIKE 'analytics_%'
       ORDER BY indexname`,
    );
    expect(rows.map((r) => r.indexname)).toEqual([
      "analytics_events_pkey",
      "analytics_sessions_pkey",
      "analytics_visitors_pkey",
      "idx_analytics_events_name_received_at",
      "idx_analytics_events_received_at",
      "idx_analytics_events_session",
      "idx_analytics_events_user_received_at",
      "idx_analytics_events_visitor_received_at",
      "idx_analytics_sessions_started_at",
      "idx_analytics_sessions_visitor",
      "idx_analytics_visitors_first_seen_at",
      "uq_analytics_events_authoritative_entity",
    ]);
  });
});

// ---------------------------------------------------------------------------

describe("the metrics FUNNEL1B1 is supposed to make possible", () => {
  beforeEach(async () => {
    // Two visitors. One arrives from TikTok, returns the next day from a
    // different campaign, and signs up. One arrives direct and bounces.
    const day1 = "2026-09-01T10:00:00Z";
    const day2 = "2026-09-02T10:00:00Z";
    const V2 = "22222222-2222-4222-8222-222222222222";
    const S2 = "66666666-6666-4666-8666-666666666666";
    const S3 = "77777777-7777-4777-8777-777777777777";

    await db.query(
      `INSERT INTO public.analytics_visitors
         (visitor_id, first_seen_at, first_utm_source, first_utm_medium, first_landing_path)
       VALUES ($1, $2, 'tiktok', 'social', '/'), ($3, $2, NULL, NULL, '/')`,
      [VISITOR, day1, V2],
    );
    await db.query(
      `INSERT INTO public.analytics_sessions (session_id, visitor_id, started_at, utm_source)
       VALUES ($1, $2, $3, 'tiktok'), ($4, $2, $5, 'youtube'), ($6, $7, $3, NULL)`,
      [SESSION, VISITOR, day1, S2, day2, S3, V2],
    );
    const ev = async (name: string, s: string, v: string, at: string, uid?: string) =>
      db.query(
        `INSERT INTO public.analytics_events
           (event_name, session_id, visitor_id, received_at, user_id, is_guest)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [name, s, v, at, uid ?? null, !uid],
      );
    await ev("landing_viewed", SESSION, VISITOR, day1);
    await ev("hub_entered", SESSION, VISITOR, day1);
    await ev("leaguecraft_opened", SESSION, VISITOR, day1);
    await ev("landing_viewed", S2, VISITOR, day2);
    await ev("signup_completed", S2, VISITOR, day2, USER_A);
    await ev("landing_viewed", S3, V2, day1);
  });

  it("counts unique visitors and unique sessions", async () => {
    const { rows } = await db.query<{ visitors: number; sessions: number }>(
      `SELECT (SELECT count(*)::int FROM public.analytics_visitors) AS visitors,
              (SELECT count(*)::int FROM public.analytics_sessions) AS sessions`,
    );
    expect(rows[0]).toEqual({ visitors: 2, sessions: 3 });
  });

  it("computes landing → hub conversion", async () => {
    const { rows } = await db.query<{ landed: number; hubbed: number }>(
      `SELECT count(DISTINCT visitor_id) FILTER (WHERE event_name = 'landing_viewed')::int AS landed,
              count(DISTINCT visitor_id) FILTER (WHERE event_name = 'hub_entered')::int AS hubbed
       FROM public.analytics_events`,
    );
    expect(rows[0]).toEqual({ landed: 2, hubbed: 1 });
  });

  it("separates new from returning visitors by session count", async () => {
    const { rows } = await db.query<{ returning: number }>(
      `SELECT count(*)::int AS returning FROM (
         SELECT visitor_id FROM public.analytics_sessions
         GROUP BY visitor_id HAVING count(*) > 1
       ) r`,
    );
    expect(rows[0].returning).toBe(1);
  });

  it("computes D1 return without a `returned` event", async () => {
    const { rows } = await db.query<{ d1: number }>(
      `SELECT count(*)::int AS d1 FROM (
         SELECT s.visitor_id
         FROM public.analytics_sessions s
         JOIN public.analytics_visitors v ON v.visitor_id = s.visitor_id
         WHERE s.started_at::date = (v.first_seen_at::date + 1)
         GROUP BY s.visitor_id
       ) x`,
    );
    expect(rows[0].d1).toBe(1);
  });

  it("attributes a signup to its FIRST touch, not the session it happened in", async () => {
    const { rows } = await db.query<{ first_utm_source: string; utm_source: string }>(
      `SELECT v.first_utm_source, s.utm_source
       FROM public.analytics_events e
       JOIN public.analytics_visitors v ON v.visitor_id = e.visitor_id
       JOIN public.analytics_sessions s ON s.session_id = e.session_id
       WHERE e.event_name = 'signup_completed'`,
    );
    // The conversion belongs to TikTok even though the visit came from YouTube.
    expect(rows[0]).toEqual({ first_utm_source: "tiktok", utm_source: "youtube" });
  });

  it("computes guest → registered conversion from the guest snapshot", async () => {
    const { rows } = await db.query<{ guests: number; converted: number }>(
      `SELECT count(DISTINCT visitor_id) FILTER (WHERE is_guest)::int AS guests,
              count(DISTINCT visitor_id) FILTER (WHERE event_name = 'signup_completed')::int AS converted
       FROM public.analytics_events`,
    );
    expect(rows[0]).toEqual({ guests: 2, converted: 1 });
  });
});
