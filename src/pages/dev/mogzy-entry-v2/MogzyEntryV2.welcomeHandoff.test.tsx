/**
 * HI1 entry handoff: the Mogzy entrance sends a first-time visitor into the
 * Academy introduction and everyone else straight to the League hub.
 *
 * The rest of the entrance — chime, entry music, veil timing, reduced motion —
 * is covered by MogzyEntryV2.music.test.tsx and is deliberately untouched here.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MogzyEntryV2 from "./MogzyEntryV2";
import { markAcademyWelcomeHandled, ACADEMY_WELCOME_ROUTE } from "@/lib/welcome/academy-welcome";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import { installLocalStorageStub } from "@/test/localStorageStub";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), startEntryMusic: vi.fn() }));

vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/components/audio/EntryMusicController", () => ({
  startEntryMusic: mocks.startEntryMusic,
}));

// The pinned jsdom does not provide a working Storage — see localStorageStub.
const resetStorage = installLocalStorageStub();

/** The entrance measures its façade anchors; jsdom has no ResizeObserver. */
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  resetStorage();
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  resetStorage();
});

/** Click "Enter Mogzy" and run out the entry transition. */
function enterMogzy() {
  fireEvent.click(screen.getByRole("button", { name: /enter mogzy/i }));
  act(() => {
    vi.advanceTimersByTime(2000);
  });
}

describe("entry destination", () => {
  it("sends a first-time visitor to the Academy introduction", () => {
    render(<MogzyEntryV2 />);
    enterMogzy();
    expect(mocks.navigate).toHaveBeenCalledWith(ACADEMY_WELCOME_ROUTE, { replace: true });
  });

  it("sends a returning visitor straight to the League hub", () => {
    markAcademyWelcomeHandled("explored");
    render(<MogzyEntryV2 />);
    enterMogzy();
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
  });

  it("treats someone who chose the tutorial as handled too", () => {
    markAcademyWelcomeHandled("tutorial");
    render(<MogzyEntryV2 />);
    enterMogzy();
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
  });

  it("falls back to the introduction when stored state is corrupt", () => {
    localStorage.setItem("mogsy.academyWelcome.v1", "not json");
    render(<MogzyEntryV2 />);
    enterMogzy();
    expect(mocks.navigate).toHaveBeenCalledWith(ACADEMY_WELCOME_ROUTE, { replace: true });
  });

  it("still starts the entry music — the audio handoff is untouched by HI1", () => {
    render(<MogzyEntryV2 />);
    enterMogzy();
    expect(mocks.startEntryMusic).toHaveBeenCalled();
  });
});
