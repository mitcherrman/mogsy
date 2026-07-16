import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdSlot from "./AdSlot";
import { setAdEventSink } from "@/lib/ads/analytics";
import type { AdsConfig } from "@/lib/ads/config";

const mocks = vi.hoisted(() => ({
  config: {
    adsGloballyEnabled: false,
    thirdPartyAdsEnabled: false,
    houseAdsEnabled: false,
    placeholdersEnabled: false,
  } as AdsConfig,
  proStatus: "free" as "unknown" | "pro" | "free",
  user: null as null | { id: string; is_anonymous?: boolean },
}));

vi.mock("@/lib/ads/config", () => ({
  getAdsConfig: () => ({ ...mocks.config }),
}));

vi.mock("@/hooks/useSitewideTheme", () => ({
  useSitewideTheme: () => ({ proStatus: mocks.proStatus }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));

vi.mock("@/lib/funnel-analytics", () => ({
  trackFunnelEvent: vi.fn(),
}));

function mount(props: Partial<React.ComponentProps<typeof AdSlot>> = {}, route = "/quiz") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AdSlot placement="quiz_results" {...props} />
    </MemoryRouter>,
  );
}

describe("AdSlot", () => {
  beforeEach(() => {
    mocks.config = {
      adsGloballyEnabled: true,
      thirdPartyAdsEnabled: false,
      houseAdsEnabled: true,
      placeholdersEnabled: false,
    };
    mocks.proStatus = "free";
    mocks.user = { id: "u1" };
    setAdEventSink(() => {});
  });

  afterEach(() => {
    cleanup();
    setAdEventSink(null);
  });

  it("renders nothing at all when the kill switch is off (no reserved space)", () => {
    mocks.config.adsGloballyEnabled = false;
    const { container } = mount();
    expect(container.innerHTML).toBe("");
  });

  it("does not throw with missing/disabled configuration", () => {
    mocks.config = {
      adsGloballyEnabled: false,
      thirdPartyAdsEnabled: false,
      houseAdsEnabled: false,
      placeholdersEnabled: false,
    };
    expect(() => mount()).not.toThrow();
  });

  it("renders a house promotion for a free user on an allowed results surface", () => {
    mount();
    expect(screen.getByText("From Mogzy")).toBeInTheDocument();
    const slot = document.querySelector('[data-ad-slot="quiz_results"]') as HTMLElement;
    expect(slot).not.toBeNull();
    expect(slot.style.minHeight).toBe("120px");
  });

  it("renders nothing while a signed-in user's entitlement is loading (no Pro ad flash)", () => {
    mocks.proStatus = "unknown";
    const { container } = mount();
    expect(container.innerHTML).toBe("");
  });

  it("does not show the Pro upsell house creative to Pro users", () => {
    mocks.proStatus = "pro";
    mount();
    expect(screen.queryByText(/Upgrade to Pro/i)).not.toBeInTheDocument();
    // Pro still gets an ordinary product recommendation on this surface.
    expect(screen.getByText("From Mogzy")).toBeInTheDocument();
  });

  it("renders nothing during an active quiz question", () => {
    const { container } = mount({ isActiveQuizQuestion: true });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing during an active ranked match or recovery", () => {
    expect(mount({ isActiveRankedMatch: true }).container.innerHTML).toBe("");
    cleanup();
    expect(mount({ isRankedRecoveryState: true }).container.innerHTML).toBe("");
  });

  it("renders nothing on admin/auth/dev/policy routes even when enabled", () => {
    for (const route of ["/admin", "/auth", "/dev/ranked-duel", "/privacy", "/shop"]) {
      const { container, unmount } = mount({}, route);
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });

  it("shows the dev placeholder when only placeholders are enabled", () => {
    mocks.config.houseAdsEnabled = false;
    mocks.config.placeholdersEnabled = true;
    mount();
    expect(screen.getByText(/Ad placeholder \(dev only\)/i)).toBeInTheDocument();
  });

  it("never renders third-party content (no provider exists; no scripts)", () => {
    mocks.config.thirdPartyAdsEnabled = true;
    mocks.config.houseAdsEnabled = false;
    mocks.config.placeholdersEnabled = false;
    const { container } = mount();
    // consent is structurally "unknown" -> suppressed; nothing in the DOM,
    // and no adsbygoogle global was touched by this component.
    expect(container.innerHTML).toBe("");
    expect(document.querySelector("ins.adsbygoogle")).toBeNull();
  });

  it("unknown placement ids cannot silently render", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/quiz"]}>
        <AdSlot placement={"bogus_slot" as never} />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe("");
  });
});
