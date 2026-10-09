/**
 * PHSR4: SR champion card visual polish. These are behavioural contracts the
 * polish must not break (one action, unchanged URL and label, no empty wrapper,
 * heading hierarchy, commentary position, long formulas) plus the passive-art
 * source and its fallback. Layout itself (overflow, clipping, touch targets) is
 * certified in a real browser; here only the structure that carries it is pinned.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PatchReportEntityCard } from "./PatchReportEntityCard";
import { storedPassiveIconUrl } from "./passiveArt";
import type { PatchReportEntrySlots } from "./PatchReportEntrySlots";
import { CombatLabHandoffLink } from "@/components/patch-hub-combat-lab/CombatLabHandoffLink";
import { CHAMPION_ABILITY_ICON_FILES } from "@/data/championAbilityIcons";
import { getAbilityIconUrl } from "@/lib/combat-lab/abilityIcons";
import { combatLabHandoffFor } from "@/lib/patch-hub-combat-lab/handoff";
import type { PatchReportCard } from "@/lib/patch-reports/api";
import { buildReportEntityNode } from "@/lib/patch-reports/report-structure";
import { mkCard, mkChange } from "@/lib/patch-reports/test-fixtures";

const node = (card: PatchReportCard) => buildReportEntityNode(card);

const passiveChange = (o: Partial<PatchReportCard["changes"][number]> = {}) =>
  mkChange({
    group_title: "Passive - Assault and Battery",
    ability_slot: "P",
    property_name: "Shield",
    before_raw: "10",
    after_raw: "12",
    ...o,
  });
const qChange = (o: Partial<PatchReportCard["changes"][number]> = {}) =>
  mkChange({
    group_title: "Q - Vault Breaker",
    ability_slot: "Q",
    ability_icon_url: "https://icons/ViQ.png",
    property_name: "Damage",
    before_raw: "55 / 80 / 105",
    after_raw: "60 / 85 / 110",
    ...o,
  });

const vi_ = mkCard("Vi", {
  official_image_url: "https://official/vi.png",
  context_text: "Vi was punching above her weight, so we are trimming her passive.",
  changes: [passiveChange(), qChange()],
});

/** The same slot wiring the Patch Report page installs (PH4-A share + PH4-C Combat Lab). */
const pageSlots = (onShare = vi.fn()): PatchReportEntrySlots => ({
  entityActions: ({ entity }) => {
    const handoff = combatLabHandoffFor(entity.card);
    return handoff ? <CombatLabHandoffLink handoff={handoff} /> : null;
  },
  entityShare: ({ entity }) => ({
    href: `/lol/patch-reports?patch=26.19#${entity.anchor}`,
    onShare,
  }),
});

const renderCard = (card: PatchReportCard, props: Partial<Parameters<typeof PatchReportEntityCard>[0]> = {}) =>
  render(
    <MemoryRouter>
      <PatchReportEntityCard entity={node(card)} slots={pageSlots()} {...props} />
    </MemoryRouter>,
  );

