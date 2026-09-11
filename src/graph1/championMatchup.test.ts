/**
 * The pair URL contract. Parsing is TOTAL — every case here is a hand-edited
 * URL, and none of them may throw, half-resolve, or silently become a
 * different matchup.
 */
import { describe, expect, it } from "vitest";

import {
  championMatchupHref,
  championMatchupUrl,
  isMatchupFocus,
  matchupPct,
  matchupTitle,
  parseChampionPair,
} from "./championMatchup";

const params = (search: string) => new URLSearchParams(search);

describe("pair mode is entered by focus alone", () => {
  it("recognises focus=matchup", () => {
    expect(isMatchupFocus(params("focus=matchup&a=olaf&b=ksante"))).toBe(true);
  });

  it("leaves every existing single-entity focus alone", () => {
    for (const focus of ["player", "team", "champion", "", "nonsense"]) {
      expect(isMatchupFocus(params(`focus=${focus}&e=azir`))).toBe(false);
    }
  });
});

describe("the pair a URL asks for", () => {
  it("reads a well-formed pair", () => {
    expect(parseChampionPair(params("a=olaf&b=ksante"))).toEqual({
      status: "ready",
      subject: "olaf",
      opponent: "ksante",
    });
  });

  it("keeps the subject first — order is meaning, not sorting", () => {
    const forward = parseChampionPair(params("a=olaf&b=ksante"));
    const reverse = parseChampionPair(params("a=ksante&b=olaf"));
    expect(forward).toEqual({ status: "ready", subject: "olaf", opponent: "ksante" });
    expect(reverse).toEqual({ status: "ready", subject: "ksante", opponent: "olaf" });
  });

  it("names a missing side rather than guessing one", () => {
    expect(parseChampionPair(params("a=olaf")).status).toBe("incomplete");
    expect(parseChampionPair(params("b=ksante")).status).toBe("incomplete");
    expect(parseChampionPair(params("")).status).toBe("incomplete");
  });

  it("refuses a champion against itself", () => {
    expect(parseChampionPair(params("a=olaf&b=olaf"))).toEqual({
      status: "same-champion",
      subject: "olaf",
    });
    // Casing is not identity, so it is folded before the comparison.
    expect(parseChampionPair(params("a=Olaf&b=olaf")).status).toBe("same-champion");
  });

  it("accepts every punctuation-heavy champion as its slug", () => {
    for (const slug of ["ksante", "dr-mundo", "chogath", "kaisa", "leblanc",
                        "aurelion-sol", "belveth", "nunu-willump"]) {
      expect(parseChampionPair(params(`a=${slug}&b=olaf`)).status).toBe("ready");
    }
  });

  it("rejects everything that is not a slug, without throwing", () => {
    for (const bad of ["<script>", "../../etc/passwd", "olaf%2Cksante", "-olaf",
                       "olaf--sol", "a".repeat(41), "olaf:bans", "olaf!"]) {
      const state = parseChampionPair(
        new URLSearchParams([["a", bad], ["b", "ksante"]]),
      );
      expect(state.status).toBe("incomplete");
    }
  });

  it("treats casing and stray whitespace as presentation, not identity", () => {
    // The same rule Step 10's Combat Lab link already applies: neither is
    // part of what a champion IS, so neither is a reason to refuse a link.
    expect(parseChampionPair(new URLSearchParams([["a", " Olaf "], ["b", "KSante"]])))
      .toEqual({ status: "ready", subject: "olaf", opponent: "ksante" });
  });
});

describe("the links", () => {
  it("carries the two champions and nothing else", () => {
    expect(championMatchupHref("olaf", "ksante")).toBe(
      "/lol/pro-play/graphs?focus=matchup&a=olaf&b=ksante",
    );
  });

  it("round-trips through the parser", () => {
    const href = championMatchupHref("dr-mundo", "chogath");
    const search = new URLSearchParams(href.split("?")[1]);
    expect(isMatchupFocus(search)).toBe(true);
    expect(parseChampionPair(search)).toEqual({
      status: "ready",
      subject: "dr-mundo",
      opponent: "chogath",
    });
  });

  it("carries a scope when one is supplied, and none when it is not", () => {
    const scoped = championMatchupHref("olaf", "ksante", {
      major: true,
      league: "LoL Champions Korea",
    });
    expect(scoped).toContain("major=1");
    expect(scoped).toContain("league=LoL+Champions+Korea");
    expect(championMatchupHref("olaf", "ksante")).not.toContain("major");
  });

  it("asks the backend for the pair under the scope", () => {
    const url = championMatchupUrl("https://api.test", "olaf", "ksante", {
      major: true,
    });
    expect(url).toContain("/api/graph1/champion-matchup?");
    expect(url).toContain("a=olaf");
    expect(url).toContain("b=ksante");
    // `scopeQuery` is the request spelling and `writeScope` the URL spelling;
    // this uses the request one, exactly as `datasetUrl` does.
    expect(url).toContain("major=true");
  });
});

describe("figures", () => {
  it("prints a rate, and never prints an absent one as zero", () => {
    expect(matchupPct(0.5426)).toBe("54.3%");
    expect(matchupPct(0)).toBe("0.0%");
    expect(matchupPct(null)).toBe("—");
    expect(matchupPct(undefined)).toBe("—");
  });

  it("titles the matchup subject-first", () => {
    expect(matchupTitle("Olaf", "K'Sante")).toBe("Olaf vs K'Sante");
  });
});
