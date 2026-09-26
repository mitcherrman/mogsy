import { describe, expect, it } from "vitest";
import { ADMIN_AREAS_BY_ID } from "@/lib/admin/admin-registry";

describe("USERS2.1 guard · Users top-level information architecture", () => {
  it("contains exactly Audience, Accounts and Moderation", () => {
    expect(ADMIN_AREAS_BY_ID.users.sections.map(({ label }) => label)).toEqual([
      "Audience",
      "Accounts",
      "Moderation",
    ]);
  });

  it("does not expose the retired audience fragments as top-level sections", () => {
    const labels = ADMIN_AREAS_BY_ID.users.sections.map(({ label }) => label);
    for (const retired of [
      "Overview",
      "Visitors",
      "Activity",
      "Acquisition",
      "Retention",
      "Traffic Health",
    ]) {
      expect(labels).not.toContain(retired);
    }
  });
});