describe("Combat Lab action in the header", () => {
  it("renders exactly one action per eligible champion, not one per change", () => {
    renderCard(vi_);
    expect(screen.getAllByTestId("patch-report-combat-lab")).toHaveLength(1);
    expect(screen.getAllByTestId("patch-report-change").length).toBeGreaterThan(1);
  });

  it("keeps the canonical URL and the 'Open {Champion} in Combat Lab' accessible name", () => {
    renderCard(vi_);
    const link = screen.getByTestId("patch-report-combat-lab");
    expect(link).toHaveAttribute("href", "/combat-lab?attacker=vi");
    expect(link).toHaveAccessibleName("Open Vi in Combat Lab");
    expect(screen.getByRole("link", { name: "Open Vi in Combat Lab" })).toBe(link);
  });

  it("keeps the entity share link beside the title and calls onShare on a plain click", () => {
    const onShare = vi.fn();
    render(
      <MemoryRouter>
        <PatchReportEntityCard entity={node(vi_)} slots={pageSlots(onShare)} />
      </MemoryRouter>,
    );
    const share = screen.getByTestId("patch-report-entity-share");
    expect(share).toHaveAccessibleName("Copy link to Vi changes");
    expect(share).toHaveAttribute("href", expect.stringContaining("?patch=26.19#"));
    // Share sits in the title row, not in the actions cluster.
    const title = screen.getByRole("heading", { name: "Vi" });
    expect(title.parentElement).toContainElement(share);
    expect(within(screen.getByTestId("patch-report-entity-actions")).queryByTestId("patch-report-entity-share")).toBeNull();
    fireEvent.click(share);
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it("renders no actions wrapper at all for entities without a Combat Lab handoff", () => {
    const ineligible: PatchReportCard[] = [
      mkCard("Locke", { mogzy_entity_ref: null }), // champion Mogzy does not map
      mkCard("Sundered Sky", { entity_type: "item", section_title: "Items", section_id: "patch-items" }),
      mkCard("Ahri", { entity_type: "system", section_title: "Arena", section_id: "patch-arena" }),
      mkCard("Vi", { section_title: "Arena", section_id: "patch-arena" }), // champion outside the SR Champions section
    ];
    for (const card of ineligible) {
      const { unmount } = renderCard(card);
      expect(screen.queryByTestId("patch-report-entity-actions")).toBeNull();
      expect(screen.queryByTestId("patch-report-combat-lab")).toBeNull();
      // The share link is independent of the action slot.
      expect(screen.getByTestId("patch-report-entity-share")).toBeInTheDocument();
      unmount();
    }
  });

  it("has the same header structure with and without slots: identity first, actions last", () => {
    const { rerender } = renderCard(vi_);
    const header = screen.getByTestId("patch-report-card").querySelector("header")!;
    const actions = screen.getByTestId("patch-report-entity-actions");
    expect(header.lastElementChild).toBe(actions);
    expect(header.firstElementChild).toBe(within(header).getByAltText("Vi"));
    // An empty `slots` object is the same as no actions: nothing extra in the header.
    rerender(
      <MemoryRouter>
        <PatchReportEntityCard entity={node(vi_)} slots={{}} />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("patch-report-entity-actions")).toBeNull();
  });

  it("wraps without colliding: grid header, shrinkable identity column, wrapping action cluster", () => {
    renderCard(vi_);
    const card = screen.getByTestId("patch-report-card");
    const header = card.querySelector("header")!;
    // Two columns on a phone, three from `sm`; the action never needs its own full-width row.
    expect(header.className).toContain("grid-cols-[auto_minmax(0,1fr)]");
    expect(header.className).toContain("sm:grid-cols-[auto_minmax(0,1fr)_auto]");
    const identity = screen.getByRole("heading", { name: "Vi" }).closest("div.min-w-0");
    expect(identity).not.toBeNull();
    const actions = screen.getByTestId("patch-report-entity-actions");
    // Phone: tucked under the identity text (column 2); desktop: top-right (column 3, row 1).
    expect(actions.className).toContain("col-start-2");
    expect(actions.className).toContain("sm:col-start-3");
    expect(actions.className).toContain("sm:row-start-1");
    expect(actions.className).toContain("flex-wrap");
    expect(actions.className).not.toMatch(/(^|\s)w-full(\s|$)/);
    // The portrait spans both phone rows so the action does not push Riot's text down.
    const portrait = within(header).getByAltText("Vi");
    expect(portrait.className).toContain("row-span-2");
    expect(portrait.className).toContain("sm:row-span-1");
  });
});

describe("heading hierarchy and Riot commentary position", () => {
  it("entity heading is h3 and ability headings are h4 by default", () => {
    renderCard(vi_);
    expect(screen.getByRole("heading", { level: 3, name: "Vi" })).toBeInTheDocument();
    const abilityHeadings = screen.getAllByRole("heading", { level: 4 });
    expect(abilityHeadings.map((h) => h.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Assault and Battery"), expect.stringContaining("Vault Breaker")]),
    );
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
  });

  it("honours headingLevel: entity h2 puts abilities at h3, entity h4 at h5", () => {
    const { unmount } = renderCard(vi_, { headingLevel: 2 });
    expect(screen.getByRole("heading", { level: 2, name: "Vi" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
    unmount();
    renderCard(vi_, { headingLevel: 4 });
    expect(screen.getByRole("heading", { level: 4, name: "Vi" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 5 })).toHaveLength(2);
  });

  it("every ability group is a named region labelled by its own heading", () => {
    renderCard(vi_);
    for (const group of screen.getAllByTestId("patch-report-ability-group")) {
      const labelledBy = group.getAttribute("aria-labelledby")!;
      expect(group.querySelector(`#${CSS.escape(labelledBy)}`)).toBe(within(group).getAllByRole("heading")[0]);
    }
  });

  it("Riot's commentary stays after the header and before every ability change", () => {
    renderCard(vi_);
    const header = screen.getByTestId("patch-report-card").querySelector("header")!;
    const commentary = screen.getByTestId("patch-report-rationale");
    const firstGroup = screen.getAllByTestId("patch-report-ability-group")[0];
    expect(header.compareDocumentPosition(commentary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(commentary.compareDocumentPosition(firstGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const change of screen.getAllByTestId("patch-report-change")) {
      expect(commentary.compareDocumentPosition(change) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(commentary).toHaveTextContent("Vi was punching above her weight");
  });
});

describe("long formulas", () => {
  const LONG =
    "50 / 75 / 100 / 125 / 150 (+ 120% bonus AD) (+ 60% AP) (+ 8% of target's maximum health) (+ 4% per 100 bonus attack speed)";
  const aphelios = mkCard("Aphelios", {
    changes: [
      qChange({ group_title: "Q - Calibrum", property_name: "Damage", before_raw: LONG, after_raw: LONG.replace("50", "60") }),
      qChange({ group_title: "Q - Severum", property_name: "Heal", before_raw: "8 / 9 / 10", after_raw: "9 / 10 / 11" }),
      qChange({ group_title: "Q - Gravitum", property_name: "Slow", before_raw: "30%", after_raw: "35%" }),
      qChange({ group_title: "Q - Infernum", property_name: "Damage", before_raw: "25 / 35", after_raw: "30 / 40" }),
      qChange({ group_title: "Q - Crescendum", property_name: "Cooldown", before_raw: "12", after_raw: "10" }),
    ],
  });

  it("renders every value in full inside shrinkable, wrapping containers", () => {
    renderCard(aphelios);
    const lines = screen.getAllByTestId("patch-report-change");
    expect(lines).toHaveLength(5);
    const [first] = lines;
    expect(first).toHaveTextContent(LONG);
    expect(first).toHaveTextContent(LONG.replace("50", "60"));
    // Nothing between the value and the card truncates or forbids wrapping.
    const card = screen.getByTestId("patch-report-card");
    for (let el: HTMLElement | null = within(first).getByTestId("patch-report-values"); el && el !== card; el = el.parentElement) {
      expect(el.className).not.toMatch(/whitespace-nowrap|truncate|text-ellipsis/);
    }
    expect(first.innerHTML).toContain("[overflow-wrap:anywhere]");
  });

  it("five changes stay five ability groups with their own headings", () => {
    renderCard(aphelios);
    expect(screen.getAllByTestId("patch-report-ability-group")).toHaveLength(5);
    expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(5);
  });
});

describe("passive art (SR Champions section only)", () => {
  const passiveIcon = (root: HTMLElement) =>
    within(root).getAllByTestId("patch-report-ability-group").find((g) => g.getAttribute("data-ability-slot") === "P")!;

  it("uses the canonical stored passive art when the champion has it", () => {
    renderCard(vi_);
    const expected = getAbilityIconUrl("Vi", "P");
    expect(expected).toBeTruthy();
    const img = passiveIcon(screen.getByTestId("patch-report-card")).querySelector("img");
    expect(img).toHaveAttribute("src", expected!);
    expect(img!.getAttribute("src")).toMatch(/passive\.png$/);
    // The slot letter still labels it, as a small badge over the art.
    expect(within(passiveIcon(screen.getByTestId("patch-report-card"))).getByTestId("patch-report-ability-icon")).toHaveTextContent("P");
  });

  it("falls back to the P glyph when the stored image fails to load", () => {
    renderCard(vi_);
    const group = passiveIcon(screen.getByTestId("patch-report-card"));
    const img = group.querySelector("img")!;
    fireEvent.error(img);
    expect(group.querySelector("img")).toBeNull();
    expect(within(group).getByTestId("patch-report-ability-icon")).toHaveTextContent("P");
  });

  it("falls back to the P glyph when the champion has no catalog identity or no stored art", () => {
    for (const card of [
      mkCard("Locke", { mogzy_entity_ref: null, changes: [passiveChange()] }),
      mkCard("Zzz Unmapped", { mogzy_entity_ref: "ZzzNotInTheArtTable", changes: [passiveChange()] }),
    ]) {
      const { unmount } = renderCard(card);
      const group = passiveIcon(screen.getByTestId("patch-report-card"));
      expect(group.querySelector("img")).toBeNull();
      expect(within(group).getByTestId("patch-report-ability-icon")).toHaveTextContent("P");
      unmount();
    }
  });

  it("never borrows champion art outside the SR Champions section (Arena, items, systems)", () => {
    for (const card of [
      mkCard("Vi", { section_title: "Arena", section_id: "patch-arena", changes: [passiveChange()] }),
      mkCard("Vi", { entity_type: "system", section_title: "Arena", section_id: "patch-arena", changes: [passiveChange()] }),
      mkCard("Vi", { entity_type: "item", section_title: "Items", section_id: "patch-items", changes: [passiveChange()] }),
    ]) {
      const { unmount } = renderCard(card);
      expect(passiveIcon(screen.getByTestId("patch-report-card")).querySelector("img")).toBeNull();
      unmount();
    }
  });

  it("prefers an icon the backend published over the stored art", () => {
    const card = mkCard("Vi", { changes: [passiveChange({ ability_icon_url: "https://backend/vi-passive.png" })] });
    renderCard(card);
    expect(passiveIcon(screen.getByTestId("patch-report-card")).querySelector("img")).toHaveAttribute(
      "src",
      "https://backend/vi-passive.png",
    );
  });

  it("leaves castable ability icons exactly as before: backend URL, or slot glyph, never stored art", () => {
    renderCard(mkCard("Vi", { changes: [qChange(), qChange({ group_title: "W - Excessive Force", ability_slot: "W", ability_icon_url: null })] }));
    const groups = screen.getAllByTestId("patch-report-ability-group");
    expect(groups[0].querySelector("img")).toHaveAttribute("src", "https://icons/ViQ.png");
    expect(groups[1].querySelector("img")).toBeNull();
    expect(within(groups[1]).getByTestId("patch-report-ability-icon")).toHaveTextContent("W");
  });

  it("storedPassiveIconUrl only answers for the P slot", () => {
    const entity = node(mkCard("Vi", { changes: [passiveChange(), qChange({ ability_icon_url: null })] }));
    const [p, q] = entity.groups;
    expect(storedPassiveIconUrl(entity.card, p)).toBe(getAbilityIconUrl("Vi", "P"));
    expect(storedPassiveIconUrl(entity.card, q)).toBeNull();
  });
});

describe("no champion-specific mapping in Patch Report components", () => {
  const sources = import.meta.glob(["./*.ts", "./*.tsx", "!./*.test.ts", "!./*.test.tsx"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const handoffSource = import.meta.glob("../patch-hub-combat-lab/CombatLabHandoffLink.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const code = Object.entries({ ...sources, ...handoffSource }).map(([file, source]) => ({
    file,
    source: source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""),
  }));

  it("scans real component sources", () => {
    expect(code.length).toBeGreaterThan(5);
    expect(code.some((c) => c.file.endsWith("PatchReportAbilityGroup.tsx"))).toBe(true);
    expect(code.some((c) => c.file.endsWith("passiveArt.ts"))).toBe(true);
  });

  it("names no champion, art path or file name: the only passive source is the Combat Lab resolver", () => {
    const champions = Object.keys(CHAMPION_ABILITY_ICON_FILES);
    expect(champions.length).toBeGreaterThan(100);
    for (const { file, source } of code) {
      expect(source, `${file} hardcodes an asset path`).not.toMatch(/assets\/champions|passive\.png|\.png["'`]/);
      for (const name of champions) {
        expect(source, `${file} names champion "${name}"`).not.toMatch(new RegExp(`["'\`]${name}["'\`]`));
      }
    }
    const art = code.find((c) => c.file.endsWith("passiveArt.ts"))!.source;
    expect(art).toContain('from "@/lib/combat-lab/abilityIcons"');
    expect(art).toContain("getAbilityIconUrl(");
    // The ability group takes its passive art from that helper, not from anywhere else.
    const group = code.find((c) => c.file.endsWith("PatchReportAbilityGroup.tsx"))!.source;
    expect(group).toContain('from "./passiveArt"');
  });
});
