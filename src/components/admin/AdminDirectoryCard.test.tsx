import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminDirectoryCard } from "./AdminDirectoryCard";
import type { AdminDirectoryItem } from "@/lib/admin/admin-directory";

const baseItem: AdminDirectoryItem = {
  id: "test-item",
  title: "Test Tool",
  description: "A test tool.",
  path: "/admin/test-tool",
  category: "Site Operations",
  status: "Internal",
  environment: "all",
  dangerLevel: "none",
};

const renderCard = (item: AdminDirectoryItem) =>
  render(
    <MemoryRouter>
      <AdminDirectoryCard item={item} />
    </MemoryRouter>,
  );

afterEach(cleanup);

describe("AdminDirectoryCard", () => {
  it("renders title, description, canonical path text, and textual status", () => {
    renderCard(baseItem);
    expect(screen.getByRole("heading", { level: 3, name: "Test Tool" })).toBeTruthy();
    expect(screen.getByText("A test tool.")).toBeTruthy();
    expect(screen.getByText("/admin/test-tool")).toBeTruthy();
    expect(screen.getByText("Internal")).toBeTruthy();
  });

  it("renders a descriptive primary open link to the canonical path", () => {
    renderCard(baseItem);
    const link = screen.getByRole("link", { name: /open test tool/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/admin/test-tool");
  });

  it("renders warnings and the Mutates Production label as text", () => {
    renderCard({
      ...baseItem,
      dangerLevel: "mutates-production",
      warning: "Publishes changes to the live public broadcast state.",
    });
    expect(
      screen.getByText("Publishes changes to the live public broadcast state."),
    ).toBeTruthy();
    expect(screen.getByText("Mutates Production")).toBeTruthy();
  });

  it("renders the required role as text", () => {
    renderCard({ ...baseItem, requiredRole: "master_admin" });
    expect(screen.getByText("Requires master_admin")).toBeTruthy();
  });

  it("renders same-tab child actions as internal links preserving query strings", () => {
    renderCard({
      ...baseItem,
      childActions: [{ label: "Builder", path: "/admin/test-tool?tab=builder" }],
    });
    const link = screen.getByRole("link", { name: "Builder" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/admin/test-tool?tab=builder");
    expect(link.getAttribute("target")).toBeNull();
  });

  it("renders new-tab child actions with safe rel attributes and their note", () => {
    renderCard({
      ...baseItem,
      childActions: [
        { label: "Live view", path: "/broadcast/live-view", newTab: true, note: "public OBS viewer surface" },
      ],
    });
    const link = screen.getByRole("link", {
      name: /live view \(public obs viewer surface\)/i,
    }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/broadcast/live-view");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders legacy aliases as metadata text, not links", () => {
    renderCard({ ...baseItem, legacyAliases: ["/admin/old-tool"] });
    expect(screen.getByText(/legacy aliases.*\/admin\/old-tool/i)).toBeTruthy();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/admin/old-tool");
  });
});
