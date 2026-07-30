/**
 * TutorialCompletePanel — completion persistence by run mode.
 *
 * The critical invariant: turning the forced-tutorial policy OFF must not stop
 * completions being recorded. A "voluntary" run is still a FIRST completion and
 * is written; a "replay" by an already-completed user is never written, so it
 * can't corrupt the original.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TutorialCompletePanel } from "./TutorialCompletePanel";
import {
  TutorialOnboardingProvider,
  type TutorialMode,
} from "../tutorialOnboardingContext";

function renderPanel(mode: TutorialMode, onComplete?: () => Promise<boolean>) {
  return render(
    <MemoryRouter>
      <TutorialOnboardingProvider value={{ mode, returnTo: "/quiz", onComplete }}>
        <TutorialCompletePanel dispatch={vi.fn()} />
      </TutorialOnboardingProvider>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("voluntary first completion", () => {
  it("records completion once, without blocking the user", async () => {
    const onComplete = vi.fn(async () => true);
    renderPanel("voluntary", onComplete);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    // Escapable: the user keeps the ordinary exits, no blocking finish action.
    expect(screen.getByTestId("return-to-ranked")).toBeTruthy();
    expect(screen.queryByTestId("finish-tutorial")).toBeNull();
    expect(screen.getByText(/completion has been saved/i)).toBeTruthy();
  });

  it("reports a failed write without trapping the user", async () => {
    const onComplete = vi.fn(async () => false);
    renderPanel("voluntary", onComplete);

    await waitFor(() =>
      expect(screen.getByTestId("voluntary-completion-error")).toBeTruthy(),
    );
    expect(screen.getByTestId("return-to-ranked")).toBeTruthy();
  });
});

describe("replay", () => {
  it("never writes — an existing completion cannot be corrupted", async () => {
    const onComplete = vi.fn(async () => true);
    // A replay is constructed with no writer at all; even if one were passed,
    // the panel must not invoke it in replay mode.
    renderPanel("replay", onComplete);
    await new Promise((r) => setTimeout(r, 0));
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByText(/does not change your saved progress/i)).toBeTruthy();
  });
});

describe("mandatory", () => {
  it("keeps the explicit blocking finish action and does not auto-write", async () => {
    const onComplete = vi.fn(async () => true);
    renderPanel("mandatory", onComplete);
    await new Promise((r) => setTimeout(r, 0));
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByTestId("finish-tutorial")).toBeTruthy();
    expect(screen.queryByTestId("return-to-ranked")).toBeNull();
  });
});

describe("dev", () => {
  it("writes nothing and says so", async () => {
    renderPanel("dev");
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText(/doesn't write anything to your account/i)).toBeTruthy();
  });
});
