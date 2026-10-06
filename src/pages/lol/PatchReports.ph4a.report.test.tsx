/**
 * PH4-A, Patch Report side: canonical entity/change share links and resilient
 * deep-link landing. Real page, real loader and accessors over the frozen real
 * corpus (26.10–26.19); only `fetch`, the clipboard and the frame clock are
 * faked.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type Location, type NavigateFunction } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CORPUS_REPORTS, CORPUS_STATS, CORPUS_VERSIONS } from "@/lib/patch-impact/fixtures/corpus";
import { createBackend, deferred, installFetch, type FakeBackend } from "@/lib/patch-impact-loader/test-support";
import { queryClient as appQueryClient } from "@/lib/query-client";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import PatchReports from "./PatchReports";

const VI = "s-patch-champions__e-champion-vi";
const VI_AD = `${VI}__g-base-stats__c-attack-damage`;
const VI_SHIELD = `${VI}__g-p__c-shield`;
const DRAVEN = "s-patch-champions__e-champion-draven";
const DRAVEN_AD = `${DRAVEN}__g-base-stats__c-attack-damage`;
const url = (anchor: string, patch = "26.19") => `https://mogzy.lol/lol/patch-reports?patch=${patch}#${anchor}`;

const scrolled: string[] = [];
beforeAll(() => {
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled.push(this.id);
  };
});

let backend: FakeBackend;
let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  backend = createBackend(CORPUS_REPORTS, CORPUS_STATS, [...CORPUS_VERSIONS].reverse());
  installFetch(backend);
  scrolled.length = 0;
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  toast.success.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

type Probe = { location?: Location; navigate?: NavigateFunction };
const LocationProbe = ({ probe }: { probe: Probe }) => {
  probe.location = useLocation();
  probe.navigate = useNavigate();
  return null;
};

function renderHub(entry: string, be: FakeBackend = backend) {
  installFetch(be);
  const client = new QueryClient({ defaultOptions: appQueryClient.getDefaultOptions() });
  const probe: Probe = {};
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/lol/patch-reports"
            element={
              <>
                <PatchReports />
                <LocationProbe probe={probe} />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { probe, ...utils };
}

const entityEl = (anchor: string) => document.getElementById(anchor)!;

describe("entity share (the existing permalink icon)", () => {
  it("copies the exact ?patch= URL even when the page URL has no patch (Vi 26.19)", async () => {
    renderHub("/lol/patch-reports"); // no ?patch=: the page shows the latest, 26.19
    await screen.findAllByTestId("patch-hub-section");
    const link = within(entityEl(VI)).getByTestId("patch-report-entity-share");
    expect(link).toHaveAttribute("href", `/lol/patch-reports?patch=26.19#${VI}`);
    expect(link).toHaveAccessibleName("Copy link to Vi changes");
    fireEvent.click(link, { button: 0 });
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith(url(VI)));
    expect(toast.success).toHaveBeenCalledWith("Link copied");
  });

  it("names its own patch for an older report (Draven 26.19 vs the page's 26.18)", async () => {
    renderHub("/lol/patch-reports?patch=26.18");
    await screen.findAllByTestId("patch-hub-section");
    const first = document.querySelector<HTMLAnchorElement>('[data-testid="patch-report-entity-share"]')!;
    expect(first.getAttribute("href")).toMatch(/^\/lol\/patch-reports\?patch=26\.18#/);
  });

  it("the click leaves the page on the canonical URL and stays in Patch Report mode", async () => {
    const { probe } = renderHub("/lol/patch-reports");
    await screen.findAllByTestId("patch-hub-section");
    fireEvent.click(within(entityEl(DRAVEN)).getByTestId("patch-report-entity-share"), { button: 0 });
    await waitFor(() => expect(probe.location!.search).toBe("?patch=26.19"));
    expect(probe.location!.hash).toBe(`#${DRAVEN}`);
    expect(screen.queryByTestId("catchup-totals")).toBeNull();
  });

  it("a modified click keeps native new-tab behaviour (no copy)", async () => {
    renderHub("/lol/patch-reports");
    await screen.findAllByTestId("patch-hub-section");
    const link = within(entityEl(VI)).getByTestId("patch-report-entity-share");
    link.addEventListener("click", (event) => event.preventDefault()); // jsdom cannot navigate
    fireEvent.click(link, { button: 0, ctrlKey: true });
    await act(async () => {});
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe("change share inside Impact Explore", () => {
  const exploreOf = async (entity: string, property: string) => {
    const line = within(entityEl(entity))
      .getAllByTestId("patch-report-change")
      .find((li) => within(li).queryAllByText(property).length > 0)!;
    fireEvent.click(within(line).getByTestId("patch-impact-explore-toggle"));
    await waitFor(() => expect(within(line).getByTestId("patch-impact-explore-body")).toBeInTheDocument());
    return line;
  };

  it("Vi 26.19 AD: offers 'Copy link to this change' and copies the exact change URL", async () => {
    renderHub("/lol/patch-reports?patch=26.19");
    await screen.findAllByTestId("patch-hub-section");
    const line = await exploreOf(VI, "Attack Damage");
    const button = await within(line).findByTestId("patch-impact-share");
    expect(button).toHaveTextContent("Copy link to this change");
    expect(button).toHaveAccessibleName("Copy link to Vi Attack Damage change in Patch 26.19");
    expect(line.id).toBe(VI_AD);
    fireEvent.click(button);
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith(url(VI_AD)));
  });

  it("Draven 26.19 AD gets the same, with its own anchor", async () => {
    renderHub("/lol/patch-reports?patch=26.19");
    await screen.findAllByTestId("patch-hub-section");
    const line = await exploreOf(DRAVEN, "Attack Damage");
    fireEvent.click(await within(line).findByTestId("patch-impact-share"));
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith(url(DRAVEN_AD)));
  });

  it("Vi Passive Shield 12%→10% has no Explore and therefore no per-line share", async () => {
    renderHub("/lol/patch-reports?patch=26.19");
    await screen.findAllByTestId("patch-hub-section");
    const shield = document.getElementById(VI_SHIELD)!;
    expect(shield).not.toBeNull();
    expect(within(shield).queryByTestId("patch-impact-explore")).toBeNull();
    expect(within(shield).queryByTestId("patch-impact-share")).toBeNull();
  });
});

describe("report deep-link landing", () => {
  it("cold load lands on the exact line once the report arrives", async () => {
    const gate = deferred();
    backend.gates.set("26.19", gate);
    renderHub(`/lol/patch-reports?patch=26.19#${VI_AD}`);
    await screen.findByText("Loading patch 26.19…");
    expect(scrolled).toEqual([]);
    gate.release();
    await waitFor(() => expect(scrolled[0]).toBe(VI_AD));
  });

  it("a cached report follows a new hash on the same report", async () => {
    const { probe } = renderHub(`/lol/patch-reports?patch=26.19#${VI}`);
    await waitFor(() => expect(scrolled[0]).toBe(VI));
    const before = [...backend.calls.values()].reduce((a, b) => a + b, 0);
    scrolled.length = 0;
    await act(async () => probe.navigate!(`/lol/patch-reports?patch=26.19#${DRAVEN}`));
    await waitFor(() => expect(scrolled[0]).toBe(DRAVEN));
    expect([...backend.calls.values()].reduce((a, b) => a + b, 0)).toBe(before);
  });

  describe("frame clock", () => {
    let frames: Array<FrameRequestCallback | null>;
    let cancelled: number[];
    beforeEach(() => {
      frames = [];
      cancelled = [];
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
      vi.stubGlobal("cancelAnimationFrame", (id: number) => {
        cancelled.push(id);
        frames[id - 1] = null;
      });
    });
    const flush = () => act(() => frames.splice(0).forEach((cb) => cb?.(0)));

    it("re-applies the scroll once on the next frame (browser restoration protection)", async () => {
      renderHub(`/lol/patch-reports?patch=26.19#${VI_AD}`);
      await waitFor(() => expect(scrolled).toEqual([VI_AD]));
      expect(frames.length).toBe(1);
      flush();
      expect(scrolled).toEqual([VI_AD, VI_AD]);
      expect(frames.length).toBe(0); // exactly once
    });

    it("unmounting cancels the pending frame", async () => {
      const { unmount } = renderHub(`/lol/patch-reports?patch=26.19#${VI_AD}`);
      await waitFor(() => expect(scrolled).toEqual([VI_AD]));
      unmount();
      expect(cancelled.length).toBeGreaterThan(0);
      flush();
      expect(scrolled).toEqual([VI_AD]);
    });

    it("does not re-apply if the element left the document", async () => {
      renderHub(`/lol/patch-reports?patch=26.19#${VI_AD}`);
      await waitFor(() => expect(scrolled).toEqual([VI_AD]));
      const el = document.getElementById(VI_AD)!;
      el.remove();
      flush();
      expect(scrolled).toEqual([VI_AD]);
    });
  });

  it("exact line missing → falls back to its group", async () => {
    renderHub(`/lol/patch-reports?patch=26.19#${VI}__g-base-stats__c-renamed-by-riot`);
    await waitFor(() => expect(scrolled[0]).toBe(`${VI}__g-base-stats`));
  });

  it("group missing too → falls back to the entity", async () => {
    renderHub(`/lol/patch-reports?patch=26.19#${VI}__g-q__c-damage`);
    await waitFor(() => expect(scrolled[0]).toBe(VI));
  });

  it("an unknown entity does not scroll anywhere (no unrelated fallback)", async () => {
    renderHub("/lol/patch-reports?patch=26.19#s-patch-champions__e-champion-nobody__g-base-stats__c-attack-damage");
    await screen.findAllByTestId("patch-hub-section");
    await act(async () => {});
    expect(scrolled).toEqual([]);
  });

  it("fallback never rewrites the URL", async () => {
    const hash = `${VI}__g-base-stats__c-renamed-by-riot`;
    const { probe } = renderHub(`/lol/patch-reports?patch=26.19#${hash}`);
    await waitFor(() => expect(scrolled.length).toBeGreaterThan(0));
    expect(probe.location!.hash).toBe(`#${hash}`);
    expect(probe.location!.search).toBe("?patch=26.19");
  });

  it("normal Patch Report with no hash never scrolls and stays on ?patch=", async () => {
    const { probe } = renderHub("/lol/patch-reports?patch=26.19");
    await screen.findAllByTestId("patch-hub-section");
    await act(async () => {});
    expect(scrolled).toEqual([]);
    expect(probe.location!.search).toBe("?patch=26.19");
    expect(probe.location!.hash).toBe("");
  });
});
