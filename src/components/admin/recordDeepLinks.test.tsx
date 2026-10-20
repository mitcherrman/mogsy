import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Notifications 2.0 (#92) — exact-record deep links into the moderation views.
 *
 *   /admin/users?section=moderation&view=<view>&focus=<record id>&from_notification=<notification id>
 *
 * Each view must open THAT record by its stable id — even beyond its list cap,
 * archived or hidden — highlight/expand it, mark the originating notification
 * read only once the record has opened, never resolve anything by viewing, and
 * say so plainly when the record is gone.
 */

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  feedback: [] as Row[],
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  updates: [] as { table: string; patch: unknown }[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const eqs: Array<[string, unknown]> = [];
    const ins: Array<[string, unknown[]]> = [];
    let cap: number | undefined;
    const run = () => {
      let rows = (db.tables[table] ?? [])
        .filter(r => eqs.every(([c, v]) => r[c] === v))
        .filter(r => ins.every(([c, vs]) => vs.includes(r[c])));
      if (cap != null) rows = rows.slice(0, cap);
      return { data: rows, error: null };
    };
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      order: () => b,
      not: () => b,
      eq: (c: string, v: unknown) => { eqs.push([c, v]); return b; },
      in: (c: string, vs: unknown[]) => { ins.push([c, vs]); return b; },
      limit: (n: number) => { cap = n; return b; },
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      single: async () => ({ data: run().data[0] ?? { value: null }, error: null }),
      update: (patch: unknown) => {
        db.updates.push({ table, patch });
        return { eq: async () => ({ error: null }) };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    });
    return b;
  };
  return {
    supabase: {
      from: builder,
      rpc: async (name: string, args: Record<string, unknown>) => {
        db.rpcCalls.push({ name, args });
        if (name === "admin_list_feedback") {
          return { data: db.feedback.filter(f => args._show_archived || !f.is_archived), error: null };
        }
        return { data: { applied: 1, skipped: 0 }, error: null };
      },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
    },
  };
});
vi.mock("@/components/UserAvatar", () => ({ default: ({ name }: { name: string }) => <span>{name}</span> }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

import AdminUserReports from "./AdminUserReports";
import AdminComments from "./AdminComments";
import AdminModeratorConfig from "./AdminModeratorConfig";
import AdminFeedback from "./AdminFeedback";

const go = (query: string) => window.history.pushState({}, "", `/admin/users?section=moderation&${query}`);
const readCalls = () => db.rpcCalls.filter(c => c.name === "admin_set_notification_state");
const focused = (id: string) => document.querySelector<HTMLElement>(`[data-focus-id="${id}"]`);

beforeEach(() => {
  db.tables = { public_profiles: [{ id: "p1", display_name: "Ana", avatar_url: null }] };
  db.feedback = [];
  db.rpcCalls = [];
  db.updates = [];
});
afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
});

describe("user reports", () => {
  const reports = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `ur-${i}`, reporter_profile_id: "p1", reported_profile_id: "p1", reason: "spam",
      details: null, status: i === 3 ? "resolved" : "pending", created_at: "2026-10-01T00:00:00Z",
    }));

  it("opens a report older than the 50 most recent by id, highlights it and marks its notification read", async () => {
    db.tables.user_reports = reports(60);
    go("view=reports&focus=ur-57&from_notification=n-57");
    render(<AdminUserReports />);
    await waitFor(() => expect(focused("ur-57")).not.toBeNull());
    expect(focused("ur-57")!.className).toMatch(/ring-2/);
    expect(await screen.findByTestId("record-focus-found")).toHaveTextContent(/highlighted/);
    await waitFor(() => expect(readCalls()).toEqual([
      { name: "admin_set_notification_state", args: { _ids: ["n-57"], _action: "read", _tab: null } },
    ]));
    // Viewing never resolves: no write to the report.
    expect(db.updates).toEqual([]);
  });

  it("says when the report is already resolved", async () => {
    db.tables.user_reports = reports(5);
    go("view=reports&focus=ur-3&from_notification=n-3");
    render(<AdminUserReports />);
    expect(await screen.findByTestId("record-focus-found")).toHaveTextContent(/already handled: Report resolved/);
  });

  it("explains a deleted report, links back to the notification, and leaves it unread", async () => {
    db.tables.user_reports = reports(5);
    go("view=reports&focus=ur-deleted&from_notification=n-x");
    render(<AdminUserReports />);
    const notice = await screen.findByTestId("record-focus-missing");
    expect(notice).toHaveTextContent(/could not be found/);
    expect(within(notice).getByRole("link", { name: /Back to the notification/ }).getAttribute("href")).toBe(
      "/admin/operations?section=notifications&notification=n-x",
    );
    expect(readCalls()).toEqual([]);
  });

  it("follows Back/Forward to a different record", async () => {
    db.tables.user_reports = reports(60);
    go("view=reports&focus=ur-1&from_notification=n-1");
    const view = render(<AdminUserReports />);
    await waitFor(() => expect(focused("ur-1")!.className).toMatch(/ring-2/));
    go("view=reports&focus=ur-55&from_notification=n-55");
    view.rerender(<AdminUserReports />); // the admin page re-renders on every URL change
    await waitFor(() => expect(focused("ur-55")?.className).toMatch(/ring-2/));
    expect(focused("ur-1")!.className).not.toMatch(/ring-2/);
    await waitFor(() => expect(readCalls().map(c => c.args._ids)).toEqual([["n-1"], ["n-55"]]));
  });
});

