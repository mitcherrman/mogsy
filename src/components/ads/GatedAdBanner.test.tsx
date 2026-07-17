import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GatedAdBanner from "./GatedAdBanner";
import type { AdsConfig } from "@/lib/ads/config";
import { resetConsentForTests, setConsentStateFromCmp } from "@/lib/ads/consent";

const mocks = vi.hoisted(() => ({
  config: {
    adsGloballyEnabled: true,
    thirdPartyAdsEnabled: true,
    houseAdsEnabled: false,
    placeholdersEnabled: false,
  } as AdsConfig,
  proStatus: "free" as "unknown" | "pro" | "free",
  user: { id: "u1" } as null | { id: string; is_anonymous?: boolean },
  ensureGoogleAdsScript: vi.fn((_arg?: unknown) => Promise.resolve(true)),
  publisherId: "ca-pub-9823769047605421" as string | null,
}));

vi.mock("@/lib/ads/config", () => ({ getAdsConfig: () => ({ ...mocks.config }) }));
vi.mock("@/hooks/useSitewideTheme", () => ({
  useSitewideTheme: () => ({ proStatus: mocks.proStatus }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }));
vi.mock("@/lib/ads/googleLoader", () => ({
  ensureGoogleAdsScript: (arg: unknown) => mocks.ensureGoogleAdsScript(arg),
  getAdsensePublisherId: () => mocks.publisherId,
}));
// AdBanner pushes into window.adsbygoogle — stub it for isolation.
vi.mock("@/components/AdBanner", () => ({
  default: ({ slot, clientId }: { slot: string; clientId?: string }) => (
    <div data-testid="google-unit" data-slot={slot} data-client={clientId} />
  ),
}));

function mount(slot = "1234567890", route = "/blog/some-post") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <GatedAdBanner slot={slot} />
    </MemoryRouter>,
  );
}

function grant() {
  act(() => setConsentStateFromCmp("granted"));
}

describe("GatedAdBanner (blog hardening + reactive consent)", () => {
  beforeEach(() => {
    mocks.config = {
      adsGloballyEnabled: true,
      thirdPartyAdsEnabled: true,
      houseAdsEnabled: false,
      placeholdersEnabled: false,
    };
    mocks.proStatus = "free";
    mocks.user = { id: "u1" };
    mocks.publisherId = "ca-pub-9823769047605421";
    mocks.ensureGoogleAdsScript.mockClear();
    resetConsentForTests();
  });

  afterEach(() => {
    cleanup();
    resetConsentForTests();
  });

  it("default consent (unknown) receives no unit and no loader call", () => {
    const { container } = mount();
    expect(container.innerHTML).toBe("");
    expect(mocks.ensureGoogleAdsScript).not.toHaveBeenCalled();
  });

  it("denied consent receives no unit", () => {
    act(() => setConsentStateFromCmp("denied"));
    const { container } = mount();
    expect(container.innerHTML).toBe("");
  });

  it("granting consent mid-session makes an eligible unit appear (reactive)", () => {
    const { container, getByTestId } = mount();
    expect(container.innerHTML).toBe("");
    grant();
    expect(getByTestId("google-unit")).toBeInTheDocument();
    expect(mocks.ensureGoogleAdsScript).toHaveBeenCalled();
  });

  it("withdrawal (granted → denied) suppresses future renders", () => {
    grant();
    const { container, getByTestId } = mount();
    expect(getByTestId("google-unit")).toBeInTheDocument();
    act(() => setConsentStateFromCmp("denied"));
    expect(container.querySelector('[data-testid="google-unit"]')).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("Pro readers receive no Google unit even with granted consent", () => {
    grant();
    mocks.proStatus = "pro";
    const { container } = mount();
    expect(container.innerHTML).toBe("");
    expect(mocks.ensureGoogleAdsScript).not.toHaveBeenCalled();
  });

  it("unknown signed-in entitlement receives no unit (fail closed)", () => {
    grant();
    mocks.proStatus = "unknown";
    const { container } = mount();
    expect(container.innerHTML).toBe("");
  });

  it("disabled flags receive no unit even with consent", () => {
    grant();
    mocks.config.thirdPartyAdsEnabled = false;
    expect(mount().container.innerHTML).toBe("");
    cleanup();
    mocks.config = { ...mocks.config, thirdPartyAdsEnabled: true, adsGloballyEnabled: false };
    expect(mount().container.innerHTML).toBe("");
    expect(mocks.ensureGoogleAdsScript).not.toHaveBeenCalled();
  });

  it("valid free/consented configuration renders a labeled unit via the single publisher source", () => {
    grant();
    const { getByTestId, getByText } = mount();
    const unit = getByTestId("google-unit");
    expect(unit.getAttribute("data-slot")).toBe("1234567890");
    expect(unit.getAttribute("data-client")).toBe("ca-pub-9823769047605421");
    expect(getByText("Advertisement")).toBeInTheDocument();
  });

  it("invalid slot IDs fail closed", () => {
    grant();
    for (const bad of ["", "auto", "abc123", "12 34"]) {
      const { container, unmount } = mount(bad);
      expect(container.innerHTML).toBe("");
      unmount();
    }
    expect(mocks.ensureGoogleAdsScript).not.toHaveBeenCalled();
  });

  it("missing publisher ID fails closed even when policy passes", () => {
    grant();
    mocks.publisherId = null;
    const { container } = mount();
    expect(container.querySelector('[data-testid="google-unit"]')).toBeNull();
  });

  it("excluded routes remain excluded regardless of consent", () => {
    grant();
    const { container } = mount("1234567890", "/admin/blog");
    expect(container.innerHTML).toBe("");
  });

  it("shows a dev diagnostic instead of a blank gap only when placeholders are enabled", () => {
    mocks.config.placeholdersEnabled = true;
    const { getByText } = mount();
    expect(getByText(/Blog ad suppressed \(dev\)/)).toBeInTheDocument();
  });
});
