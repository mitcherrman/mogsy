import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ProfilePhotoCirclesProps {
  photos: { url: string }[];
}

export default function ProfilePhotoCircles({ photos }: ProfilePhotoCirclesProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (photos.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % photos.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [photos.length]);

  if (photos.length === 0) return null;

  // Each photo is a circle. The "active" one is biggest.
  // They flow left to right, active slides right over time.
  const getSize = (index: number) => {
    if (index === activeIndex) return { size: 120, ring: true };
    const dist = Math.abs(index - activeIndex);
    if (dist === 1) return { size: 72, ring: false };
    return { size: 56, ring: false };
  };

  return (
    <div className="flex items-center justify-center gap-2 py-2">
      {photos.map((photo, i) => {
        const { size, ring } = getSize(i);
        return (
          <motion.div
            key={i}
            animate={{
              width: size,
              height: size,
              opacity: ring ? 1 : 0.7,
            }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className={`rounded-full overflow-hidden flex-shrink-0 ${
              ring
                ? "ring-2 ring-primary/60 shadow-[0_0_15px_hsl(210_80%_60%/0.3)]"
                : "ring-1 ring-border"
            }`}
          >
            <img
              src={photo.url}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </motion.div>
        );
      })}
    </div>
  );
}
