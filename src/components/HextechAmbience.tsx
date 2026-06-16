import { memo } from "react";

/**
 * Hextech ambience overlay — fixed full-viewport decorative layer for the
 * League of Legends section. Renders animated arcane wisps, floating Hextech
 * runes/gems, and ornate gold corner brackets inspired by the official LoL
 * brand collateral. Pure SVG/CSS, pointer-events: none — never intercepts UI.
 */
function HextechAmbience() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[5] overflow-hidden"
    >
      {/* Deep navy vignette + arcane horizon wisps */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 50% at 50% 35%, rgba(80,170,220,0.10), transparent 65%), radial-gradient(60% 40% at 50% 100%, rgba(201,168,76,0.08), transparent 70%)",
        }}
      />
      {/* Horizontal arcane mist band */}
      <div className="hextech-mist absolute left-0 right-0 top-1/2 h-[40vh] -translate-y-1/2" />

      {/* Floating runes — varied size/position/duration for organic drift */}
      <Rune symbol="hex" className="top-[12%] left-[8%]" size={42} delay="0s" duration="14s" />
      <Rune symbol="gem" className="top-[22%] right-[10%]" size={36} delay="2s" duration="17s" />
      <Rune symbol="cross" className="top-[58%] left-[6%]" size={30} delay="4s" duration="19s" />
      <Rune symbol="bolt" className="bottom-[14%] right-[14%]" size={40} delay="1s" duration="15s" />
      <Rune symbol="diamond" className="top-[40%] left-[46%]" size={26} delay="6s" duration="22s" />
      <Rune symbol="hex" className="bottom-[26%] left-[28%]" size={22} delay="3s" duration="20s" />
      <Rune symbol="gem" className="top-[8%] right-[34%]" size={20} delay="5s" duration="18s" />
      <Rune symbol="cross" className="bottom-[8%] right-[40%]" size={28} delay="7s" duration="21s" />
      <Rune symbol="bolt" className="top-[68%] right-[6%]" size={24} delay="2.5s" duration="16s" />

      {/* Ornate gold corner brackets */}
      <CornerBracket className="top-3 left-3" />
      <CornerBracket className="top-3 right-3 scale-x-[-1]" />
      <CornerBracket className="bottom-3 left-3 scale-y-[-1]" />
      <CornerBracket className="bottom-3 right-3 scale-x-[-1] scale-y-[-1]" />
    </div>
  );
}

function Rune({
  symbol,
  className = "",
  size = 32,
  delay = "0s",
  duration = "16s",
}: {
  symbol: "hex" | "gem" | "cross" | "bolt" | "diamond";
  className?: string;
  size?: number;
  delay?: string;
  duration?: string;
}) {
  return (
    <div
      className={`hextech-float absolute ${className}`}
      style={{ width: size, height: size, animationDelay: delay, animationDuration: duration }}
    >
      <RuneSvg symbol={symbol} />
    </div>
  );
}

function RuneSvg({ symbol }: { symbol: "hex" | "gem" | "cross" | "bolt" | "diamond" }) {
  const gold = "#c9a84c";
  const goldLight = "#f0d78c";
  const blue = "#5cbdd9";
  const common = {
    width: "100%",
    height: "100%",
    viewBox: "0 0 64 64",
    fill: "none",
    style: {
      filter:
        "drop-shadow(0 0 6px rgba(92,189,217,0.35)) drop-shadow(0 0 2px rgba(201,168,76,0.6))",
    } as const,
  };
  switch (symbol) {
    case "hex":
      return (
        <svg {...common}>
          <polygon
            points="32,6 56,20 56,44 32,58 8,44 8,20"
            stroke={gold}
            strokeWidth="2"
            fill="rgba(10,20,40,0.45)"
          />
          <polygon points="32,18 46,26 46,40 32,48 18,40 18,26" stroke={blue} strokeWidth="1.2" fill="rgba(40,120,160,0.35)" />
          <circle cx="32" cy="33" r="3" fill={goldLight} />
        </svg>
      );
    case "gem":
      return (
        <svg {...common}>
          <polygon points="32,6 52,24 32,58 12,24" stroke={gold} strokeWidth="2" fill="rgba(20,60,90,0.55)" />
          <polyline points="12,24 32,30 52,24" stroke={blue} strokeWidth="1.2" fill="none" />
          <line x1="32" y1="30" x2="32" y2="58" stroke={blue} strokeWidth="1.2" />
        </svg>
      );
    case "cross":
      return (
        <svg {...common}>
          <path
            d="M32 6 L36 20 L50 16 L42 28 L58 32 L42 36 L50 48 L36 44 L32 58 L28 44 L14 48 L22 36 L6 32 L22 28 L14 16 L28 20 Z"
            stroke={gold}
            strokeWidth="1.6"
            fill="rgba(10,20,40,0.4)"
          />
          <circle cx="32" cy="32" r="4" fill={goldLight} />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <polygon
            points="36,4 14,34 30,34 24,60 50,28 34,28"
            stroke={gold}
            strokeWidth="2"
            fill="rgba(92,189,217,0.25)"
          />
        </svg>
      );
    case "diamond":
      return (
        <svg {...common}>
          <polygon points="32,4 60,32 32,60 4,32" stroke={gold} strokeWidth="2" fill="rgba(20,60,90,0.55)" />
          <polygon points="32,16 48,32 32,48 16,32" stroke={blue} strokeWidth="1.2" fill="rgba(92,189,217,0.25)" />
        </svg>
      );
  }
}

function CornerBracket({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`absolute h-16 w-16 md:h-20 md:w-20 opacity-60 ${className}`}
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 28 L4 12 Q4 4 12 4 L28 4"
        stroke="#c9a84c"
        strokeWidth="1.5"
        fill="none"
      />
      <path d="M10 18 L10 10 L18 10" stroke="#c9a84c" strokeWidth="1" fill="none" opacity="0.7" />
      <circle cx="10" cy="10" r="1.5" fill="#f0d78c" />
      <path d="M4 44 L4 36" stroke="#c9a84c" strokeWidth="1" opacity="0.5" />
      <path d="M36 4 L44 4" stroke="#c9a84c" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

export default memo(HextechAmbience);