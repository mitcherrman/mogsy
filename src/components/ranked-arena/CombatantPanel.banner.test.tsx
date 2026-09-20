/**
 * RM1 Pass 2 — the duel banner, and the module-history strip inside it.
 *
 * Two things are fixed here and they are the two the presentation seam exists
 * for: Ranked gets the banner, and EVERY OTHER CALLER still gets the card it
 * had. The second is the one worth a test — the banner is visible the moment
 * anyone looks at Ranked, and a Daily Challenge column that quietly became a
 * pointed banner is exactly the regression nobody would look for.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { CombatantPanel, MODULE_HISTORY_WINDOW } from "./CombatantPanel";
import type { CombatantView, RoundHistoryEntry } from "@/lib/ranked-core/viewTypes";

const combatant = (over: Partial<CombatantView> = {}): CombatantView => ({
  playerId: "you", name: "You", tag: "Top", side: "player", classId: "tank",
  roleId: "top", identityMode: "role", score: 14,
  hp: 150, maxHp: 170, xp: 0, level: 1, nextLevelThreshold: null,
  currentLevelThreshold: 0, hasSubmitted: false, abilityWindow: null,
  hasAbilitySelected: false, ...over,
});

/** `[base, bonus]` per module, oldest first. `null` base = never scored. */
const history = (
  rows: readonly (readonly [number | null, number])[],
): RoundHistoryEntry[] => rows.map(([base, bonus], i) => ({
  roundNumber: i + 1,
  outcome: base === null ? "timed_out" : base > 0 ? "correct" : "incorrect",
  basePoints: base,
  speedBonusPoints: base === null ? null : bonus,
  pointsAwarded: base === null ? null : base + bonus,
  dealt: 0, taken: 0, absorbed: 0, hpBefore: 150, hpAfter: 150, timeExpired: false,
}));

const TEN = history([
  [2, 1], [1, 0], [0, 0], [3, 1], [2, 0], [1, 0], [2, 1], [0, 0], [3, 1], [1, 0],
]);

describe("the duel banner (presentation: banner)", () => {
  it("replaces the card's chrome rather than layering over it", () => {
    render(<CombatantPanel combatant={combatant()} presentation="banner" damage={TEN} />);
    const column = screen.getByTestId("combatant-you");
    expect(column).toHaveAttribute("data-presentation", "banner");
    expect(column.className).toContain("ranked-banner");
    // A ring and a rounded border trace a RECTANGLE; the banner's silhouette
    // comes to a point, so the card's vocabulary is dropped, not stacked.
    expect(column.className).not.toContain("rounded-xl");
    expect(column.className).not.toContain("border-2");
    expect(column.className).not.toContain("bg-card");
  });

  it("publishes side and outcome for the banner's own edge to read", () => {
    render(<CombatantPanel combatant={combatant({ side: "opponent" })}
      presentation="banner" damage={TEN} outcome="correct" />);
    const column = screen.getByTestId("combatant-you");
    expect(column).toHaveAttribute("data-side", "opponent");
    expect(column).toHaveAttribute("data-outcome", "correct");
  });

  it("keeps every part of the column the plan preserves", () => {
    render(<CombatantPanel combatant={combatant()} presentation="banner"
      progressionEnabled={false} damage={TEN} />);
    const column = screen.getByTestId("combatant-you");
    // Mascot, identity, role, score, history, answer state — all still here.
    expect(column.querySelector('[data-testid="role-crest"]')).toBeTruthy();
    expect(column).toHaveTextContent("You");
    expect(screen.getByTestId("identity-tag-you")).toHaveTextContent("Top");
    expect(screen.getByTestId("score-you")).toHaveAttribute("data-score", "14");
    expect(screen.getByTestId("module-history-you")).toBeInTheDocument();
    expect(screen.getByTestId("status-you")).toHaveTextContent("Thinking");
  });

  it("carries no internal scroller", () => {
    // The arena's standing rule: nothing inside it scrolls on its own.
    render(<CombatantPanel combatant={combatant()} presentation="banner" damage={TEN} />);
    const column = screen.getByTestId("combatant-you");
    // `getAttribute` and not `.className`: an SVG element's className is an
    // SVGAnimatedString, and the mascot crest is SVG.
    for (const el of [column, ...column.querySelectorAll("*")]) {
      expect(el.getAttribute("class") ?? "")
        .not.toMatch(/overflow-(y|x)?-?auto|overflow-scroll/);
    }
  });
});

