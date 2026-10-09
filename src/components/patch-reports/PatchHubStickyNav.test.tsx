/**
 * PHSR3 sticky Summoner's Rift navigator, in isolation. jsdom has no layout,
 * so geometry is a stub: `layout` maps what the component measures (sentinel,
 * holder, nav, anchor ids) to rects, and the frame clock is a manual queue.
 * Assertions are about behaviour (shown / destination / active / cleanup),
 * never about how many times something scrolled.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPatchReportStructure, filterReportStructure } from "@/lib/patch-reports/report-structure";
import { SR_CARDS, srDetail } from "@/lib/patch-reports/sr-test-fixtures";
import { PatchHubStickyNav } from "./PatchHubStickyNav";

const structure = buildPatchReportStructure(srDetail());
const only = (names: string[]) =>
  filterReportStructure(
    structure,
    new Set(SR_CARDS.filter((c) => names.includes(c.entity_name))),
  ).sections;
const anchorOf = (title: string) => structure.sections.find((s) => s.title === title)!.anchor;
const bucketAnchor = (direction: string) =>
  structure.sections.find((s) => s.title === "Champions")!.directionBuckets!.find((b) => b.direction === direction)!.anchor;

type Box = { top: number; bottom: number };
let layout: { sentinelTop: number; holderTop: number; boxes: Map<string, Box> };
let frames: Array<FrameRequestCallback | null>;
let cancelled: number[];
const flush = () =>
  act(() => {
    frames.splice(0).forEach((cb) => cb?.(0));
  });
const scrollTo = (next: Partial<typeof layout>) => {
  Object.assign(layout, next);
  fireEvent.scroll(window);
  flush();
};

const rectFor = (el: Element): DOMRect => {
  const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON() {} }) as DOMRect;
  const testId = el.getAttribute("data-testid");
  if (testId === "patch-hub-sticky-sentinel") return rect(layout.sentinelTop, layout.sentinelTop);
  if (testId === "patch-hub-sticky-holder") return rect(layout.holderTop, layout.holderTop);
  const box = el.id ? layout.boxes.get(el.id) : undefined;
  return box ? rect(box.top, box.bottom) : rect(0, 0);
};

beforeEach(() => {
  layout = { sentinelTop: 400, holderTop: 400, boxes: new Map() };
  frames = [];
  cancelled = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    cancelled.push(id);
    frames[id - 1] = null;
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return rectFor(this);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty("scroll-padding-top");
});

/** The report body the navigator points into: one element per anchor id. */
const Targets = ({ ids }: { ids: string[] }) => (
  <>
    {ids.map((id) => (
      <div key={id} id={id} />
    ))}
  </>
);

const mount = (sections = structure.sections) => {
  const ids = ["patch-hub", ...sections.flatMap((s) => [s.anchor, ...(s.directionBuckets ?? []).map((b) => b.anchor)])];
  return render(
    <>
      <PatchHubStickyNav patchVersion="26.19" sections={sections} />
      <Targets ids={ids} />
    </>,
  );
};

const nav = () => screen.getByTestId("patch-hub-sticky-nav");
// DOM query on purpose: a hidden nav is (correctly) not in the accessibility tree.
const links = () => [...nav().querySelectorAll("a")];
const hrefs = () => links().map((a) => a.getAttribute("href"));
const labelOf = (a: Element) => a.getAttribute("aria-label") ?? a.textContent;
const labels = () => links().map(labelOf);
const show = () => scrollTo({ sentinelTop: -250, holderTop: 62 });

