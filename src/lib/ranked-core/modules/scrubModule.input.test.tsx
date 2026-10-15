/**
 * SCRUB-S3 — the Chronoscope honours the shell's input gate.
 *
 * A timed-out lock never receives an own reveal, so through the arena's result hold the instrument
 * still reads "open" under the TIMED OUT stamp. The shell closes input for that hold
 * (`permissions.canSelectAnswer === false`) and refuses the submit; the module must not offer a
 * Lock that nothing would send. Driven by the REAL captured open state.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import { permissionsForSubmissionPhase } from "@/lib/ranked-core/permissions";
import { readPrivatePlayer, readPublicRound } from "@/lib/ranked-public/contracts";
import capture from "@/lib/ranked-public/__fixtures__/scrubServerCapture.json";
import { scrubModule } from "./scrubModule";

/* eslint-disable @typescript-eslint/no-explicit-any */
const C = capture as Record<string, any>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance", "requestAnimationFrame", "cancelAnimationFrame"] });
  vi.setSystemTime(new Date(Date.parse(C.private_open.server_time) + 60_000));
});
afterEach(() => vi.useRealTimers());

function mount(permissions: typeof NO_INTERACTIONS) {
  const submitChallenge = vi.fn();
  const Viewport = scrubModule.Viewport;
  const segmentState = readPrivatePlayer(C.private_open).segmentState!;
  render(
    <Viewport publicRound={readPublicRound(C.public_open)} selection={null} permissions={permissions}
      onSelect={() => {}} segmentState={segmentState}
      actions={{ submitChallenge, busy: false, error: null }} skewMs={0} />);
  return submitChallenge;
}

describe("SCRUB-S3 — input follows the shell", () => {
  it("is interactive when the shell opens input: the lock sends exactly the checkpoint", () => {
    const submit = mount(permissionsForSubmissionPhase("selecting", true));
    const phase = screen.getByTestId("scrub-phase");
    expect(phase).toHaveAttribute("data-phase", "open");
    expect(phase).not.toHaveAttribute("data-input-closed");
    expect(phase).not.toHaveAttribute("inert");
    const rail = screen.getByTestId("chronoscope-rail");
    rail.focus();
    fireEvent.keyDown(rail, { key: "Home" });
    for (let i = 0; i < 3; i += 1) fireEvent.keyDown(rail, { key: "ArrowRight" });
    fireEvent.click(screen.getByTestId("chronoscope-lock"));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(0, { checkpoint: "w4" });
  });

  it("is inert through a result hold: no Lock is attempted and the instrument never fakes a locked state", () => {
    const submit = mount(NO_INTERACTIONS);
    const phase = screen.getByTestId("scrub-phase");
    expect(phase).toHaveAttribute("data-phase", "open");
    expect(phase).toHaveAttribute("data-input-closed", "true");
    expect(phase).toHaveAttribute("inert");
    // Even if events reach the (inert) controls, the module refuses the lock.
    const rail = screen.getByTestId("chronoscope-rail");
    rail.focus();
    fireEvent.keyDown(rail, { key: "Home" });
    for (let i = 0; i < 3; i += 1) fireEvent.keyDown(rail, { key: "ArrowRight" });
    fireEvent.click(screen.getByTestId("chronoscope-lock"));
    expect(submit).not.toHaveBeenCalled();
    expect(phase).toHaveAttribute("data-phase", "open");
  });
});