describe("the module-history strip", () => {
  const strip = () => {
    render(<CombatantPanel combatant={combatant()} presentation="banner" damage={TEN} />);
    return screen.getByTestId("module-history-you");
  };

  it("draws one bubble per module IN THE WINDOW, in chronological order", () => {
    // Ten modules, five drawn. The strip shows the TAIL of the run — see the
    // window's own describe below for why five and what it does not touch.
    const el = strip();
    const bubbles = within(el).getAllByRole("img");
    expect(bubbles).toHaveLength(MODULE_HISTORY_WINDOW);
    expect(bubbles.map((b) => b.getAttribute("data-base-points")))
      .toEqual(["1", "2", "0", "3", "1"]);   // modules 6..10 of the fixture
  });

  it("flags exactly the modules the SERVER gave a speed bonus", () => {
    // Read against the drawn window, not the whole run.
    const el = strip();
    expect(within(el).getAllByRole("img").map((b) => b.getAttribute("data-speed-bonus")))
      .toEqual(["false", "true", "false", "true", "false"]);   // modules 6..10
  });

  it("prints the BASE, never the base plus the bonus", () => {
    const el = strip();
    // Module 7 banked three points (2 base + 1 speed) and reads +2. Module 7
    // rather than module 1 only because the strip draws the window; what is
    // being fixed here — base, never base+bonus — is unchanged.
    const bubble = within(el).getByTestId("module-bubble-you-7");
    expect(bubble).toHaveTextContent("+2");
    expect(bubble).toHaveAccessibleName("2 base points, plus 1 speed bonus");
  });

  it("is oldest-first on BOTH sides, so the two strips compare module for module",
    () => {
      // The ledger it replaces is newest-first; a strip that inherited that
      // would still have compared correctly against itself and nonsensically
      // against the opponent's row on the end screen.
      const { container } = render(
        <>
          <CombatantPanel combatant={combatant()} presentation="banner" damage={TEN} />
          <CombatantPanel combatant={combatant({ playerId: "opp", side: "opponent" })}
            presentation="banner" damage={TEN} />
        </>);
      void container;
      const order = (id: string) => within(screen.getByTestId(`module-history-${id}`))
        .getAllByRole("img").map((b) => b.getAttribute("data-base-points"));
      expect(order("you")).toEqual(order("opp"));
      // The window's OLDEST, not the run's: both columns draw modules 6..10 of
      // the fixture, so the first token is module 6 and never module 10.
      expect(order("you")[0]).toBe("1");
    });

  it("says so honestly when nothing has settled yet", () => {
    render(<CombatantPanel combatant={combatant()} presentation="banner" damage={[]} />);
    const el = screen.getByTestId("module-history-you");
    expect(el).toHaveTextContent("No modules yet");
    expect(within(el).queryAllByRole("img")).toHaveLength(0);
  });
});

