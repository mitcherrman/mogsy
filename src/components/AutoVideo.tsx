import { useRef, useEffect, useState } from "react";

interface AutoVideoProps {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  draggable?: boolean;
  onLoad?: () => void;
  onError?: (e: React.SyntheticEvent) => void;
  /** If true, auto play/pause based on IntersectionObserver visibility */
  visibilityControl?: boolean;
}

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v"];

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase().split("?")[0];
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Renders a `<video>` for video URLs (mp4/webm) or an `<img>` for images.
 * Video behaves like a GIF: autoplay, loop, muted, playsInline.
 * Supports IntersectionObserver-based play/pause for offscreen cards.
 */
export default function AutoVideo({
  src,
  alt = "",
  className = "",
  style,
  draggable = false,
  onLoad,
  onError,
  visibilityControl = true,
}: AutoVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideo] = useState(() => isVideoUrl(src));

  // Play/pause based on visibility
  useEffect(() => {
    if (!isVideo || !visibilityControl || !videoRef.current) return;
    const el = videoRef.current;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.25 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isVideo, visibilityControl]);

  if (isVideo) {
    return (
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className={className}
        style={{ ...style, willChange: "transform" }}
        draggable={draggable}
        onLoadedData={onLoad}
      >
        {/* Prefer webm if the source is mp4 — offer both */}
        {src.toLowerCase().endsWith(".mp4") && (
          <source
            src={src.replace(/\.mp4$/i, ".webm")}
            type="video/webm"
          />
        )}
        <source src={src} type={src.toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4"} />
        {/* Ultimate fallback: static image won't work for video but satisfies a11y */}
        <img src={src} alt={alt} className={className} style={style} />
      </video>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      draggable={draggable}
      onLoad={onLoad}
      onError={onError}
    />
  );
}

/** Utility: check if a URL points to a video file */
export { isVideoUrl };
