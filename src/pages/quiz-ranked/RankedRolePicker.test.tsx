/**
 * R1 role picker: the five roles, and the accessibility contract that makes
 * them usable without sight or a mouse.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RankedRolePicker } from "./RankedRolePicker";
import { RANKED_ROLES } from "@/lib/ranked-public/roles";

describe("RankedRolePicker", () => {
  it("renders exactly the five canonical roles, by name", () => {
    render(<RankedRolePicker value={null} onSelect={() => {}} />);
    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(5);
    // The NAME leads every option, in lane order.
    expect(options.map((o) => o.querySelector("div")?.textContent))
      .toEqual(["Top", "Jungle", "Mid", "ADC", "Support"]);
    // Nothing from the legacy class vocabulary leaks into the picker.
    for (const legacy of [/tank/i, /mage/i, /marksman/i]) {
      expect(screen.queryByText(legacy)).toBeNull();
    }
  });

  it("names every role in TEXT, so identity never depends on colour or art", () => {
    render(<RankedRolePicker value={null} onSelect={() => {}} />);
    for (const role of RANKED_ROLES) {
      const option = screen.getByTestId(`ranked-role-${role}`);
      expect(option.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("exposes selection as aria-checked, not styling alone", () => {
    render(<RankedRolePicker value="jungle" onSelect={() => {}} />);
    expect(screen.getByTestId("ranked-role-jungle")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("ranked-role-top")).toHaveAttribute("aria-checked", "false");
  });

  it("is a radiogroup with a single tab stop on the selected option", () => {
    render(<RankedRolePicker value="adc" onSelect={() => {}} />);
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    expect(screen.getByTestId("ranked-role-adc")).toHaveAttribute("tabindex", "0");
    expect(screen.getByTestId("ranked-role-top")).toHaveAttribute("tabindex", "-1");
  });

  it("moves focus AND selects with the arrow keys, and wraps", () => {
    const onSelect = vi.fn();
    render(<RankedRolePicker value="top" onSelect={onSelect} />);
    const top = screen.getByTestId("ranked-role-top");
    top.focus();
    fireEvent.keyDown(top, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith("jungle");
    expect(document.activeElement).toBe(screen.getByTestId("ranked-role-jungle"));
    // Wrap backwards off the start of the group: top -> support.
    fireEvent.keyDown(screen.getByTestId("ranked-role-top"), { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenLastCalledWith("support");
  });

  it("Home and End jump to the ends of the group", () => {
    const onSelect = vi.fn();
    render(<RankedRolePicker value="mid" onSelect={onSelect} />);
    const mid = screen.getByTestId("ranked-role-mid");
    fireEvent.keyDown(mid, { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith("support");
    fireEvent.keyDown(screen.getByTestId("ranked-role-support"), { key: "Home" });
    expect(onSelect).toHaveBeenLastCalledWith("top");
  });

  it("selects on click", () => {
    const onSelect = vi.fn();
    render(<RankedRolePicker value={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("ranked-role-support"));
    expect(onSelect).toHaveBeenCalledWith("support");
  });

  it("goes inert while a write is in flight and marks the pending option", () => {
    render(<RankedRolePicker value={null} onSelect={() => {}} busy busyRole="mid" />);
    for (const role of RANKED_ROLES) {
      expect(screen.getByTestId(`ranked-role-${role}`)).toBeDisabled();
    }
    expect(screen.getByTestId("ranked-role-mid")).toHaveAttribute("aria-busy", "true");
  });

  it("carries a visible focus ring and reduced-motion-safe transitions", () => {
    render(<RankedRolePicker value={null} onSelect={() => {}} />);
    const cls = screen.getByTestId("ranked-role-top").className;
    expect(cls).toContain("focus-visible:ring-2");
    expect(cls).toContain("motion-reduce:transition-none");
    // 44px minimum touch target for mobile usability.
    expect(cls).toContain("min-h-[44px]");
  });
});
