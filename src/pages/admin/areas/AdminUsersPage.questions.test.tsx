import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

// QI1: Question Intelligence is an owner-only view inside Users › Audience.
// Everything the page reads is stubbed; this pins only where the view lives
// and who can reach it.

const roles = { isMasterAdmin: true };
vi.mock("@/hooks/useAdminRoles", () => ({ useAdminRoles: () => roles }));
vi.mock("@/lib/admin/analytics/loadAnalytics", () => ({
  ROW_CAP: 50_000,
  loadAnalytics: vi.fn(() => new Promise(() => {})),
}));
vi.mock("@/components/admin/users/QuestionIntelligencePanel", () => ({
  QuestionIntelligencePanel: () => <div data-testid="qi-panel-stub" />,
}));

import AdminUsersPage from "./AdminUsersPage";

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.search}</output>;
}

function renderAt(search: string) {
  render(
    <MemoryRouter initialEntries={[`/admin/users${search}`]}>
      <Routes>
        <Route path="/admin/users" element={<><AdminUsersPage /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("QI1 · Users › Audience › Question Intelligence", () => {
  beforeEach(() => {
    roles.isMasterAdmin = true;
  });

  it("opens from the Audience sub-tabs and replaces the traffic dashboard", () => {
    renderAt("?section=audience");
    expect(screen.getByTestId("analytics-loading")).toBeTruthy();
    fireEvent.click(screen.getByTestId("users-audience-subtabs-questions"));
    expect(screen.getByTestId("qi-panel-stub")).toBeTruthy();
    expect(screen.queryByTestId("analytics-loading")).toBeNull();
    expect(screen.queryByTestId("analytics-range")).toBeNull();
    expect(screen.getByTestId("where").textContent).toContain("view=questions");
  });

  it("is deep-linkable and returns to the traffic view", () => {
    renderAt("?section=audience&view=questions");
    expect(screen.getByTestId("qi-panel-stub")).toBeTruthy();
    fireEvent.click(screen.getByTestId("users-audience-subtabs-traffic"));
    expect(screen.queryByTestId("qi-panel-stub")).toBeNull();
    expect(screen.getByTestId("where").textContent).not.toContain("view=questions");
  });

  it("is not offered to a non-owner admin, even by URL", () => {
    roles.isMasterAdmin = false;
    renderAt("?section=audience&view=questions");
    expect(screen.queryByTestId("users-audience-subtabs")).toBeNull();
    expect(screen.queryByTestId("qi-panel-stub")).toBeNull();
    expect(screen.getByTestId("analytics-loading")).toBeTruthy();
  });
});
