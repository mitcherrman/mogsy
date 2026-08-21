/**
 * LC1 — the Ranked emblem component.
 *
 * Three things are under test and they are different in kind.
 *
 * The SEMANTIC contract is what every other Ranked surface reads: `data-tier`
 * means "this account HAS this rank" and `data-baseline` means "this is the
 * ladder's floor, not an award". It is unchanged by this pass and it is the
 * part that must never bend.
 *
 * The PRESENTATION contract is new, and it deliberately no longer follows the
 * semantic one: light is governed by `emphasis`, not by `earned`, so the
 * lobby's placement Bronze is allowed to be the most radiant emblem on the
 * page. What the tests below hold is the ORDER — ceremonial > standard >
 * quiet, at every tier and in both states — rather than any single value.
 *
 * The CSS contract is the two ladders and the reduced-motion escape, which
 * live in `index.css` and cannot be observed from jsdom — so they are
 * asserted against the stylesheet source, the same way the parchment shell's
 * invariants already are.
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import RankEmblem, {
  DEFAULT_EMPHASIS,
  type RankEmblemEmphasis,
  type RankEmblemVariant,
} from "./RankEmblem";
import { RANK_TIERS, type RankTier } from "@/lib/progression/tiers";

afterEach(cleanup);

/**
 * The reduced-motion block that actually governs THIS component.
 *
 * Anchored on a selector the block must contain, not on `lastIndexOf` — index.css
 * carries a dozen `prefers-reduced-motion` blocks and "the last one" is whichever
 * feature appended CSS most recently, which is not a fact about this component.
 */
const reducedMotionBlockContaining = (css: string, anchor: string): string => {
  const starts = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)/g)].map(
    (m) => m.index as number,
  );
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const block = css.slice(starts[i], starts[i + 1] ?? css.length);
    if (block.includes(anchor)) return block;
  }
  throw new Error(`no reduced-motion block contains ${anchor}`);
};

describe("RankEmblem — earned vs baseline", () => {
  it("marks an earned tier with data-tier, on the wrapper AND the art", () => {
    const { container } = render(<RankEmblem tier="gold" earned alt="Gold ranked emblem" />);
    expect(container.querySelector('.lc-emblem[data-tier="gold"]')).toBeTruthy();
    expect(container.querySelector('img[data-tier="gold"]')).toBeTruthy();
    expect(container.querySelector("[data-baseline]")).toBeNull();
  });

  it("marks a baseline as a baseline and never as an awarded tier", () => {
    const { container } = render(<RankEmblem tier="bronze" earned={false} alt="baseline" />);
    expect(container.querySelector('img[data-baseline="bronze"]')).toBeTruthy();
    // `data-tier` is the claim "this rank was won". The baseline has not been.
    expect(container.querySelector("[data-tier]")).toBeNull();
  });

  it("never carries the tint as an inline filter, which a stylesheet cannot beat", () => {
    // The baseline tint lives in `index.css` keyed on `[data-baseline]`. It
    // was an inline `style.filter` for one pass, and that inline value
    // silently overwrote the ceremonial emblem's glow — an inline filter
    // beats every rule in the sheet, so the two could not compose.
    const { container } = render(<RankEmblem tier="bronze" earned={false} alt="baseline" />);
    expect(container.querySelector<HTMLImageElement>("img")!.style.filter).toBe("");
  });

  it("gives an earned emblem its effect layers", () => {
    const { container } = render(
      <RankEmblem tier="diamond" earned variant="hero" alt="Diamond ranked emblem" />,
    );
    expect(container.querySelector(".lc-emblem__halo")).toBeTruthy();
    expect(container.querySelector(".lc-emblem__glint")).toBeTruthy();
    expect(container.querySelectorAll(".lc-emblem__spark").length).toBeGreaterThan(0);
  });

  it("lights a ceremonial BASELINE exactly as fully as a ceremonial earned rank", () => {
    // The direction reversal, as an assertion. The lobby's placement Bronze
    // is the page's focal emblem and it must not be a dimmed placeholder;
    // what marks it unearned is `data-baseline` and its own tint, never the
    // absence of a highlight.
    const { container } = render(
      <RankEmblem tier="bronze" earned={false} variant="hero" alt="baseline" />,
    );
    expect(container.querySelector(".lc-emblem__halo")).toBeTruthy();
    expect(container.querySelector(".lc-emblem__glint")).toBeTruthy();
    expect(container.querySelectorAll(".lc-emblem__spark").length).toBeGreaterThan(0);
    // ...and it is STILL not an awarded tier. Both halves matter.
    expect(container.querySelector("[data-tier]")).toBeNull();
  });

  it("withholds travelling light at compact size, earned or not", () => {
    // A 16px token cannot carry a sweep or a spark; at that size they are
    // single pixels of noise. Structural, not stylistic: the layers are
    // absent from the DOM, so no CSS rule can switch them back on.
    for (const earned of [true, false]) {
      const { container } = render(
        <RankEmblem tier="challenger" earned={earned} variant="compact" decorative />,
      );
      expect(container.querySelector('.lc-emblem[data-variant="compact"]')).toBeTruthy();
      expect(container.querySelector('.lc-emblem[data-emphasis="quiet"]')).toBeTruthy();
      expect(container.querySelector(".lc-emblem__halo")).toBeTruthy();
      expect(container.querySelector(".lc-emblem__glint")).toBeNull();
      expect(container.querySelector(".lc-emblem__spark")).toBeNull();
      cleanup();
    }
  });
});