describe("comments", () => {
  it("opens an auto-hidden comment that the default list filters out", async () => {
    db.tables.comments = [
      { id: "cm-ok", profile_id: "p1", league_id: null, blog_post_id: null, content: "fine", is_hidden: false, hidden_by_admin: false, created_at: "2026-10-02T00:00:00Z" },
      { id: "cm-bad", profile_id: "p1", league_id: null, blog_post_id: null, content: "reported comment", is_hidden: true, hidden_by_admin: false, created_at: "2026-10-01T00:00:00Z" },
    ];
    go("view=comments&focus=cm-bad&from_notification=n-c");
    render(<AdminComments />);
    expect(await screen.findByText("reported comment")).toBeTruthy();
    await waitFor(() => expect(focused("cm-bad")?.className).toMatch(/ring-2/));
    await waitFor(() => expect(readCalls()[0]?.args._ids).toEqual(["n-c"]));
  });
});

describe("moderator requests", () => {
  it("opens a request older than the 50 most recent", async () => {
    db.tables.admin_notifications = Array.from({ length: 55 }, (_, i) => ({
      id: `mr-${i}`, type: "mod_delete_request", title: `Delete ${i}`, message: "please", metadata: {}, created_at: "2026-10-01T00:00:00Z", is_read: false,
    }));
    go("view=mod-config&focus=mr-54&from_notification=mr-54");
    render(<AdminModeratorConfig />);
    await waitFor(() => expect(focused("mr-54")?.className).toMatch(/ring-2/));
    await waitFor(() => expect(readCalls()[0]?.args._ids).toEqual(["mr-54"]));
  });
});

describe("feedback and question reports", () => {
  const fb = (over: Row) => ({
    id: "fb-x", profile_id: "p1", entry_intent: "question_report", type: "bug", category: "Ranked",
    title: "Incorrect answer — Ranked", body: "wrong key", status: "open", priority: "normal",
    severity: null, report_context: { kind: "question_report", v: 1, reason: "incorrect_answer", prompt: "Which item?" },
    admin_notes: "", is_archived: false, upvotes: 0, created_at: "2026-10-01T00:00:00Z", client_meta: {},
    ...over,
  });

  it("opens and expands an archived question report that the default listing hides", async () => {
    db.feedback = [fb({ id: "fb-live", title: "Live one" }), fb({ id: "fb-arch", title: "Archived one", is_archived: true, status: "completed" })];
    go("view=feedback&focus=fb-arch&from_notification=n-f");
    render(<AdminFeedback />);
    await waitFor(() => expect(focused("fb-arch")).not.toBeNull());
    expect(focused("fb-arch")!.className).toMatch(/ring-2/);
    await waitFor(() => expect(within(focused("fb-arch")!).getByTestId("feedback-plain-summary")).toBeTruthy());
    expect(await screen.findByTestId("record-focus-found")).toHaveTextContent(/already handled: Archived/);
    expect(db.rpcCalls.filter(c => c.name === "admin_list_feedback").map(c => c.args._show_archived)).toEqual([false, true]);
    await waitFor(() => expect(readCalls()[0]?.args._ids).toEqual(["n-f"]));
  });

  it("explains a deleted feedback record", async () => {
    db.feedback = [fb({ id: "fb-live" })];
    go("view=feedback&focus=fb-gone&from_notification=n-g");
    render(<AdminFeedback />);
    expect(await screen.findByTestId("record-focus-missing")).toHaveTextContent(/feedback could not be found/);
    expect(readCalls()).toEqual([]);
  });
});
