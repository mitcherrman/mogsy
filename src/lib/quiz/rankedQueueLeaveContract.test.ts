import { describe, expect, it } from "vitest";
import { rankedQueueLeaveMode } from "./rankedQueueLeaveContract";
import type { QueueState } from "@/pages/quiz-ranked/useRankedQueue";

describe("rankedQueueLeaveMode", () => {
  it.each(["waiting", "cancelling"] satisfies QueueState[])(
    "%s remains cancellable queue ownership",
    (state) => expect(rankedQueueLeaveMode(state)).toBe("cancellable"),
  );

  it("treats pairing as committed and non-cancellable", () => {
    expect(rankedQueueLeaveMode("pairing")).toBe("committed");
  });

  it.each([
    "recovering", "selecting_class", "joining", "matched", "unavailable",
    "fatal", "reconnect_required",
  ] satisfies QueueState[])("relinquishes ownership for %s", (state) => {
    expect(rankedQueueLeaveMode(state)).toBeNull();
  });
});
