/**
 * The slim Academy Radio strip (Academy Pulse layout): pure UI over the shared
 * transport, like the dock. Its own controls are specified here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const store = vi.hoisted(() => ({
  snapshot: {
    status: "playing", isPlaying: true, isAudible: true, muted: false, volume: 0.15, trackTitle: "Tidecaller",
  } as Record<string, unknown>,
  toggle: vi.fn(),
  setVolume: vi.fn(),
}));
vi.mock("@/lib/audio/academy-radio", () => ({
  useAcademyRadio: () => store.snapshot,
  toggleRadioPlayback: () => store.toggle(),
  setRadioVolume: (v: number) => store.setVolume(v),
}));

import AcademyRadioStrip from "./AcademyRadioStrip";

beforeEach(() => {
  store.snapshot = { status: "playing", isPlaying: true, isAudible: true, muted: false, volume: 0.15, trackTitle: "Tidecaller" };
  store.toggle.mockReset();
  store.setVolume.mockReset();
});

describe("AcademyRadioStrip", () => {
  it("is one labelled group with Play/Pause, the track line and a volume slider", () => {
    render(<AcademyRadioStrip />);
    const strip = screen.getByRole("group", { name: "Academy Radio" });
    expect(strip).toHaveTextContent("Tidecaller");
    expect(strip).toHaveTextContent("Live");
    expect(screen.getByRole("button", { name: "Pause music" })).toBeInTheDocument();
    const volume = screen.getByRole("slider", { name: "Music volume" });
    expect(volume).toHaveAttribute("aria-valuetext", "15 percent");
  });

  it("Play/Pause drives the shared transport; the glyph follows mute", () => {
    store.snapshot = { ...store.snapshot, muted: true };
    render(<AcademyRadioStrip />);
    fireEvent.click(screen.getByRole("button", { name: "Play music" }));
    expect(store.toggle).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("academy-radio-strip")).toHaveTextContent("Live · Muted");
  });

  it("the slider sets the shared volume", () => {
    render(<AcademyRadioStrip />);
    fireEvent.change(screen.getByTestId("academy-radio-strip-volume"), { target: { value: "0.6" } });
    expect(store.setVolume).toHaveBeenCalledWith(0.6);
  });
});
