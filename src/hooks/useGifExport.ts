import { useState, useCallback, RefObject } from "react";
import html2canvas from "html2canvas";
import { toast } from "sonner";

interface UseGifExportOptions {
  /** Scale factor for capture resolution (default 1.5 for balance of quality/speed) */
  scale?: number;
  /** Target frames per second for playback (default 30) */
  fps?: number;
  /** Max colors in GIF palette (default 256 for best quality) */
  maxColors?: number;
  /** Total recording duration in ms (default 3000) */
  duration?: number;
}

export function useGifExport(ref: RefObject<HTMLElement>, options: UseGifExportOptions = {}) {
  const {
    scale = 1.5,
    fps = 30,
    maxColors = 256,
    duration = 3000,
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);

  const recordGif = useCallback(
    async (onStartAnimation?: () => void) => {
      if (!ref.current || isRecording) return;

      setIsRecording(true);
      setProgress(0);

      const toastId = toast.loading("Recording animation...", { duration: 30000 });

      try {
        const el = ref.current;
        const rect = el.getBoundingClientRect();
        const width = Math.round(rect.width * scale);
        const height = Math.round(rect.height * scale);

        // Start animation
        if (onStartAnimation) {
          onStartAnimation();
        }

        // Small delay to let animation begin rendering
        await new Promise((r) => setTimeout(r, 30));

        // Capture frames as fast as html2canvas allows, recording real timestamps
        const rawFrames: { data: ImageData; timestamp: number }[] = [];
        const startTime = performance.now();
        const endTime = startTime + duration;

        // Shared html2canvas options (reuse for perf)
        const captureOpts = {
          backgroundColor: null,
          scale,
          useCORS: true,
          allowTaint: true,
          logging: false,
          width: rect.width,
          height: rect.height,
          // Skip expensive operations for speed
          imageTimeout: 0,
          removeContainer: true,
        };

        let frameCount = 0;
        while (performance.now() < endTime) {
          const frameStart = performance.now();

          const canvas = await html2canvas(el, captureOpts);
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const imageData = ctx.getImageData(0, 0, width, height);
            rawFrames.push({ data: imageData, timestamp: frameStart - startTime });
          }

          frameCount++;
          setProgress(Math.round((performance.now() - startTime) / duration * 40));

          // Yield to browser to let animations render
          await new Promise((r) => requestAnimationFrame(r));
        }

        if (rawFrames.length < 2) {
          toast.error("Too few frames captured", { id: toastId });
          setIsRecording(false);
          setProgress(0);
          return;
        }

        toast.loading(`Encoding GIF (${rawFrames.length} frames)...`, { id: toastId });
        setProgress(50);

        // Build GIF frames with real timing delays
        const targetDelay = Math.round(1000 / fps); // desired playback delay per frame
        const gifFrames: { data: Uint8Array; delay: number }[] = [];

        for (let i = 0; i < rawFrames.length; i++) {
          const nextTimestamp = i < rawFrames.length - 1 ? rawFrames[i + 1].timestamp : rawFrames[i].timestamp + targetDelay;
          const realDelay = Math.round(nextTimestamp - rawFrames[i].timestamp);
          const clampedDelay = Math.max(10, Math.min(200, realDelay));

          gifFrames.push({
            data: new Uint8Array(rawFrames[i].data.data.buffer),
            delay: clampedDelay,
          });
        }

        setProgress(60);

        // Dynamically import modern-gif
        const { encode } = await import("modern-gif");

        const output = await encode({
          width,
          height,
          frames: gifFrames,
          maxColors,
        });

        setProgress(90);

        // Create blob and download/share
        const blob = new Blob([output], { type: "image/gif" });

        if (navigator.share && navigator.canShare) {
          const file = new File([blob], "mogsy-animation.gif", { type: "image/gif" });
          const shareData = { files: [file] };
          if (navigator.canShare(shareData)) {
            try {
              await navigator.share(shareData);
              toast.success("GIF shared!", { id: toastId });
              setProgress(100);
              setIsRecording(false);
              return;
            } catch {
              // Fall through to download
            }
          }
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "mogsy-animation.gif";
        a.click();
        URL.revokeObjectURL(url);

        const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
        const actualFps = Math.round(rawFrames.length / (duration / 1000));
        toast.success(`GIF saved! (${sizeMB}MB, ${width}×${height}px, ~${actualFps}fps, ${rawFrames.length} frames)`, { id: toastId });
        setProgress(100);
      } catch (err) {
        console.error("GIF export failed:", err);
        toast.error("Failed to export GIF", { id: toastId });
      } finally {
        setIsRecording(false);
        setProgress(0);
      }
    },
    [ref, isRecording, scale, fps, maxColors, duration]
  );

  return { recordGif, isRecording, progress };
}