describe("RankEmblem — the emphasis axis", () => {
  it("takes its emphasis from the variant when the caller does not say", () => {
    for (const [variant, level] of Object.entries(DEFAULT_EMPHASIS)) {
      const { container } = render(
        <RankEmblem tier="gold" earned variant={variant as RankEmblemVariant} decorative />,
      );
      expect(container.querySelector<HTMLElement>(".lc-emblem")!.dataset.emphasis).toBe(level);
      cleanup();
    }
  });

  it("lets a site disagree with its variant's default — the whole point of two axes", () => {
    // A hero-size emblem that is not the subject of its page. Before the
    // split this was unsayable: "hero" meant both sizes and both intensities.
    const { container } = render(
      <RankEmblem tier="gold" earned variant="hero" emphasis="quiet" decorative />,
    );
    const wrapper = container.querySelector<HTMLElement>(".lc-emblem")!;
    expect(wrapper.dataset.variant).toBe("hero");
    expect(wrapper.dataset.emphasis).toBe("quiet");
    expect(container.querySelector(".lc-emblem__glint")).toBeNull();
  });

  it("ranks the emphases: ceremonial > standard > quiet, in moving layers", () => {
    const moving = (level: RankEmblemEmphasis) => {
      const { container } = render(
        <RankEmblem tier="challenger" earned variant="hero" emphasis={level} decorative />,
      );
      const n =
        container.querySelectorAll(".lc-emblem__glint").length +
        container.querySelectorAll(".lc-emblem__spark").length;
      cleanup();
      return n;
    };
    expect(moving("ceremonial")).toBeGreaterThan(moving("standard"));
    expect(moving("standard")).toBeGreaterThan(moving("quiet"));
    expect(moving("quiet")).toBe(0);
  });

  it("makes sparks the ceremonial signature — nothing else has them, at any tier", () => {
    // The layer set IS the hierarchy: quiet = halo, standard = halo + glint,
    // ceremonial = halo + glint + sparks. Structural, so it still holds at
    // Bronze, whose tier spark count is one and which would otherwise have
    // left the two top emphases carrying identical DOM.
    for (const tier of RANK_TIERS) {
      const { container } = render(<RankEmblem tier={tier} earned variant="standard" decorative />);
      expect(container.querySelector(".lc-emblem__glint")).toBeTruthy();
      expect(container.querySelectorAll(".lc-emblem__spark").length).toBe(0);
      cleanup();

      const hero = render(<RankEmblem tier={tier} earned variant="hero" decorative />).container;
      expect(hero.querySelectorAll(".lc-emblem__spark").length).toBeGreaterThan(0);
      cleanup();
    }
  });

  it("holds still when the caller asks it to, without losing its light", () => {
    // `animated={false}` is for surfaces CSS cannot see — a screenshot
    // harness, a print sheet. The halo is light, not motion: it stays.
    const { container } = render(
      <RankEmblem tier="challenger" earned variant="hero" animated={false} decorative />,
    );
    expect(container.querySelector(".lc-emblem__halo")).toBeTruthy();
    expect(container.querySelector(".lc-emblem__glint")).toBeNull();
    expect(container.querySelector(".lc-emblem__spark")).toBeNull();
  });
});

