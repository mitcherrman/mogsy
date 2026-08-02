import { describe, expect, it } from "vitest";
import {
  formatMembershipSpan,
  formatRosterDate,
  hiddenRecordsMessage,
  sortMemberships,
  splitRoles,
  warningLabel,
} from "./roster-display";
import type { RosterMembership } from "./roster-api";

function membership(over: Partial<RosterMembership>): RosterMembership {
  return {
    membership_key: "k",
    player_page: "P",
    player_display_name: "P",
    team_page: "T",
    team_display_name: "T",
    region: null,
    role: null,
    start_date: null,
    end_date: null,
    start_precision: "day",
    end_precision: "day",
    is_active: false,
    source_url: null,
    eligibility_level: "A",
    warning_code: null,
    reason_codes: [],
    ...over,
  };
}

describe("date formatting", () => {
  it("renders an open-ended membership as ongoing rather than inventing a date", () => {
    expect(formatRosterDate(null, "open")).toBe("present");
    expect(
      formatMembershipSpan(
        membership({ start_date: "2020-11-17", end_date: null, end_precision: "open" }),
      ),
    ).toBe("2020-11-17 → present");
  });

  it("honours coarse source precision instead of implying a day", () => {
    expect(formatRosterDate("2014-06-01", "year")).toBe("2014");
    expect(formatRosterDate("2014-06-01", "month")).toBe("2014-06");
  });

  it("says unknown when the source recorded no date", () => {
    expect(formatRosterDate(null, "day")).toBe("unknown");
  });
});

describe("roles", () => {
  it("splits the source's semicolon notation", () => {
    expect(splitRoles("Jungle;Mid")).toEqual(["Jungle", "Mid"]);
  });

  it("returns nothing for a missing role rather than a placeholder role", () => {
    expect(splitRoles(null)).toEqual([]);
    expect(splitRoles("")).toEqual([]);
  });
});

describe("warning labels", () => {
  it("expands the codes the backend currently emits", () => {
    expect(warningLabel("academy_main_overlap")).toBe("Academy / main roster overlap");
    expect(warningLabel("sister_team_overlap")).toBe("Sister team overlap");
  });

  it("shows an unrecognised code verbatim rather than hiding or guessing at it", () => {
    expect(warningLabel("some_future_code")).toBe("some_future_code");
  });
});

describe("sorting", () => {
  it("orders oldest first and pushes undated rows to the end", () => {
    const rows = [
      membership({ membership_key: "c", start_date: null }),
      membership({ membership_key: "b", start_date: "2020-06-01" }),
      membership({ membership_key: "a", start_date: "2012-04-30" }),
    ];
    expect(sortMemberships(rows).map((m) => m.membership_key)).toEqual(["a", "b", "c"]);
  });

  it("is stable and does not mutate the input", () => {
    const rows = [
      membership({ membership_key: "z", start_date: "2020-01-01" }),
      membership({ membership_key: "y", start_date: "2020-01-01" }),
    ];
    const original = rows.map((m) => m.membership_key);
    expect(sortMemberships(rows).map((m) => m.membership_key)).toEqual(["y", "z"]);
    expect(rows.map((m) => m.membership_key)).toEqual(original);
  });
});

describe("withheld-record messaging", () => {
  it("says nothing when nothing is withheld", () => {
    expect(hiddenRecordsMessage(0, false)).toBeNull();
  });

  it("at Level A, explains the remainder covers both warnings and review holds", () => {
    expect(hiddenRecordsMessage(13, false)).toMatch(/13 further records are not shown by default/);
    expect(hiddenRecordsMessage(13, false)).toMatch(/some are held for internal review/);
  });

  it("agrees in number when exactly one record is withheld", () => {
    const msg = hiddenRecordsMessage(1, false) ?? "";
    expect(msg).toMatch(/1 further record is not shown by default/);
    expect(msg).not.toMatch(/record are/);
  });

  it("at Level AB, the remainder is review-held only", () => {
    expect(hiddenRecordsMessage(1, true)).toBe(
      "1 record held for internal review and not published.",
    );
  });
});
