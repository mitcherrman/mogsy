/**
 * MALT B1 — the Leaguecraft Record as a PARCHMENT LEDGER.
 *
 * Three claims, and they are the ones a restyle can silently break:
 *
 *  1. the material, that it is art already committed here rather than
 *     something generated, and that the torn silhouette survives;
 *  2. the CONTRAST floor — the whole reason this surface may reuse the
 *     approved parchment palette is that its crop, padding and wash keep the
 *     sheet no darker under text than the sheet those values were derived
 *     against, and that is an arithmetic claim, so it is checked as one;
 *  3. relative age everywhere, in one language, from one function.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { relativeMatchAge } from "@/components/quiz/workspace/RankedMatchRow";
import { formatSessionDate } from "@/components/quiz/workspace/StudyHistoryLedger";

const CSS = readFileSync("src/index.css", "utf8");

const SHEET_RULE = CSS.slice(
  CSS.indexOf(".lc-vellum__sheet {"),
  CSS.indexOf(".lc-vellum__content"),
);
const CONTENT_RULE = CSS.slice(
  CSS.indexOf(".lc-vellum__content"),
  CSS.indexOf(".lc-vellum .bg-card"),
);

/** WCAG relative luminance of an `#rrggbb` colour. */
function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const chan = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * chan((n >> 16) & 255) +
    0.7152 * chan((n >> 8) & 255) +
    0.0722 * chan(n & 255)
  );
}
const contrast = (ink: number, sheet: number) => (sheet + 0.05) / (ink + 0.05);

// ---------------------------------------------------------------- material

