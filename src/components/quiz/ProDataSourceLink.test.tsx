import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProDataSourceLink from "./ProDataSourceLink";

function renderLink(metadata?: Record<string, unknown> | null) {
  return render(
    <MemoryRouter>
      <ProDataSourceLink metadata={metadata} />
    </MemoryRouter>,
  );
}

describe("ProDataSourceLink", () => {
  it("renders a source link for valid champion-only metadata", () => {
    renderLink({ pro_data_source: { champion_slug: "akali" } });
    const link = screen.getByRole("link", { name: /view source data/i });
    expect(link).toHaveAttribute("href", "/lol/docs/pro/champions/akali");
  });

  it("preserves year, scope, and section in the destination", () => {
    renderLink({
      pro_data_source: { champion_slug: "akali", year: 2026, scope: "major", section: "scoped-stats" },
    });
    expect(screen.getByRole("link", { name: /view source data/i })).toHaveAttribute(
      "href",
      "/lol/docs/pro/champions/akali?year=2026&scope=major#scoped-stats",
    );
  });

  it("renders nothing when metadata is absent", () => {
    const { container } = renderLink(undefined);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders nothing when pro_data_source is missing", () => {
    const { container } = renderLink({ item_name: "Rabadon's Deathcap" });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when pro_data_source is malformed", () => {
    const { container } = renderLink({ pro_data_source: { champion_slug: "" } });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when a supplied optional field is invalid (fails closed)", () => {
    // A malformed citation must not silently widen to a broader champion link.
    const { container: badYear } = renderLink({
      pro_data_source: { champion_slug: "akali", year: 1500 },
    });
    expect(badYear).toBeEmptyDOMElement();

    const { container: badSection } = renderLink({
      pro_data_source: { champion_slug: "akali", year: 2011, section: "hack" },
    });
    expect(badSection).toBeEmptyDOMElement();

    const { container: badScope } = renderLink({
      pro_data_source: { champion_slug: "akali", scope: "challenger" },
    });
    expect(badScope).toBeEmptyDOMElement();
  });

  it("shows the trust caption", () => {
    renderLink({ pro_data_source: { champion_slug: "akali" } });
    expect(screen.getByText(/Mogsy's imported dataset/i)).toBeInTheDocument();
  });
});
