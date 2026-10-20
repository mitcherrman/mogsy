import { describe, expect, it } from "vitest";
import { ADMIN_NOTIFICATIONS_PATH, adminNotificationPermalink, adminRecordLink } from "./policy";

/**
 * Every admin notification type lands on ONE specific record, by stable id —
 * never on /admin or the bare notifications page.
 */
const CASES: Array<{ type: string; subjectType: string | null; subjectId: string | null; expect: string }> = [
  { type: "feedback (suggestion)", subjectType: "feedback", subjectId: "fb-1", expect: "/admin/users?section=moderation&view=feedback&focus=fb-1&from_notification=N" },
  { type: "feedback (question report)", subjectType: "feedback", subjectId: "fb-2", expect: "/admin/users?section=moderation&view=feedback&focus=fb-2&from_notification=N" },
  { type: "user_report", subjectType: "user_report", subjectId: "ur-1", expect: "/admin/users?section=moderation&view=reports&focus=ur-1&from_notification=N" },
  { type: "comment_report", subjectType: "comment", subjectId: "cm-1", expect: "/admin/users?section=moderation&view=comments&focus=cm-1&from_notification=N" },
  { type: "mod_delete_request", subjectType: "mod_request", subjectId: "N", expect: "/admin/users?section=moderation&view=mod-config&focus=N&from_notification=N" },
  { type: "image_report", subjectType: "image", subjectId: "img-1", expect: "/admin/operations?section=notifications&notification=N" },
  { type: "image_report_critical", subjectType: "image", subjectId: "img-1", expect: "/admin/operations?section=notifications&notification=N" },
  { type: "system / platform notice", subjectType: null, subjectId: null, expect: "/admin/operations?section=notifications&notification=N" },
];

describe("adminRecordLink", () => {
  for (const c of CASES) {
    it(`${c.type} → a specific record`, () => {
      const { href } = adminRecordLink({ id: "N", subjectType: c.subjectType, subjectId: c.subjectId });
      expect(href).toBe(c.expect);
      expect(href).not.toBe("/admin");
      expect(href).not.toBe(ADMIN_NOTIFICATIONS_PATH);
    });
  }

  it("sends a notification whose record was deleted to its own permalink, which explains it", () => {
    const link = adminRecordLink({ id: "N", subjectType: "comment", subjectId: "cm-1", resolution: "subject_deleted" });
    expect(link).toMatchObject({ href: adminNotificationPermalink("N"), kind: "notification" });
  });

  it("encodes ids rather than trusting them", () => {
    expect(adminRecordLink({ id: "a&b", subjectType: "feedback", subjectId: "x y" }).href).toBe(
      "/admin/users?section=moderation&view=feedback&focus=x%20y&from_notification=a%26b",
    );
  });
});
