import { describe, expect, it } from "vitest";
import {
  emailBadge, emailDetailLine, isReachable, parseEmailSubscriptionRows, type AdminEmailSub,
} from "./email-subscriptions";

const sub = (o: Partial<AdminEmailSub> = {}): AdminEmailSub => ({
  status: "subscribed", topics: ["events"], pendingTopics: [], confirmedAt: null, addressCurrent: true, suppressed: false, ...o,
});

describe("parseEmailSubscriptionRows", () => {
  it("maps good rows and ignores everything malformed", () => {
    const out = parseEmailSubscriptionRows([
      { user_id: "u1", status: "subscribed", topics: ["events", "bogus"], pending_topics: [], confirmed_at: "2026-01-01", suppressed: false, address_current: true },
      { user_id: "u2", status: "weird" },
      { id: "feedback-row", title: "not a subscription" },
      null, 7, "x",
    ]);
    expect(Object.keys(out)).toEqual(["u1"]);
    expect(out.u1.topics).toEqual(["events"]);
    expect(parseEmailSubscriptionRows(null)).toEqual({});
    expect(parseEmailSubscriptionRows({})).toEqual({});
  });
});

describe("badges and reachability", () => {
  it("only a confirmed, current, unsuppressed subscription is reachable", () => {
    expect(isReachable(sub())).toBe(true);
    expect(isReachable(sub({ addressCurrent: false }))).toBe(false);
    expect(isReachable(sub({ suppressed: true }))).toBe(false);
    expect(isReachable(sub({ status: "pending", topics: [] }))).toBe(false);
    expect(isReachable(sub({ status: "unsubscribed", topics: [] }))).toBe(false);
    expect(isReachable(undefined)).toBe(false);
  });

  it("badges: subscribers, pending, suppressed; nothing for opted-out or none", () => {
    expect(emailBadge(sub())).toEqual({ label: "Newsletter", tone: "primary" });
    expect(emailBadge(sub({ addressCurrent: false }))?.tone).toBe("warning");
    expect(emailBadge(sub({ status: "pending", topics: [], pendingTopics: ["events"] }))?.label).toBe("Email pending");
    expect(emailBadge(sub({ status: "suppressed", topics: [] }))?.label).toBe("Email suppressed");
    expect(emailBadge(sub({ suppressed: true }))?.label).toBe("Email suppressed");
    expect(emailBadge(sub({ status: "unsubscribed", topics: [] }))).toBeNull();
    expect(emailBadge(undefined)).toBeNull();
  });

  it("describes each state in one line for the detail header", () => {
    expect(emailDetailLine(undefined)).toBe("Not subscribed to email");
    expect(emailDetailLine(sub({ topics: ["daily_reminder", "events"] }))).toBe("Subscribed: Daily Challenge reminders, Mogzy and League of Legends events");
    expect(emailDetailLine(sub({ addressCurrent: false }))).toMatch(/not mailable/);
    expect(emailDetailLine(sub({ status: "pending", topics: [], pendingTopics: ["promotions"] }))).toBe("Awaiting confirmation: Mogzy offers and promotions");
    expect(emailDetailLine(sub({ status: "unsubscribed", topics: [] }))).toBe("Unsubscribed");
    expect(emailDetailLine(sub({ status: "suppressed", topics: [] }))).toMatch(/never mailed/);
  });
});
