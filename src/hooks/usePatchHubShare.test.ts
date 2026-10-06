import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { canUseNativeShare, sharePatchHubLink } from "./usePatchHubShare";

const URL_ = "https://mogzy.lol/lol/patch-reports?patch=26.19#s-patch-champions__e-champion-vi";
let writeText: ReturnType<typeof vi.fn>;

const setCoarse = (coarse: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: coarse && q.includes("coarse"), media: q }));
const setShare = (share: unknown) =>
  Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  toast.success.mockClear();
  toast.error.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (navigator as { share?: unknown }).share;
});

describe("sharePatchHubLink", () => {
  it("copies the exact URL and toasts when native share is unavailable", async () => {
    setCoarse(true);
    await sharePatchHubLink({ url: URL_, title: "Vi" });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(URL_);
    expect(toast.success).toHaveBeenCalledWith("Link copied");
  });

  it("desktop (fine pointer) copies even when navigator.share exists", async () => {
    setCoarse(false);
    const share = vi.fn();
    setShare(share);
    expect(canUseNativeShare()).toBe(false);
    await sharePatchHubLink({ url: URL_, title: "Vi" });
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(URL_);
  });

  it("touch devices use native share with the exact URL and do not copy", async () => {
    setCoarse(true);
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);
    await sharePatchHubLink({ url: URL_, title: "Vi 26.19" });
    expect(share).toHaveBeenCalledExactlyOnceWith({ title: "Vi 26.19", url: URL_ });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("a cancelled native share is silent", async () => {
    setCoarse(true);
    setShare(vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")));
    await sharePatchHubLink({ url: URL_, title: "Vi" });
    expect(writeText).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("a failed native share falls back to copying the same URL", async () => {
    setCoarse(true);
    setShare(vi.fn().mockRejectedValue(new Error("x")));
    await sharePatchHubLink({ url: URL_, title: "Vi" });
    expect(writeText).toHaveBeenCalledWith(URL_);
  });

  it("reports a clipboard failure", async () => {
    setCoarse(false);
    writeText.mockRejectedValue(new Error("denied"));
    await sharePatchHubLink({ url: URL_, title: "Vi" });
    expect(toast.error).toHaveBeenCalledWith("Could not copy link");
  });
});
