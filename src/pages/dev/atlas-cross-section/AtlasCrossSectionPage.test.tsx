/**
 * ATL-CS-UX-001 — page journey in jsdom through the real reducer, the real
 * fixture adapter (zero latency) and the real plates. Covers the owner's
 * acceptance list: A alone, topic filtering, A × B, B.1 attached to B and
 * cleared when B changes, collection states per persona, keyboard paths.
 */
import { MotionGlobalConfig } from "framer-motion";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import examples from "@/lib/atlas-cross-section/__fixtures__/atlasQuestionsV0Examples.json";
import { createFixtureAdapter } from "@/lib/atlas-cross-section/fixtureAdapter";
import { createServerWireAdapter } from "@/lib/atlas-cross-section/serverWireAdapter";
import type { CrossSectionAdapter } from "@/lib/atlas-cross-section/types";
import AtlasCrossSectionPage from "./AtlasCrossSectionPage";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

const adapter = createFixtureAdapter({ latencyMs: 0 });

function mount(search = "", using: CrossSectionAdapter = adapter) {
  return render(
    <MemoryRouter initialEntries={[`/lol/dev/atlas-cross-section${search}`]}>
      <Routes>
        <Route path="/lol/dev/atlas-cross-section" element={<AtlasCrossSectionPage adapter={using} />} />
      </Routes>
    </MemoryRouter>,
  );
}

const railA = () => screen.getByRole("listbox", { name: /Axis A/ });
const railB = () => screen.getByRole("listbox", { name: /Axis B/ });
const pick = (rail: HTMLElement, name: RegExp) => fireEvent.click(within(rail).getByRole("option", { name }));
const results = () => screen.queryByRole("list", { name: "Matching questions" });

