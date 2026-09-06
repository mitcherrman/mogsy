/**
 * Academy Updates — the Hall surface.
 *
 * The dormant contract comes first: the Hall must render exactly as it does
 * with the feature off, so "nothing at all" is the behaviour with the most
 * tests on it. WHATSNEW2 changed only where the two inputs come from, so every
 * presentation test below is WHATSNEW1's, unchanged — which is the point.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AcademyUpdates from "./AcademyUpdates";
import {
  getPublishedUpdates,
  isAcademyUpdatesActive,
  resolveUpdateCta,
  type AcademyUpdate,
} from "@/lib/lol/academy-updates";
import { hasUnseenUpdate, readSeenUpdateId } from "@/lib/lol/academy-updates-seen";
import { installLocalStorageStub } from "@/test/localStorageStub";

// The database boundary. Its own contract — "every failure resolves to an empty
// list" — is tested in academy-updates-store.test.ts; here it is a seam, so the
// component's fetch path can be driven without a Supabase client.
const store = vi.hoisted(() => ({ listPublishedUpdates: vi.fn() }));
vi.mock("@/lib/lol/academy-updates-store", () => ({
  listPublishedUpdates: store.listPublishedUpdates,
}));

const resetLocalStorage = installLocalStorageStub();

const NEWEST: AcademyUpdate = {
  id: "2026-09-04-newest",
  date: "2026-09-04",
  title: "The newest notice",
  body: "Something a player can now do.",
  published: true,
  cta: { label: "Open Ranked", href: "/lol/ranked" },
};

const OLDER: AcademyUpdate = {
  id: "2026-08-01-older",
  date: "2026-08-01",
  title: "An older notice",
  body: "Something from before.",
  published: true,
};

const DRAFT: AcademyUpdate = {
  id: "2026-09-09-draft",
  date: "2026-09-09",
  title: "A draft nobody should read",
  body: "Unpublished.",
  published: false,
};

function renderUpdates(props: Parameters<typeof AcademyUpdates>[0] = {}) {
  return render(
    <MemoryRouter>
      <AcademyUpdates {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  resetLocalStorage();
  store.listPublishedUpdates.mockReset();
  store.listPublishedUpdates.mockResolvedValue([]);
});
afterEach(() => cleanup());

describe("the default mount", () => {
  it("renders nothing when told nothing", () => {
    // A mount that says neither "enabled" nor "here are the notices" is the
    // fail-closed case, and it must be silent.
    const { container } = renderUpdates();
    expect(container).toBeEmptyDOMElement();
  });

  it("holds no update list of its own: the module exports none", async () => {
    // WHATSNEW2's whole purpose. Two production authorities — an array in
    // source and a table in Supabase — is the failure being removed, so the
    // absence of the array is asserted, not merely assumed.
    const module = await import("@/lib/lol/academy-updates");
    expect("ACADEMY_UPDATES" in module).toBe(false);
    expect("ACADEMY_UPDATES_ENABLED" in module).toBe(false);
  });

  it("fails closed on an empty list whatever the switch says", () => {
    expect(isAcademyUpdatesActive([], true)).toBe(false);
    expect(getPublishedUpdates([])).toEqual([]);
  });
});

describe("reading from the database", () => {
  it("makes no query at all while the feature is off", () => {
    renderUpdates({ enabled: false });
    expect(store.listPublishedUpdates).not.toHaveBeenCalled();
  });

  it("fetches published updates once the switch is on, and renders them", async () => {
    store.listPublishedUpdates.mockResolvedValue([NEWEST]);
    renderUpdates({ enabled: true });
    await waitFor(() => expect(screen.getByTestId("academy-updates-mark")).toBeInTheDocument());
    expect(store.listPublishedUpdates).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("academy-updates-mark"));
    expect(screen.getByText(NEWEST.title)).toBeInTheDocument();
  });

  it("keeps the database order, newest first", async () => {
    store.listPublishedUpdates.mockResolvedValue([NEWEST, OLDER]);
    renderUpdates({ enabled: true });
    await waitFor(() => expect(screen.getByTestId("academy-updates-mark")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("academy-updates-mark"));
    expect(
      screen.getAllByTestId("academy-update-entry").map((el) => el.getAttribute("data-update-id")),
    ).toEqual([NEWEST.id, OLDER.id]);
  });

  it("renders nothing when the read comes back empty — a failed read included", async () => {
    // The store converts every failure into an empty list, so this one case
    // covers a network error, an RLS refusal and an unapplied migration alike.
    store.listPublishedUpdates.mockResolvedValue([]);
    const { container } = renderUpdates({ enabled: true });
    await waitFor(() => expect(store.listPublishedUpdates).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing while the query is still in flight", async () => {
    let release: (v: AcademyUpdate[]) => void = () => {};
    store.listPublishedUpdates.mockReturnValue(
      new Promise<AcademyUpdate[]>((resolve) => {
        release = resolve;
      }),
    );
    const { container } = renderUpdates({ enabled: true });
    // Not a spinner, not a placeholder, not an empty panel: the Hall must be
    // undisturbed until there is genuinely something to say.
    expect(container).toBeEmptyDOMElement();
    release([NEWEST]);
    await waitFor(() => expect(screen.getByTestId("academy-updates-mark")).toBeInTheDocument());
  });

  it("never queries when the caller supplies its own notices", () => {
    renderUpdates({ enabled: true, updates: [NEWEST] });
    expect(screen.getByTestId("academy-updates-mark")).toBeInTheDocument();
    expect(store.listPublishedUpdates).not.toHaveBeenCalled();
  });
});

describe("dormant state", () => {
  it("renders nothing when disabled, even with published entries", () => {
    const { container } = renderUpdates({ enabled: false, updates: [NEWEST, OLDER] });
    expect(container).toBeEmptyDOMElement();
    // No mark and, critically, no invisible hit region either.
    expect(screen.queryByTestId("academy-updates-mark")).toBeNull();
    expect(screen.queryByTestId("academy-updates-hall")).toBeNull();
  });

  it("fails closed when enabled with zero published entries", () => {
    const { container } = renderUpdates({ enabled: true, updates: [DRAFT] });
    expect(container).toBeEmptyDOMElement();
  });

  it("fails closed when enabled with no entries at all", () => {
    const { container } = renderUpdates({ enabled: true, updates: [] });
    expect(container).toBeEmptyDOMElement();
  });
});

describe("activated state", () => {
  it("shows the affordance when enabled with a published update", () => {
    renderUpdates({ enabled: true, updates: [NEWEST] });
    const mark = screen.getByTestId("academy-updates-mark");
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveAttribute("aria-expanded", "false");
    // The panel is not merely hidden — it is not rendered.
    expect(screen.queryByTestId("academy-updates-panel")).toBeNull();
  });

  it("opens and closes the panel from the mark", () => {
    renderUpdates({ enabled: true, updates: [NEWEST] });
    const mark = screen.getByTestId("academy-updates-mark");
    fireEvent.click(mark);
    expect(screen.getByTestId("academy-updates-panel")).toBeInTheDocument();
    expect(mark).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(mark);
    expect(screen.queryByTestId("academy-updates-panel")).toBeNull();
  });

  it("closes on Escape and returns focus to the mark", () => {
    renderUpdates({ enabled: true, updates: [NEWEST] });
    const mark = screen.getByTestId("academy-updates-mark");
    fireEvent.click(mark);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("academy-updates-panel")).toBeNull();
    expect(document.activeElement).toBe(mark);
  });

  it("closes on the panel's own close button", () => {
    renderUpdates({ enabled: true, updates: [NEWEST] });
    fireEvent.click(screen.getByTestId("academy-updates-mark"));
    fireEvent.click(screen.getByRole("button", { name: "Close Academy Updates" }));
    expect(screen.queryByTestId("academy-updates-panel")).toBeNull();
  });

  it("excludes drafts from the panel", () => {
    renderUpdates({ enabled: true, updates: [DRAFT, NEWEST] });
    fireEvent.click(screen.getByTestId("academy-updates-mark"));
    expect(screen.getByText(NEWEST.title)).toBeInTheDocument();
    expect(screen.queryByText(DRAFT.title)).toBeNull();
  });

  it("orders published entries newest first regardless of authored order", () => {
    renderUpdates({ enabled: true, updates: [OLDER, NEWEST] });
    fireEvent.click(screen.getByTestId("academy-updates-mark"));
    const ids = screen
      .getAllByTestId("academy-update-entry")
      .map((el) => el.getAttribute("data-update-id"));
    expect(ids).toEqual([NEWEST.id, OLDER.id]);
  });

  it("caps the panel at three entries and says how many remain", () => {
    const many = [1, 2, 3, 4, 5].map((n) => ({
      ...OLDER,
      id: `e${n}`,
      date: `2026-08-0${n}`,
      title: `Notice ${n}`,
    }));
    renderUpdates({ enabled: true, updates: many });
    fireEvent.click(screen.getByTestId("academy-updates-mark"));
    expect(screen.getAllByTestId("academy-update-entry")).toHaveLength(3);
    expect(screen.getByText(/2 earlier notices below/i)).toBeInTheDocument();
  });

  it("renders an internal CTA as an in-app link", () => {
    renderUpdates({ enabled: true, updates: [NEWEST] });
    fireEvent.click(screen.getByTestId("academy-updates-mark"));
    const cta = screen.getByRole("link", { name: "Open Ranked" });
    expect(cta).toHaveAttribute("href", "/lol/ranked");
    expect(cta).not.toHaveAttribute("target");
  });

  it("renders an https CTA as an external anchor", () => {
    renderUpdates({
      enabled: true,
      updates: [{ ...NEWEST, cta: { label: "Read more", href: "https://example.com/x" } }],
    });
    fireEvent.click(screen.getByTestId("academy-updates-mark"));
    const cta = screen.getByRole("link", { name: "Read more" });
    expect(cta).toHaveAttribute("href", "https://example.com/x");
    expect(cta).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("drops a CTA whose href is neither a route nor https", () => {
    const hostile = { ...NEWEST, cta: { label: "Click", href: "javascript:alert(1)" } };
    expect(resolveUpdateCta(hostile)).toBeNull();
    renderUpdates({ enabled: true, updates: [hostile] });
    fireEvent.click(screen.getByTestId("academy-updates-mark"));
    expect(screen.queryByRole("link", { name: "Click" })).toBeNull();
  });
});

describe("seen state", () => {
  it("treats a browser that has stored nothing as having an unseen update", () => {
    expect(hasUnseenUpdate(NEWEST.id)).toBe(true);
    renderUpdates({ enabled: true, updates: [NEWEST] });
    expect(screen.getByTestId("academy-updates-mark")).toHaveAttribute("data-unseen", "true");
  });

  it("carries the new state in the accessible name, not only in the animation", () => {
    renderUpdates({ enabled: true, updates: [NEWEST] });
    expect(screen.getByRole("button", { name: "Academy Updates — new" })).toBeInTheDocument();
  });

  it("inks the desktop glyph Academy red while unseen, and only then", () => {
    renderUpdates({ enabled: true, updates: [NEWEST] });
    const glyph = screen.getByTestId("academy-updates-glyph");
    // Academy red is the UNSEEN treatment...
    expect(glyph.style.color).toBe("rgb(182, 58, 53)");
    // ...and the circle itself is untouched: the badge must not become red.
    // jsdom's CSS parser drops the multi-stop parchment gradient altogether,
    // so the fill is asserted in the browser (see the verification run) and
    // here by what the circle carries in the DOM: its size, brass border and
    // shadow, and the fact that NO background class was swapped in.
    expect(glyph.className).toContain("border-[#b9934c]/70");
    expect(glyph.className).toContain("h-[28px]");
    expect(glyph.className).toContain("w-[28px]");
    expect(glyph.className).toContain("text-[17px]");
    expect(glyph.className).toContain("shadow-[0_2px_8px_rgba(0,0,0,0.5)]");
    expect(glyph.className).not.toMatch(/\bbg-/);

    fireEvent.click(screen.getByTestId("academy-updates-mark"));
    // Seen returns to the ordinary ink at 70% — quieter than unseen, and the
    // SAME size, so nothing shifts when a notice is read.
    expect(glyph.style.color).toBe("rgb(58, 44, 18)");
    expect(glyph.className).toContain("opacity-70");
    expect(glyph.className).toContain("h-[28px]");
    expect(glyph.className).toContain("text-[17px]");
  });

  it("leaves the mobile glyph on the ordinary ink in both states", () => {
    // The crimson is a desktop-only adjustment.
    renderUpdates({ variant: "mobile", enabled: true, updates: [NEWEST] });
    const glyph = screen.getByTestId("academy-updates-glyph");
    expect(glyph.style.color).toBe("rgb(58, 44, 18)");
    fireEvent.click(screen.getByTestId("academy-updates-mark"));
    expect(glyph.style.color).toBe("rgb(58, 44, 18)");
    // ...and the desktop enlargement did not leak into it either.
    expect(glyph.className).toContain("h-5");
    expect(glyph.className).toContain("text-[12px]");
  });

  it("marks the newest entry seen on open and goes quiet", () => {
    renderUpdates({ enabled: true, updates: [NEWEST, OLDER] });
    fireEvent.click(screen.getByTestId("academy-updates-mark"));
    expect(readSeenUpdateId()).toBe(NEWEST.id);
    expect(screen.getByTestId("academy-updates-mark")).toHaveAttribute("data-unseen", "false");
    expect(screen.getByRole("button", { name: "Academy Updates" })).toBeInTheDocument();
  });

  it("stays quiet on a later visit, but wakes for a newer entry", () => {
    renderUpdates({ enabled: true, updates: [NEWEST] });
    fireEvent.click(screen.getByTestId("academy-updates-mark"));
    cleanup();

    renderUpdates({ enabled: true, updates: [NEWEST] });
    expect(screen.getByTestId("academy-updates-mark")).toHaveAttribute("data-unseen", "false");
    cleanup();

    const newer = { ...NEWEST, id: "2026-09-20-newer", date: "2026-09-20" };
    renderUpdates({ enabled: true, updates: [newer, NEWEST] });
    expect(screen.getByTestId("academy-updates-mark")).toHaveAttribute("data-unseen", "true");
  });
});

describe("mobile variant", () => {
  it("renders a labelled row rather than a bare glyph, and opens the same panel", () => {
    renderUpdates({ variant: "mobile", enabled: true, updates: [NEWEST] });
    expect(screen.getByTestId("academy-updates-mobile")).toBeInTheDocument();
    expect(screen.getByText("Academy Updates")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("academy-updates-mark"));
    expect(screen.getByText(NEWEST.title)).toBeInTheDocument();
  });

  it("renders nothing on mobile while dormant", () => {
    const { container } = renderUpdates({ variant: "mobile", enabled: false, updates: [NEWEST] });
    expect(container).toBeEmptyDOMElement();
  });
});
