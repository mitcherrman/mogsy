import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useRankedAudioBoundary } from "./useRankedAudioBoundary";

const mocks = vi.hoisted(() => ({ acquire: vi.fn(async () => true), release: vi.fn() }));
vi.mock("@/lib/audio/engine", () => ({
  mogzyAudio: {
    acquireModeSoundtrack: mocks.acquire,
    releaseModeSoundtrack: mocks.release,
    registerModeSoundtrack: vi.fn(),
  },
}));

function Harness({ matchId, active = true }: { matchId: string; active?: boolean }) {
  useRankedAudioBoundary(matchId, active);
  return null;
}

afterEach(() => vi.clearAllMocks());

describe("Ranked audio ownership boundary", () => {
  it("acquires a recovered live match and releases on unmount", () => {
    const view = render(<Harness matchId="recovered" />);
    expect(mocks.acquire).toHaveBeenCalledWith(expect.objectContaining({
      owner: "ranked:recovered", sourceId: "ranked",
    }));
    view.unmount();
    expect(mocks.release).toHaveBeenCalledWith("ranked:recovered");
  });

  it("does not reacquire on ordinary rerender and releases when inactive", () => {
    const view = render(<Harness matchId="m1" />);
    view.rerender(<Harness matchId="m1" />);
    expect(mocks.acquire).toHaveBeenCalledOnce();
    view.rerender(<Harness matchId="m1" active={false} />);
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("releases the old match before acquiring its replacement", () => {
    const view = render(<Harness matchId="old" />);
    view.rerender(<Harness matchId="new" />);
    expect(mocks.release).toHaveBeenCalledWith("ranked:old");
    expect(mocks.acquire).toHaveBeenLastCalledWith(expect.objectContaining({
      owner: "ranked:new",
    }));
  });
});
