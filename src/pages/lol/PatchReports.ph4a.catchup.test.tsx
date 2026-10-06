/**
 * PH4-A, Catch-Up side: each entry's share link carries the explicit baseline
 * and its own #cu- anchor, and landing on it stays in Catch Up and survives a
 * refresh (a fresh mount of the same URL). Real loader over the frozen real
 * corpus.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, type Location } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CORPUS_RAW, corpusReports } from "@/lib/patch-catchup/test-support";
import { createBackend, installFetch, type FakeBackend } from "@/lib/patch-catchup-loader/test-support";
import { queryClient as appQueryClient } from "@/lib/query-client";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import PatchReports from "./PatchReports";

const BELVETH = "cu-sr-champions-bel-veth";
const SUNDERED = "cu-sr-items-sundered-sky";
const copyUrl = (since: string, id: string) => `https://mogzy.lol/lol/patch-reports?since=${since}#${id}`;

const scrolled: string[] = [];
beforeAll(() => {
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled.push(this.id);
  };
});

let backend: FakeBackend;
let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  backend = createBackend(corpusReports(), CORPUS_RAW.listedVersions);
  installFetch(backend);
  scrolled.length = 0;
  localStorage.clear();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const Probe = ({ out }: { out: { location?: Location } }) => {
  out.location = useLocation();
  return null;
};

function renderHub(entry: string) {
  const client = new QueryClient({ defaultOptions: appQueryClient.getDefaultOptions() });
  const out: { location?: Location } = {};
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/lol/patch-reports"
            element={
              <>
                <PatchReports />
                <Probe out={out} />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { out, ...utils };
}

const ready = () => screen.findByTestId("catchup-totals", undefined, { timeout: 5000 });
const shareOf = (id: string) => within(document.getElementById(id)!).getByTestId("catchup-entry-share");

describe("Catch-Up entry share", () => {
  it("Bel'Veth chain: copies ?since=26.14 + its #cu- anchor, never ?patch=", async () => {
    const { out } = renderHub("/lol/patch-reports?since=26.14");
    await ready();
    const button = shareOf(BELVETH);
    expect(button).toHaveAccessibleName("Copy link to Bel'Veth changes since Patch 26.14");
    fireEvent.click(button);
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith(copyUrl("26.14", BELVETH)));
    expect(writeText.mock.calls[0][0]).not.toContain("patch=");
    // Staying put: still Catch Up, same URL.
    expect(out.location!.search).toBe("?since=26.14");
    expect(screen.getByTestId("catchup-totals")).toBeInTheDocument();
  });

  it("Sundered Sky chain: exact URL under a different baseline", async () => {
    renderHub("/lol/patch-reports?since=26.10");
    await ready();
    fireEvent.click(shareOf(SUNDERED));
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith(copyUrl("26.10", SUNDERED)));
  });

  it("every entry has exactly one share control carrying its own id", async () => {
    renderHub("/lol/patch-reports?since=26.18");
    await ready();
    const entries = screen.getAllByTestId("catchup-entry");
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const buttons = within(entry).getAllByTestId("catchup-entry-share");
      expect(buttons).toHaveLength(1);
      expect(buttons[0].dataset.shareUrl).toBe(copyUrl("26.18", entry.id));
    }
  });

  it("the copied URL, opened fresh (a refresh), lands on the exact entry inside Catch Up", async () => {
    const first = renderHub("/lol/patch-reports?since=26.14");
    await ready();
    const url = new URL(shareOf(SUNDERED).dataset.shareUrl!);
    first.unmount();
    scrolled.length = 0;
    const { out } = renderHub(`${url.pathname}${url.search}${url.hash}`);
    await ready();
    await waitFor(() => expect(scrolled).toContain(SUNDERED));
    expect(out.location!.search).toBe("?since=26.14");
    expect(out.location!.hash).toBe(`#${SUNDERED}`);
    expect(screen.queryByTestId("patch-report-entity-share")).toBeNull(); // never silently the Patch Report
  });

  it("Catch-Up shows no Patch Report permalink controls and the report share does not appear", async () => {
    renderHub("/lol/patch-reports?since=26.14");
    await ready();
    await act(async () => {});
    expect(screen.queryAllByTestId("patch-report-entity-share")).toHaveLength(0);
  });
});
