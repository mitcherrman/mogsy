/**
 * Admin · Academy Updates (WHATSNEW2).
 *
 * Two things this suite is careful about.
 *
 * FIRST, the page is never optimistic. Every write re-reads before it changes
 * what is displayed, because the one thing an admin must be able to trust is
 * the status line: a page that showed "ON" after a refused write would tell the
 * owner their announcements were live when they were not.
 *
 * SECOND, authorization is Postgres's. The route gate is asserted separately
 * (`AdminAcademyUpdates.route.test.tsx`); here the store is a seam, and what is
 * tested is that a refusal coming back from it is surfaced as a failure and
 * leaves the displayed value untouched — which is the behaviour that matters
 * when the client-side chrome has been bypassed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import AdminAcademyUpdates from "./AdminAcademyUpdates";
import { POLICY_KEYS } from "@/lib/platform-policy/policy";
import type { AcademyUpdateRow } from "@/lib/lol/academy-updates-store";

const store = vi.hoisted(() => ({
  listAllUpdatesForAdmin: vi.fn(),
  readAcademyUpdatesEnabled: vi.fn(),
  writeAcademyUpdatesEnabled: vi.fn(),
  createUpdate: vi.fn(),
  updateUpdate: vi.fn(),
  setUpdatePublished: vi.fn(),
  deleteUpdate: vi.fn(),
}));
vi.mock("@/lib/lol/academy-updates-store", () => store);

// The route gate has its own suite; render its children here.
vi.mock("@/components/admin/AdminAuthGate", () => ({
  AdminAuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));

const PUBLISHED: AcademyUpdateRow = {
  id: "id-published",
  title: "Ranked is open",
  body: "You can now queue for a ranked match.",
  publish_date: "2026-09-05",
  published: true,
  cta_label: null,
  cta_href: null,
};

const DRAFT: AcademyUpdateRow = {
  id: "id-draft",
  title: "Not finished yet",
  body: "Half written.",
  publish_date: "2026-09-01",
  published: false,
  cta_label: null,
  cta_href: null,
};

function setup(
  rows: AcademyUpdateRow[] = [],
  enabled = false,
  errors: { list?: string; flag?: string } = {},
) {
  store.listAllUpdatesForAdmin.mockResolvedValue({ rows, error: errors.list ?? null });
  store.readAcademyUpdatesEnabled.mockResolvedValue({ enabled, error: errors.flag ?? null });
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminAcademyUpdates />
    </MemoryRouter>,
  );

/** The page loads asynchronously; every test starts after that settles. */
const renderLoaded = async () => {
  const utils = renderPage();
  await waitFor(() => expect(screen.getByTestId("academy-updates-status")).toBeInTheDocument());
  return utils;
};

const row = (id: string) =>
  screen.getAllByTestId("academy-update-row").find((el) => el.getAttribute("data-row-id") === id)!;

/** Radix AlertDialog: click the trigger, then the confirming action. */
const confirmDialog = async (name: RegExp) => {
  await waitFor(() => expect(screen.getByRole("alertdialog")).toBeInTheDocument());
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name }));
};

beforeEach(() => {
  for (const fn of Object.values(store)) fn.mockReset();
  store.writeAcademyUpdatesEnabled.mockResolvedValue({ error: null });
  store.createUpdate.mockResolvedValue({ error: null });
  store.updateUpdate.mockResolvedValue({ error: null });
  store.setUpdatePublished.mockResolvedValue({ error: null });
  store.deleteUpdate.mockResolvedValue({ error: null });
  setup();
});
afterEach(cleanup);

