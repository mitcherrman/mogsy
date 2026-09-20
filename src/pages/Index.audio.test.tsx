import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  play: vi.fn(), stop: vi.fn(), preload: vi.fn(), navigate: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => mocks }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));

import Landing from "./Index";

describe("landing SFX migration", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
  afterEach(() => vi.useRealTimers());

  it("keeps one launch cue and the existing 250ms navigation timing", () => {
    render(<Landing />);
    fireEvent.click(screen.getByRole("button", { name: "Enter Mogsy" }));
    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(mocks.play).toHaveBeenCalledWith("landing.enter");
    expect(mocks.navigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(249);
    expect(mocks.navigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mocks.navigate).toHaveBeenCalledWith("/home", { replace: true });
  });
});