describe("activation (spec 1)", () => {
  it("is hidden, and out of the accessibility tree, while the full section nav is still in flow", () => {
    mount();
    expect(nav()).toHaveAttribute("data-state", "hidden");
    expect(nav()).toHaveStyle({ visibility: "hidden" });
    expect(screen.queryByRole("navigation", { name: "Main game sections" })).toBeNull();
    expect(screen.queryAllByRole("link", { name: /Champions/ })).toHaveLength(0);
  });

  it("appears once the in-flow nav has scrolled away (holder sticks, sentinel moves above it)", () => {
    mount();
    scrollTo({ sentinelTop: -250, holderTop: 62 });
    expect(nav()).toHaveAttribute("data-state", "shown");
    expect(nav()).toHaveStyle({ visibility: "visible" });
    expect(screen.getByRole("navigation", { name: "Main game sections" })).toBeInTheDocument();
  });

  it("hides again when the reader scrolls back above the full nav", () => {
    mount();
    scrollTo({ sentinelTop: -250, holderTop: 62 });
    scrollTo({ sentinelTop: 300, holderTop: 300 });
    expect(nav()).toHaveAttribute("data-state", "hidden");
    expect(screen.queryByRole("navigation", { name: "Main game sections" })).toBeNull();
  });

  it("is shown on mount when the page is restored already scrolled past the full nav", () => {
    layout.sentinelTop = -900;
    layout.holderTop = 62;
    mount();
    expect(nav()).toHaveAttribute("data-state", "shown");
  });

  it("recomputes on resize as well as scroll", () => {
    mount();
    layout.sentinelTop = -10;
    layout.holderTop = 62;
    fireEvent(window, new Event("resize"));
    flush();
    expect(nav()).toHaveAttribute("data-state", "shown");
  });

  it("coalesces a burst of scroll events into one measurement frame", () => {
    mount();
    fireEvent.scroll(window);
    fireEvent.scroll(window);
    fireEvent.scroll(window);
    expect(frames.length).toBe(1);
  });
});

describe("destinations (specs 2–8)", () => {
  it("lists the patch, Champions, Buffs, Nerfs, Adjustments, Items, Runes, Systems and Top, and nothing from Arena / ARAM", () => {
    mount();
    expect(labels()).toEqual(["Champions", "Buffs1", "Nerfs2", "Adjustments1", "Items", "Runes", "Systems", "Back to top"]);
    expect(nav()).toHaveTextContent("26.19");
    expect(nav().textContent).not.toMatch(/Arena|ARAM|Mayhem/);
  });

  it("each destination is a plain fragment link to the anchor the page renders", () => {
    mount();
    expect(hrefs()).toEqual([
      `#${anchorOf("Champions")}`,
      `#${bucketAnchor("buff")}`,
      `#${bucketAnchor("nerf")}`,
      `#${bucketAnchor("adjustment")}`,
      `#${anchorOf("Items")}`,
      `#${anchorOf("Runes")}`,
      `#${anchorOf("Systems")}`,
      "#patch-hub",
    ]);
    for (const href of hrefs()) expect(document.getElementById(href!.slice(1))).not.toBeNull();
  });

  it("the Top link targets the masthead anchor", () => {
    mount();
    show();
    const top = within(nav()).getByRole("link", { name: "Back to top" });
    expect(top).toHaveAttribute("href", "#patch-hub");
  });

  it("announces the patch version for screen readers and groups the direction links", () => {
    mount();
    show();
    expect(within(nav()).getByText("Patch")).toHaveClass("sr-only");
    expect(within(nav()).getByRole("list", { name: "Champions by direction" })).toBeInTheDocument();
  });
});

describe("filtered structure (spec 14)", () => {
  it("shows only the destinations that survive the filter", () => {
    mount(only(["Zed", "Baron"]));
    expect(labels()).toEqual(["Champions", "Nerfs1", "Systems", "Back to top"]);
    for (const href of hrefs()) expect(document.getElementById(href!.slice(1))).not.toBeNull();
  });

  it("re-rendering with a narrower structure removes the dropped links (no stale anchors)", () => {
    const { rerender } = mount();
    expect(labels()).toContain("Items");
    const narrowed = only(["Ahri"]);
    rerender(
      <>
        <PatchHubStickyNav patchVersion="26.19" sections={narrowed} />
        <Targets ids={["patch-hub", ...narrowed.flatMap((s) => [s.anchor, ...(s.directionBuckets ?? []).map((b) => b.anchor)])]} />
      </>,
    );
    expect(labels()).toEqual(["Champions", "Buffs1", "Back to top"]);
    expect(hrefs().every((href) => document.getElementById(href!.slice(1)))).toBe(true);
  });

  it("renders nothing at all, including its sentinel, when no main-game section is left", () => {
    const { container } = mount(only(["Augment A"]));
    expect(container.querySelector('[data-testid="patch-hub-sticky-nav"]')).toBeNull();
    expect(container.querySelector('[data-testid="patch-hub-sticky-sentinel"]')).toBeNull();
    expect(document.documentElement.style.scrollPaddingTop).toBe("");
  });
});