describe("current state", () => {
  it("shows a loading state before it claims anything about the feature", async () => {
    renderPage();
    expect(screen.getByTestId("academy-updates-loading")).toBeInTheDocument();
    // Nothing may assert ON or OFF until both facts are actually known.
    expect(screen.queryByTestId("academy-updates-state")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("academy-updates-status")).toBeInTheDocument());
  });

  it("reports OFF with no updates, and says visitors see nothing", async () => {
    await renderLoaded();
    expect(screen.getByTestId("academy-updates-state")).toHaveTextContent("OFF");
    expect(screen.getByTestId("academy-updates-visibility")).toHaveTextContent(
      /Visitors see nothing: the feature is off/i,
    );
  });

  it("reports ON with published updates, and how many are live", async () => {
    setup([PUBLISHED, DRAFT], true);
    await renderLoaded();
    expect(screen.getByTestId("academy-updates-state")).toHaveTextContent("ON");
    expect(screen.getByTestId("academy-updates-visibility")).toHaveTextContent(
      /Visitors to \/lol can see 1 published update\./i,
    );
  });

  it("says so plainly when the feature is on but nothing is published", async () => {
    // The trap this page exists to prevent: the switch reads ON, so the owner
    // believes announcements are live, while the Hall renders nothing.
    setup([DRAFT], true);
    await renderLoaded();
    expect(screen.getByTestId("academy-updates-state")).toHaveTextContent("ON");
    expect(screen.getByTestId("academy-updates-visibility")).toHaveTextContent(
      /Visitors see nothing: the feature is on, but nothing is published yet/i,
    );
  });

  it("treats published-while-off as a valid prepared state, not an error", async () => {
    setup([PUBLISHED], false);
    await renderLoaded();
    expect(screen.getByTestId("academy-updates-state")).toHaveTextContent("OFF");
    expect(screen.getByText(/Published updates:/)).toHaveTextContent("1");
    expect(screen.queryByTestId("academy-updates-load-error")).toBeNull();
  });

  it("counts published and drafts separately", async () => {
    setup([PUBLISHED, DRAFT]);
    await renderLoaded();
    const counts = screen.getByText(/Published updates:/);
    expect(counts).toHaveTextContent("Published updates: 1");
    expect(counts).toHaveTextContent("Drafts: 1");
  });

  it("reports a failed load rather than showing an empty list as 'nothing written'", async () => {
    setup([], false, { list: "permission denied" });
    await renderLoaded();
    expect(screen.getByTestId("academy-updates-load-error")).toBeInTheDocument();
  });

  it("shows OFF when the switch cannot be read", async () => {
    setup([], false, { flag: "permission denied" });
    await renderLoaded();
    // Fail closed: never claim a feature is live without proof.
    expect(screen.getByTestId("academy-updates-state")).toHaveTextContent("OFF");
  });
});

describe("the list", () => {
  it("distinguishes draft from published", async () => {
    setup([PUBLISHED, DRAFT]);
    await renderLoaded();
    expect(within(row("id-published")).getByTestId("academy-update-status")).toHaveTextContent(
      "Published",
    );
    expect(within(row("id-draft")).getByTestId("academy-update-status")).toHaveTextContent("Draft");
  });

  it("shows date and title for each row", async () => {
    setup([PUBLISHED]);
    await renderLoaded();
    expect(within(row("id-published")).getByText("Ranked is open")).toBeInTheDocument();
    expect(within(row("id-published")).getByText(/5 Sept? 2026/)).toBeInTheDocument();
  });

  it("invites a first update when there are none", async () => {
    await renderLoaded();
    expect(screen.getByTestId("academy-updates-empty")).toHaveTextContent(/starts as a draft/i);
  });
});

