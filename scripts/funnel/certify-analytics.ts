/**
 * FUNNEL1B2 — production certification for the analytics foundation.
 *
 *   pnpm tsx scripts/funnel/certify-analytics.ts
 *
 * WHY THIS EXISTS. FUNNEL1A's central finding was that "the migration is in
 * git" and "the table is in production" are different claims, and that nobody
 * noticed the gap for two months because the emitter fails silently by design.
 * A phase that applies a migration by hand and then declares victory would be
 * repeating that mistake with more paperwork. This script is the evidence.
 *
 * WHAT IT PROVES, AND WHAT IT CANNOT
 *
 * It runs with the PUBLISHABLE (anon) key — the same credential a browser has —
 * so it exercises the real client path and nothing more privileged. That covers
 * certification items 1, 2, 3, 5, 7 and 8. Items 4 (policy inventory) and 6
 * (authorized admin read-back) require privileges this script deliberately does
 * not hold; it prints the exact SQL for a human to run in the Lovable SQL
 * Editor, and says plainly that they are unproven until that is done.
 *
 * It never prints a key, and it performs no destructive operation.
 *
 * THE SMOKE EVENT
 *
 * `smoke_test_ping` is used rather than a real funnel event. It is not in the
 * contract and never will be, so it cannot be mistaken for product telemetry,
 * cannot enter any funnel count by accident, and can be deleted by name with no
 * risk of taking real rows with it. Tagging a genuine `landing_viewed` with
 * `{smoke: true}` would have put the burden on every future query to remember
 * the exclusion — exactly the kind of footgun this codebase keeps finding.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const SMOKE_EVENT = "smoke_test_ping";

type Check = { id: string; label: string; ok: boolean; detail: string };
const checks: Check[] = [];
const record = (id: string, label: string, ok: boolean, detail: string) => {
  checks.push({ id, label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}. ${label}\n      ${detail}`);
};

function env(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(join(process.cwd(), ".env"), "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function configuredProjectRef(): string {
  const toml = readFileSync(join(process.cwd(), "supabase/config.toml"), "utf8");
  return /project_id\s*=\s*"([^"]+)"/.exec(toml)?.[1] ?? "";
}

/** A v4 UUID, so the smoke rows are indistinguishable in shape from real ones. */
const uuid = () => crypto.randomUUID();

