import { motion } from "framer-motion";

interface CategoryBubbleProps {
  size: number;
  onClick: () => void;
  imageUrl?: string | null;
  label: string;
  sublabel?: string;
  active?: boolean;
  variant?: "card" | "accent";
}

export default function CategoryBubble({ size, onClick, imageUrl, label, sublabel, active = false, variant = "card" }: CategoryBubbleProps) {
  const baseClass = "rounded-full flex flex-col items-center justify-center border-2 cursor-pointer select-none overflow-hidden relative";

  let colorClass: string;
  if (active) {
    colorClass = "border-primary text-primary";
  } else if (variant === "accent") {
    colorClass = "border-primary/30 text-primary";
  } else {
    colorClass = "border-border text-foreground";
  }

  const hasImage = !!imageUrl;

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.95 }}
      className={`${baseClass} ${colorClass} ${!hasImage ? (active ? "bg-primary/10" : variant === "accent" ? "bg-primary/5" : "bg-card") : ""}`}
      style={{
        width: size,
        height: size,
        gap: size >= 128 ? 8 : 4,
        boxShadow: active ? "0 0 40px hsl(var(--primary) / 0.25)" : "none",
      }}
    >
      {hasImage && (
        <>
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover rounded-full transition-opacity duration-700"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/50 rounded-full" />
        </>
      )}
      <span className={`relative z-10 flex flex-col items-center justify-center ${hasImage ? "text-white drop-shadow-lg" : ""}`}
        style={{ gap: size >= 128 ? 8 : 4 }}
      >
        <span className={`${size >= 100 ? "text-xs" : "text-[10px]"} font-extrabold tracking-wide leading-tight text-center px-1 line-clamp-2`}>{label}</span>
        {sublabel && (
          <span className="text-[8px] text-muted-foreground">{sublabel}</span>
        )}
      </span>
    </motion.button>
  );
}