describe("every other caller still gets the card", () => {
  it("defaults to the card, with the ledger and no banner chrome", () => {
    // The Daily Challenge, the staff duel, the arena inspector, the playtest
    // host and the match-over frame all pass nothing.
    render(<CombatantPanel combatant={combatant({ score: undefined })} damage={TEN} />);
    const column = screen.getByTestId("combatant-you");
    expect(column).toHaveAttribute("data-presentation", "card");
    expect(column.className).not.toContain("ranked-banner");
    expect(column.className).toContain("rounded-xl");
    expect(screen.getByTestId("combat-ledger-you")).toBeInTheDocument();
    expect(screen.queryByTestId("module-history-you")).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// RM1 — THE BANNER IS A PAINTED ASSET NOW, AND THE CSS STOPPED IMITATING ONE.
//
// The PNG carries the cloth, the gold embroidered edge, the flat top and the
// point. Every rule that used to draw those is therefore a SECOND edge printed
// next to the real one, which is why their absence is asserted here and not
// just their replacement.
// ───────────────────────────────────────────────────────────────────────────
describe("the duel banner is mounted from the approved asset", () => {
  const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
  const rules = CSS.slice(CSS.indexOf(".ranked-banner {"),
    CSS.indexOf("/* RP1 Step 4 — THE CUMULATIVE SCORE MOVING."));

  it("draws the cloth from the PNG, in two layers of the same file", () => {
    // RFX1 2B2 — the SAME artwork, re-encoded: a 768w WebP (69 KB) in place
    // of the 1.26 MB PNG. The three-zone geometry below is unchanged, and it
    // can be, because every size here is a percentage of the element rather
    // than of the file's intrinsic pixels.
    expect(rules).toContain('url("/assets/ranked/navy-banner2-768w.webp")');
    // THREE layers, because the asset has three zones and two of them are
    // rigid: a stretched rod and a stretched point both look wrong, so only
    // the cloth may give.
    expect(rules).toMatch(/\.ranked-banner::before \{[^}]*height: var\(--banner-rod\)/);
    expect(rules).toMatch(/\.ranked-banner::after \{[^}]*height: var\(--banner-point\)/);
    expect(rules).toContain("background-repeat: no-repeat");
    // The cloth rides on the element itself, clipped to the content box — the
    // one declaration that both confines the cloth to its band and seats the
    // column's content on cloth instead of over the hardware.
    expect(rules).toContain("background-clip: content-box");
    expect(rules).toContain("padding: var(--banner-rod) 0 var(--banner-point)");
  });

  it("maps the banner's sub-rects out of the untrimmed 959x1641 file", () => {
    // The asset is NOT cropped — its transparent margins are handled by this
    // arithmetic, so the file on disk stays exactly the one that was approved.
    // Rod y 25..209, cloth y 210..1333, point y 1334..1591, all mapped to the
    // rod's 667px span at x 146 — which is exactly centred, hence a clean 50%.
    // `offset / (imageSize - subRectSize)` is the position formula.
    expect(rules).toContain("background-position-x: 50%");        // 146 / (959-667)
    expect(rules).toContain("background-position-y: 1.7170%");    //   25 / (1641-185)
    expect(rules).toContain("50% 40.6190%");                      //  210 / (1641-1124)
    expect(rules).toContain("background-position-y: 96.4570%");   // 1334 / (1641-258)
    expect(rules).toContain("calc(100% * 959 / 667)");
    expect(rules).toContain("calc(100% * 1641 / 185)");
    expect(rules).toContain("calc(100% * 1641 / 1124)");
    expect(rules).toContain("calc(100% * 1641 / 258)");
  });

  it("no longer draws a silhouette, an edge, a weave or a sigil in CSS", () => {
    // Each of these existed only to imitate what the PNG now contains.
    for (const dead of [
      "clip-path",          // the five/seven-sided silhouette
      "--banner-edge",      // the gold stroke and its width
      "--banner-head",      // the chamfered shoulders
      "--banner-shoulder",
      "--banner-sigil",     // the roundel behind the mascot
      "repeating-linear-gradient", // the woven drape
    ]) {
      expect(rules, `dead banner rule still present: ${dead}`).not.toContain(dead);
    }
    // And the roundel is gone from the whole stylesheet, not just this block —
    // it was scoped to the crest, which lives outside these rules.
    expect(CSS).not.toContain('.ranked-banner [data-testid="role-crest"]');
  });

  it("says side and outcome in light, never as a border through the asset", () => {
    // The asset's gold trim IS the trim. A red opponent outline drawn over it
    // would fight the embroidery; the same fact reads fine as a glow.
    expect(rules).toContain("filter:");
    expect(rules).toContain("drop-shadow(0 0 14px var(--banner-glow))");
    for (const state of ['[data-side="opponent"]', '[data-outcome="correct"]',
      '[data-outcome="incorrect"]']) {
      expect(rules).toContain(`.ranked-banner${state} { --banner-glow:`);
    }
    expect(rules).toContain("border: 0;");
  });

  it("seats content on cloth, clear of the rod, the taper and the trim", () => {
    // The padding IS the three zones, so content cannot be seated over the rod
    // or inside the taper; and the side inset clears the embroidery.
    expect(rules).toContain("padding: var(--banner-rod) 0 var(--banner-point)");
    expect(rules).toContain("margin-inline: var(--banner-inset)");
    // 18%, against embroidery that sits 11.5% in: real air, where the earlier
    // 14% read as content touching the trim at every column width.
    expect(rules).toMatch(/--banner-inset:\s*18%/);
  });

  it("dims the banner without dimming what sits on it", () => {
    // The cloth rides on the ELEMENT's background and the element also carries
    // the column's content, so a `filter` there would dim the name, the score
    // and the bubbles along with the banner — the opposite of the point. The
    // cloth is veiled by a background layer instead; only the two pseudo-
    // elements, which carry no content, take the filter.
    expect(rules).toContain("linear-gradient(rgba(5,10,20,0.30), rgba(5,10,20,0.30))");
    expect(rules).toContain("filter: brightness(0.80) saturate(0.90) contrast(0.97)");
    // The veil is sized to the CLOTH (553 of the rod's 667), not the element —
    // full width would paint a dark rectangle out over the transparent margin.
    expect(rules).toContain("calc(100% * 553 / 667) 100%");
    // And the element's own filter stays shadows only, so content is untouched.
    expect(rules).not.toMatch(/\.ranked-banner \{[^}]*filter:[^;]*brightness/);
  });

  it("reserves every zone, so a state change moves nothing", () => {
    // A score ticking, a bubble arriving, "Thinking…" becoming a verdict —
    // each used to be only as tall as its current contents, and each moved the
    // rows beneath it. Now each zone reserves its tallest state.
    for (const [zone, rule] of [
      ["identity", /\.ranked-banner > header \{ min-height: 1\.75rem/],
      ["points", /\[data-testid\^="score-"\] \{ min-height: 3\.5rem/],
      ["bubbles", /\[data-testid\^="module-history-"\] \{ min-height: 4\.75rem/],
    ] as const) {
      expect(rules, `${zone} zone is not reserved`).toMatch(rule);
    }
    // The verdict and the neutral chips share ONE slot — and it is now a
    // FIXED bubble rather than a reserved minimum: one width, one height, one
    // radius, centred, with only the icon, the words and the accent changing.
    // The pill used to be as wide as whichever string was current, so the
    // bottom of the column changed shape three times a module.
    expect(rules).toMatch(/width:\s*10\.5rem/);
    expect(rules).toMatch(/height:\s*2\.25rem/);
    expect(rules).toMatch(/border-radius:\s*9999px/);
    expect(rules).toMatch(/margin-inline:\s*auto/);
    expect(rules).toMatch(/overflow:\s*hidden/);
  });

// ───────────────────────────────────────────────────────────────────────────
// THE RECENT-HISTORY WINDOW — presentation only.
//
// Ten tokens do not fit on this cloth. Rather than shrink them into
// illegibility or let the zone grow a row as the match went on, the banner
// draws the TAIL of the run at a fixed count, and everything upstream still
// sees every module.
// ───────────────────────────────────────────────────────────────────────────
describe("the banner shows a fixed window of recent modules", () => {
  const bubbles = () => Array.from(
    // The player-scoped prefix, deliberately: `module-bubble-speed` is the
    // dot INSIDE a bubble and would otherwise be counted as one.
    screen.getByTestId("module-history-you")
      .querySelectorAll('[data-testid^="module-bubble-you-"]'),
  ).map((el) => el.getAttribute("data-testid")!.replace("module-bubble-you-", ""));

  it("is five, fixed, and does not adapt to the column", () => {
    // Measured against the 18% safe area at the narrowest supported column
    // (~146px of cloth): six tokens plus five gaps need 23px each, below the
    // token's own `min-w-6`; five need 24px, which that column seats. A window
    // that changed size mid-match would be a second source of movement in the
    // one zone this exists to hold still.
    expect(MODULE_HISTORY_WINDOW).toBe(5);
  });

  it("draws only the most recent N, in chronological order", () => {
    render(<CombatantPanel combatant={combatant()} presentation="banner" damage={TEN} />);
    expect(bubbles()).toEqual(["6", "7", "8", "9", "10"]);
  });

  it("appends the newest and drops the oldest as the match runs", () => {
    const { rerender } = render(
      <CombatantPanel combatant={combatant()} presentation="banner"
        damage={TEN.slice(0, 4)} />);
    // Below the window every module is visible, oldest first.
    expect(bubbles()).toEqual(["1", "2", "3", "4"]);

    rerender(<CombatantPanel combatant={combatant()} presentation="banner"
      damage={TEN.slice(0, 5)} />);
    expect(bubbles()).toEqual(["1", "2", "3", "4", "5"]);

    // Full: the sixth pushes the first out, and the order never reverses.
    rerender(<CombatantPanel combatant={combatant()} presentation="banner"
      damage={TEN.slice(0, 6)} />);
    expect(bubbles()).toEqual(["2", "3", "4", "5", "6"]);

    rerender(<CombatantPanel combatant={combatant()} presentation="banner"
      damage={TEN.slice(0, 7)} />);
    expect(bubbles()).toEqual(["3", "4", "5", "6", "7"]);
  });

  it("never draws more than the window, at any length", () => {
    for (let n = 0; n <= TEN.length; n++) {
      cleanup();
      render(<CombatantPanel combatant={combatant()} presentation="banner"
        damage={TEN.slice(0, n)} />);
      expect(bubbles().length, `at ${n} modules`)
        .toBe(Math.min(n, MODULE_HISTORY_WINDOW));
    }
  });

  it("keeps the FULL run intact — the window is drawing, not trimming", () => {
    render(<CombatantPanel combatant={combatant()} presentation="banner" damage={TEN} />);
    // The strip is handed all ten and says so. Nothing here touches the
    // settlement log, `RoundHistoryEntry`, the ten-module chronology, the
    // Module Rail or what an end screen could later compare.
    expect(screen.getByTestId("module-history-you"))
      .toHaveAttribute("data-history-total", "10");
    expect(TEN).toHaveLength(10);
  });

  it("reserves the zone for two token rows, and two is also the ceiling", () => {
    // Five tokens can wrap to at most two rows: the narrowest supported cloth
    // (~146px) seats three 24px tokens and two 6px gaps with room over, so a
    // third row is unreachable rather than merely unlikely. The reserve is in
    // force from module 1, so the rows below it never move.
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    expect(css).toMatch(
      /\[data-testid\^="module-history-"\] \{ min-height: 4\.75rem/);
  });
});
});