async function main() {
  const e = env();
  const url = e.VITE_SUPABASE_URL;
  const key = e.VITE_SUPABASE_PUBLISHABLE_KEY;
  const envRef = e.VITE_SUPABASE_PROJECT_ID;
  const tomlRef = configuredProjectRef();

  if (!url || !key) {
    console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env");
    process.exit(2);
  }

  console.log("FUNNEL1B2 — analytics production certification");
  console.log(`  project ref : ${tomlRef}`);
  console.log(`  host        : ${new URL(url).host}`);
  console.log(`  credential  : publishable (anon) — no privileged key is used\n`);

  // 0 — identity. Applying a migration to the wrong project is the one mistake
  // that cannot be walked back by re-running anything.
  record(
    "0",
    "project identity agrees between .env and supabase/config.toml",
    Boolean(tomlRef) && envRef === tomlRef && url.includes(tomlRef),
    `.env=${envRef}  config.toml=${tomlRef}`,
  );

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // 1–3 — the tables exist. A missing table answers PGRST205, which is exactly
  // what funnel_events answered for two months; RLS denial (empty result or
  // 42501) means the table IS there, which is the outcome wanted here.
  for (const [n, table] of [
    ["1", "analytics_events"],
    ["2", "analytics_visitors"],
    ["3", "analytics_sessions"],
  ] as const) {
    const { error } = await supabase.from(table).select("*").limit(1);
    const missing = error?.code === "PGRST205" || /schema cache/i.test(error?.message ?? "");
    record(
      n,
      `public.${table} exists in the live project`,
      !missing,
      missing ? `NOT FOUND — ${error?.message}` : "present (reads are RLS-filtered, as intended)",
    );
  }

  const tablesExist = checks.slice(1, 4).every((c) => c.ok);
  if (!tablesExist) {
    console.log(
      "\nThe migration has not been applied. Apply " +
        "supabase/migrations/20260920120000_funnel1b1_analytics_foundation.sql\n" +
        "in the Lovable Cloud SQL Editor, then re-run this script.",
    );
    summarize();
    process.exit(1);
  }

  // 5 + 7 — a real web event goes in through the client path, carrying the
  // common fields a browser would populate.
  const visitorId = uuid();
  const sessionId = uuid();
  const stamp = new Date().toISOString();

  const visitorWrite = await supabase.from("analytics_visitors").insert({
    visitor_id: visitorId,
    first_landing_path: "/",
    first_referrer: "https://certification.local/funnel1b2",
    first_utm_source: "certification",
    first_utm_medium: "smoke",
    first_utm_campaign: "funnel1b2",
  });
  const sessionWrite = await supabase.from("analytics_sessions").insert({
    session_id: sessionId,
    visitor_id: visitorId,
    landing_path: "/",
    referrer: "https://certification.local/funnel1b2",
    utm_source: "certification",
  });
  const eventWrite = await supabase.from("analytics_events").insert({
    event_name: SMOKE_EVENT,
    event_version: 1,
    occurred_at: stamp,
    route: "/",
    visitor_id: visitorId,
    session_id: sessionId,
    user_id: null,
    is_guest: true,
    source_system: "web",
    metadata: { certification: "FUNNEL1B2", at: stamp },
  });

  record(
    "5",
    "an anonymous browser can insert a web event through the client path",
    !eventWrite.error && !visitorWrite.error && !sessionWrite.error,
    eventWrite.error?.message ??
      visitorWrite.error?.message ??
      sessionWrite.error?.message ??
      `event + visitor + session accepted (visitor ${visitorId})`,
  );

  record(
    "7",
    "common fields are accepted as written (name, ids, route, attribution, timestamps)",
    !eventWrite.error,
    eventWrite.error
      ? eventWrite.error.message
      : `event_name=${SMOKE_EVENT} visitor=${visitorId} session=${sessionId} route=/ occurred_at=${stamp}`,
  );

  // 8 — and cannot read any of it back.
  const reads = await Promise.all(
    ["analytics_events", "analytics_visitors", "analytics_sessions"].map(async (t) => {
      const { data, error } = await supabase.from(t).select("*").limit(5);
      return { t, rows: data?.length ?? 0, denied: Boolean(error) };
    }),
  );
  record(
    "8",
    "unauthorized reads are blocked — anon sees nothing, including its own rows",
    reads.every((r) => r.denied || r.rows === 0),
    reads.map((r) => `${r.t}: ${r.denied ? "denied" : `${r.rows} rows`}`).join("  "),
  );

  // A browser must not be able to forge server authority. Not on the brief's
  // list, but it is the integrity claim the whole authoritative/idempotent
  // design rests on, and it costs one round trip to prove in production.
  const forged = await supabase.from("analytics_events").insert({
    event_name: "ranked_completed",
    source_system: "railway",
    source_entity_type: "ranked_match",
    source_entity_id: `certification-${Date.now()}`,
  });
  record(
    "8b",
    "a browser cannot write a server-authoritative row",
    Boolean(forged.error),
    forged.error ? `rejected: ${forged.error.message}` : "ACCEPTED — RLS is not protecting source_system",
  );

  console.log(`
────────────────────────────────────────────────────────────────────────
STILL UNPROVEN BY THIS SCRIPT — run as admin/service in the SQL Editor.
These need privileges a browser does not have, so they are not asserted
above and must not be reported as certified until this returns.

-- 4. the expected RLS policies exist
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename like 'analytics_%'
order by tablename, cmd, policyname;
-- expect, per table: one INSERT policy for {anon,authenticated}
--                    one SELECT policy for {authenticated}
--                    and NO update/delete policy anywhere.

-- 6. the smoke event reads back through authorized access
select id, event_name, visitor_id, session_id, user_id, is_guest,
       route, source_system, occurred_at, received_at, metadata
from public.analytics_events
where event_name = '${SMOKE_EVENT}'
order by received_at desc
limit 5;

-- 7. …joined to its attribution, which is the whole point of the model
select e.event_name, e.route, e.is_guest,
       v.first_utm_source, v.first_referrer, s.utm_source
from public.analytics_events e
join public.analytics_visitors v on v.visitor_id = e.visitor_id
join public.analytics_sessions s on s.session_id = e.session_id
where e.event_name = '${SMOKE_EVENT}';

-- THEN CLEAN UP. '${SMOKE_EVENT}' is not a contract event, so this cannot
-- touch a real funnel row. Run all three, in this order.
delete from public.analytics_events   where event_name = '${SMOKE_EVENT}';
delete from public.analytics_sessions where utm_source = 'certification';
delete from public.analytics_visitors where first_utm_source = 'certification';
────────────────────────────────────────────────────────────────────────
`);

  summarize();
}

function summarize() {
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} automated checks passed.`);
  if (failed.length) {
    console.log(`FAILED: ${failed.map((c) => c.id).join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("certification aborted:", error instanceof Error ? error.message : error);
  process.exit(2);
});