describe("creating", () => {
  it("creates a draft, and never publishes on the same click", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByTestId("academy-updates-new"));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Ranked is open" } });
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Queue up." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(store.createUpdate).toHaveBeenCalledTimes(1));
    expect(store.createUpdate.mock.calls[0][0]).toMatchObject({
      title: "Ranked is open",
      body: "Queue up.",
    });
    expect(store.setUpdatePublished).not.toHaveBeenCalled();
  });

  it("refuses a title-less update", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByTestId("academy-updates-new"));
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Body only." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByTestId("academy-updates-form-error")).toHaveTextContent(/title/i);
    expect(store.createUpdate).not.toHaveBeenCalled();
  });

  it("refuses a body-less update", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByTestId("academy-updates-new"));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Just a title" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByTestId("academy-updates-form-error")).toHaveTextContent(/body/i);
    expect(store.createUpdate).not.toHaveBeenCalled();
  });

  it("reports a refused write and keeps the editor open", async () => {
    store.createUpdate.mockResolvedValue({ error: "new row violates row-level security policy" });
    await renderLoaded();
    fireEvent.click(screen.getByTestId("academy-updates-new"));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByTestId("academy-updates-form-error")).toHaveTextContent(/Not authorized/i),
    );
    // The author's text is not thrown away by a failure that was not theirs.
    expect(screen.getByTestId("academy-updates-editor")).toBeInTheDocument();
  });
});

describe("the CTA", () => {
  const fillAndSave = (label: string, href: string) => {
    fireEvent.click(screen.getByTestId("academy-updates-new"));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "B" } });
    fireEvent.change(screen.getByLabelText(/Button label/), { target: { value: label } });
    fireEvent.change(screen.getByLabelText(/Button link/), { target: { value: href } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
  };

  it("accepts an internal Mogzy route", async () => {
    await renderLoaded();
    fillAndSave("Open Ranked", "/lol/ranked");
    await waitFor(() => expect(store.createUpdate).toHaveBeenCalled());
    expect(store.createUpdate.mock.calls[0][0]).toMatchObject({ cta_href: "/lol/ranked" });
  });

  it("accepts an absolute https URL", async () => {
    await renderLoaded();
    fillAndSave("Read more", "https://example.com/post");
    await waitFor(() => expect(store.createUpdate).toHaveBeenCalled());
    expect(store.createUpdate.mock.calls[0][0]).toMatchObject({
      cta_href: "https://example.com/post",
    });
  });

  it("rejects a javascript: link rather than storing it", async () => {
    await renderLoaded();
    fillAndSave("Click", "javascript:alert(1)");
    expect(screen.getByTestId("academy-updates-form-error")).toHaveTextContent(/https:\/\//i);
    expect(store.createUpdate).not.toHaveBeenCalled();
  });

  it("rejects plain http, which the renderer would drop anyway", async () => {
    await renderLoaded();
    fillAndSave("Click", "http://example.com");
    expect(screen.getByTestId("academy-updates-form-error")).toBeInTheDocument();
    expect(store.createUpdate).not.toHaveBeenCalled();
  });

  it("rejects a label with no destination, and a destination with no label", async () => {
    await renderLoaded();
    fillAndSave("Dangling label", "");
    expect(screen.getByTestId("academy-updates-form-error")).toHaveTextContent(/destination/i);
    fireEvent.change(screen.getByLabelText(/Button label/), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(/Button link/), { target: { value: "/lol" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByTestId("academy-updates-form-error")).toHaveTextContent(/label/i);
    expect(store.createUpdate).not.toHaveBeenCalled();
  });

  it("stores NULL for both halves when the CTA is left blank", async () => {
    await renderLoaded();
    fillAndSave("", "");
    await waitFor(() => expect(store.createUpdate).toHaveBeenCalled());
    expect(store.createUpdate.mock.calls[0][0]).toMatchObject({
      cta_label: null,
      cta_href: null,
    });
  });
});

describe("editing", () => {
  it("opens with the row's current values and saves the changes", async () => {
    setup([PUBLISHED]);
    await renderLoaded();
    fireEvent.click(within(row("id-published")).getByLabelText(/^Edit /));

    expect(screen.getByLabelText("Title")).toHaveValue("Ranked is open");
    expect(screen.getByLabelText("Date")).toHaveValue("2026-09-05");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Ranked is live" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(store.updateUpdate).toHaveBeenCalledTimes(1));
    expect(store.updateUpdate.mock.calls[0][0]).toBe("id-published");
    expect(store.updateUpdate.mock.calls[0][1]).toMatchObject({ title: "Ranked is live" });
  });

  it("never changes visibility while editing content", async () => {
    // The seen-state contract: an edit is a correction, not an announcement, so
    // it must not touch `published` or the id.
    setup([PUBLISHED]);
    await renderLoaded();
    fireEvent.click(within(row("id-published")).getByLabelText(/^Edit /));
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Corrected." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(store.updateUpdate).toHaveBeenCalled());
    expect(store.updateUpdate.mock.calls[0][1]).not.toHaveProperty("published");
    expect(store.setUpdatePublished).not.toHaveBeenCalled();
  });

  it("previews through the real Academy Updates surface", async () => {
    await renderLoaded();
    fireEvent.click(screen.getByTestId("academy-updates-new"));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Ranked is open" } });
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "Queue up." } });
    // The mark comes from the shipped component, not a copy of it, so the
    // preview cannot drift from what visitors see.
    const preview = screen.getByTestId("academy-updates-preview");
    fireEvent.click(within(preview).getByTestId("academy-updates-mark"));
    expect(within(preview).getByText("Ranked is open")).toBeInTheDocument();
    expect(within(preview).getByText("Queue up.")).toBeInTheDocument();
  });
});

