// @vitest-environment node
//
// PGlite loads its wasm build through fetch/Response; jsdom's shims break that.
/**
 * Notifications 2.0 (#92) — the lifecycle migration RUN on a real Postgres.
 *
 * History is seeded BEFORE the migration (through the real producers where
 * one exists), so the backfill is exercised exactly as it will run in
 * production. Every case after that runs under `SET ROLE authenticated` with
 * auth.uid() set, so RLS, grants and INVOKER rights apply as for a browser.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { PER_ADMIN_READS, PREFLIGHT, ROLLBACK, V2, VERIFY, as, bootNotificationsDb, rejected } from "./notificationsV2DbFixture";

const ADMIN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_B = "abababab-abab-4bab-8bab-abababababab";
const PLAYER_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PLAYER_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let db: PGlite;
let preflight: Record<string, unknown>;
const profile: Record<string, string> = {};
const seeded: Record<string, string> = {};

type AdminRow = {
  id: string; type: string; category: string; priority: string; state: string;
  is_read: boolean; is_done: boolean; is_saved: boolean; occurrence_count: number;
  resolution: string | null; metadata: Record<string, any>; sort_rank: number; sort_at: string;
};
type PlayerRow = { id: string; type: string; category: string; state: string; is_read: boolean; resolution: string | null };

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const adminTab = (uid: string, tab: string, limit = 100, cursor?: AdminRow) =>
  as(db, uid, async () => (await db.query<AdminRow>(
    `SELECT * FROM public.admin_get_notifications($1, $2, $3, $4, $5)`,
    [tab, limit, cursor?.sort_rank ?? null, cursor?.sort_at ?? null, cursor?.id ?? null])).rows);
const adminCounts = (uid: string) =>
  as(db, uid, async () => (await one<{ c: Record<string, number> }>(`SELECT public.admin_notification_counts() AS c`)).c);
const adminSet = (uid: string, ids: string[] | null, action: string, tab: string | null = null) =>
  as(db, uid, async () => (await one<{ r: { applied: number; skipped: number } }>(
    `SELECT public.admin_set_notification_state($1::uuid[], $2, $3) AS r`, [ids, action, tab])).r);
const unreadCount = (uid: string) =>
  as(db, uid, async () => (await one<{ n: number }>(`SELECT public.admin_unread_notification_count() AS n`)).n);
const myInbox = (uid: string, view = "inbox") =>
  as(db, uid, async () => (await db.query<PlayerRow>(`SELECT * FROM public.get_my_notifications($1, 100)`, [view])).rows);
const mySummary = (uid: string) =>
  as(db, uid, async () => (await one<{ s: Record<string, number> }>(`SELECT public.get_my_notification_summary() AS s`)).s);
const mySet = (uid: string, ids: string[] | null, action: string) =>
  as(db, uid, async () => (await one<{ n: number }>(`SELECT public.set_my_notification_state($1::uuid[], $2) AS n`, [ids, action])).n);
const adminRow = async (id: string) =>
  one<{ category: string; priority: string; resolved_at: string | null; resolution: string | null; occurrence_count: number; type: string }>(
    `SELECT category, priority, resolved_at, resolution, occurrence_count, type FROM public.admin_notifications WHERE id = $1`, [id]);

beforeAll(async () => {
  db = await bootNotificationsDb();
  await db.exec(`
    INSERT INTO public.user_roles VALUES ('${ADMIN_A}', 'admin'), ('${ADMIN_B}', 'admin');
    INSERT INTO public.profiles (user_id, display_name, created_at) VALUES
      ('${ADMIN_A}', 'Admin A', now() - interval '400 days'),
      ('${ADMIN_B}', 'Admin B', now() - interval '400 days'),
      ('${PLAYER_A}', 'Player A', now() - interval '400 days'),
      ('${PLAYER_B}', 'Player B', now() - interval '400 days');
  `);
  for (const uid of [ADMIN_A, ADMIN_B, PLAYER_A, PLAYER_B]) {
    profile[uid] = (await one<{ id: string }>(`SELECT id FROM public.profiles WHERE user_id = $1`, [uid])).id;
  }
  await db.exec(PER_ADMIN_READS);

  // ---- History, written the way production wrote it ------------------------
  const ins = async (key: string, sql: string, params: unknown[] = []) => {
    seeded[key] = (await one<{ id: string }>(sql, params)).id;
  };
  await ins("routine", `INSERT INTO public.admin_notifications (type, title, created_at)
    VALUES ('system_notice', 'Nightly job ran', now() - interval '60 days') RETURNING id`);
  await ins("modDone", `INSERT INTO public.admin_notifications (type, title, message, is_read, created_at)
    VALUES ('mod_delete_request', 'Delete league?', 'please [APPROVED]', true, now() - interval '50 days') RETURNING id`);
  await ins("modOpen", `INSERT INTO public.admin_notifications (type, title, message, created_at)
    VALUES ('mod_delete_request', 'Delete item?', 'please', now() - interval '200 days') RETURNING id`);

  const fb = async (key: string, cols: string, vals: string, ageDays: number) => {
    await ins(`${key}Feedback`, `INSERT INTO public.feedback (profile_id, ${cols}) VALUES ('${profile[PLAYER_A]}', ${vals}) RETURNING id`);
    seeded[key] = (await one<{ id: string }>(
      `UPDATE public.admin_notifications SET created_at = now() - make_interval(days => $2)
       WHERE metadata->>'feedback_id' = $1 RETURNING id`, [seeded[`${key}Feedback`], ageDays])).id;
  };
  await fb("fbClosed", "title, status", "'Old idea', 'completed'", 45);
  await fb("fbStale", "title", "'Stale suggestion'", 45);
  await fb("fbQuestion", "title, entry_intent, type, report_context",
    `'Wrong answer', 'question_report', 'bug',
     '{"reason":"incorrect_answer","prompt":"Which item gives 40 AD?","selected_answer":"Long Sword","canonical_answer":"Pickaxe","answer_evidence":"patch notes"}'::jsonb`, 90);

  await ins("comment", `INSERT INTO public.comments (profile_id, content) VALUES ('${profile[PLAYER_B]}', 'rude') RETURNING id`);
  for (let i = 0; i < 3; i++) {
    await db.query(`INSERT INTO public.comment_reports (comment_id, reporter_profile_id, reason) VALUES ($1, $2, 'spam')`,
      [seeded.comment, profile[PLAYER_A]]);
  }
  await ins("reportOpen", `INSERT INTO public.user_reports (reporter_profile_id, reported_profile_id)
    VALUES ('${profile[PLAYER_A]}', '${profile[PLAYER_B]}') RETURNING id`);
  await ins("reportDone", `INSERT INTO public.user_reports (reporter_profile_id, reported_profile_id, status, resolved_at)
    VALUES ('${profile[PLAYER_B]}', '${profile[PLAYER_A]}', 'resolved', now()) RETURNING id`);

  await ins("oldBroadcast", `INSERT INTO public.user_notifications (title, type, sent_by_user_id, created_at)
    VALUES ('Season recap', 'general', '${ADMIN_A}', now() - interval '60 days') RETURNING id`);
  await ins("freshBroadcast", `INSERT INTO public.user_notifications (title, type, sent_by_user_id, created_at)
    VALUES ('Patch 26.20 is live', 'update', '${ADMIN_A}', now() - interval '2 days') RETURNING id`);
  await ins("legacyBroadcast", `INSERT INTO public.user_notifications (title, type, sent_by_user_id)
    VALUES ('Spin the wheel', 'promotion', '${ADMIN_A}') RETURNING id`);
  await ins("friendship", `INSERT INTO public.friendships (requester_id, addressee_id)
    VALUES ('${profile[PLAYER_B]}', '${profile[PLAYER_A]}') RETURNING id`);
  await db.query(`UPDATE public.friendships SET status = 'accepted' WHERE id = $1`, [seeded.friendship]);

  // ---- The migration ---------------------------------------------------------
  preflight = (await db.query<Record<string, unknown>>(PREFLIGHT)).rows[0];
  await db.exec(V2);
}, 120_000);

afterAll(async () => db?.close());

describe("backfill — old clutter leaves the active inbox, unresolved work does not", () => {
  it("expires an old routine admin notice into Completed", async () => {
    const r = await adminRow(seeded.routine);
    expect(r).toMatchObject({ category: "platform", resolved_at: null });
    const platform = await adminTab(ADMIN_A, "platform");
    expect(platform.map(x => x.id)).not.toContain(seeded.routine);
    const completed = await adminTab(ADMIN_A, "completed");
    expect(completed.find(x => x.id === seeded.routine)?.state).toBe("expired");
  });

  it("mirrors a historical moderator disposition into resolution", async () => {
    expect(await adminRow(seeded.modDone)).toMatchObject({ resolution: "approved" });
  });

  it("keeps a 200-day-old undispositioned moderator request in Action Required", async () => {
    const action = await adminTab(ADMIN_A, "action");
    expect(action.map(x => x.id)).toContain(seeded.modOpen);
  });

  it("resolves feedback whose status is already closed", async () => {
    expect(await adminRow(seeded.fbClosed)).toMatchObject({ category: "community", resolution: "completed" });
  });

  it("files a question report under Action Required with its question, problem and evidence", async () => {
    const action = await adminTab(ADMIN_A, "action");
    const q = action.find(x => x.id === seeded.fbQuestion)!;
    expect(q).toBeTruthy();
    expect(q.priority).toBe("high");
    expect(q.metadata.feedback).toMatchObject({
      entry_intent: "question_report",
      reason: "incorrect_answer",
      question_prompt: "Which item gives 40 AD?",
      selected_answer: "Long Sword",
      canonical_answer: "Pickaxe",
      has_evidence: true,
      status: "open",
    });
  });

  it("lets stale ordinary feedback expire out of Community", async () => {
    const community = await adminTab(ADMIN_A, "community");
    expect(community.map(x => x.id)).not.toContain(seeded.fbStale);
  });

  it("collapses repeated reports on one comment into a single item", async () => {
    const rows = (await db.query<{ resolution: string | null; occurrence_count: number }>(
      `SELECT resolution, occurrence_count FROM public.admin_notifications WHERE subject_id = $1 ORDER BY created_at`,
      [seeded.comment])).rows;
    // The three reports arrived before the migration: one keeper, two merged copies.
    expect(rows.filter(r => r.resolution === null)).toHaveLength(1);
    expect(rows.filter(r => r.resolution === "merged")).toHaveLength(2);
    expect(rows.find(r => r.resolution === null)!.occurrence_count).toBe(3);
  });

  it("resolves the notification of an already-resolved user report, not the pending one", async () => {
    const action = await adminTab(ADMIN_A, "action");
    const subjects = action.map(x => x.metadata.user_report_id);
    expect(subjects).toContain(seeded.reportOpen);
    expect(subjects).not.toContain(seeded.reportDone);
  });

  it("expires old broadcasts and hides legacy types from players", async () => {
    const inbox = await myInbox(PLAYER_A);
    const ids = inbox.map(x => x.id);
    expect(ids).toContain(seeded.freshBroadcast);
    expect(ids).not.toContain(seeded.oldBroadcast);
    expect(ids).not.toContain(seeded.legacyBroadcast);
    const history = await myInbox(PLAYER_A, "history");
    expect(history.map(x => x.id)).toContain(seeded.oldBroadcast);
    expect(history.map(x => x.id)).not.toContain(seeded.legacyBroadcast);
  });

  it("makes an already-accepted friend request non-actionable", async () => {
    const inbox = await myInbox(PLAYER_A);
    expect(inbox.some(x => x.type === "friend_request")).toBe(false);
    const history = await myInbox(PLAYER_A, "history");
    expect(history.find(x => x.type === "friend_request")?.resolution).toBe("accepted");
    // B, who sent it, sees the acceptance.
    expect((await myInbox(PLAYER_B)).some(x => x.type === "friend_accepted")).toBe(true);
  });

  it("deleted no rows", async () => {
    const n = await one<{ n: number }>(`SELECT count(*)::int AS n FROM public.admin_notifications`);
    // routine, 2 mod, 3 feedback, 3 comment reports, 2 user reports
    expect(n.n).toBe(11);
  });
});

describe("per-admin isolation", () => {
  it("one admin's read, done and saved state never reaches another admin", async () => {
    const id = seeded.modOpen;
    const before = await adminCounts(ADMIN_B);
    await adminSet(ADMIN_A, [id], "read");
    await adminSet(ADMIN_A, [id], "save");
    const a = (await adminTab(ADMIN_A, "action")).find(x => x.id === id)!;
    const b = (await adminTab(ADMIN_B, "action")).find(x => x.id === id)!;
    expect(a).toMatchObject({ is_read: true, is_saved: true });
    expect(b).toMatchObject({ is_read: false, is_saved: false });
    expect(await adminCounts(ADMIN_B)).toEqual(before);
  });

  it("an admin cannot read or write another admin's state rows directly", async () => {
    const theirs = await as(db, ADMIN_B, async () =>
      (await db.query(`SELECT * FROM public.admin_notification_states WHERE admin_user_id = $1`, [ADMIN_A])).rows);
    expect(theirs).toHaveLength(0);
    const msg = await rejected(() => as(db, ADMIN_B, () => db.query(
      `INSERT INTO public.admin_notification_states (notification_id, admin_user_id, saved_at) VALUES ($1, $2, now())`,
      [seeded.fbQuestion, ADMIN_A])));
    expect(msg).toMatch(/row-level security/);
  });

  it("a player sees no admin notification and no admin state", async () => {
    const rows = await as(db, PLAYER_A, async () =>
      (await db.query(`SELECT * FROM public.admin_notifications`)).rows);
    expect(rows).toHaveLength(0);
    expect(await rejected(() => adminTab(PLAYER_A, "action"))).toMatch(/admin role required/);
    expect(await rejected(() => adminCounts(PLAYER_A))).toMatch(/admin role required/);
  });

  it("revokes TRUNCATE and DELETE on the state tables", async () => {
    for (const sql of [
      `TRUNCATE public.admin_notification_states`,
      `DELETE FROM public.admin_notification_states`,
      `TRUNCATE public.user_notification_states`,
      `DELETE FROM public.notification_preferences`,
    ]) {
      expect(await rejected(() => as(db, ADMIN_A, () => db.query(sql))), sql).toMatch(/permission denied/);
    }
  });
});

describe("Action Required cannot be hidden", () => {
  it("refuses Done on an unresolved action item, through the RPC and directly", async () => {
    const r = await adminSet(ADMIN_A, [seeded.modOpen], "done");
    expect(r).toEqual({ applied: 0, skipped: 1 });
    const msg = await rejected(() => as(db, ADMIN_A, () => db.query(
      `UPDATE public.admin_notification_states SET done_at = now() WHERE notification_id = $1`, [seeded.modOpen])));
    expect(msg).toMatch(/notification_unresolved_action/);
    expect((await adminTab(ADMIN_A, "action")).map(x => x.id)).toContain(seeded.modOpen);
  });

  it("bulk Done on a tab skips unresolved action work but clears routine items", async () => {
    await db.query(`INSERT INTO public.admin_notifications (type, title) VALUES ('system_notice', 'Deploy finished')`);
    const r = await adminSet(ADMIN_A, null, "done", "platform");
    expect(r.applied).toBeGreaterThan(0);
    expect(await adminTab(ADMIN_A, "platform")).toHaveLength(0);
    expect((await adminTab(ADMIN_B, "platform")).length).toBeGreaterThan(0);
  });

  it("refuses manual resolution of items owned by another workflow", async () => {
    const r = await as(db, ADMIN_A, async () => (await one<{ r: { resolved: number; refused: number } }>(
      `SELECT public.admin_resolve_notifications($1::uuid[], 'dismissed') AS r`,
      [[seeded.fbQuestion, seeded.modOpen]])).r);
    expect(r).toEqual({ resolved: 0, refused: 2 });
  });

  it("dedupes new reports, escalates the auto-hide, and makes the item unread again", async () => {
    const item = (await adminTab(ADMIN_A, "action")).find(x => x.metadata.comment_id === seeded.comment)!;
    await adminSet(ADMIN_A, [item.id], "read");
    expect((await adminTab(ADMIN_A, "action")).find(x => x.id === item.id)!.is_read).toBe(true);
    for (let i = 0; i < 2; i++) {
      await db.query(`INSERT INTO public.comment_reports (comment_id, reporter_profile_id) VALUES ($1, $2)`,
        [seeded.comment, profile[PLAYER_B]]);
    }
    const after = (await adminTab(ADMIN_A, "action")).filter(x => x.metadata.comment_id === seeded.comment);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: item.id, priority: "critical", is_read: false, occurrence_count: 6 });
    // Critical sorts to the top of Action Required.
    expect((await adminTab(ADMIN_A, "action"))[0].priority).toBe("critical");
  });

  it("resolves the comment item when an admin hides the comment, and it moves to Completed", async () => {
    await db.query(`UPDATE public.comments SET hidden_by_admin = true WHERE id = $1`, [seeded.comment]);
    const action = await adminTab(ADMIN_A, "action");
    expect(action.some(x => x.metadata.comment_id === seeded.comment)).toBe(false);
    const done = (await adminTab(ADMIN_B, "completed")).find(x => x.metadata.comment_id === seeded.comment && x.resolution !== "merged");
    expect(done).toMatchObject({ state: "resolved", resolution: "hidden_by_admin" });
  });

  it("resolves and reopens through the user report's own status", async () => {
    await db.query(`UPDATE public.user_reports SET status = 'resolved' WHERE id = $1`, [seeded.reportOpen]);
    expect((await adminTab(ADMIN_A, "action")).some(x => x.metadata.user_report_id === seeded.reportOpen)).toBe(false);
    await db.query(`UPDATE public.user_reports SET status = 'pending' WHERE id = $1`, [seeded.reportOpen]);
    expect((await adminTab(ADMIN_A, "action")).some(x => x.metadata.user_report_id === seeded.reportOpen)).toBe(true);
  });

  it("mirrors a live moderator approval into resolution", async () => {
    await as(db, ADMIN_B, () => db.query(`SELECT public.admin_resolve_mod_request($1, false)`, [seeded.modOpen]));
    expect(await adminRow(seeded.modOpen)).toMatchObject({ resolution: "denied" });
    expect((await adminTab(ADMIN_A, "action")).map(x => x.id)).not.toContain(seeded.modOpen);
  });
});

describe("feedback workflow drives both inboxes", () => {
  it("resolving a question report closes the admin item and tells the player, once per change", async () => {
    await db.query(`UPDATE public.feedback SET status = 'in-progress' WHERE id = $1`, [seeded.fbQuestionFeedback]);
    let row = (await adminTab(ADMIN_A, "action")).find(x => x.id === seeded.fbQuestion)!;
    expect(row.metadata.feedback.status).toBe("in-progress");

    await db.query(`UPDATE public.feedback SET status = 'completed' WHERE id = $1`, [seeded.fbQuestionFeedback]);
    expect((await adminTab(ADMIN_A, "action")).map(x => x.id)).not.toContain(seeded.fbQuestion);
    row = (await adminTab(ADMIN_A, "completed")).find(x => x.id === seeded.fbQuestion)!;
    expect(row).toMatchObject({ state: "resolved", resolution: "completed" });

    const updates = (await myInbox(PLAYER_A)).filter(x => x.type === "feedback_update");
    expect(updates).toHaveLength(1);
    expect(updates[0].category).toBe("feedback");
    // Player B never sees A's report updates.
    expect((await myInbox(PLAYER_B)).some(x => x.type === "feedback_update")).toBe(false);
  });

  it("reopening the feedback reopens the admin item", async () => {
    await db.query(`UPDATE public.feedback SET status = 'open' WHERE id = $1`, [seeded.fbQuestionFeedback]);
    expect((await adminTab(ADMIN_A, "action")).map(x => x.id)).toContain(seeded.fbQuestion);
  });

  it("sends nothing for a report whose author's profile is gone, and the status change still lands", async () => {
    const before = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM public.user_notifications WHERE type = 'feedback_update'`)).n;
    await db.query(`UPDATE public.feedback SET status = 'planned', profile_id = NULL WHERE id = $1`, [seeded.fbStaleFeedback]);
    expect((await one<{ status: string }>(`SELECT status FROM public.feedback WHERE id = $1`, [seeded.fbStaleFeedback])).status)
      .toBe("planned");
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM public.user_notifications WHERE type = 'feedback_update'`)).n)
      .toBe(before);
  });
});

describe("player lifecycle", () => {
  it("Done removes a broadcast for that player only, and survives a refetch", async () => {
    const id = seeded.freshBroadcast;
    expect(await mySet(PLAYER_A, [id], "done")).toBe(1);
    expect((await myInbox(PLAYER_A)).map(x => x.id)).not.toContain(id);
    expect((await myInbox(PLAYER_A)).map(x => x.id)).not.toContain(id); // refresh does not resurrect
    expect((await myInbox(PLAYER_B)).map(x => x.id)).toContain(id);
    expect(await one(`SELECT 1 FROM public.user_notifications WHERE id = $1`, [id])).toBeTruthy();
    expect(await mySet(PLAYER_A, [id], "undone")).toBe(1);
    expect((await myInbox(PLAYER_A)).map(x => x.id)).toContain(id);
  });

  it("cannot read or act on another player's targeted notification", async () => {
    const theirs = (await myInbox(PLAYER_B)).find(x => x.type === "friend_accepted")!;
    expect(await mySet(PLAYER_A, [theirs.id], "done")).toBe(0);
    const visible = await as(db, PLAYER_A, async () =>
      (await db.query(`SELECT id FROM public.user_notifications WHERE id = $1`, [theirs.id])).rows);
    expect(visible).toHaveLength(0);
    const msg = await rejected(() => as(db, PLAYER_A, () => db.query(
      `INSERT INTO public.user_notification_states (notification_id, user_id, done_at) VALUES ($1, $2, now())`,
      [theirs.id, PLAYER_A])));
    expect(msg).toMatch(/row-level security/);
  });

  it("badge counts only active, unmuted, unread items", async () => {
    const s0 = await mySummary(PLAYER_B);
    const inbox = await myInbox(PLAYER_B);
    expect(s0.active).toBe(inbox.length);
    expect(s0.unread).toBe(inbox.filter(x => !x.is_read).length);
    await mySet(PLAYER_B, null, "read_all");
    expect((await mySummary(PLAYER_B)).unread).toBe(0);
  });

  it("muting announcements hides them, but account notices cannot be muted", async () => {
    await db.query(`INSERT INTO public.user_notifications (title, type, sent_by_user_id) VALUES ('Account notice', 'warning', $1)`, [ADMIN_A]);
    await as(db, PLAYER_B, () => db.query(`SELECT public.set_my_notification_preferences('{social}')`));
    await as(db, PLAYER_B, () => db.query(`SELECT public.set_my_notification_preferences('{announcement}')`));
    // The RPC writes only the caller's row; a direct write to another player's row is refused.
    const msg0 = await rejected(() => as(db, PLAYER_A, () => db.query(
      `INSERT INTO public.notification_preferences (user_id, muted_categories) VALUES ($1, '{}')`, [PLAYER_B])));
    expect(msg0).toMatch(/row-level security|duplicate key/);
    expect((await one<{ m: string[] }>(`SELECT muted_categories AS m FROM public.notification_preferences WHERE user_id = $1`, [PLAYER_B])).m)
      .toEqual(["announcement"]);
    const inbox = await myInbox(PLAYER_B);
    expect(inbox.some(x => x.category === "announcement")).toBe(false);
    expect(inbox.some(x => x.category === "account")).toBe(true);
    const msg = await rejected(() => as(db, PLAYER_B, () => db.query(
      `UPDATE public.notification_preferences SET muted_categories = '{account}' WHERE user_id = $1`, [PLAYER_B])));
    expect(msg).toMatch(/notification_preferences_mutable_only/);
    expect(await rejected(() => as(db, PLAYER_B, () => db.query(
      `SELECT public.set_my_notification_preferences('{security}')`)))).toMatch(/notification_preferences_mutable_only/);
  });

  it("a new friend request is actionable until the friendship row changes", async () => {
    const f = (await one<{ id: string }>(`INSERT INTO public.friendships (requester_id, addressee_id)
      VALUES ($1, $2) RETURNING id`, [profile[ADMIN_A], profile[PLAYER_B]])).id;
    expect((await mySummary(PLAYER_B)).actionable).toBe(1);
    await db.query(`DELETE FROM public.friendships WHERE id = $1`, [f]);
    expect((await mySummary(PLAYER_B)).actionable).toBe(0);
    const h = (await myInbox(PLAYER_B, "history")).find(x => x.type === "friend_request");
    expect(h?.resolution).toBe("withdrawn");
  });

  it("anon holds no execute right on any inbox RPC", async () => {
    for (const sql of [
      `SELECT public.get_my_notification_summary()`,
      `SELECT * FROM public.get_my_notifications('inbox', 10)`,
      `SELECT public.admin_notification_counts()`,
    ]) {
      expect(await rejected(() => as(db, null, () => db.query(sql), "anon")), sql).toMatch(/permission denied/);
    }
  });
});

describe("old rows cannot starve the inbox", () => {
  it("returns an older active item even behind 150 newer done ones, and pages without gaps", async () => {
    const oldFeedback = (await one<{ id: string }>(
      `INSERT INTO public.feedback (title) VALUES ('Important older feedback') RETURNING id`)).id;
    const old = (await one<{ id: string }>(`UPDATE public.admin_notifications SET activity_at = now() - interval '5 days'
      WHERE subject_id = $1 RETURNING id`, [oldFeedback])).id;
    await db.query(`INSERT INTO public.feedback (title) SELECT 'noise ' || g FROM generate_series(1, 150) g`);
    const noise = (await db.query<{ id: string }>(
      `SELECT id FROM public.admin_notifications WHERE title LIKE 'New feedback: noise %'`)).rows.map(r => r.id);
    expect(noise).toHaveLength(150);
    await adminSet(ADMIN_A, noise, "done");

    const page = await adminTab(ADMIN_A, "community", 30);
    expect(page.map(x => x.id)).toContain(old);

    // Admin B has not cleared anything: paging through every item, keyset, yields each exactly once.
    const seen: string[] = [];
    let cursor: AdminRow | undefined;
    for (;;) {
      const rows = await adminTab(ADMIN_B, "community", 40, cursor);
      if (rows.length === 0) break;
      seen.push(...rows.map(r => r.id));
      cursor = rows[rows.length - 1];
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toContain(old);
    expect(seen.length).toBe((await adminCounts(ADMIN_B)).community_active);
  });

  it("the legacy unread count no longer counts done or expired items", async () => {
    const a = await unreadCount(ADMIN_A);
    const counts = await adminCounts(ADMIN_A);
    expect(a).toBe(counts.unread_total);
    expect(a).toBeLessThan(await unreadCount(ADMIN_B));
  });
});

describe("operability", () => {
  it("re-applying the migration is a no-op (safe after a partial manual run)", async () => {
    const snapshot = async () => (await db.query(
      `SELECT id, category, priority, resolved_at, resolution, occurrence_count, expires_at
         FROM public.admin_notifications ORDER BY id`)).rows;
    const before = await snapshot();
    await db.exec(V2);
    expect(await snapshot()).toEqual(before);
  });

  it("the preflight predicted the cleanup without writing anything", () => {
    expect(preflight).toMatchObject({
      admin_rows_total: 11,
      mod_requests_resolved: 1,
      feedback_resolved: 1,
      user_reports_resolved: 1,
      comment_reports_merged: 2,
      friend_requests_no_longer_actionable: 1,
      user_legacy_rows_hidden: 1,
    });
  });

  it("the verification script passes on the migrated database", async () => {
    const row = (await db.query<Record<string, unknown>>(VERIFY)).rows[0];
    const failed = Object.entries(row).filter(([k, v]) => k.endsWith("_ok") && v !== true);
    expect(failed).toEqual([]);
  });

  it("the rollback restores the legacy schema without losing a notification or receipt", async () => {
    const count = async (t: string) => (await one<{ n: number }>(`SELECT count(*)::int AS n FROM public.${t}`)).n;
    const before = { a: await count("admin_notifications"), u: await count("user_notifications"),
                     ar: await count("admin_notification_reads"), ur: await count("user_notification_reads") };
    await db.exec(ROLLBACK);
    expect({ a: await count("admin_notifications"), u: await count("user_notifications"),
             ar: await count("admin_notification_reads"), ur: await count("user_notification_reads") }).toEqual(before);
    const cols = (await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'admin_notifications'`)).rows.map(r => r.column_name);
    expect(cols.sort()).toEqual(["created_at", "id", "is_read", "message", "metadata", "title", "type"]);
    // The legacy count works again (legacy meaning: rows with no receipt).
    expect(await unreadCount(ADMIN_B)).toBeGreaterThan(0);
    // ...and the migration can be re-applied on top of the rollback.
    await db.exec(V2);
    const row = (await db.query<Record<string, unknown>>(VERIFY)).rows[0];
    expect(Object.entries(row).filter(([k, v]) => k.endsWith("_ok") && v !== true)).toEqual([]);
  });
});