describe("RankEmblem — the intensity ladder", () => {
  const SPARKS: Record<RankTier, number> = {
    bronze: 1,
    silver: 1,
    gold: 2,
    diamond: 2,
    challenger: 3,
  };

  it.each(RANK_TIERS)("gives %s its own spark count, and never more than three", (tier) => {
    const { container } = render(
      <RankEmblem tier={tier} earned variant="hero" alt={`${tier} emblem`} />,
    );
    const sparks = container.querySelectorAll(".lc-emblem__spark");
    expect(sparks.length).toBe(SPARKS[tier]);
    expect(sparks.length).toBeLessThanOrEqual(3);
  });

  it("staggers the sparks so two never fire together", () => {
    const { container } = render(
      <RankEmblem tier="challenger" earned variant="hero" alt="Challenger emblem" />,
    );
    const delays = Array.from(container.querySelectorAll<HTMLElement>(".lc-emblem__spark")).map(
      (s) => s.style.animationDelay,
    );
    expect(delays.length).toBe(3);
    expect(new Set(delays).size).toBe(3);
  });

  it("climbs the ladder, never dips", () => {
    const counts = RANK_TIERS.map((tier) => {
      const { container } = render(<RankEmblem tier={tier} earned variant="hero" alt={tier} />);
      const n = container.querySelectorAll(".lc-emblem__spark").length;
      cleanup();
      return n;
    });
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });
});

