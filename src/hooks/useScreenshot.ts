import { useCallback, RefObject } from "react";
import html2canvas from "html2canvas";
import { toast } from "sonner";

export function useScreenshot(ref: RefObject<HTMLElement>) {
  const capture = useCallback(async () => {
    if (!ref.current) return;

    try {
      const canvas = await html2canvas(ref.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });

      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error("Failed to capture image");
          return;
        }

        // Try native share first (mobile)
        if (navigator.share && navigator.canShare) {
          const file = new File([blob], "mogsy-matchup.png", { type: "image/png" });
          const shareData = { files: [file] };
          if (navigator.canShare(shareData)) {
            try {
              await navigator.share(shareData);
              return;
            } catch {
              // User cancelled or share failed, fall through to download
            }
          }
        }

        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "mogsy-matchup.png";
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Image saved!");
      }, "image/png");
    } catch {
      toast.error("Failed to capture screenshot");
    }
  }, [ref]);

  return { capture };
}
