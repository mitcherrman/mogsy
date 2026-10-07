import { describe, expect, it } from "vitest";
import { NavigationType, type Location } from "react-router-dom";
import {
  isUnfinishedPracticePhase,
  PRACTICE_LEAVE_COPY,
  shouldBlockPracticeDeparture,
  type PracticePhase,
} from "./practiceLeaveContract";

const location = (pathname: string, search = "", hash = ""): Location => ({
  pathname,
  search,
  hash,
  state: null,
  key: "test",
});

describe("Practice leave contract", () => {
  it.each<[PracticePhase, boolean]>([
    ["sets", false],
    ["loading-questions", true],
    ["active", true],
    ["result", false],
    ["error", false],
  ])("classifies %s as unfinished=%s", (phase, expected) => {
    expect(isUnfinishedPracticePhase(phase)).toBe(expected);
  });

  it("blocks route, search, and hash departures but not an identical location", () => {
    const currentLocation = location("/quiz");
    const candidate = (nextLocation: Location) => ({
      currentLocation,
      nextLocation,
      historyAction: NavigationType.Push,
    });

    expect(shouldBlockPracticeDeparture(candidate(location("/lol")))).toBe(true);
    expect(shouldBlockPracticeDeparture(candidate(location("/quiz", "?play=1")))).toBe(true);
    expect(shouldBlockPracticeDeparture(candidate(location("/quiz", "", "#history")))).toBe(true);
    expect(shouldBlockPracticeDeparture(candidate(location("/quiz")))).toBe(false);
  });

  it("owns the exact product copy", () => {
    expect(PRACTICE_LEAVE_COPY).toEqual({
      title: "Leave practice?",
      body: "This practice run can’t be resumed if you leave.",
      stayLabel: "Stay in Practice",
      leaveLabel: "Leave Practice",
    });
  });
});
