import { describe, expect, it } from "vitest";

import {
  cardAnchors,
  changeAnchor,
  entityAnchor,
  groupAnchor,
  reportEntityAnchors,
  sectionAnchor,
  slugifySegment,
} from "./semantic-ids";
import { mkCard, mkChange } from "./test-fixtures";

const URL_SAFE = /^[a-z0-9_-]+$/;

describe("slugifySegment", () => {
  it("is lowercase ASCII, hyphen-collapsed and URL safe", () => {
    expect(slugifySegment("Kai'Sa")).toBe("kai-sa");
    expect(slugifySegment("Nunu & Willump")).toBe("nunu-and-willump");
    expect(slugifySegment("Bel'Veth")).toBe("bel-veth");
    expect(slugifySegment("Renata Glasc")).toBe("renata-glasc");
    expect(slugifySegment("  Q — Spell / Cost! ")).toBe("q-spell-cost");
    expect(slugifySegment("Cho’Gath")).toBe("cho-gath");
    expect(slugifySegment("Nautilus Ünïcode")).toBe("nautilus-unicode");
    expect(slugifySegment(null)).toBe("");
    expect(slugifySegment("日本語")).toBe("");
  });
});

describe("semantic anchors", () => {
  const ahri = mkCard("Ahri", {
    changes: [
      mkChange({ group_title: "Base Stats", property_name: "Base health" }),
      mkChange({ group_title: "Q - Orb of Deception", ability_slot: "Q", property_name: "Damage" }),
    ],
  });

  it("builds the four-level grammar from structured fields", () => {
    expect(sectionAnchor(ahri)).toBe("s-patch-champions");
    expect(entityAnchor(ahri)).toBe("s-patch-champions__e-champion-ahri");
    expect(groupAnchor(ahri, ahri.changes[1])).toBe("s-patch-champions__e-champion-ahri__g-q");
    expect(changeAnchor(ahri, ahri.changes[1])).toBe(
      "s-patch-champions__e-champion-ahri__g-q__c-damage",
    );
    // No slot → group title is the key.
    expect(groupAnchor(ahri, ahri.changes[0])).toBe("s-patch-champions__e-champion-ahri__g-base-stats");
  });

  it("every id is URL-safe and every child is prefixed by its parent", () => {
    const a = cardAnchors(ahri);
    for (const id of [a.entity, ...a.changes.flatMap((c) => [c.group, c.change])]) {
      expect(id).toMatch(URL_SAFE);
      expect(encodeURIComponent(id)).toBe(id);
    }
    a.changes.forEach((c) => {
      expect(c.group.startsWith(a.entity + "__g-")).toBe(true);
      expect(c.change.startsWith(c.group + "__c-")).toBe(true);
    });
  });

  it("is independent of db ids, prose, before/after values and display text of unrelated fields", () => {
    const other = mkCard("Ahri", {
      id: 99999,
      context_text: "Completely different rationale.",
      aggregate_status: "mismatch",
      changes: [
        mkChange({ group_title: "Base Stats", property_name: "Base health", before_raw: "1", after_raw: "2", detail_text: "x" }),
        mkChange({
          group_title: "Q - Renamed Orb",
          ability_slot: "Q",
          property_name: "Damage",
          before_raw: "9",
          after_raw: "8",
        }),
      ],
    });
    expect(cardAnchors(other)).toEqual(cardAnchors(ahri));
  });

  it("is deterministic across repeated calls", () => {
    expect(cardAnchors(ahri)).toEqual(cardAnchors(ahri));
  });

  it("separates the same champion in different official sections", () => {
    const classic = mkCard("Ahri", { section_id: "patch-classic", section_title: "Classic" });
    expect(entityAnchor(classic)).not.toBe(entityAnchor(ahri));
  });

  it("separates entity types that share a name", () => {
    const rune = mkCard("Electrocute", { entity_type: "rune", section_id: "patch-runes" });
    const item = mkCard("Electrocute", { entity_type: "item", section_id: "patch-runes" });
    expect(entityAnchor(rune)).not.toBe(entityAnchor(item));
  });

  it("falls back to the section title when section_id is empty", () => {
    const c = mkCard("Ahri", { section_id: "", section_title: "ARAM: Mayhem" });
    expect(sectionAnchor(c)).toBe("s-aram-mayhem");
  });

  it("disambiguates repeated changes by occurrence order without renaming the first", () => {
    const dup = mkCard("Zed", {
      changes: [
        mkChange({ group_title: "W", ability_slot: "W", property_name: "Cooldown" }),
        mkChange({ group_title: "W", ability_slot: "W", property_name: "Cooldown" }),
        mkChange({ group_title: "W", ability_slot: "W", property_name: "Cooldown" }),
      ],
    });
    const ids = cardAnchors(dup).changes.map((c) => c.change);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0].endsWith("__c-cooldown")).toBe(true);
    expect(ids[1].endsWith("__c-cooldown-2")).toBe(true);
    expect(ids[2].endsWith("__c-cooldown-3")).toBe(true);
    // Appending a later duplicate never renames earlier anchors.
    const shorter = { ...dup, changes: dup.changes.slice(0, 2) };
    expect(cardAnchors(shorter).changes.map((c) => c.change)).toEqual(ids.slice(0, 2));
  });

  it("falls back for blank structured labels instead of emitting empty segments", () => {
    const c = mkCard("Ahri", { changes: [mkChange({ group_title: "", ability_slot: null, property_name: "" })] });
    const [{ group, change }] = cardAnchors(c).changes;
    expect(group.endsWith("__g-general")).toBe(true);
    expect(change.endsWith("__c-change")).toBe(true);
  });

  it("resolves entity slug collisions across a report and keeps children under the parent", () => {
    const a = mkCard("Nunu & Willump");
    const b = mkCard("Nunu and Willump");
    const [ida, idb] = reportEntityAnchors([a, b]);
    expect(ida).not.toBe(idb);
    expect(cardAnchors(b, idb).changes[0].change.startsWith(idb + "__g-")).toBe(true);
  });

  it("tolerates a payload with no changes array", () => {
    const c = { ...mkCard("Ahri"), changes: undefined as never };
    expect(cardAnchors(c).changes).toEqual([]);
  });
});