describe("publishing and withdrawing", () => {
  it("publishes a draft", async () => {
    setup([DRAFT]);
    await renderLoaded();
    fireEvent.click(within(row("id-draft")).getByLabelText(/^Publish /));
    await waitFor(() => expect(store.setUpdatePublished).toHaveBeenCalledWith("id-draft", true));
  });

  it("unpublishes a published update", async () => {
    setup([PUBLISHED]);
    await renderLoaded();
    fireEvent.click(within(row("id-published")).getByLabelText(/^Unpublish /));
    await waitFor(() =>
      expect(store.setUpdatePublished).toHaveBeenCalledWith("id-published", false),
    );
  });

  it("refuses to publish an update with no title or body", async () => {
    // A draft is allowed to be empty. A published notice is not — it would
    // render as a blank entry in the panel.
    setup([{ ...DRAFT, title: "", body: "" }]);
    await renderLoaded();
    fireEvent.click(within(row("id-draft")).getByLabelText(/^Publish /));
    expect(screen.getByTestId("academy-updates-row-error")).toHaveTextContent(
      /title and a body before publishing/i,
    );
    expect(store.setUpdatePublished).not.toHaveBeenCalled();
  });

  it("reports a refused publish", async () => {
    store.setUpdatePublished.mockResolvedValue({ error: "permission denied" });
    setup([DRAFT]);
    await renderLoaded();
    fireEvent.click(within(row("id-draft")).getByLabelText(/^Publish /));
    await waitFor(() =>
      expect(screen.getByTestId("academy-updates-row-error")).toHaveTextContent(/Not authorized/i),
    );
  });

  it("re-reads after a successful publish rather than assuming", async () => {
    setup([DRAFT]);
    await renderLoaded();
    expect(store.listAllUpdatesForAdmin).toHaveBeenCalledTimes(1);
    fireEvent.click(within(row("id-draft")).getByLabelText(/^Publish /));
    await waitFor(() => expect(store.listAllUpdatesForAdmin).toHaveBeenCalledTimes(2));
  });
});

describe("deleting", () => {
  it("asks first, then deletes", async () => {
    setup([PUBLISHED]);
    await renderLoaded();
    fireEvent.click(within(row("id-published")).getByLabelText(/^Delete /));
    // Confirmation is not optional for a permanent removal.
    expect(store.deleteUpdate).not.toHaveBeenCalled();
    await confirmDialog(/^Delete$/);
    await waitFor(() => expect(store.deleteUpdate).toHaveBeenCalledWith("id-published"));
  });

  it("reports a refused delete", async () => {
    store.deleteUpdate.mockResolvedValue({ error: "permission denied" });
    setup([PUBLISHED]);
    await renderLoaded();
    fireEvent.click(within(row("id-published")).getByLabelText(/^Delete /));
    await confirmDialog(/^Delete$/);
    await waitFor(() =>
      expect(screen.getByTestId("academy-updates-row-error")).toHaveTextContent(/Not authorized/i),
    );
  });
});