describe("the match-history parchment", () => {
  it("draws only from Ranked art already committed here", () => {
    expect(SHEET_RULE).toContain('url("/assets/ranked/parchment-match-history.png")');
    const referenced = new Set(CSS.match(/\/assets\/ranked\/[A-Za-z0-9._-]+/g) ?? []);
    for (const path of referenced) {
      expect([
        "/assets/ranked/parchment-match-history.png",
        "/assets/ranked/parchment.png",
        "/assets/ranked/play-seal.png",
        "/assets/ranked/ranked-academy-duel-bg.png",
        "/assets/ranked/ranked-vellum-texture.png",
      ]).toContain(path);
    }
  });

  it("keeps the torn silhouette instead of squaring it into a card", () => {
    // The artwork is a shaped sheet on a transparent surround, so the lift has
    // to follow its alpha; a box-shadow would cast a rectangle out of the
    // transparent corners.
    expect(SHEET_RULE).toMatch(/filter:\s*drop-shadow\(/);
    expect(SHEET_RULE).not.toMatch(/box-shadow/);
    // And the wash is MASKED, so it cannot fill the surround and square the
    // page back into a panel.
    expect(SHEET_RULE).toMatch(
      /mask-image:\s*url\("\/assets\/ranked\/parchment-match-history\.png"\)/,
    );
  });

  it("keeps ink off the burnt edge on all four sides", () => {
    // Left and right are handled by padding — CSS percentage padding is
    // width-relative on every side, which makes it exactly right for these two
    // and useless for the other two. Top and bottom are CROPPED instead.
    expect(SHEET_RULE).toMatch(/background-size:\s*100%\s*122%/);
    expect(SHEET_RULE).toMatch(/background-position:\s*center/);
    expect(CONTENT_RULE).toMatch(/padding:\s*[\d.]+rem\s+6%/);
  });
});

// ---------------------------------------------------------------- contrast

/**
 * The floor the record's ink actually sits on: `parchment-match-history.png`
 * under its 0.50 wash, sampled inside the text area the 122% crop and 6% side
 * padding leave.
 *
 * It is a GLYPH-CELL mean (14x18px, one glyph at this surface's type size)
 * rather than the darkest single pixel — a speck under one stem does not make
 * a word unreadable, and this parchment's mottling has plenty of specks. The
 * worst such cell measures rgb(219,199,161).
 */
const SHEET_FLOOR = luminance("#dbc7a1");

describe("ink on the sheet", () => {
  it("composites to a sheet no darker than the palette's own binding case", () => {
    // THE load-bearing claim. `LEAGUECRAFT_INK` was derived against
    // rgb(209,187,158); this surface may reuse it only because its worst
    // glyph-sized cell inside the text area is lighter than that.
    expect(SHEET_FLOOR).toBeGreaterThan(luminance("#d1bb9e"));
    // …and the CSS still carries the wash that measurement assumed, so the
    // number cannot quietly stop describing what is on screen.
    expect(SHEET_RULE).toContain("rgba(247, 238, 214, 0.5)");
  });

  it.each([
    ["strong", LEAGUECRAFT_INK.strong],
    ["body", LEAGUECRAFT_INK.body],
    ["faint", LEAGUECRAFT_INK.faint],
    ["heading", LEAGUECRAFT_INK.heading],
    ["brass", LEAGUECRAFT_INK.brass],
    ["accent", LEAGUECRAFT_INK.accent],
    ["rubric", LEAGUECRAFT_INK.rubric],
  ])("%s clears 4.5:1 on the sheet's darkest point under text", (_name, hex) => {
    expect(contrast(luminance(hex), SHEET_FLOOR)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["victory jade", "#1f5c3c"],
    ["defeat rubric", LEAGUECRAFT_INK.rubric],
  ])("the %s verdict ink clears 4.5:1 too", (_name, hex) => {
    // These are the two colours a reader scans a column of matches by, so they
    // are held to body-text contrast rather than to a decorative bar's.
    expect(contrast(luminance(hex), SHEET_FLOOR)).toBeGreaterThanOrEqual(4.5);
  });

  it("re-points the theme variables at the parchment ink, not at the dark plate", () => {
    const scope = CSS.slice(CSS.indexOf(".lc-vellum {"), CSS.indexOf(".lc-vellum__sheet"));
    // The dark theme's foreground is a pale gold (42 55% 90%); on paper the
    // foreground has to be the darkest ink on the sheet.
    expect(scope).toMatch(/--foreground:\s*32 64% 9%/);
    expect(scope).toMatch(/--muted-foreground:\s*31 34% 25%/);
    expect(scope).not.toMatch(/--foreground:\s*42/);
  });
});

// ------------------------------------------------------------------- time

describe("relative age", () => {
  const now = new Date(2026, 7, 22, 12, 0, 0);
  const at = (y: number, m: number, d: number, h = 12) =>
    new Date(y, m, d, h).toISOString();

  it.each([
    ["the same day", at(2026, 7, 22, 9), "Today"],
    ["late last night", at(2026, 7, 21, 23), "1d ago"],
    ["two days back", at(2026, 7, 20), "2d ago"],
    ["six days back", at(2026, 7, 16), "6d ago"],
    ["a week back", at(2026, 7, 15), "1w ago"],
    ["three weeks back", at(2026, 7, 1), "3w ago"],
    ["two months back", at(2026, 5, 22), "2mo ago"],
  ])("%s reads %s", (_label, iso, expected) => {
    expect(relativeMatchAge(iso, now)).toBe(expected);
  });

  it("treats a server clock running ahead as Today, never as the future", () => {
    expect(relativeMatchAge(at(2026, 7, 23), now)).toBe("Today");
  });

  it("says nothing rather than something wrong for an unparseable stamp", () => {
    expect(relativeMatchAge("not a date", now)).toBe("");
  });

  it("counts CALENDAR days, so 11pm yesterday is 1d ago at 1am", () => {
    const earlyMorning = new Date(2026, 7, 22, 1, 0, 0);
    expect(relativeMatchAge(at(2026, 7, 21, 23), earlyMorning)).toBe("1d ago");
  });

  it("dates Study rows in the SAME language as Ranked rows", () => {
    // One ledger. A record that printed "2d ago" on half its rows and
    // "Aug 20, 8:00 PM" on the other half would read as two ledgers — and
    // `/lol/history` mounts this same component, so the full record page
    // speaks it too rather than being kept deliberately different.
    const iso = new Date(Date.now() - 2 * 86400000).toISOString();
    expect(formatSessionDate(iso)).toBe(relativeMatchAge(iso));
    expect(formatSessionDate(iso)).not.toMatch(/\d{1,2}:\d{2}/);
    expect(formatSessionDate(iso)).not.toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/);
  });
});
