import { describe, expect, it } from "vitest";

import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_EDGE,
  MAX_UPLOAD_BYTES,
  ScreenshotProcessingError,
  imageFromClipboard,
  isAcceptedImage,
  prepareScreenshot,
  scaleToFit,
} from "./screenshot";

/**
 * The pure parts of screenshot handling. Canvas encoding needs a real browser,
 * so prepareScreenshot is exercised here only for the validation it does before
 * touching the DOM — the rejection paths, which are the ones with security
 * consequences.
 */

function fakeFile(type: string, size: number): File {
  return { type, size, name: "shot" } as unknown as File;
}

describe("isAcceptedImage", () => {
  it("accepts exactly the bucket's allowed types", () => {
    for (const type of ACCEPTED_IMAGE_TYPES) {
      expect(isAcceptedImage({ type })).toBe(true);
    }
  });

  it("rejects anything else, including types that merely look like images", () => {
    for (const type of ["image/svg+xml", "image/gif", "application/pdf", "text/html", ""]) {
      expect(isAcceptedImage({ type })).toBe(false);
    }
  });

  it("rejects SVG specifically — it is a script vector, not a screenshot", () => {
    expect(isAcceptedImage({ type: "image/svg+xml" })).toBe(false);
  });
});

describe("scaleToFit", () => {
  it("leaves an already-small image alone", () => {
    expect(scaleToFit(800, 600)).toBe(1);
    expect(scaleToFit(MAX_IMAGE_EDGE, 1080)).toBe(1);
  });

  it("scales by the longest edge, portrait or landscape", () => {
    expect(scaleToFit(3840, 2160)).toBeCloseTo(0.5);
    expect(scaleToFit(1080, 3840)).toBeCloseTo(0.5);
  });

  it("does not divide by zero on a degenerate image", () => {
    expect(scaleToFit(0, 0)).toBe(1);
  });
});

describe("imageFromClipboard", () => {
  const item = (kind: string, file: File | null) =>
    ({ kind, getAsFile: () => file }) as unknown as DataTransferItem;

  const list = (items: DataTransferItem[]) =>
    ({ length: items.length, ...items }) as unknown as DataTransferItemList;

  it("returns the first acceptable image on the clipboard", () => {
    const png = fakeFile("image/png", 1000);
    expect(imageFromClipboard(list([item("string", null), item("file", png)]))).toBe(png);
  });

  it("ignores a text-only paste so normal typing is unaffected", () => {
    expect(imageFromClipboard(list([item("string", null)]))).toBeNull();
  });

  it("ignores a pasted file of an unsupported type", () => {
    expect(imageFromClipboard(list([item("file", fakeFile("application/pdf", 10))]))).toBeNull();
  });

  it("handles a missing clipboard without throwing", () => {
    expect(imageFromClipboard(null)).toBeNull();
    expect(imageFromClipboard(undefined)).toBeNull();
  });
});

describe("prepareScreenshot validation", () => {
  it("rejects an unsupported type before any decoding", async () => {
    await expect(prepareScreenshot(fakeFile("image/svg+xml", 100))).rejects.toBeInstanceOf(
      ScreenshotProcessingError,
    );
    await expect(prepareScreenshot(fakeFile("image/svg+xml", 100))).rejects.toMatchObject({
      reason: "unsupported_type",
    });
  });

  it("rejects an oversized file before any decoding", async () => {
    await expect(
      prepareScreenshot(fakeFile("image/png", MAX_UPLOAD_BYTES + 1)),
    ).rejects.toMatchObject({ reason: "too_large" });
  });

  it("agrees with the bucket ceiling", () => {
    expect(MAX_UPLOAD_BYTES).toBe(5 * 1024 * 1024);
  });
});
