import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import UserAvatar from "@/components/UserAvatar";

interface FavoriteItem {
  id: string;
  type: "preset_item" | "user_profile";
  name: string;
  image_url: string | null;
  subtitle?: string;
  link?: string;
}

interface ProfileFavoriteCardsProps {
  items: FavoriteItem[];
}

export default function ProfileFavoriteCards({ items }: ProfileFavoriteCardsProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (items.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % items.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [items.length]);

  if (items.length === 0) return null;

  const getSize = (index: number) => {
    if (index === activeIndex) return { size: 100, ring: true, opacity: 1 };
    const dist = Math.abs(index - activeIndex);
    if (dist === 1) return { size: 72, ring: false, opacity: 0.7 };
    return { size: 56, ring: false, opacity: 0.5 };
  };

  return (
    <div className="flex items-center justify-center gap-3 py-2">
      {items.map((item, i) => {
        const { size, ring, opacity } = getSize(i);
        return (
          <motion.button
            key={item.id}
            animate={{
              width: size,
              height: size + 24,
              opacity,
            }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className={`rounded-xl overflow-hidden flex-shrink-0 flex flex-col items-center bg-card border ${
              ring
                ? "border-primary/60 shadow-[0_0_15px_hsl(var(--primary)/0.3)]"
                : "border-border"
            }`}
            onClick={() => {
              if (item.type === "user_profile") {
                navigate(`/user/${item.id}`);
              }
            }}
          >
            <div className="w-full flex-1 overflow-hidden">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-secondary">
                  <UserAvatar name={item.name} size="md" />
                </div>
              )}
            </div>
            {ring && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[8px] font-bold text-foreground truncate w-full text-center px-1 py-0.5"
              >
                {item.name}
              </motion.p>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
