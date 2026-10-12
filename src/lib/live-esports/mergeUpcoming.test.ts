import { describe, expect, it } from "vitest";

import type { UpcomingMatch } from "./api";
import { mergeUpcoming } from "./hooks";

const m = (id: string, start: string | null) =>
  ({ match_id: id, scheduled_start: start, league: { slug: "x" } }) as unknown as UpcomingMatch;

describe("mergeUpcoming (PW1-C)", () => {
  it("dedupes by match_id and orders by start, keeping feed order for ties and unparseable starts last", () => {
    const merged = mergeUpcoming(
      [m("a", "2026-10-12T06:00:00Z"), m("c", "2026-10-15T18:00:00Z"), m("u", null)],
      [m("c", "2026-10-15T18:00:00Z"), m("b", "2026-10-13T06:00:00Z"), m("", "2026-10-13T07:00:00Z")],
    );
    expect(merged.map((x) => x.match_id)).toEqual(["a", "b", "c", "u"]);
  });

  it("is empty for empty inputs", () => {
    expect(mergeUpcoming([], [])).toEqual([]);
  });
});
