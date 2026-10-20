import { describe, expect, it } from "vitest";
import { DECK_FACES, deckHref, deckSearch, isDeckFace, readDeckRoute } from "./route";

describe("deck route", () => {
  it("reads patch, card and face, defaulting the face", () => {
    expect(readDeckRoute(new URLSearchParams("patch=26.20&card=s-x__e-champion-vi&face=impact"))).toEqual({
      patch: "26.20",
      card: "s-x__e-champion-vi",
      face: "impact",
    });
    expect(readDeckRoute(new URLSearchParams(""))).toEqual({ patch: null, card: null, face: "overview" });
    expect(readDeckRoute(new URLSearchParams("face=bogus&card=%20"))).toEqual({ patch: null, card: null, face: "overview" });
  });

  it("serialises without defaults and round-trips", () => {
    expect(deckSearch({})).toBe("");
    expect(deckSearch({ patch: "26.20" })).toBe("?patch=26.20");
    expect(deckSearch({ patch: "26.20", card: "cover", face: "overview" })).toBe("?patch=26.20");
    const search = deckSearch({ patch: "26.20", card: "s-patch-champions__e-champion-k-sante", face: "history" });
    expect(readDeckRoute(new URLSearchParams(search))).toEqual({
      patch: "26.20",
      card: "s-patch-champions__e-champion-k-sante",
      face: "history",
    });
    expect(deckHref({ patch: "26.19" })).toBe("/dev/patch-deck?patch=26.19");
  });

  it("knows its faces", () => {
    expect(DECK_FACES).toEqual(["overview", "changes", "impact", "history", "explore"]);
    expect(isDeckFace("explore")).toBe(true);
    expect(isDeckFace("Explore")).toBe(false);
    expect(isDeckFace(null)).toBe(false);
  });
});