describe("the master switch", () => {
  it("turns off without ceremony — withdrawing is the safe direction", async () => {
    setup([PUBLISHED], true);
    await renderLoaded();
    fireEvent.click(screen.getByRole("switch", { name: "Academy Updates" }));
    await waitFor(() =>
      expect(store.writeAcademyUpdatesEnabled).toHaveBeenCalledWith(
        POLICY_KEYS.academyUpdatesEnabled,
        false,
      ),
    );
  });

  it("confirms before turning on, and says what visitors will see", async () => {
    setup([PUBLISHED], false);
    await renderLoaded();
    fireEvent.click(screen.getByRole("switch", { name: "Academy Updates" }));
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeInTheDocument());
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/1 published update/i);
    expect(store.writeAcademyUpdatesEnabled).not.toHaveBeenCalled();

    await confirmDialog(/Turn on/);
    await waitFor(() =>
      expect(store.writeAcademyUpdatesEnabled).toHaveBeenCalledWith(
        POLICY_KEYS.academyUpdatesEnabled,
        true,
      ),
    );
  });

  it("warns in the confirmation that turning on shows nothing while nothing is published", async () => {
    setup([DRAFT], false);
    await renderLoaded();
    fireEvent.click(screen.getByRole("switch", { name: "Academy Updates" }));
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeInTheDocument());
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/Nothing is published yet/i);
  });

  it("cancelling changes nothing", async () => {
    setup([PUBLISHED], false);
    await renderLoaded();
    fireEvent.click(screen.getByRole("switch", { name: "Academy Updates" }));
    await confirmDialog(/Cancel/);
    expect(store.writeAcademyUpdatesEnabled).not.toHaveBeenCalled();
    expect(screen.getByTestId("academy-updates-state")).toHaveTextContent("OFF");
  });

  it("re-reads the switch after writing, rather than displaying its own guess", async () => {
    setup([PUBLISHED], false);
    await renderLoaded();
    store.readAcademyUpdatesEnabled.mockResolvedValue({ enabled: true, error: null });
    fireEvent.click(screen.getByRole("switch", { name: "Academy Updates" }));
    await confirmDialog(/Turn on/);
    await waitFor(() => expect(screen.getByTestId("academy-updates-state")).toHaveTextContent("ON"));
    expect(store.readAcademyUpdatesEnabled).toHaveBeenCalledTimes(2);
  });

  it("leaves the displayed state alone when the write is refused", async () => {
    store.writeAcademyUpdatesEnabled.mockResolvedValue({ error: "permission denied" });
    setup([PUBLISHED], false);
    await renderLoaded();
    fireEvent.click(screen.getByRole("switch", { name: "Academy Updates" }));
    await confirmDialog(/Turn on/);
    await waitFor(() =>
      expect(screen.getByTestId("academy-updates-switch-error")).toHaveTextContent(
        /Not authorized/i,
      ),
    );
    // The critical assertion: a refused write must never leave the page saying
    // the feature is live.
    expect(screen.getByTestId("academy-updates-state")).toHaveTextContent("OFF");
  });

  it("only ever writes the one settings key it owns", async () => {
    setup([PUBLISHED], true);
    await renderLoaded();
    fireEvent.click(screen.getByRole("switch", { name: "Academy Updates" }));
    await waitFor(() => expect(store.writeAcademyUpdatesEnabled).toHaveBeenCalled());
    for (const call of store.writeAcademyUpdatesEnabled.mock.calls) {
      expect(call[0]).toBe(POLICY_KEYS.academyUpdatesEnabled);
    }
  });
});
