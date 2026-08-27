// ---------------------------------------------------------------------------
// VERIFY1 — Settings → Account Connections.
//
// The behaviours that matter here are the ones a security review would ask
// about: the ticket never survives in the address bar, nothing is committed
// without an explicit confirmation, cancelling commits nothing, and Riot never
// presents a usable control it cannot honour.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  user: { id: "u-1", is_anonymous: false } as { id: string; is_anonymous: boolean } | null,
  availability: { discord: true, riot: false },
  links: [] as unknown[],
  preview: vi.fn(),
  redeem: vi.fn(),
  start: vi.fn(),
  disconnect: vi.fn(),
  setPreference: vi.fn(),
  assigned: [] as string[],
}));

// The real client is pulled in transitively and would try to open a session.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mocks.user, signOut: vi.fn() }),
}));

// Only the network surface is stubbed. The pure helpers (label, prompt, URL
// parsing and stripping) stay real, because the URL hygiene is under test.
vi.mock("@/lib/identity/connections", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/connections")>();
  return {
    ...actual,
    fetchProviderAvailability: async () => mocks.availability,
    fetchIdentityLinks: async () => mocks.links,
    previewIdentityLink: mocks.preview,
    redeemIdentityLink: mocks.redeem,
    startIdentityLink: mocks.start,
    disconnectIdentityLink: mocks.disconnect,
    setIdentityPreference: mocks.setPreference,
  };
});

import AccountConnections from "./AccountConnections";

const DISCORD_IDENTITY = {
  provider: "discord" as const,
  username: "mogzy_dev",
  displayName: "Mogzy",
  tagLine: null,
  avatarUrl: null,
};

function connectedDiscord(over: Record<string, unknown> = {}) {
  return {
    id: "l-1",
    provider: "discord",
    username: "mogzy_dev",
    displayName: "Mogzy",
    tagLine: null,
    avatarUrl: null,
    verifiedAt: "2026-08-27T00:00:00Z",
    contactConsent: false,
    publicOnProfile: false,
    ...over,
  };
}

