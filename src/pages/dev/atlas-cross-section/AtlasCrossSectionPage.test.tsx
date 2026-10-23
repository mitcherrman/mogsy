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
import { createFixtureAdapter } from "@/lib/atlas-cross-section/fixtureAdapter";
import AtlasCrossSectionPage from "./AtlasCrossSectionPage";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

const adapter = createFixtureAdapter({ latencyMs: 0 });

function mount(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/lol/dev/atlas-cross-section${search}`]}>
      <Routes>
        <Route path="/lol/dev/atlas-cross-section" element={<AtlasCrossSectionPage adapter={adapter} />} />
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
    await waitFor(() => expect(screen.getByText(/Applied: Topic: mana/)).toBeInTheDocument());
    await waitFor(() => {
      const rows = within(results()!).getAllByRole("listitem");
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(within(row).getAllByText("mana").length).toBeGreaterThan(0);
    });
    const manaPrompts = within(results()!).getAllByRole("listitem").map((r) => r.textContent);
    fireEvent.click(screen.getByRole("button", { name: /^Mana/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Cooldown/ }));
    await waitFor(() => expect(screen.getByText(/Applied: Topic: cooldown/)).toBeInTheDocument());
    await waitFor(() => {
      const prompts = within(results()!).getAllByRole("listitem").map((r) => r.textContent);
      expect(prompts).not.toEqual(manaPrompts);
    });
    // Unlocked vs locked are both represented without revealing an answer.
    expect(screen.getAllByLabelText("Unlocked").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Not yet unlocked").length).toBeGreaterThan(0);
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
    const main = within(results()!).getAllByRole("listitem").map((r) => r.textContent ?? "");
    expect(main.every((t) => !t.includes("Zhonya"))).toBe(true);

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
    await waitFor(() => expect(screen.queryAllByLabelText("Not yet unlocked")).toHaveLength(0));
    fireEvent.click(screen.getByRole("radio", { name: "Premium review" }));
    expect(await screen.findByText("Not available to this account")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: /Preview the collections/ }), { target: { value: "premium" } });
    await waitFor(() => expect(screen.getAllByText(/missed · 2026/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /Premium lookup 503/ }));
    expect(await screen.findByText("Entitlement check unavailable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Premium exclusive/ }));
    expect(await screen.findByText("Reserved collection")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Admin inventory" })).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: /Preview the collections/ }), { target: { value: "owner" } });
    fireEvent.click(await screen.findByRole("radio", { name: "Admin inventory" }));
    await waitFor(() => expect(screen.getAllByText(/answer-role edge/).length).toBeGreaterThan(0));
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
});
