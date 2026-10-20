// @vitest-environment node
/**
 * Notifications 2.0 — the client policy (src/lib/notifications/policy.ts) and
 * the SQL classifier (notification_admin_profile / notification_user_profile)
 * must agree. The server is authoritative; the client uses its mirror for the
 * pre-migration fallback, labels and routing. This runs both over the same
 * matrix so a change to one without the other fails here.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { PER_ADMIN_READS, V2, bootNotificationsDb } from "./notificationsV2DbFixture";
import {
  ADMIN_EXPIRY_DAYS,
  MUTABLE_PLAYER_CATEGORIES,
  PLAYER_VISIBLE_CATEGORIES,
  classifyAdmin,
  classifyPlayer,
} from "@/lib/notifications/policy";

let db: PGlite;
beforeAll(async () => {
  db = await bootNotificationsDb();
  await db.exec(PER_ADMIN_READS);
  await db.exec(V2);
}, 120_000);
afterAll(async () => db?.close());

const ADMIN_TYPES = [
  "comment_report", "image_report", "image_report_critical", "user_report",
  "mod_delete_request", "mod_action", "feedback", "system_notice", "something_new",
];
const FEEDBACK_SHAPES: Array<[string | null, string | null, string | null]> = [
  [null, null, null],
  ["question_report", "bug", null],
  ["page_report", "bug", null],
  ["bug", "bug", "blocking"],
  ["bug", "bug", "major"],
  ["bug", "bug", "minor"],
  ["feature", "feature", null],
  ["gameplay", "feedback", null],
];
const PLAYER_TYPES = [
  "friend_request", "friend_accepted", "comment_reply", "comment_reaction", "feedback_update",
  "achievement_unlocked", "progression_milestone", "warning", "security_notice", "general", "update",
  "lol_quiz", "quiz_broadcast", "combat_lab", "lol_patch", "esports_quiz", "lol_site_notice",
  "new_item", "elo_milestone", "new_league", "promotion", "spotlight", "brand_new_type",
];

describe("admin classification parity", () => {
  it("agrees on category and priority for every type and feedback shape", async () => {
    for (const type of ADMIN_TYPES) {
      for (const [intent, fbType, severity] of type === "feedback" ? FEEDBACK_SHAPES : [[null, null, null] as const]) {
        for (const autoHidden of type === "comment_report" ? [false, true] : [false]) {
          const metadata = autoHidden ? { auto_hidden: true } : {};
          const { rows } = await db.query<{ category: string; priority: string; ttl: string | null }>(
            `SELECT category, priority, ttl::text AS ttl
               FROM public.notification_admin_profile(gen_random_uuid(), $1, $2::jsonb, $3, $4, $5)`,
            [type, JSON.stringify(metadata), intent, fbType, severity],
          );
          const ts = classifyAdmin(type, { entry_intent: intent, type: fbType, severity }, metadata);
          const label = `${type}/${intent}/${fbType}/${severity}/${autoHidden}`;
          expect({ category: rows[0].category, priority: rows[0].priority }, label).toEqual(ts);
          const days = ADMIN_EXPIRY_DAYS[ts.category];
          expect(rows[0].ttl, label).toBe(days == null ? null : `${days} days`);
        }
      }
    }
  });
});

describe("player classification parity", () => {
  it("agrees on the category of every known, retired and unknown type", async () => {
    for (const type of PLAYER_TYPES) {
      const { rows } = await db.query<{ category: string }>(
        `SELECT category FROM public.notification_user_profile($1, 'normal', '{}'::jsonb)`, [type]);
      expect(rows[0].category, type).toBe(classifyPlayer(type));
    }
  });

  it("the mutable categories are exactly what the database CHECK allows, and never account/security", async () => {
    const { rows } = await db.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'notification_preferences_mutable_only'`);
    for (const c of MUTABLE_PLAYER_CATEGORIES) expect(rows[0].def).toContain(`'${c.id}'`);
    expect(rows[0].def).not.toContain("'account'");
    expect(rows[0].def).not.toContain("'security'");
  });

  it("the visible categories are exactly what get_my_notifications serves", async () => {
    const { rows } = await db.query<{ src: string }>(
      `SELECT prosrc AS src FROM pg_proc WHERE proname = 'my_notification_inbox_rows'`);
    const served = /n\.category IN \(([^)]*)\)/.exec(rows[0].src)![1].match(/'([a-z]+)'/g)!.map(s => s.slice(1, -1));
    expect(new Set(served)).toEqual(new Set(PLAYER_VISIBLE_CATEGORIES));
  });
});
