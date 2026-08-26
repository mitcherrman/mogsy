import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Settings from "./Settings";
import { RADIO_STORAGE_KEYS, getRadioSnapshot, resetRadioForTests } from "@/lib/audio/academy-radio";
import {
  MODE_STORAGE_KEYS,
  getModeSoundtrackSnapshot,
  resetModeSoundtrackForTests,
} from "@/lib/audio/mode-soundtrack";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, signOut: vi.fn() }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ clear: vi.fn() }) }));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/components/TwoFactorAuth", () => ({ default: () => null }));
vi.mock("@/components/UiSfxSettings", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const nativeLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function installLocalStorageStub() {
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      get length() { return entries.size; },
      clear: () => entries.clear(),
      getItem: (key: string) => entries.get(key) ?? null,
      key: (index: number) => Array.from(entries.keys())[index] ?? null,
      removeItem: (key: string) => void entries.delete(key),
      setItem: (key: string, value: string) => void entries.set(key, String(value)),
    } satisfies Storage,
  });
}

beforeEach(() => {
  installLocalStorageStub();
  resetRadioForTests();
  resetModeSoundtrackForTests();
});
afterEach(() => {
  cleanup();
  resetRadioForTests();
  resetModeSoundtrackForTests();
  if (nativeLocalStorage) Object.defineProperty(globalThis, "localStorage", nativeLocalStorage);
});

describe("Settings — Mode Soundtracks", () => {
  it("defaults on at 15% and persists its independent controls", () => {
    render(<Settings />);
    const toggle = screen.getByRole("switch", { name: "Play mode music automatically" });
    expect(toggle).toHaveAttribute("data-state", "checked");
    fireEvent.click(toggle);
    fireEvent.change(screen.getByRole("slider", { name: "Mode music volume" }), {
      target: { value: "0.42" },
    });
    expect(getModeSoundtrackSnapshot()).toMatchObject({
      playAutomatically: false, volume: 0.42,
    });
    expect(localStorage.getItem(MODE_STORAGE_KEYS.playAutomatically)).toBe("false");
    expect(localStorage.getItem(MODE_STORAGE_KEYS.volume)).toBe("0.42");
  });
});

describe("Settings — Academy Radio", () => {
  it("renders new users off and persists an explicit preference without starting music", () => {
    const { container } = render(<Settings />);
    const toggle = screen.getByRole("switch", { name: "Play Radio by default" });
    expect(toggle).toHaveAttribute("data-state", "unchecked");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("data-state", "checked");
    expect(localStorage.getItem(RADIO_STORAGE_KEYS.playByDefault)).toBe("true");
    expect(getRadioSnapshot()).toMatchObject({ playRadioByDefault: true, isPlaying: false });
    expect(container.querySelector("audio")).toBeNull();
  });

  it("defaults inactivity auto-mute on and persists an explicit change", () => {
    render(<Settings />);
    const toggle = screen.getByRole("switch", { name: "Auto-mute Radio when inactive" });
    expect(toggle).toHaveAttribute("data-state", "checked");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("data-state", "unchecked");
    expect(localStorage.getItem(RADIO_STORAGE_KEYS.autoMuteWhenInactive)).toBe("false");
  });
});