function at(url: string) {
  window.history.replaceState({}, "", url);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AccountConnections />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.user = { id: "u-1", is_anonymous: false };
  mocks.availability = { discord: true, riot: false };
  mocks.links = [];
  mocks.preview.mockReset().mockResolvedValue(DISCORD_IDENTITY);
  mocks.redeem.mockReset().mockResolvedValue(undefined);
  mocks.start.mockReset().mockResolvedValue("https://discord.com/oauth2/authorize?x=1");
  mocks.disconnect.mockReset().mockResolvedValue(undefined);
  mocks.setPreference.mockReset().mockResolvedValue(undefined);
  at("/settings");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// --- availability ----------------------------------------------------------

describe("provider availability", () => {
  it("shows Riot as unavailable, with no usable connect control", async () => {
    renderPage();
    expect(await screen.findByTestId("connection-riot-unavailable")).toHaveTextContent(
      "Riot account verification is not available yet.",
    );
    expect(screen.queryByTestId("connection-riot-connect")).toBeNull();
  });

  it("offers Discord when it is configured", async () => {
    renderPage();
    expect(await screen.findByTestId("connection-discord-connect")).toBeTruthy();
    expect(screen.queryByTestId("connection-discord-unavailable")).toBeNull();
  });

  it("shows Discord as unavailable when no credentials are configured", async () => {
    mocks.availability = { discord: false, riot: false };
    renderPage();
    expect(await screen.findByTestId("connection-discord-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("connection-discord-connect")).toBeNull();
  });
});

// --- guests ----------------------------------------------------------------

describe("guests", () => {
  it("are routed to the existing account-save path, not to a connect button", async () => {
    mocks.user = { id: "guest", is_anonymous: true };
    renderPage();
    expect(await screen.findByTestId("connections-guest")).toBeTruthy();
    expect(screen.getByTestId("connections-create-account")).toBeTruthy();
    expect(screen.queryByTestId("connection-discord-connect")).toBeNull();
    expect(screen.queryByTestId("connection-riot-connect")).toBeNull();
  });
});

// --- the callback and its URL ---------------------------------------------

describe("OAuth return", () => {
  it("strips the ticket from the address bar immediately", async () => {
    at("/settings?connect=discord&status=pending&ticket=SECRET-TICKET");
    renderPage();
    await screen.findByTestId("connection-discord-confirm");
    expect(window.location.search).not.toContain("SECRET-TICKET");
    expect(window.location.search).not.toContain("ticket");
    expect(window.location.search).not.toContain("connect");
    expect(window.location.href).not.toContain("SECRET-TICKET");
  });

  it("preserves unrelated query parameters while removing the callback fields", async () => {
    at("/settings?tab=audio&connect=discord&status=pending&ticket=SECRET");
    renderPage();
    await screen.findByTestId("connection-discord-confirm");
    expect(new URLSearchParams(window.location.search).get("tab")).toBe("audio");
    expect(window.location.search).not.toContain("SECRET");
  });

  it("never writes the ticket to browser storage", async () => {
    at("/settings?connect=discord&status=pending&ticket=SECRET-TICKET");
    renderPage();
    await screen.findByTestId("connection-discord-confirm");
    expect(JSON.stringify(window.localStorage)).not.toContain("SECRET-TICKET");
    expect(JSON.stringify(window.sessionStorage)).not.toContain("SECRET-TICKET");
  });

  it("previews the identity without committing anything", async () => {
    at("/settings?connect=discord&status=pending&ticket=T");
    renderPage();
    expect(await screen.findByTestId("connection-discord-confirm")).toHaveTextContent(
      "Link Discord account Mogzy?",
    );
    expect(mocks.preview).toHaveBeenCalledWith("T");
    expect(mocks.redeem).not.toHaveBeenCalled();
  });

  it("reports a cancelled provider consent once, and does not preview", async () => {
    at("/settings?connect=discord&status=denied");
    renderPage();
    expect(await screen.findByTestId("connections-notice")).toHaveTextContent(
      "Discord connection cancelled.",
    );
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.redeem).not.toHaveBeenCalled();
  });

  it("does not replay the flow on a reload, because the URL no longer carries it", async () => {
    at("/settings?connect=discord&status=pending&ticket=T");
    const first = renderPage();
    await screen.findByTestId("connection-discord-confirm");
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    first.unmount();

    // The address bar is what a reload would replay from.
    renderPage();
    await screen.findByTestId("connection-discord-connect");
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("connection-discord-confirm")).toBeNull();
  });

  it("surfaces an expired ticket rather than a silent failure", async () => {
    mocks.preview.mockRejectedValue(new Error("invalid_ticket"));
    at("/settings?connect=discord&status=pending&ticket=STALE");
    renderPage();
    expect(await screen.findByTestId("connections-notice")).toHaveTextContent("expired");
    expect(mocks.redeem).not.toHaveBeenCalled();
  });
});

// --- confirmation ----------------------------------------------------------

describe("explicit confirmation", () => {
  it("commits only when the user confirms", async () => {
    at("/settings?connect=discord&status=pending&ticket=T");
    renderPage();
    await screen.findByTestId("connection-discord-confirm");
    expect(mocks.redeem).not.toHaveBeenCalled();

    mocks.links = [connectedDiscord()];
    fireEvent.click(screen.getByTestId("connection-discord-confirm-button"));
    await waitFor(() => expect(mocks.redeem).toHaveBeenCalledWith("T"));
    expect(await screen.findByTestId("connections-notice")).toHaveTextContent(
      "Discord account connected.",
    );
  });

  it("cancel abandons the flow and redeems nothing", async () => {
    at("/settings?connect=discord&status=pending&ticket=T");
    renderPage();
    await screen.findByTestId("connection-discord-confirm");
    fireEvent.click(screen.getByTestId("connection-discord-cancel-button"));
    await screen.findByTestId("connection-discord-connect");
    expect(mocks.redeem).not.toHaveBeenCalled();
    expect(screen.queryByTestId("connection-discord-confirm")).toBeNull();
  });
});

// --- connected state -------------------------------------------------------

describe("connected Discord", () => {
  beforeEach(() => {
    mocks.links = [connectedDiscord()];
  });

  it("shows the verified identity and both switches OFF by default", async () => {
    renderPage();
    expect(await screen.findByTestId("connection-discord-identity")).toHaveTextContent("Mogzy");
    expect(screen.getByTestId("connection-discord-verified")).toBeTruthy();
    expect(screen.getByTestId("connection-discord-consent")).toHaveAttribute(
      "data-state",
      "unchecked",
    );
    expect(screen.getByTestId("connection-discord-public")).toHaveAttribute(
      "data-state",
      "unchecked",
    );
  });

  it("offers reconnect and disconnect", async () => {
    renderPage();
    expect(await screen.findByTestId("connection-discord-reconnect")).toBeTruthy();
    expect(screen.getByTestId("connection-discord-disconnect")).toBeTruthy();
  });

  it("saves contact consent only when the user turns it on", async () => {
    renderPage();
    await screen.findByTestId("connection-discord-consent");
    expect(mocks.setPreference).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("connection-discord-consent"));
    await waitFor(() =>
      expect(mocks.setPreference).toHaveBeenCalledWith("u-1", "discord", { contactConsent: true }),
    );
  });

  it("saves public visibility independently of contact consent", async () => {
    renderPage();
    await screen.findByTestId("connection-discord-public");
    fireEvent.click(screen.getByTestId("connection-discord-public"));
    await waitFor(() =>
      expect(mocks.setPreference).toHaveBeenCalledWith("u-1", "discord", { publicOnProfile: true }),
    );
    expect(mocks.setPreference).not.toHaveBeenCalledWith("u-1", "discord", { contactConsent: true });
  });

  it("disconnects on request", async () => {
    renderPage();
    await screen.findByTestId("connection-discord-disconnect");
    mocks.links = [];
    fireEvent.click(screen.getByTestId("connection-discord-disconnect"));
    await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledWith("discord"));
  });

  it("starts the ceremony from Connect", async () => {
    mocks.links = [];
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign, search: "", href: "http://localhost/settings" },
      writable: true,
    });
    renderPage();
    fireEvent.click(await screen.findByTestId("connection-discord-connect"));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith("discord"));
  });
});

// --- connected Riot --------------------------------------------------------

describe("connected Riot", () => {
  beforeEach(() => {
    mocks.availability = { discord: true, riot: true };
    mocks.links = [
      {
        id: "l-2",
        provider: "riot",
        username: "Mogzy",
        displayName: null,
        tagLine: "EUW",
        avatarUrl: null,
        verifiedAt: "2026-08-27T00:00:00Z",
        contactConsent: false,
        publicOnProfile: false,
      },
    ];
  });

  it("renders the Riot ID as gameName#tagLine", async () => {
    renderPage();
    expect(await screen.findByTestId("connection-riot-identity")).toHaveTextContent("Mogzy#EUW");
  });

  it("offers a public-profile switch but NO contact-consent switch", async () => {
    renderPage();
    expect(await screen.findByTestId("connection-riot-public")).toBeTruthy();
    expect(screen.queryByTestId("connection-riot-consent")).toBeNull();
  });
});
