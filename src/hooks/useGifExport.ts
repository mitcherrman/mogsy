import { useState, useCallback, RefObject } from "react";
import html2canvas from "html2canvas";
import { toast } from "sonner";

interface UseGifExportOptions {
  /** Scale factor for capture resolution (default 2 for high-res) */
  scale?: number;
  /** Frames per second (default 20 for smooth animation) */
  fps?: number;
  /** Max colors in GIF palette (default 255 for best quality) */
  maxColors?: number;
  /** Total recording duration in ms (default 3000) */
  duration?: number;
}

export function useGifExport(ref: RefObject<HTMLElement>, options: UseGifExportOptions = {}) {
  const {
    scale = 2,
    fps = 20,
    maxColors = 255,
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
        const frameDelay = Math.round(1000 / fps);
        const totalFrames = Math.ceil(duration / frameDelay);
        const frames: { data: ImageData; delay: number }[] = [];

        // Capture the element dimensions at scale
        const el = ref.current;
        const rect = el.getBoundingClientRect();
        const width = Math.round(rect.width * scale);
        const height = Math.round(rect.height * scale);

        // Start animation after a small delay to let UI settle
        if (onStartAnimation) {
          onStartAnimation();
        }

        // Small delay to let animation start rendering
        await new Promise((r) => setTimeout(r, 50));

        // Capture frames
        for (let i = 0; i < totalFrames; i++) {
          const canvas = await html2canvas(el, {
            backgroundColor: null,
            scale,
            useCORS: true,
            allowTaint: true,
            logging: false,
            width: rect.width,
            height: rect.height,
          });

          // Get ImageData from canvas
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const imageData = ctx.getImageData(0, 0, width, height);
            frames.push({ data: imageData, delay: frameDelay });
          }

          setProgress(Math.round(((i + 1) / totalFrames) * 50));

          // Wait for next frame
          if (i < totalFrames - 1) {
            await new Promise((r) => setTimeout(r, frameDelay));
          }
        }

        toast.loading("Encoding GIF...", { id: toastId });
        setProgress(60);

        // Dynamically import modern-gif to keep bundle small
        const { encode } = await import("modern-gif");

        // Encode with high quality settings
        const output = await encode({
          width,
          height,
          frames: frames.map((f) => ({
            data: f.data.data,
            delay: f.delay,
          })),
          maxColors,
        });

        setProgress(90);

        // Create blob and download
        const blob = new Blob([output], { type: "image/gif" });

        // Try native share first (mobile)
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

        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "mogsy-animation.gif";
        a.click();
        URL.revokeObjectURL(url);

        const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
        toast.success(`GIF saved! (${sizeMB}MB, ${width}×${height}px)`, { id: toastId });
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