describe("ATL-CS page", () => {
  it("opens on a useful empty state marked DEMO DATA, with both rails present", () => {
    mount();
    expect(screen.getByTestId("acs-root")).toBeInTheDocument();
    expect(screen.getByText("Pick a subject on either axis")).toBeInTheDocument();
    expect(screen.getAllByText("DEMO DATA").length).toBeGreaterThan(0);
    expect(within(railA()).getAllByRole("option")).toHaveLength(10);
    expect(within(railB()).getAllByRole("option")).toHaveLength(10);
    expect(screen.getByRole("button", { name: /Featured demo investigation/ })).toBeInTheDocument();
  });

  it("A = Ahri: Ahri-only research; topic mana shows only mana questions and cooldown changes them", async () => {
    mount("?persona=account");
    pick(railA(), /^Ahri, champion/);
    expect(await screen.findByText("A only")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Questions" }));
    expect(await screen.findByRole("list", { name: "Matching questions" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Mana/ }));
    await waitFor(() => expect(screen.getByText(/Applied: Topic: Mana/)).toBeInTheDocument());
    await waitFor(() => {
      const rows = within(results()!).getAllByRole("listitem");
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(within(row).getAllByText("Mana").length).toBeGreaterThan(0);
    });
    const manaPrompts = within(results()!).getAllByRole("listitem").map((r) => r.textContent);
    fireEvent.click(screen.getByRole("button", { name: /^Mana/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Cooldown/ }));
    await waitFor(() => expect(screen.getByText(/Applied: Topic: Cooldown/)).toBeInTheDocument());
    await waitFor(() => {
      const prompts = within(results()!).getAllByRole("listitem").map((r) => r.textContent);
      expect(prompts).not.toEqual(manaPrompts);
    });
    // The catalog does not report discovery: null is shown as "not reported", never as "locked".
    expect(screen.getAllByLabelText("Discovery not reported here").length).toBeGreaterThan(0);
    expect(screen.queryAllByLabelText("Unlocked")).toHaveLength(0);
    expect(screen.queryAllByLabelText(/Not yet unlocked/)).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/correct answer/i);
  });

  it("A × B meets in the center; B.1 attaches to B, shows on B, and is cleared explicitly when B changes", async () => {
    mount("?persona=account");
    pick(railA(), /^Ahri, champion/);
    pick(railB(), /^Syndra, champion/);
    expect(await screen.findByText("A × B")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByText(/Base stats at level 1/)).toBeInTheDocument();

    // B.1 socket is enabled only because B is a champion.
    const socket = screen.getByRole("button", { name: /B\.1: equip an item on Syndra/ });
    expect(socket).toBeEnabled();
    fireEvent.click(socket);
    const itemList = await screen.findByRole("listbox", { name: "Items" });
    fireEvent.click(within(itemList).getByRole("option", { name: /Zhonya's Hourglass/ }));
    expect(await screen.findByText("A × (B + B.1)")).toBeInTheDocument();
    expect(screen.getByText(/Syndra \+ Zhonya's Hourglass/)).toBeInTheDocument();
    expect(screen.getByLabelText("B.1: Zhonya's Hourglass")).toBeInTheDocument();
    expect(screen.getByText(/Equipment intent, not a result/)).toBeInTheDocument();

    // Questions: B.1 questions are related, never in the intersection.
    fireEvent.click(screen.getByRole("button", { name: "Questions" }));
    const related = await screen.findByRole("region", { name: /Related: questions about Zhonya's Hourglass/ });
    expect(within(related).getAllByRole("listitem").length).toBeGreaterThan(0);
    // B.1 narrows the intersection to its attached item; the related panel never repeats it.
    const main = within(results()!).getAllByRole("listitem").map((r) => r.textContent ?? "");
    const aside = within(related).getAllByRole("listitem").map((r) => r.textContent ?? "");
    expect(main.length).toBeGreaterThan(0);
    expect(main.every((t) => t.includes("Zhonya"))).toBe(true);
    expect(aside.some((t) => main.includes(t))).toBe(false);
    expect(within(related).getByText(/not part of the A × B intersection/)).toBeInTheDocument();

    // Changing B clears B.1 and says so.
    pick(railB(), /^Lux, champion/);
    await waitFor(() => expect(screen.getByTestId("acs-live")).toHaveTextContent(/attached item was cleared/));
    expect(screen.queryByLabelText("B.1: Zhonya's Hourglass")).toBeNull();
    expect(screen.getByText("A × B")).toBeInTheDocument();

    // B as an item disables the socket with the reason.
    pick(railB(), /^Rabadon's Deathcap, item/);
    const disabledSocket = await screen.findByRole("button", { name: /B\.1 item slot\. Disabled/ });
    expect(disabledSocket).toBeDisabled();
  });

  it("tells the collections apart per persona without inventing a Premium supply", async () => {
    mount("?a=champion:Ahri&view=questions&persona=anonymous");
    expect(await screen.findByText("Sign in required")).toBeInTheDocument();
    expect(results()).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: /Preview the collections/ }), { target: { value: "account" } });
    expect(await screen.findByRole("list", { name: "Matching questions" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "My unlocked" }));
    await waitFor(() => expect(screen.getAllByLabelText("Unlocked").length).toBeGreaterThan(0));
    expect(screen.queryAllByLabelText("Discovery not reported here")).toHaveLength(0);
    fireEvent.click(screen.getByRole("radio", { name: "Premium review" }));
    expect(await screen.findByText("Not available to this account")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: /Preview the collections/ }), { target: { value: "premium" } });
    await waitFor(() => expect(screen.getAllByText(/missed ×1 · last 2026/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /Premium lookup 503/ }));
    expect(await screen.findByText("Entitlement check unavailable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Premium exclusive/ }));
    expect(await screen.findByText("Not configured")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Admin inventory" })).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: /Preview the collections/ }), { target: { value: "owner" } });
    fireEvent.click(await screen.findByRole("radio", { name: "Admin inventory" }));
    await waitFor(() => expect(screen.getAllByText(/catalog (listed|withheld)/).length).toBeGreaterThan(0));
  });

  it("walks the rails from the keyboard and clears with Delete", async () => {
    mount("?persona=account");
    const first = within(railA()).getAllByRole("option")[0];
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(within(railA()).getAllByRole("option")[1]);
    fireEvent.click(document.activeElement as HTMLElement);
    expect(await screen.findByText("A only")).toBeInTheDocument();
    expect(screen.getByTestId("acs-live")).toHaveTextContent(/Axis A: Syndra/);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Delete" });
    await waitFor(() => expect(screen.getByText("Pick a subject on either axis")).toBeInTheDocument());
  });

  it("honours forced reduced motion and restores state from the URL", async () => {
    mount("?a=champion:Ahri&b=champion:Syndra&b1=3157&view=compare&motion=reduce&level=9&slot=Q&rank=3");
    expect(screen.getByTestId("acs-root").dataset.reduced).toBe("true");
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
    expect(await screen.findByText("A × (B + B.1)")).toBeInTheDocument();
    expect(screen.getByText(/Base stats at level 9/)).toBeInTheDocument();
    expect(screen.getByText(/rank 3/)).toBeInTheDocument();
    await act(async () => {});
  });
  it("max rank is a symbolic toggle that lands in the URL and the applied filters", async () => {
    mount("?a=champion:Syndra&view=questions&persona=account");
    await screen.findByRole("list", { name: "Matching questions" });
    fireEvent.click(screen.getByRole("button", { name: "Max rank" }));
    await waitFor(() => expect(screen.getByText(/Applied: .*Rank max/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Max rank" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(within(results()!).getAllByText("max rank").length).toBe(1));
  });
});

/**
 * The page rendered over the REAL wire mapper: the server wire adapter answers
 * from the backend's committed example payloads through an in-memory
 * transport. No network exists; this proves the view shows wire facts
 * truthfully (separate B.1 panel, unsupported relation, partial coverage,
 * entitlement outage, request failure) rather than fixture ones.
 */
describe("ATL-CS page over the wire mapper (in-memory transport)", () => {
  type Example = { status: number; body: Record<string, unknown> };
  const wireAdapter = (name: string, mutate?: (e: Example) => void): CrossSectionAdapter =>
    createServerWireAdapter(async () => {
      const found = (examples as unknown as Record<string, Example>)[name];
      const e = structuredClone(found);
      const body = e.body as { query?: { filters: { patch: string | null } } | null };
      if (body.query) body.query.filters.patch = "current";
      mutate?.(e);
      return { status: e.status, body: e.body };
    });

  it("shows B.1 questions in their own panel, an unsupported relation, partial coverage and what is not indexed", async () => {
    mount("?a=champion:Ahri&b=champion:Syndra&b1=3089&view=questions&collection=catalog&persona=account", wireAdapter("A=Ahri B=Syndra B.1=3089 (catalog, flag on)"));
    expect(await screen.findByText(/No certified relation/)).toBeInTheDocument();
    // No intersection list, but the B.1 panel still shows what the server returned.
    expect(results()).toBeNull();
    const related = await screen.findByRole("region", { name: /Related: questions about Rabadon's Deathcap/ });
    expect(within(related).getByText("How much does Rabadon's Deathcap cost?")).toBeInTheDocument();
    expect(within(related).getByText("Gold & cost")).toBeInTheDocument();
    expect(within(related).getByText(/not part of the A × B intersection/)).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/coverage partial/);
    expect(text).toMatch(/not every Mogzy question/);
    expect(text).toMatch(/Not indexed: ranked accepted bank, mastery curriculum/);
    expect(text).toMatch(/index 4b7bd8bb643dd32110d2/);
    expect(text).not.toMatch(/coverage full/i);
    expect(text).not.toMatch(/\d+ of \d+ families/);
    expect(text).not.toMatch(/DEMO DATA\)\./);
  });

  it("renders discovered results with server topic labels and a cursor, and says what is outside the index", async () => {
    mount("?a=champion:Ahri&view=questions&collection=discovered&persona=account", wireAdapter("A=Ahri (discovered, user U1)"));
    expect(await screen.findByRole("list", { name: "Matching questions" })).toBeInTheDocument();
    expect(within(results()!).getAllByText("Cooldown").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Unlocked").length).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(/4 of your unlocked questions are outside the indexed corpus/);
    expect(document.body.textContent).toMatch(/Showing 2 of 3/);
  });

  it("an entitlement outage is not a denial, an upsell or a zero", async () => {
    mount("?a=champion:Ahri&view=questions&collection=premium_review&persona=premium", wireAdapter("premium_review (lookup error)"));
    expect(await screen.findByText("Entitlement check unavailable")).toBeInTheDocument();
    expect(screen.getByText(/not a denial and not a Free upsell/)).toBeInTheDocument();
    expect(screen.queryByText("Not available to this account")).toBeNull();
    expect(screen.queryByText(/No matches/)).toBeNull();
    expect(results()).toBeNull();
  });

  it("401 reads as sign-in required; the catalog flag being off reads as not configured", async () => {
    const { unmount } = mount("?a=champion:Ahri&view=questions&collection=discovered", wireAdapter("discovered unauthenticated"));
    expect(await screen.findByText("Sign in required")).toBeInTheDocument();
    unmount();
    mount("?a=champion:Ahri&view=questions&collection=catalog", wireAdapter("catalog (default)"));
    expect(await screen.findByText("Not configured")).toBeInTheDocument();
    expect(screen.getByText(/catalog is not enabled yet/)).toBeInTheDocument();
    expect(screen.queryByText(/No matches/)).toBeNull();
  });

  it("a rejected request (400) or an unreadable answer is unavailable, never zero results", async () => {
    mount("?a=champion:Ahri&view=questions&collection=discovered", wireAdapter("invalid item id"));
    expect(await screen.findByText("Search request rejected")).toBeInTheDocument();
    expect(screen.queryByText(/No matches/)).toBeNull();
  });

  it("a response that fails validation shows the unavailable chip and no results", async () => {
    const poisoned = wireAdapter("A=Ahri (discovered, user U1)", (e) => {
      (e.body.results as Array<Record<string, unknown>>)[0].correct_answer = "Q";
    });
    mount("?a=champion:Ahri&view=questions&collection=discovered", poisoned);
    expect(await screen.findByRole("alert")).toHaveTextContent("Question index unavailable");
    expect(results()).toBeNull();
    expect(document.body.textContent).not.toMatch(/Cooldown of|What is the rank 1 cooldown/);
  });
});
