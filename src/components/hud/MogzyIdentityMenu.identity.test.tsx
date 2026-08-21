import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * The identity model of the compound top-right control, as distinct from the
 * notification pipeline (MogzyIdentityMenu.notifications.test.tsx) and the
 * invite section (…invites.test.tsx).
 *
 * What this suite pins down is the thing the refactor is *for*: two symbols,
 * two destinations, no ambiguous capsule, and no feature quietly lost when the
 * bell and the account menu were folded into one control.
 */

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  // `search` is part of the real router's location and the menu reads it
  // (the sign-in item preserves the full current URL as returnTo).
  useLocation: () => ({ pathname: locationState.pathname, search: "" }),
  // jsdom has no navigation, and the real <Link> preventDefaults anyway — so
  // does this, or every asserted click logs a "navigation not implemented".
  Link: ({
    to,
    children,
    onClick,
    ...rest
  }: Record<string, unknown> & {
    to: string;
    children?: unknown;
    onClick?: (e: { preventDefault: () => void }) => void;
  }) => (
    <a
      href={to}
      {...rest}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
    >
      {children as never}
    </a>
  ),
}));
const locationState = vi.hoisted(() => ({ pathname: "/lol" }));

const invitesHook = vi.hoisted(() => ({
  invites: [] as unknown[],
  busyToken: null as string | null,
  accept: vi.fn(),
  acceptSwitch: vi.fn(),
  decline: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/hooks/useStatCheckInvites", () => ({ useStatCheckInvites: () => invitesHook }));

const authState = vi.hoisted(() => ({
  user: { id: "auth-uid", is_anonymous: false } as
    | null
    | { id: string; is_anonymous?: boolean; created_at?: string },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));

const adminCtx = vi.hoisted(() => ({ isAuthorized: false as boolean }));
vi.mock("@/lib/admin-auth/AdminAuthProvider", () => ({ useAdminAuth: () => adminCtx }));

vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({ settings: { nav_tab_mode: "play" } }),
}));
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: vi.fn() }));
vi.mock("@/lib/ui-sfx", () => ({ playUiSfx: vi.fn() }));
const funnel = vi.hoisted(() => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/lib/funnel-analytics", () => funnel);
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const db = vi.hoisted(() => ({
  notifications: [] as Record<string, unknown>[],
  reads: [] as { notification_id: string }[],
  roles: [] as { role: string }[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const resultFor = (table: string) => {
    if (table === "user_notifications") return { data: db.notifications, error: null };
    if (table === "user_notification_reads") return { data: db.reads, error: null };
    if (table === "user_roles") return { data: db.roles, error: null };
    return { data: [], error: null };
  };
  const makeBuilder = (table: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain, eq: chain, in: chain, gte: chain, order: chain, update: chain,
      maybeSingle: () => Promise.resolve({ data: { id: "profile-1" }, error: null }),
      single: () => Promise.resolve({ data: { id: "profile-1" }, error: null }),
      limit: () => Promise.resolve(resultFor(table)),
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve(resultFor(table)),
    });
    return b;
  };
  const channel: Record<string, unknown> = {};
  Object.assign(channel, { on: () => channel, subscribe: () => channel });
  return {
    supabase: {
      from: (table: string) => makeBuilder(table),
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});

import MogzyIdentityMenu from "./MogzyIdentityMenu";
import { ADMIN_HOME_PATH } from "@/lib/admin/admin-registry";

const notif = (over: Record<string, unknown> = {}) => ({
  id: "n1",
  title: "A notification",
  message: null,
  type: "general",
  image_url: null,
  created_at: new Date().toISOString(),
  target_type: "all",
  profile_id: null,
  metadata: {},
  action_url: null,
  ...over,
});

const chevron = () => screen.getByTestId("hud-notifications-trigger");
const portrait = () => screen.getByTestId("hud-profile");

/** b follows a in document order. */
const follows = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  authState.user = { id: "auth-uid", is_anonymous: false };
  adminCtx.isAuthorized = false;
  locationState.pathname = "/lol";
  db.notifications = [];
  db.reads = [];
  db.roles = [];
  invitesHook.invites = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("identity compound — two targets, one piece of chrome", () => {
  it("puts the Mogzy portrait before the chevron, so tab order is profile → notifications", () => {
    render(<MogzyIdentityMenu />);
    expect(follows(portrait(), chevron())).toBe(true);
  });

  it("makes the portrait a plain link to Profile — not a menu trigger", () => {
    render(<MogzyIdentityMenu />);
    const p = portrait();
    expect(p.getAttribute("href")).toBe("/profile");
    expect(p.getAttribute("aria-label")).toBe("Profile");
    // A portrait that opened something would be the ambiguous capsule this
    // refactor exists to avoid.
    expect(p.getAttribute("aria-haspopup")).toBeNull();
    expect(p.getAttribute("aria-expanded")).toBeNull();
  });

  it("does not open the panel when the portrait is clicked", () => {
    render(<MogzyIdentityMenu />);
    fireEvent.click(portrait());
    expect(screen.queryByTestId("notification-panel")).toBeNull();
    expect(chevron().getAttribute("aria-expanded")).toBe("false");
  });

  it("gives the chevron its own explicit, action-shaped accessible name", async () => {
    render(<MogzyIdentityMenu />);
    await waitFor(() => expect(chevron().getAttribute("aria-label")).toBe("Open notifications"));
    expect(chevron().getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("opens and closes notifications from the chevron alone", async () => {
    render(<MogzyIdentityMenu />);
    fireEvent.click(chevron());
    expect(await screen.findByTestId("notification-panel")).toBeTruthy();
    fireEvent.click(chevron());
    await waitFor(() => expect(screen.queryByTestId("notification-panel")).toBeNull());
  });

  it("keeps the chevron activatable by keyboard as its own tab stop", async () => {
    render(<MogzyIdentityMenu />);
    chevron().focus();
    expect(document.activeElement).toBe(chevron());
    // A <button> activates on Enter/Space natively; the contract under test is
    // that it IS a button and not a click-only div.
    expect(chevron().tagName).toBe("BUTTON");
    fireEvent.click(document.activeElement as Element);
    expect(await screen.findByTestId("notification-panel")).toBeTruthy();
  });
});

describe("unread badge — on the NOTIFICATIONS control, and inert", () => {
  it("appears over the notifications control once there is something unread", async () => {
    db.notifications = [notif({ id: "g", title: "Patch is live" })];
    render(<MogzyIdentityMenu />);
    const badge = await screen.findByTestId("hud-unread-badge");
    expect(badge.textContent).toBe("1");
    // AUTH1 §7: the count belongs to the inbox, so it is anchored inside the
    // notifications trigger.
    expect(chevron().contains(badge)).toBe(true);
  });

  it("is no longer attached to the profile portrait", async () => {
    db.notifications = [notif({ id: "g", title: "Patch is live" })];
    render(<MogzyIdentityMenu />);
    const badge = await screen.findByTestId("hud-unread-badge");
    // The portrait means identity and nothing else. A notification count on a
    // link to /profile reads as a fact about the account.
    expect(portrait().contains(badge)).toBe(false);
  });

  it("stays out of the layout, out of the pointer path, and out of the a11y tree", async () => {
    db.notifications = [notif({ id: "g", title: "Patch is live" })];
    render(<MogzyIdentityMenu />);
    const badge = await screen.findByTestId("hud-unread-badge");
    expect(badge.className).toContain("absolute");
    expect(badge.className).toContain("pointer-events-none");
    expect(badge.getAttribute("aria-hidden")).toBe("true");
    // Not a second focus stop and not a second reading of the count.
    expect(badge.getAttribute("tabindex")).toBeNull();
  });

  it("is absent when there is nothing unread", async () => {
    render(<MogzyIdentityMenu />);
    await waitFor(() => expect(chevron().getAttribute("aria-label")).toBe("Open notifications"));
    expect(screen.queryByTestId("hud-unread-badge")).toBeNull();
  });

  it("speaks the count through the chevron's name, not the badge", async () => {
    db.notifications = [notif({ id: "g", title: "Patch is live" })];
    render(<MogzyIdentityMenu />);
    await waitFor(() =>
      expect(chevron().getAttribute("aria-label")).toBe("Open notifications: 1 unread"),
    );
  });
});

describe("hit targets and the branded pop", () => {
  /**
   * These pin the SHAPE of the hover, never its magnitude. The scale value is
   * a design dial and will move; what must not move is which box carries the
   * transform — because that is the whole zero-layout-shift guarantee.
   */
  const popClasses = (el: Element) =>
    el.className.split(/\s+/).filter((c) => /scale-\[|translate-y/.test(c));

  it("gives the portrait and the chevron 44px-tall targets", () => {
    render(<MogzyIdentityMenu />);
    expect(portrait().className).toMatch(/\bh-11\b/);
    expect(portrait().className).toMatch(/\bw-11\b/);
    expect(chevron().className).toMatch(/\bh-11\b/);
    // The chevron is narrower on purpose — a chevron centred in 44px of width
    // reads as a gap — but still far past the 28px it used to be.
    expect(chevron().className).toMatch(/\bw-10\b/);
  });

  it("keeps the transform off the box the layout measures", () => {
    render(<MogzyIdentityMenu />);
    // The link itself never scales…
    expect(popClasses(portrait())).toEqual([]);
    // …its visual child does. A transform on a child paints outside the
    // parent's box without reserving any, which is why the cluster's width,
    // the chevron's position and the document's scroll width cannot move.
    expect(popClasses(portrait().firstElementChild!).length).toBeGreaterThan(0);
  });

  it("gives keyboard focus the same emphasis as hover", () => {
    render(<MogzyIdentityMenu />);
    const classes = portrait().firstElementChild!.className;
    // Every hover transform has a focus-visible twin. A pop that only answers
    // the mouse would leave keyboard users with a duller control.
    const hovers = classes.match(/group-hover:[a-z-]*(scale|translate)[^\s]*/g) ?? [];
    expect(hovers.length).toBeGreaterThan(0);
    for (const h of hovers) {
      expect(classes).toContain(h.replace("group-hover:", "group-focus-visible:"));
    }
  });

  it("drops the transition, not the end state, under reduced motion", () => {
    render(<MogzyIdentityMenu />);
    const classes = portrait().firstElementChild!.className;
    expect(classes).toContain("motion-reduce:transition-none");
    // The scale utilities carry no motion-reduce variant, so the affordance
    // still lands — it just lands instantly.
    expect(classes).not.toMatch(/motion-reduce:[a-z-]*scale/);
  });

  it("keeps the chevron restrained — no mascot pop on a utility control", () => {
    render(<MogzyIdentityMenu />);
    const glyph = chevron().querySelector("svg")!;
    const scales = [chevron(), glyph].flatMap((el) =>
      el.getAttribute("class")!.split(/\s+/).filter((c) => c.includes("scale-[")),
    );
    // A nudge is fine; anything in mascot territory is not.
    for (const c of scales) {
      const n = Number(c.match(/scale-\[([\d.]+)\]/)?.[1] ?? "1");
      expect(n).toBeLessThan(1.15);
    }
  });

  it("keeps the badge out of the portrait's transformed group entirely", async () => {
    db.notifications = [notif({ id: "g", title: "Patch is live" })];
    render(<MogzyIdentityMenu />);
    const badge = await screen.findByTestId("hud-unread-badge");
    const visual = portrait().firstElementChild!;
    // AUTH1 §7 moved it to the notifications control, which is a utility and
    // deliberately does NOT pop — so the badge no longer scales with anything.
    expect(visual.contains(badge)).toBe(false);
    expect(popClasses(chevron()).length).toBe(0);
  });

  it("keeps the badge inside the notifications control's own 44px box", async () => {
    db.notifications = [notif({ id: "g", title: "Patch is live" })];
    render(<MogzyIdentityMenu />);
    const badge = await screen.findByTestId("hud-unread-badge");
    // The header band leaves ~10px of headroom. A deep negative top offset
    // would put the badge above the top of the viewport, where it is simply
    // clipped. A half-step overhang stays inside the band at every width.
    expect(badge.className).toMatch(/-top-0\.5\b/);
    expect(badge.className).not.toMatch(/-top-[1-9]/);
    // Still inert: no layout, no pointer, no second reading of the count.
    expect(badge.className).toContain("absolute");
    expect(badge.className).toContain("pointer-events-none");
    expect(badge.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("notifications panel footer", () => {
  it("puts Settings at the bottom, pointing at the existing route", async () => {
    db.notifications = [notif({ id: "g", title: "Patch is live" })];
    render(<MogzyIdentityMenu />);
    fireEvent.click(chevron());
    const panel = await screen.findByTestId("notification-panel");
    const settings = screen.getByTestId("hud-settings-link");
    expect(settings.getAttribute("href")).toBe("/settings");
    expect(panel.contains(settings)).toBe(true);
    // Last, after the inbox — not floating above it.
    expect(follows(await screen.findByText("Patch is live"), settings)).toBe(true);
  });

  it("keeps the footer outside the scrolling body, so a long inbox cannot bury it", async () => {
    render(<MogzyIdentityMenu />);
    fireEvent.click(chevron());
    const settings = await screen.findByTestId("hud-settings-link");
    const scroller = document
      .querySelector("[data-testid='notification-panel'] .overflow-y-auto");
    expect(scroller).not.toBeNull();
    expect(scroller!.contains(settings)).toBe(false);
  });

  it("closes the panel and returns focus to the chevron when Settings is used", async () => {
    render(<MogzyIdentityMenu />);
    fireEvent.click(chevron());
    fireEvent.click(await screen.findByTestId("hud-settings-link"));
    await waitFor(() => expect(screen.queryByTestId("notification-panel")).toBeNull());
    expect(document.activeElement).toBe(chevron());
  });

  it("exposes Settings exactly once in the whole HUD surface", async () => {
    render(<MogzyIdentityMenu />);
    fireEvent.click(chevron());
    await screen.findByTestId("hud-settings-link");
    expect(screen.getAllByTestId("hud-settings-link")).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: /^settings$/i })).toHaveLength(1);
  });
});

describe("admin entry point (migrated from the account menu)", () => {
  it("shows Admin in the footer for an authorized admin, targeting the Admin home", async () => {
    adminCtx.isAuthorized = true;
    render(<MogzyIdentityMenu />);
    fireEvent.click(chevron());
    const link = await screen.findByTestId("hud-admin-link");
    // The entry point is the Admin application itself, not the tool index.
    // /admin/directory survives as a permanent redirect (see admin-registry).
    expect(link.getAttribute("href")).toBe(ADMIN_HOME_PATH);
    expect(ADMIN_HOME_PATH).toBe("/admin");
    expect(link.textContent).toBe("Admin");
  });

  it("renders no Admin item — and no placeholder — for a non-admin", async () => {
    render(<MogzyIdentityMenu />);
    fireEvent.click(chevron());
    await screen.findByTestId("notification-panel");
    expect(screen.queryByTestId("hud-admin-link")).toBeNull();
    expect(document.body.innerHTML).not.toContain("hud-admin-link");
  });

  it("reaches an admin authorized without an account, via the guest panel", async () => {
    // The explicit admin-key fallback authorizes with no real Supabase user, so
    // the guest branch has to carry the footer too — otherwise a fallback-key
    // operator loses the entry point entirely.
    authState.user = null;
    adminCtx.isAuthorized = true;
    render(<MogzyIdentityMenu />);
    fireEvent.click(chevron());
    const link = await screen.findByTestId("hud-admin-link");
    expect(link.getAttribute("href")).toBe(ADMIN_HOME_PATH);
  });
});

describe("sign-out and account actions", () => {
  it("keeps sign-out reachable in exactly one hop, via Settings", async () => {
    // The account menu never owned a sign-out of its own — /settings has always
    // been the page that signs you out. The refactor preserves that by keeping
    // Settings one click from the HUD.
    render(<MogzyIdentityMenu />);
    fireEvent.click(chevron());
    expect((await screen.findByTestId("hud-settings-link")).getAttribute("href")).toBe(
      "/settings",
    );
  });
});

describe("theme picker hand-off", () => {
  it("offers Theme only where a picker is mounted", async () => {
    locationState.pathname = "/profile";
    render(<MogzyIdentityMenu />);
    fireEvent.click(chevron());
    expect(await screen.findByTestId("hud-theme-item")).toBeTruthy();
  });

  it("hides Theme inside the LoL section, where no picker is mounted", async () => {
    locationState.pathname = "/lol";
    render(<MogzyIdentityMenu />);
    fireEvent.click(chevron());
    await screen.findByTestId("notification-panel");
    expect(screen.queryByTestId("hud-theme-item")).toBeNull();
  });

  it("dispatches the existing event and closes", async () => {
    locationState.pathname = "/profile";
    const heard = vi.fn();
    window.addEventListener("open-theme-picker", heard);
    render(<MogzyIdentityMenu />);
    fireEvent.click(chevron());
    fireEvent.click(await screen.findByTestId("hud-theme-item"));
    expect(heard).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("notification-panel")).toBeNull());
    window.removeEventListener("open-theme-picker", heard);
  });
});

describe("guest behaviour", () => {
  beforeEach(() => {
    authState.user = { id: "anon-uid", is_anonymous: true };
    locationState.pathname = "/quiz";
  });

  it("still gives a guest a one-click portrait to the Profile route", () => {
    render(<MogzyIdentityMenu />);
    // Unchanged destination: the retired account menu sent guests to /profile
    // too. ProtectedRoute owns whatever gating applies there.
    expect(portrait().getAttribute("href")).toBe("/profile");
  });

  it("shows no unread badge to a guest", () => {
    render(<MogzyIdentityMenu />);
    expect(screen.queryByTestId("hud-unread-badge")).toBeNull();
  });

  it("does not claim to open notifications a guest cannot have", () => {
    render(<MogzyIdentityMenu />);
    expect(chevron().getAttribute("aria-label")).toBe("Open account menu");
  });

  it("carries the account menu's signup CTA, route, copy and funnel event", async () => {
    render(<MogzyIdentityMenu />);
    fireEvent.click(chevron());
    const item = await screen.findByTestId("hud-signup-menu-item");
    expect(item.getAttribute("href")).toBe("/auth?mode=signup&returnTo=%2Fquiz");
    expect(item.textContent).toContain("Sign up free");
    expect(item.textContent).toContain("Save your XP, streaks, and progress.");
    fireEvent.click(item);
    expect(funnel.trackFunnelEvent).toHaveBeenCalledWith("hud_signup_menu_clicked", {
      returnTo: "/quiz",
    });
  });

  it("keeps Settings reachable for a guest — that is where they sign in", async () => {
    render(<MogzyIdentityMenu />);
    fireEvent.click(chevron());
    expect((await screen.findByTestId("hud-settings-link")).getAttribute("href")).toBe(
      "/settings",
    );
  });

  it("opens an Account panel, never a notifications inbox", async () => {
    render(<MogzyIdentityMenu />);
    fireEvent.click(chevron());
    const panel = await screen.findByTestId("hud-guest-panel");
    expect(panel.getAttribute("aria-label")).toBe("Account");
    expect(screen.queryByTestId("notification-panel")).toBeNull();
  });
});

describe("retired controls", () => {
  it("renders no standalone bell", async () => {
    render(<MogzyIdentityMenu />);
    await waitFor(() => expect(chevron()).toBeTruthy());
    // The old trigger was a lone bell button; the only trigger now is the
    // chevron, and its icon is not the bell.
    expect(screen.queryByRole("button", { name: /^notifications: /i })).toBeNull();
    expect(chevron().querySelector("svg.lucide-bell")).toBeNull();
  });

  it("renders no second account trigger inside the compound", async () => {
    render(<MogzyIdentityMenu />);
    await waitFor(() => expect(chevron()).toBeTruthy());
    expect(screen.queryByTestId("hud-account-trigger")).toBeNull();
    // Exactly two interactive targets before anything is opened.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
