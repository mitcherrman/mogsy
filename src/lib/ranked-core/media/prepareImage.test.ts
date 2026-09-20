/**
 * RFX1 Phase 2B1 — `prepareImage`: dedupe, never-rejects, bounded waits.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPreparedImagesForTests, isImagePrepared, normalizeImageUrl, prepareImage, prepareImages,
} from "./prepareImage";

type Mode = "load" | "error" | "never";
class FakeImage {
  static instances: FakeImage[] = [];
  static mode: Mode = "load";
  static decodeCalls = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = "";
  fetchPriority?: string;
  private _src = "";
  constructor() { FakeImage.instances.push(this); }
  set src(v: string) {
    this._src = v;
    const mode = FakeImage.mode;
    if (mode === "never") return;
    setTimeout(() => (mode === "load" ? this.onload?.() : this.onerror?.()), 5);
  }
  get src() { return this._src; }
  decode() { FakeImage.decodeCalls += 1; return Promise.resolve(); }
}

beforeEach(() => {
  __resetPreparedImagesForTests();
  FakeImage.instances = [];
  FakeImage.mode = "load";
  FakeImage.decodeCalls = 0;
  vi.stubGlobal("Image", FakeImage);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("prepareImage", () => {
  it("deduplicates by normalized URL and reuses the in-flight load", async () => {
    const a = prepareImage("/assets/ranked/x.png");
    const b = prepareImage(`${window.location.origin}/assets/ranked/x.png`);
    const c = prepareImage("/assets/ranked/x.png", { priority: "low" });
    expect(FakeImage.instances).toHaveLength(1);
    expect(await Promise.all([a, b, c])).toEqual(["ok", "ok", "ok"]);
    expect(normalizeImageUrl("/assets/ranked/x.png"))
      .toBe(`${window.location.origin}/assets/ranked/x.png`);
  });

  it("reuses a COMPLETED preparation without a second request", async () => {
    expect(await prepareImage("/a.png")).toBe("ok");
    expect(isImagePrepared("/a.png")).toBe(true);
    expect(await prepareImage("/a.png")).toBe("ok");
    expect(FakeImage.instances).toHaveLength(1);
  });

  it("decodes after load where supported, and sets the fetch priority", async () => {
    await prepareImage("/d.png", { priority: "high" });
    expect(FakeImage.decodeCalls).toBe(1);
    expect(FakeImage.instances[0].fetchPriority).toBe("high");
    await prepareImage("/nd.png", { decode: false });
    expect(FakeImage.decodeCalls).toBe(1);
  });

  it("resolves 'error' on a broken image — never rejects — and allows a later retry", async () => {
    FakeImage.mode = "error";
    await expect(prepareImage("/broken.png")).resolves.toBe("error");
    expect(isImagePrepared("/broken.png")).toBe(false);
    FakeImage.mode = "load";
    await expect(prepareImage("/broken.png")).resolves.toBe("ok");
    expect(FakeImage.instances).toHaveLength(2);
  });

  it("cannot block: a load that never finishes resolves 'timeout' at the caller's budget", async () => {
    vi.useFakeTimers();
    FakeImage.mode = "never";
    const p = prepareImage("/slow.png", { timeoutMs: 600 });
    let settled: string | null = null;
    void p.then((r) => { settled = r; });
    await vi.advanceTimersByTimeAsync(599);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe("timeout");
  });

  it("a caller's timeout does not cancel the load: a later caller still sees it finish", async () => {
    vi.useFakeTimers();
    FakeImage.mode = "never";
    const first = prepareImage("/late.png", { timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    expect(await first).toBe("timeout");
    const second = prepareImage("/late.png", { timeoutMs: 5000 });
    FakeImage.instances[0].onload?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(await second).toBe("ok");
    expect(FakeImage.instances).toHaveLength(1);
  });

  it("treats a missing URL as a settled no-op", async () => {
    expect(await prepareImage(null)).toBe("error");
    expect(await prepareImages([])).toEqual([]);
    expect(FakeImage.instances).toHaveLength(0);
  });
});
