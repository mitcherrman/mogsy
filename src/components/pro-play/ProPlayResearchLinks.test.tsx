/**
 * The admin-only doorway onto Explore Pro Data.
 *
 * Two things matter and nothing else does: an admin can SEE the way in (the
 * whole reason the component exists — the gated pages are otherwise reachable
 * only by typing a URL), and a non-admin is not walked into a 403.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import ProPlayResearchLinks from "./ProPlayResearchLinks";
import { PRO_PLAY_MATCHUP_ROUTE, PRO_PLAY_SEARCH_ROUTE } from "@/lib/pro-play/routes";

const status = vi.hoisted(() => ({ value: "loading" as string }));
vi.mock("@/lib/admin-auth/AdminAuthProvider", () => ({
  useAdminAuth: () => ({ status: status.value }),
}));

function renderAs(value: string) {
  status.value = value;
  return render(
    <MemoryRouter>
      <ProPlayResearchLinks />
    </MemoryRouter>,
  );
}

describe("ProPlayResearchLinks", () => {
  it.each(["authorized", "authorized_via_fallback"])(
    "links an admin (%s) to the Matchup Explorer and to Search",
    (value) => {
      renderAs(value);
      expect(screen.getByRole("link", { name: /Matchup Explorer/ })).toHaveAttribute(
        "href",
        PRO_PLAY_MATCHUP_ROUTE,
      );
      expect(screen.getByRole("link", { name: /Pro Play Search/ })).toHaveAttribute(
        "href",
        PRO_PLAY_SEARCH_ROUTE,
      );
    },
  );

  it.each(["loading", "unauthorized", "error"])(
    "renders nothing while status is %s, so no one is sent to a 403",
    (value) => {
      const { container } = renderAs(value);
      expect(container).toBeEmptyDOMElement();
    },
  );
});