describe("active section (specs 15, 17)", () => {
  const champions = () => anchorOf("Champions");
  const activeLabels = () => links().filter((a) => a.getAttribute("aria-current") === "location").map(labelOf);

  it("marks the bucket the reader is inside, as aria-current=location", () => {
    mount();
    scrollTo({
      sentinelTop: -250,
      holderTop: 62,
      boxes: new Map([
        [champions(), { top: -900, bottom: 1500 }],
        [bucketAnchor("nerf"), { top: 0, bottom: 900 }],
      ]),
    });
    expect(activeLabels()).toEqual(["Nerfs2"]);
  });

  it("moves through Champions → Buffs → Nerfs → Adjustments → Items → Runes → Systems as the reader scrolls", () => {
    mount();
    const probe = 62 + 36 + 24; // holder top + strip height + gap
    const inside = (anchor: string, others: string[] = []) =>
      new Map<string, Box>([
        ...others.map((a) => [a, { top: -2000, bottom: 5000 }] as [string, Box]),
        [anchor, { top: probe - 10, bottom: probe + 400 }],
      ]);
    const steps: Array<[Map<string, Box>, string]> = [
      [inside(champions()), "Champions"],
      [inside(bucketAnchor("buff"), [champions()]), "Buffs1"],
      [inside(bucketAnchor("nerf"), [champions()]), "Nerfs2"],
      [inside(bucketAnchor("adjustment"), [champions()]), "Adjustments1"],
      [inside(anchorOf("Items")), "Items"],
      [inside(anchorOf("Runes")), "Runes"],
      [inside(anchorOf("Systems")), "Systems"],
    ];
    for (const [boxes, expected] of steps) {
      scrollTo({ sentinelTop: -250, holderTop: 62, boxes });
      expect(activeLabels()).toEqual([expected]);
    }
  });

  it("a heading that has just landed (12px under the strip) is active, even while the strip is mid-slide", () => {
    mount();
    // Holder 62 -> strip bottom 98 -> landed heading at 110. The strip's own rect must not matter.
    scrollTo({ sentinelTop: -250, holderTop: 62, boxes: new Map([[anchorOf("Items"), { top: 110, bottom: 560 }]]) });
    expect(activeLabels()).toEqual(["Items"]);
    scrollTo({ boxes: new Map([[anchorOf("Systems"), { top: 110.4, bottom: 600 }]]) });
    expect(activeLabels()).toEqual(["Systems"]);
  });

  it("nothing is active in the Arena after Systems, or above Champions", () => {
    mount();
    scrollTo({ sentinelTop: -250, holderTop: 62, boxes: new Map([[anchorOf("Systems"), { top: -900, bottom: 20 }]]) });
    expect(activeLabels()).toEqual([]);
    scrollTo({ boxes: new Map([[champions(), { top: 900, bottom: 1500 }]]) });
    expect(activeLabels()).toEqual([]);
  });
});

describe("narrow strip follows the active destination (spec 18)", () => {
  const widen = (width: number, scrollWidth: number) => {
    const strip = nav().querySelector("ul")!;
    Object.defineProperty(strip, "clientWidth", { configurable: true, value: width });
    Object.defineProperty(strip, "scrollWidth", { configurable: true, value: scrollWidth });
    return strip;
  };
  /** Put a link at `left` within the strip's content; its viewport rect moves as the strip scrolls. */
  const place = (label: RegExp, left: number, width: number) => {
    const link = links().find((a) => label.test(a.textContent ?? ""))!;
    Object.defineProperty(link, "offsetWidth", { configurable: true, value: width });
    const original = link.getBoundingClientRect.bind(link);
    const strip = nav().querySelector("ul")!;
    link.getBoundingClientRect = () => ({ ...original(), left: left - strip.scrollLeft, right: left - strip.scrollLeft + width }) as DOMRect;
    return link;
  };

  it("scrolls the strip, not the page, to bring a far-right destination into view with edge-fade clearance", () => {
    mount();
    const strip = widen(200, 600);
    place(/^Systems$/, 480, 50);
    const pageScroll = vi.spyOn(window, "scrollTo");
    scrollTo({ sentinelTop: -250, holderTop: 62, boxes: new Map([[anchorOf("Systems"), { top: 90, bottom: 500 }]]) });
    // right edge (530) + 24px margin must sit inside the visible window
    expect(strip.scrollLeft).toBe(530 + 24 - 200);
    expect(pageScroll).not.toHaveBeenCalled();
  });

  it("scrolls back left when the active destination is left of the window", () => {
    mount();
    const strip = widen(200, 600);
    strip.scrollLeft = 400;
    place(/^Champions$/, 20, 60);
    scrollTo({ sentinelTop: -250, holderTop: 62, boxes: new Map([[anchorOf("Champions"), { top: 90, bottom: 500 }]]) });
    expect(strip.scrollLeft).toBe(0);
  });

  it("keyboard focus on a partly hidden link brings it fully into view", () => {
    mount();
    show();
    const strip = widen(200, 600);
    const systems = place(/^Systems$/, 480, 50);
    systems.focus();
    expect(strip.scrollLeft).toBe(530 + 24 - 200);
    const champions = place(/^Champions$/, 20, 60);
    champions.focus();
    expect(strip.scrollLeft).toBe(0);
  });

  it("does nothing when everything already fits", () => {
    mount();
    const strip = widen(500, 500);
    scrollTo({ sentinelTop: -250, holderTop: 62, boxes: new Map([[anchorOf("Systems"), { top: 90, bottom: 500 }]]) });
    expect(strip.scrollLeft).toBe(0);
  });

  it("does not move a hidden strip", () => {
    mount();
    const strip = widen(200, 600);
    place(/^Systems$/, 480, 50);
    scrollTo({ sentinelTop: 300, holderTop: 300, boxes: new Map([[anchorOf("Systems"), { top: 90, bottom: 500 }]]) });
    expect(strip.scrollLeft).toBe(0);
  });
});

