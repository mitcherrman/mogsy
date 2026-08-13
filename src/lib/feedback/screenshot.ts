/**
 * FB1 — screenshot preparation.
 *
 * Pure browser work: validate, downscale, re-encode. Nothing here talks to
 * Supabase; uploading lives in client.ts so the network boundary stays in one
 * place and this module stays testable.
 *
 * Why re-encode at all: a raw desktop screenshot is a 2-6 MB PNG. Downscaled to
 * 1920px and re-encoded as WebP it lands around 200-400 KB, which keeps a
 * playtest's worth of evidence inside a rounding error of storage cost and
 * makes the admin lightbox load instantly. It also strips metadata as a side
 * effect — a canvas round-trip carries no EXIF, so a phone screenshot cannot
 * smuggle GPS coordinates into the bucket.
 */

/** Matches allowed_mime_types on the feedback-evidence bucket. */
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** Bucket ceiling. The server enforces this too; failing early is just kinder. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Longest edge after downscaling. 1920 keeps UI text legible when zoomed. */
export const MAX_IMAGE_EDGE = 1920;

const WEBP_QUALITY = 0.85;

export type ScreenshotError =
  | "unsupported_type"
  | "too_large"
  | "decode_failed"
  | "encode_failed";

export interface PreparedScreenshot {
  blob: Blob;
  /** Always "image/webp" on success — see prepareScreenshot. */
  contentType: string;
  width: number;
  height: number;
  bytes: number;
}

export class ScreenshotProcessingError extends Error {
  constructor(readonly reason: ScreenshotError) {
    super(reason);
    this.name = "ScreenshotProcessingError";
  }
}

/** Is this a file we are willing to accept at all? */
export function isAcceptedImage(file: { type: string }): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type);
}

/**
 * Pull the first image out of a paste event.
 *
 * This is the path most people actually use: Win+Shift+S or Cmd+Ctrl+Shift+4
 * puts a PNG on the clipboard, and pasting it into the form is one keystroke
 * versus save-to-disk-then-browse. Returns null when the paste carried no
 * image, so a normal text paste falls through to the textarea untouched.
 */
export function imageFromClipboard(items: DataTransferItemList | null | undefined): File | null {
  if (!items) return null;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file && isAcceptedImage(file)) return file;
  }
  return null;
}

/** Downscale factor that fits the longest edge inside MAX_IMAGE_EDGE. */
export function scaleToFit(width: number, height: number, maxEdge = MAX_IMAGE_EDGE): number {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return 1;
  return maxEdge / longest;
}

/**
 * Validate, downscale and re-encode an image for upload.
 *
 * Always yields WebP regardless of input type, so the stored object type is
 * predictable and the bucket's allow-list has one normal case. Throws
 * ScreenshotProcessingError with a machine-readable reason; the form maps that
 * to a sentence.
 */
export async function prepareScreenshot(file: File): Promise<PreparedScreenshot> {
  if (!isAcceptedImage(file)) throw new ScreenshotProcessingError("unsupported_type");
  if (file.size > MAX_UPLOAD_BYTES) throw new ScreenshotProcessingError("too_large");

  const bitmap = await decode(file);
  const scale = scaleToFit(bitmap.width, bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ScreenshotProcessingError("encode_failed");
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
  );
  if (!blob) throw new ScreenshotProcessingError("encode_failed");

  // A re-encode that somehow grew past the ceiling is still not uploadable.
  if (blob.size > MAX_UPLOAD_BYTES) throw new ScreenshotProcessingError("too_large");

  return { blob, contentType: "image/webp", width, height, bytes: blob.size };
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      throw new ScreenshotProcessingError("decode_failed");
    }
  }
  // Safari fallback for older versions without createImageBitmap on File.
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ScreenshotProcessingError("decode_failed"));
    };
    img.src = url;
  });
}

/** Human sentences for each failure. Kept here so the form stays declarative. */
export const SCREENSHOT_ERROR_MESSAGES: Record<ScreenshotError, string> = {
  unsupported_type: "That file type isn't supported. Use a PNG, JPEG, or WebP image.",
  too_large: "That image is too large. The limit is 5 MB.",
  decode_failed: "That image couldn't be read. Try saving it again.",
  encode_failed: "That image couldn't be processed in this browser.",
};
