/**
 * LC1 — the Ranked emblem component.
 *
 * Two things are under test and they are different in kind. The DOM contract
 * is what every other Ranked surface reads: `data-tier` means "this account
 * HAS this rank", `data-baseline` means "this is the ladder's floor, not an
 * award", and an unearned emblem must not celebrate. The CSS contract is the
 * intensity ladder and the reduced-motion escape, both of which live in
 * `index.css` and cannot be observed from jsdom — so they are asserted
 * against the stylesheet source, the same way the parchment shell's
 * invariants already are.
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import RankEmblem from "./RankEmblem";
import { RANK_TIERS, type RankTier } from "@/lib/progression/tiers";

afterEach(cleanup);

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

  it("holds the baseline back with LIGHT only — never by draining its colour", () => {
    // The hero emblem and the chip are the same tier and must read as the
    // same metal; desaturating one of them showed one rank in two colours.
    const { container } = render(<RankEmblem tier="bronze" earned={false} alt="baseline" />);
    const filter = container.querySelector<HTMLImageElement>("img")!.style.filter;
    expect(filter).toContain("opacity");
    expect(filter).not.toContain("grayscale");
  });

  it("gives an earned hero emblem its effect layers", () => {
    const { container } = render(<RankEmblem tier="diamond" earned alt="Diamond ranked emblem" />);
    expect(container.querySelector(".lc-emblem__halo")).toBeTruthy();
    expect(container.querySelector(".lc-emblem__glint")).toBeTruthy();
    expect(container.querySelectorAll(".lc-emblem__spark").length).toBeGreaterThan(0);
  });

  it("gives a baseline the ambient halo and NOTHING that celebrates", () => {
    // Structural, not stylistic: the layers are absent from the DOM, so no
    // future CSS rule can switch a spark back on for an unearned rank.
    const { container } = render(<RankEmblem tier="bronze" earned={false} alt="baseline" />);
    expect(container.querySelector(".lc-emblem__halo")).toBeTruthy();
    expect(container.querySelector(".lc-emblem__glint")).toBeNull();
    expect(container.querySelector(".lc-emblem__spark")).toBeNull();
  });

  it("withholds travelling light at chip size, earned or not", () => {
    // A 16px chip cannot carry a sweep or a spark; at that size they are
    // single pixels of noise.
    const { container } = render(<RankEmblem tier="challenger" earned size="chip" decorative />);
    expect(container.querySelector('.lc-emblem[data-size="chip"]')).toBeTruthy();
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
    const { container } = render(<RankEmblem tier={tier} earned alt={`${tier} emblem`} />);
    const sparks = container.querySelectorAll(".lc-emblem__spark");
    expect(sparks.length).toBe(SPARKS[tier]);
    expect(sparks.length).toBeLessThanOrEqual(3);
  });

  it("staggers the sparks so two never fire together", () => {
    const { container } = render(<RankEmblem tier="challenger" earned alt="Challenger emblem" />);
    const delays = Array.from(container.querySelectorAll<HTMLElement>(".lc-emblem__spark")).map(
      (s) => s.style.animationDelay,
    );
    expect(delays.length).toBe(3);
    expect(new Set(delays).size).toBe(3);
  });

  it("climbs the ladder, never dips", () => {
    const counts = RANK_TIERS.map((tier) => {
      const { container } = render(<RankEmblem tier={tier} earned alt={tier} />);
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
    const { container } = render(<RankEmblem tier="gold" earned size="chip" decorative />);
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

  it("stops every travelling highlight under prefers-reduced-motion", () => {
    const block = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toContain(".lc-emblem__glint");
    expect(block).toContain(".lc-emblem__spark");
    expect(block).toContain(".lc-seal__glint");
    expect(block).toMatch(/display:\s*none/);
    // The halo is light, not motion: it survives. Nobody loses the emblem.
    expect(block).not.toContain(".lc-emblem__halo");
  });
});
