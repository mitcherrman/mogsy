/**
 * The readiness gate for the Academy introduction (HI1-C4).
 *
 * ONE PROPERTY MATTERS MORE THAN THE REST: this hook always ends up true. The
 * page holds its opening frame while it is false, so a path that could stay
 * false is a blank screen — and the paths are all failure paths, which is
 * exactly the set nobody exercises by hand. Every one of them is below: the
 * assets decode, the assets 404, the decode never settles at all, the font host
 * is unreachable, and the environment cannot answer the question in the first
 * place.
 *
 * The last of those is also why the rest of the welcome suite is unaffected by
 * this hook: jsdom fetches no subresources and has no `decode`, so the gate
 * recognises an environment that cannot report and opens immediately.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SCENE_READY_CAP_MS, useSceneReady } from "./useSceneReady";

const SOURCES = ["/a.png", "/b.png"];

/**
 * Give jsdom a `decode()` so the hook believes it is in a real browser, and
 * hand back control of what that decode does.
 */
function installDecode(impl: () => Promise<void>) {
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    writable: true,
    value: impl,
  });
}

function removeDecode() {
  delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
}

afterEach(() => {
  removeDecode();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("an environment that cannot observe decoding", () => {
  it("is ready on the very first render, with no effect and no timer", () => {
    // jsdom, and server rendering: waiting here would wait for ever.
    const { result } = renderHook(() => useSceneReady(SOURCES, '700 1rem "Cinzel"'));
    expect(result.current).toBe(true);
  });
});

describe("a browser that can", () => {
  it("holds until every image has decoded", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    installDecode(() => gate);

    const { result } = renderHook(() => useSceneReady(SOURCES));
    expect(result.current).toBe(false);

    await act(async () => {
      release?.();
      await gate;
    });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("opens anyway when an image fails to decode", async () => {
    // A 404 or a corrupt file must delay the introduction, never cancel it.
    installDecode(() => Promise.reject(new Error("no such image")));

    const { result } = renderHook(() => useSceneReady(SOURCES));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("opens anyway when the display face never arrives", async () => {
    installDecode(() => Promise.resolve());
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { load: () => Promise.reject(new Error("font host unreachable")) },
    });

    const { result } = renderHook(() => useSceneReady(SOURCES, '700 1rem "Cinzel"'));
    await waitFor(() => expect(result.current).toBe(true));

    delete (document as unknown as { fonts?: unknown }).fonts;
  });

  it("opens at the ceiling when a decode simply never settles", async () => {
    vi.useFakeTimers();
    // The wedged-CDN case: no resolve, no reject, no error to catch.
    installDecode(() => new Promise<void>(() => {}));

    const { result } = renderHook(() => useSceneReady(SOURCES));
    expect(result.current).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(SCENE_READY_CAP_MS - 1);
    });
    expect(result.current).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(2);
    });
    expect(result.current).toBe(true);
  });

  it("is ready immediately when there is nothing to wait for", async () => {
    installDecode(() => new Promise<void>(() => {}));

    const { result } = renderHook(() => useSceneReady([]));
    await waitFor(() => expect(result.current).toBe(true));
  });
});
