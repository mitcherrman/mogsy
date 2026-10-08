import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CombatLabHandoffLink } from "./CombatLabHandoffLink";
import { combatLabHandoffFor } from "@/lib/patch-hub-combat-lab/handoff";
import { mkCard } from "@/lib/patch-reports/test-fixtures";

const renderLink = (name: string) => {
  const handoff = combatLabHandoffFor(mkCard(name))!;
  render(
    <MemoryRouter>
      <CombatLabHandoffLink handoff={handoff} />
    </MemoryRouter>,
  );
  return { handoff, link: screen.getByTestId("patch-report-combat-lab") };
};

describe("CombatLabHandoffLink (PHSR4 quiet secondary action)", () => {
  it("keeps the href from the handoff exactly, with no patch data", () => {
    const { handoff, link } = renderLink("Aatrox");
    expect(handoff.href).toBe("/combat-lab?attacker=aatrox");
    expect(link).toHaveAttribute("href", "/combat-lab?attacker=aatrox");
  });

  it("is named 'Open {Champion} in Combat Lab' for assistive technology and text content", () => {
    const { link } = renderLink("Aatrox");
    expect(link).toHaveAccessibleName("Open Aatrox in Combat Lab");
    expect(link).toHaveTextContent("Open Aatrox in Combat Lab");
  });

  it("shows only 'Combat Lab' to sighted readers; the champion lead-in is screen-reader-only", () => {
    const { link } = renderLink("Aatrox");
    const lead = link.querySelector(".sr-only");
    expect(lead).not.toBeNull();
    expect(lead!.textContent).toBe("Open Aatrox in ");
    // Whatever is not sr-only is the visible label.
    const clone = link.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".sr-only").forEach((el) => el.remove());
    expect(clone.textContent?.trim()).toBe("Combat Lab");
  });

  it("is a quiet link, not a bordered gold button, and keeps a touch-sized hit area and focus ring", () => {
    const { link } = renderLink("Aatrox");
    const cls = link.className;
    expect(cls).not.toMatch(/(^|\s)border(\s|$)|border-\[/);
    expect(cls).not.toMatch(/bg-\[#c9a84c\]/);
    expect(cls).not.toMatch(/(^|\s)text-\[#c9a84c\]/);
    expect(cls).toMatch(/min-h-10/);
    expect(cls).toMatch(/focus-visible:ring-2/);
    expect(cls).toMatch(/whitespace-nowrap/);
  });

  it("decorative flask icon is hidden from assistive technology", () => {
    const { link } = renderLink("Aatrox");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("falls back to the full label when it does not end in 'Combat Lab'", () => {
    render(
      <MemoryRouter>
        <CombatLabHandoffLink handoff={{ href: "/combat-lab?attacker=x", label: "Something else" }} />
      </MemoryRouter>,
    );
    const link = screen.getByTestId("patch-report-combat-lab");
    expect(link).toHaveAccessibleName("Something else");
    expect(link.querySelector(".sr-only")).toBeNull();
    expect(link).toHaveTextContent("Something else");
  });
});
