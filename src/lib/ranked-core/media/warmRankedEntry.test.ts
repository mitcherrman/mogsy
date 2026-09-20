/**
 * RFX1 Phase 2B1 — Tier 1 from the lobby: the Ranked chrome and the viewer's
 * own mascot, and nothing else.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/pages/quiz-ranked/QuizRankedPage", () => ({ default: () => null }));

import { __resetPreparedImagesForTests } from "./prepareImage";
import { RANKED_CHROME_URLS, rankedBackdropUrl } from "./rankedChrome";
import { warmRankedEntry } from "./warmRankedEntry";

let requested: string[];
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = "";
  set src(v: string) { requested.push(v.replace(window.location.origin, "")); }
  decode() { return Promise.resolve(); }
}
beforeEach(() => { requested = []; __resetPreparedImagesForTests(); vi.stubGlobal("Image", FakeImage); });
afterEach(() => vi.unstubAllGlobals());

describe("warmRankedEntry", () => {
  it("requests the persistent chrome and ONLY the viewer's own role mascot", () => {
    warmRankedEntry("adc");
    // RFX1 2B2 — the ARENA encode of the mascot, which is what the arena's
    // own <img> asks for, so the warm is a cache hit and not a second file.
    expect(requested).toEqual(expect.arrayContaining([
      rankedBackdropUrl(), ...RANKED_CHROME_URLS.slice(1), "/mascot/ranked/botmogzy-384.webp"]));
    expect(requested.filter((u) => u.includes("/mascot/"))).toEqual(["/mascot/ranked/botmogzy-384.webp"]);
    expect(requested).toHaveLength(RANKED_CHROME_URLS.length + 1);
  });

  it("dedupes against the arena's own later preparation", () => {
    warmRankedEntry("mid");
    warmRankedEntry("mid");
    expect(requested).toHaveLength(RANKED_CHROME_URLS.length + 1);
  });
});
