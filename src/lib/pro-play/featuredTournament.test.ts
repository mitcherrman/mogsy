/**
 * PW4-B — the hub's featured tournament is chosen by the event's own calendar
 * day (Los Angeles for Worlds), whatever the visitor's timezone.
 */
import { afterEach, describe, expect, it } from "vitest";

import { FEATURED_EVENTS, calendarDay, featuredTournament, type FeaturedEvent } from "./featuredTournament";

const at = (iso: string) => Date.parse(iso);
const pick = (iso: string) => featuredTournament(at(iso));

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("calendarDay", () => {
  it("reads the day in the named zone, not the process zone", () => {
    const t = at("2026-10-15T06:59:59Z");
    expect(calendarDay(t, "America/Los_Angeles")).toBe("2026-10-14");
    expect(calendarDay(t, "UTC")).toBe("2026-10-15");
    expect(calendarDay(t, "Asia/Tokyo")).toBe("2026-10-15");
  });
});

describe("featuredTournament — the 14 → 15 October switch", () => {
  it("features DCGI before 15 Oct in Los Angeles", () => {
    expect(pick("2026-10-12T18:00:00Z").event.contextId).toBe("dcgi-2026");
    // 23:59:59 on 14 Oct in Los Angeles is already 15 Oct in UTC, Europe and Asia.
    expect(pick("2026-10-15T06:59:59Z").event.contextId).toBe("dcgi-2026");
  });

  it("features Worlds from 00:00 on 15 Oct in Los Angeles", () => {
    const first = pick("2026-10-15T07:00:00Z");
    expect(first.event.contextId).toBe("worlds-2026");
    expect(first.status).toBe("current");
  });

  it("is the same answer in every visitor timezone at the boundary", () => {
    const instants = ["2026-10-14T20:00:00Z", "2026-10-15T06:59:59Z", "2026-10-15T07:00:00Z", "2026-10-15T23:00:00Z"];
    const expected = instants.map((i) => pick(i).event.contextId);
    expect(expected).toEqual(["dcgi-2026", "dcgi-2026", "worlds-2026", "worlds-2026"]);
    for (const tz of ["Pacific/Kiritimati", "Asia/Tokyo", "Europe/London", "America/New_York", "America/Los_Angeles", "Pacific/Pago_Pago"]) {
      process.env.TZ = tz;
      expect(instants.map((i) => pick(i).event.contextId)).toEqual(expected);
    }
  });
});

describe("featuredTournament — through and after Worlds", () => {
  it("keeps Worlds featured every day of the event, match day or not", () => {
    // Noon in Los Angeles on each day from 15 Oct to 14 Nov, including the
    // Play-In → Swiss gap (19–22 Oct) and Swiss → Knockout gap (1–2 Nov).
    const start = at("2026-10-15T19:00:00Z");
    for (let d = 0; d <= 30; d++) {
      const choice = featuredTournament(start + d * 86_400_000);
      expect(choice.event.contextId).toBe("worlds-2026");
      expect(choice.status).toBe("current");
    }
  });

  it("keeps Worlds as a completed archive after 14 Nov until a successor is configured", () => {
    for (const iso of ["2026-11-15T08:00:00Z", "2026-12-25T12:00:00Z", "2027-06-01T12:00:00Z"]) {
      const choice = pick(iso);
      expect(choice.event.contextId).toBe("worlds-2026");
      expect(choice.status).toBe("archive");
    }
    // The last day of the event (14 Nov in Los Angeles) is still current.
    expect(pick("2026-11-15T07:59:00Z").status).toBe("current");
  });

  it("never falls back to an expired earlier event", () => {
    const ids = new Set<string>();
    for (let t = at("2026-10-15T07:00:00Z"); t < at("2027-12-31T00:00:00Z"); t += 7 * 86_400_000) {
      ids.add(pick(new Date(t).toISOString()).event.contextId);
    }
    expect([...ids]).toEqual(["worlds-2026"]);
  });

  it("hands over to an explicitly configured successor on its own day", () => {
    const successor: FeaturedEvent = {
      contextId: "msi-2027",
      from: "2027-06-27",
      ends: "2027-07-12",
      timeZone: "Europe/Berlin",
      name: "Mid-Season Invitational 2027",
      shortName: "MSI",
      leagueSlug: "msi",
    };
    const events = [...FEATURED_EVENTS, successor];
    expect(featuredTournament(at("2027-06-26T21:59:00Z"), events).event.contextId).toBe("worlds-2026");
    expect(featuredTournament(at("2027-06-26T22:00:00Z"), events).event.contextId).toBe("msi-2027");
  });
});

describe("FEATURED_EVENTS", () => {
  it("is ordered by start day, starts from a floor, and every zone is valid", () => {
    expect(FEATURED_EVENTS[0].from).toBeNull();
    const days = FEATURED_EVENTS.slice(1).map((e) => e.from as string);
    expect([...days].sort()).toEqual(days);
    for (const e of FEATURED_EVENTS) expect(() => calendarDay(Date.now(), e.timeZone)).not.toThrow();
  });
});
