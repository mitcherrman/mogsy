/**
 * COM1-2 — one state, one word.
 *
 * The presentation map lives apart from JSX so these rules are checkable
 * without a DOM, and so a second surface cannot invent a different word for a
 * state that already has one.
 */
import { describe, expect, it } from "vitest";
import {
  presentRelationship,
  toRelationship,
  type Relationship,
} from "./relationship";

describe("toRelationship narrows an untrusted server string", () => {
  it("accepts every state the RPCs emit", () => {
    for (const s of [
      "self",
      "none",
      "outgoing",
      "incoming",
      "friends",
      "blocked",
      "unavailable",
    ]) {
      expect(toRelationship(s)).toBe(s);
    }
  });

  it("degrades anything else to `unavailable`", () => {
    // Falling through to `none` would render "Add Friend" for a state this
    // build does not understand — the most permissive possible guess.
    for (const junk of ["", "pending", "BLOCKED", null, undefined, 7, {}]) {
      expect(toRelationship(junk)).toBe("unavailable");
    }
  });
});

describe("presentRelationship", () => {
  const cases: Array<[Relationship, string, boolean]> = [
    ["none", "Add Friend", false],
    ["outgoing", "Requested", true],
    ["incoming", "Accept", false],
    ["friends", "Friends", true],
    ["blocked", "Unblock", false],
    ["self", "You", true],
    ["unavailable", "Unavailable", true],
  ];

  it.each(cases)("%s renders %s (passive: %s)", (state, label, passive) => {
    const p = presentRelationship(state);
    expect(p.label).toBe(label);
    expect(p.passive).toBe(passive);
  });

  it("an outgoing request is state, not an offer", () => {
    // The bug this prevents: showing "Add Friend" for a request already sent,
    // whose re-send the `friendships_unique_live_pair` index refuses.
    expect(presentRelationship("outgoing").action).toBe("requested");
    expect(presentRelationship("outgoing").passive).toBe(true);
  });

  it("an incoming request offers Accept, not Add Friend", () => {
    expect(presentRelationship("incoming").action).toBe("accept");
  });

  it("`unavailable` explains nothing", () => {
    // It must never grow a reason. One of the reasons is a block the viewer is
    // not entitled to know about, and a label that named ANY cause would let a
    // viewer distinguish that case from the others by elimination.
    const label = presentRelationship("unavailable").label.toLowerCase();
    expect(label).toBe("unavailable");
    expect(label).not.toContain("block");
    expect(presentRelationship("unavailable").action).toBe("none");
  });

  it("`blocked` says Unblock — it is the caller's own block, and reversible", () => {
    // This is the one place the word "block" is correct: the viewer created it,
    // so naming it discloses nothing, and the offered action is to undo it.
    expect(presentRelationship("blocked").action).toBe("unblock");
    expect(presentRelationship("blocked").passive).toBe(false);
  });

  it("only three states offer an action at all", () => {
    const actionable = (
      ["self", "none", "outgoing", "incoming", "friends", "blocked", "unavailable"] as const
    ).filter((s) => !presentRelationship(s).passive);
    expect(actionable).toEqual(["none", "incoming", "blocked"]);
  });
});
