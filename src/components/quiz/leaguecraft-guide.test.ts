import { describe, expect, it } from "vitest";
import { isCompactGuideCopy, selectGuideMessage } from "@/components/mogzy-guide";
import {
  LEAGUECRAFT_GUIDE_PLACEMENT,
  ROLE_FIRST_USE_ID,
  ROLE_PICKED_ID,
  SIGNUP_GUIDE_PLACEMENT,
  buildLeaguecraftGuideMessages,
  buildSignupGuideMessage,
  leaguecraftSignupLine,
  type LeaguecraftGuideState,
} from "./leaguecraft-guide";

const STATES: LeaguecraftGuideState[] = [];
for (const offerRoleGuidance of [true, false]) {
  for (const rolePicked of [true, false]) {
    for (const playEnabled of [true, false]) {
      STATES.push({ offerRoleGuidance, rolePicked, playEnabled });
    }
  }
}

describe("buildLeaguecraftGuideMessages", () => {
  it("offers nothing to a visitor who already has a role and has not moved the stage", () => {
    expect(
      buildLeaguecraftGuideMessages({ offerRoleGuidance: false, rolePicked: false, playEnabled: true }),
    ).toEqual([]);
  });

  it("offers the first-use line once, as first-use, with substrate persistence", () => {
    const [m] = buildLeaguecraftGuideMessages({
      offerRoleGuidance: true,
      rolePicked: false,
      playEnabled: true,
    });
    expect(m).toMatchObject({
      id: ROLE_FIRST_USE_ID,
      priority: "first-use",
      text: "Pick the role you know best.",
      once: "dismiss",
    });
    // Never a sticky prompt: it expires, and expiry counts as seen.
    expect(m.ttlMs).toBeGreaterThan(0);
  });

  it("reacts to a pick with a contextual lean toward PLAY that outranks first-use", () => {
    const messages = buildLeaguecraftGuideMessages({
      offerRoleGuidance: true,
      rolePicked: true,
      playEnabled: true,
    });
    const picked = messages.find((m) => m.id === ROLE_PICKED_ID);
    expect(picked).toMatchObject({
      priority: "contextual",
      target: { direction: "down" },
    });
    expect(picked?.ttlMs).toBeGreaterThan(0);
    // It is not persisted: a reaction, not an introduction.
    expect(picked?.once).toBeUndefined();
    expect(selectGuideMessage(messages)?.id).toBe(ROLE_PICKED_ID);
  });

  it("does not point at PLAY while the host holds PLAY still", () => {
    const messages = buildLeaguecraftGuideMessages({
      offerRoleGuidance: false,
      rolePicked: true,
      playEnabled: false,
    });
    expect(messages).toEqual([]);
  });

  it("keeps every string inside the compact budget, in every state", () => {
    for (const state of STATES) {
      for (const m of buildLeaguecraftGuideMessages(state)) {
        expect(isCompactGuideCopy(m), `${m.id}: ${m.text}`).toBe(true);
      }
    }
  });

  it("never asks Mogzy to own queue, availability or navigation state", () => {
    // The state he is given carries exactly the three facts the lobby already
    // renders; there is no field through which he could decide anything else.
    expect(Object.keys(STATES[0]).sort()).toEqual(
      ["offerRoleGuidance", "playEnabled", "rolePicked"],
    );
  });
});

describe("leaguecraftSignupLine", () => {
  it("praises a solid run and stays neutral otherwise, with the same offer", () => {
    expect(leaguecraftSignupLine(4, 5)).toBe("Not bad. Want me to keep track of your progress?");
    expect(leaguecraftSignupLine(3, 5)).toBe("Not bad. Want me to keep track of your progress?");
    expect(leaguecraftSignupLine(2, 5)).toBe("Good practice. Want me to keep track of your progress?");
    expect(leaguecraftSignupLine(0, 5)).toBe("Good practice. Want me to keep track of your progress?");
    expect(leaguecraftSignupLine(0, 0)).toBe("Good practice. Want me to keep track of your progress?");
  });

  it("fits the compact budget and builds a contextual (announced) message", () => {
    for (const [score, total] of [[5, 5], [0, 5], [0, 0]] as const) {
      const m = buildSignupGuideMessage(leaguecraftSignupLine(score, total));
      expect(isCompactGuideCopy(m)).toBe(true);
      expect(m.priority).toBe("contextual");
      // No persistence: the prompt's own policy decides when it appears.
      expect(m.once).toBeUndefined();
    }
  });
});

describe("authored placements", () => {
  it("defines desktop and mobile for both surfaces", () => {
    for (const p of [LEAGUECRAFT_GUIDE_PLACEMENT, SIGNUP_GUIDE_PLACEMENT]) {
      expect(p.desktop.size).toBeTruthy();
      expect(p.mobile?.size).toBeTruthy();
    }
  });
});