describe("RankEmblem — art resolution and failure", () => {
  it("hands the glint the art it must be masked to", () => {
    // Unmasked, the sweep crosses a rectangle instead of the metal.
    const { container } = render(<RankEmblem tier="gold" earned alt="Gold emblem" />);
    const wrapper = container.querySelector<HTMLElement>(".lc-emblem")!;
    const art = wrapper.style.getPropertyValue("--lc-emblem-art");
    expect(art).toContain("url(");
    expect(art).toContain("gold");
  });

  it("steps down to the caller's legacy art when the tier art fails", () => {
    const { container } = render(
      <RankEmblem tier="bronze" earned={false} alt="baseline" fallbackSrc="/legacy/unranked.png" />,
    );
    const img = container.querySelector<HTMLImageElement>("img")!;
    fireEvent.error(img);
    expect(container.querySelector<HTMLImageElement>("img")!.getAttribute("src")).toBe(
      "/legacy/unranked.png",
    );
  });

  it("renders the caller's fallback node once there is no art left — never a hole", () => {
    const { container } = render(
      <RankEmblem tier="bronze" earned alt="Bronze emblem" fallback={<i data-testid="fb" />} />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector('[data-testid="fb"]')).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("does not retry the same failing source in a loop", () => {
    const { container } = render(
      <RankEmblem tier="bronze" earned alt="Bronze emblem" fallbackSrc="/legacy/unranked.png" />,
    );
    fireEvent.error(container.querySelector("img")!);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
  });

  it("declines to alpha-mask cross-origin art, which would delete the glint", () => {
    // The emblems are served by the combat backend on another origin, and a
    // cross-origin `mask-image` fails CORS and renders the layer as nothing.
    const { container } = render(<RankEmblem tier="gold" earned alt="Gold emblem" />);
    const wrapper = container.querySelector<HTMLElement>(".lc-emblem")!;
    expect(wrapper.getAttribute("src")).toBeNull();
    expect(wrapper.dataset.mask).toBe("off");
    // The glint layer is still THERE — it is the mask that is withheld, not
    // the highlight.
    expect(container.querySelector(".lc-emblem__glint")).toBeTruthy();
  });

  it("masks the glint the moment the art is same-origin", () => {
    const { container } = render(
      <RankEmblem tier="gold" earned alt="Gold emblem" fallbackSrc="/images/ranked/gold.png" />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector<HTMLElement>(".lc-emblem")!.dataset.mask).toBe("alpha");
  });

  it("is decorative when an adjacent label already names the tier", () => {
    const { container } = render(<RankEmblem tier="gold" earned variant="compact" decorative />);
    const img = container.querySelector<HTMLImageElement>("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("the emblem's CSS invariants", () => {
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

  it("gives every tier its own intensity, and never its own hue", () => {
    // The art carries the tier's identity. Recolouring the light on top of it
    // says the same thing twice, in two voices.
    for (const tier of RANK_TIERS) {
      const rule = css.match(new RegExp(`\\.lc-emblem\\[data-tier="${tier}"\\]\\s*\\{([^}]*)\\}`));
      expect(rule, `no intensity block for ${tier}`).toBeTruthy();
      const body = rule![1];
      expect(body).toContain("--lc-emblem-halo");
      expect(body).toContain("--lc-emblem-glint");
      expect(body).toContain("--lc-emblem-cadence");
      // Hue is set once, on `.lc-emblem` and the baseline. Never per tier.
      expect(body).not.toContain("--lc-emblem-core");
    }
  });

  it("keeps every glint cadence rare — 9s to 13s, never a shimmer", () => {
    const cadences = [...css.matchAll(/--lc-emblem-cadence:\s*([\d.]+)s/g)].map((m) =>
      Number(m[1]),
    );
    expect(cadences.length).toBeGreaterThanOrEqual(RANK_TIERS.length);
    for (const c of cadences) {
      expect(c).toBeGreaterThanOrEqual(9);
      expect(c).toBeLessThanOrEqual(13);
    }
  });

  it("climbs the halo and the glint together, tier by tier", () => {
    const read = (tier: string, prop: string) => {
      const rule = css.match(new RegExp(`\\.lc-emblem\\[data-tier="${tier}"\\]\\s*\\{([^}]*)\\}`))![1];
      return Number(rule.match(new RegExp(`${prop}:\\s*([\\d.]+)`))![1]);
    };
    for (let i = 1; i < RANK_TIERS.length; i += 1) {
      expect(read(RANK_TIERS[i], "--lc-emblem-halo")).toBeGreaterThan(
        read(RANK_TIERS[i - 1], "--lc-emblem-halo"),
      );
      expect(read(RANK_TIERS[i], "--lc-emblem-glint")).toBeGreaterThan(
        read(RANK_TIERS[i - 1], "--lc-emblem-glint"),
      );
      expect(read(RANK_TIERS[i], "--lc-emblem-cadence")).toBeLessThan(
        read(RANK_TIERS[i - 1], "--lc-emblem-cadence"),
      );
    }
  });

  it("never masks the glint unconditionally — a failed mask deletes the layer", () => {
    // `mask-image` obeys CORS and the emblems are served cross-origin without
    // the header. Chrome does not fall back to "no mask" — it renders the
    // masked element as NOTHING, which would silently remove the glint from
    // every earned rank in production.
    const start = css.indexOf(".lc-emblem__glint {");
    const base = css.slice(start, css.indexOf("}", start));
    expect(base).not.toContain("mask-image");
    // The round clip is the floor, and it is unconditional: with no mask the
    // highlight is still an object rather than a rectangle.
    expect(base).toContain("overflow: hidden");
    expect(base).toContain("border-radius: 50%");
  });

  it("keeps the masked version reachable, for same-origin art", () => {
    const masked = css.slice(
      css.indexOf('.lc-emblem[data-mask="alpha"] .lc-emblem__glint {'),
      css.indexOf(".lc-emblem__glint::after"),
    );
    expect(masked).toContain("mask-image: var(--lc-emblem-art)");
    expect(masked).toContain("-webkit-mask-image: var(--lc-emblem-art)");
  });

  it("climbs the emphasis ladder — one multiplier, three steps, one direction", () => {
    // Emphasis is a SCALAR over the tier's own numbers, not a second table.
    // That is what keeps a Challenger chip quieter than a Bronze hero while
    // every tier holds its relative position.
    const lift = (level: string) => {
      const rule = css.match(
        new RegExp(`\\.lc-emblem\\[data-emphasis="${level}"\\]\\s*\\{([^}]*)\\}`),
      );
      expect(rule, `no emphasis block for ${level}`).toBeTruthy();
      return Number(rule![1].match(/--lc-emblem-lift:\s*([\d.]+)/)![1]);
    };
    expect(lift("ceremonial")).toBeGreaterThan(lift("standard"));
    expect(lift("standard")).toBeGreaterThan(lift("quiet"));
    expect(lift("quiet")).toBeGreaterThan(0); // `quiet` is dim, never dark
  });

  it("composes the art filter from identity functions, never from `none`", () => {
    // `filter: none drop-shadow(...)` is invalid AS A WHOLE — the browser
    // drops the rest of the stack with it, silently. Every composable slot
    // therefore defaults to a real no-op function instead.
    const base = css.slice(css.indexOf(".lc-emblem {"), css.indexOf(".lc-emblem[data-variant="));
    for (const slot of ["--lc-emblem-tint", "--lc-emblem-seat"]) {
      expect(base).toContain(`${slot}: opacity(1)`);
      expect(base).not.toMatch(new RegExp(`${slot}:\\s*none`));
    }
    // And the stack itself substitutes those slots rather than re-declaring
    // itself per state, which is how the three axes stay independent.
    const art = css.slice(css.indexOf(".lc-emblem__art {"), css.indexOf(".lc-emblem__halo {"));
    expect(art).toContain("var(--lc-emblem-tint)");
    expect(art).toContain("var(--lc-emblem-seat)");
    expect(art).toContain("var(--lc-emblem-glow-blur)");
  });

  it("never lets the ceremonial glow clamp at the top of the tier ladder", () => {
    // An alpha that saturates at 1 stops being a ladder: every tier above
    // the clamp point renders identically.
    const block = css.match(
      /\.lc-emblem\[data-emphasis="ceremonial"\]\s*\{([\s\S]*?)\}/,
    )![1];
    const [, base, factor] = block.match(
      /--lc-emblem-glow-alpha:\s*calc\(([\d.]+)\s*\+\s*var\(--lc-emblem-halo\)\s*\*\s*([\d.]+)\)/,
    )!;
    const halos = [...css.matchAll(/--lc-emblem-halo:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    const worst = Math.max(...halos);
    expect(Number(base) + worst * Number(factor)).toBeLessThan(1);
  });

  it("holds the baseline back with WARMTH, never by draining its colour", () => {
    // Both baseline tints. Desaturating art that is already dark and
    // low-chroma produced a muddy grey-violet crest twice; chroma is
    // off-limits here and the difference is spent on luminance.
    const tints = [...css.matchAll(/--lc-emblem-tint:\s*(sepia[^;]*);/g)].map((m) => m[1]);
    expect(tints.length).toBeGreaterThanOrEqual(2);
    for (const tint of tints) {
      expect(tint).not.toContain("grayscale");
      // `saturate()` above 1 only. A value below 1 is desaturation by
      // another name and it is the exact regression this test exists for.
      const sat = Number(tint.match(/saturate\(([\d.]+)\)/)![1]);
      expect(sat).toBeGreaterThanOrEqual(1);
    }
  });

  it("makes the ceremonial baseline the RICHER of the two, not the dimmer", () => {
    // The direction reversal, at the stylesheet level: the lobby's placement
    // Bronze is the page's focal emblem, so its tint adds light rather than
    // removing it, and the held-back `opacity()` is gone entirely.
    const quiet = css.match(
      /\.lc-emblem\[data-baseline\]\s*\{([\s\S]*?)\}/,
    )![1];
    const ceremonial = css.match(
      /\.lc-emblem\[data-baseline\]\[data-emphasis="ceremonial"\]\s*\{([\s\S]*?)\}/,
    )![1];
    const brightness = (block: string) =>
      Number(block.match(/brightness\(([\d.]+)\)/)![1]);
    expect(brightness(ceremonial)).toBeGreaterThan(brightness(quiet));
    expect(quiet).toContain("opacity(");
    expect(ceremonial).not.toContain("opacity(");
  });

  it("gives the baseline the same three numbers every earned tier has", () => {
    // It used to have a halo and nothing else, because an unearned rank was
    // structurally denied the moving layers. Now it is a state of the SAME
    // ladder, and emphasis alone decides how much of it is spent.
    const block = css.match(/\.lc-emblem\[data-baseline\]\s*\{([\s\S]*?)\}/)![1];
    expect(block).toContain("--lc-emblem-halo");
    expect(block).toContain("--lc-emblem-glint");
    expect(block).toContain("--lc-emblem-cadence");
  });

  it("stops every travelling highlight under prefers-reduced-motion", () => {
    const block = reducedMotionBlockContaining(css, ".lc-emblem__glint");
    expect(block).toContain(".lc-emblem__glint");
    expect(block).toContain(".lc-emblem__spark");
    expect(block).toContain(".lc-seal__glint");
    expect(block).toMatch(/display:\s*none/);
    // The halo is light, not motion: it survives. Nobody loses the emblem.
    expect(block).not.toContain(".lc-emblem__halo");
  });
});
