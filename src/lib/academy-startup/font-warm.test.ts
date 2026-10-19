import { afterEach, describe, expect, it, vi } from "vitest";
import { warmAcademyFonts } from "./font-warm";

/**
 * ACADEMY STARTUP RC2.2 — the Orrery's late faces are requested during the
 * Landing through the faces the stylesheets registered (never a static URL:
 * Google Fonts serves each browser its own file).
 */
type Face = { family: string };
function fakeFonts(faces: Face[]) {
  const load = vi.fn((_spec: string) => Promise.resolve([]));
  return { load, value: { load, forEach: (cb: (f: Face) => void) => faces.forEach(cb) } };
}
function withFonts(value: unknown) {
  Object.defineProperty(document, "fonts", { configurable: true, value });
}
afterEach(() => {
  delete (document as unknown as Record<string, unknown>).fonts;
  document.head.querySelectorAll("link[data-test]").forEach((l) => l.remove());
  vi.useRealTimers();
});

describe("warmAcademyFonts", () => {
  it("asks for Lora and Space Mono when their faces are registered", () => {
    const f = fakeFonts([{ family: "Lora" }, { family: '"Space Mono"' }, { family: "Inter" }]);
    withFonts(f.value);
    warmAcademyFonts();
    expect(f.load.mock.calls.map((c) => c[0])).toEqual(['400 12px "Lora"', '400 12px "Space Mono"']);
  });

  it("a face whose stylesheet has not arrived is asked for once that stylesheet loads", () => {
    vi.useFakeTimers();
    const faces: Face[] = [{ family: "Space Mono" }];
    const f = fakeFonts(faces);
    withFonts(f.value);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&display=swap";
    link.setAttribute("data-test", "");
    document.head.appendChild(link);
    warmAcademyFonts();
    expect(f.load.mock.calls.map((c) => c[0])).toEqual(['400 12px "Space Mono"']);
    faces.push({ family: "Lora" }); // the index.html loader flips the sheet to media=all
    link.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(0);
    expect(f.load.mock.calls.map((c) => c[0])).toContain('400 12px "Lora"');
  });

  it("never throws without a FontFaceSet, or when a load rejects", () => {
    expect(() => warmAcademyFonts()).not.toThrow();
    withFonts({ load: () => Promise.reject(new Error("blocked")), forEach: (cb: (f: Face) => void) => cb({ family: "Lora" }) });
    expect(() => warmAcademyFonts()).not.toThrow();
  });

  it("never asks by URL: nothing is added to the document", () => {
    const f = fakeFonts([{ family: "Lora" }, { family: "Space Mono" }]);
    withFonts(f.value);
    const before = document.head.innerHTML;
    warmAcademyFonts();
    expect(document.head.innerHTML).toBe(before);
  });
});