describe("keyboard (spec 15)", () => {
  it("hidden links are not focusable by the accessibility tree; once shown they are real links with a visible-focus ring class", () => {
    mount();
    expect(screen.queryAllByRole("link", { name: "Items" })).toHaveLength(0);
    scrollTo({ sentinelTop: -250, holderTop: 62 });
    const items = screen.getByRole("link", { name: "Items" });
    items.focus();
    expect(document.activeElement).toBe(items);
    expect(items.className).toContain("focus-visible:ring-2");
    expect(screen.getByRole("link", { name: "Back to top" }).className).toContain("focus-visible:ring-2");
  });
});

describe("scroll offset (specs 9, 20)", () => {
  const padding = () => document.documentElement.style.getPropertyValue("scroll-padding-top");

  it("sets a report-only scroll-padding clear of the header and the strip while mounted", () => {
    mount();
    expect(padding()).toContain("--app-header-h");
  });

  it("restores the previous value on unmount", () => {
    document.documentElement.style.setProperty("scroll-padding-top", "7px");
    const { unmount } = mount();
    expect(padding()).toContain("--app-header-h");
    unmount();
    expect(padding()).toBe("7px");
  });

  it("leaves no scroll-padding behind when there was none before", () => {
    const { unmount } = mount();
    unmount();
    expect(padding()).toBe("");
  });

  it("is released when filtering removes every destination, and re-applied when they return", () => {
    const { rerender } = mount();
    expect(padding()).toContain("--app-header-h");
    rerender(<PatchHubStickyNav patchVersion="26.19" sections={only(["Augment A"])} />);
    expect(padding()).toBe("");
    rerender(<PatchHubStickyNav patchVersion="26.19" sections={structure.sections} />);
    expect(padding()).toContain("--app-header-h");
  });
});

describe("cleanup (spec 19)", () => {
  it("removes exactly the scroll and resize listeners it added", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = mount();
    const added = add.mock.calls.filter(([type]) => type === "scroll" || type === "resize");
    expect(added.map(([type]) => type).sort()).toEqual(["resize", "scroll"]);
    unmount();
    for (const [type, handler] of added) {
      expect(remove.mock.calls.some(([t, h]) => t === type && h === handler)).toBe(true);
    }
  });

  it("an unmounted navigator no longer reacts to scrolling or schedules frames", () => {
    const { unmount } = mount();
    unmount();
    fireEvent.scroll(window);
    fireEvent(window, new Event("resize"));
    expect(frames.length).toBe(0);
  });

  it("cancels a pending measurement frame on unmount", () => {
    const { unmount } = mount();
    fireEvent.scroll(window);
    expect(frames.length).toBe(1);
    unmount();
    expect(cancelled.length).toBe(1);
    flush(); // a cancelled frame must not run and must not set state on an unmounted tree
  });

  it("swaps listeners (no accumulation) when the structure changes", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { rerender, unmount } = mount();
    rerender(<PatchHubStickyNav patchVersion="26.19" sections={only(["Ahri"])} />);
    unmount();
    const count = (spy: typeof add) => spy.mock.calls.filter(([type]) => type === "scroll").length;
    expect(count(add)).toBe(count(remove));
  });
});
