/**
 * Client-side GIF → WebM conversion using Canvas + MediaRecorder.
 * Uses `modern-gif` (already installed) for frame decoding.
 */

import { decode, decodeFrames } from "modern-gif";

export interface ConversionResult {
  webmBlob: Blob;
  thumbnailBlob: Blob;
  width: number;
  height: number;
  duration: number; // seconds
}

/**
 * Convert a GIF File to a WebM video blob + JPEG thumbnail.
 * Returns null if the browser doesn't support WebM recording.
 */
export async function gifToWebm(file: File): Promise<ConversionResult | null> {
  // Check MediaRecorder WebM support
  if (
    typeof MediaRecorder === "undefined" ||
    !MediaRecorder.isTypeSupported("video/webm")
  ) {
    console.warn("MediaRecorder WebM not supported — skipping GIF conversion");
    return null;
  }

  const arrayBuffer = await file.arrayBuffer();
  const gif = decode(arrayBuffer);
  const frames = await decodeFrames(arrayBuffer);

  if (!frames || frames.length === 0) {
    console.warn("No frames decoded from GIF");
    return null;
  }

  // Get dimensions from gif metadata
  const width = gif.width;
  const height = gif.height;

  // Create offscreen canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Generate thumbnail from first frame
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(firstFrame.data), width, height),
    0,
    0
  );
  const thumbnailBlob = await new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob!),
      "image/jpeg",
      0.85
    );
  });

  // Set up MediaRecorder on the canvas stream
  const stream = canvas.captureStream(0); // 0 = manual frame capture
  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm",
    videoBitsPerSecond: 2_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const recordingDone = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: "video/webm" }));
    };
  });

  recorder.start();

  // Draw each frame with its delay
  let totalDuration = 0;
  const track = stream.getVideoTracks()[0] as any;

  for (const frame of frames) {
    const imageData = new ImageData(
      new Uint8ClampedArray(frame.data),
      frame.width,
      frame.height
    );
    ctx.putImageData(imageData, 0, 0);

    // Request a frame capture on the stream track
    if (track && typeof track.requestFrame === "function") {
      track.requestFrame();
    }

    const delay = Math.max(frame.delay ?? 100, 20); // ms, minimum 20ms
    totalDuration += delay;
    await sleep(delay);
  }

  recorder.stop();
  const webmBlob = await recordingDone;

  return {
    webmBlob,
    thumbnailBlob,
    width,
    height,
    duration: totalDuration / 1000,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
