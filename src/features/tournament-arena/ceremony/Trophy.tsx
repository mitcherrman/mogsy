/**
 * The Arena cup: an original chalice with a laurel band (ported from the
 * Dynasty `TrophyArt`; not a Summoner's Cup likeness). Inline SVG, no asset.
 */
const G = "#e3c66f";

export function Trophy({ accent = G, size = 150, className }: { accent?: string; size?: number; className?: string }) {
  const id = "ta-trophy-gold";
  return (
    <svg viewBox="0 0 200 260" width={size} height={size * 1.3} aria-hidden="true" className={className} data-testid="ta-trophy">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.5" stopColor={G} />
          <stop offset="1" stopColor="#8a6a1f" />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff8dc" />
          <stop offset="1" stopColor="#b48e3a" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="248" rx="64" ry="6" fill="rgba(227,198,111,0.18)" />
      <path d="M50 30 L150 30 L140 120 C135 150 115 165 100 165 C85 165 65 150 60 120 Z" fill={`url(#${id})`} />
      <path d="M50 40 C20 40 15 90 50 100 L56 86 C36 82 36 52 54 52 Z M150 40 C180 40 185 90 150 100 L144 86 C164 82 164 52 146 52 Z" fill={`url(#${id})`} />
      <rect x="46" y="26" width="108" height="8" rx="3" fill={`url(#${id}-rim)`} />
      <rect x="92" y="165" width="16" height="30" fill={`url(#${id})`} />
      <path d="M60 195 L140 195 L150 215 L50 215 Z" fill={`url(#${id})`} />
      <rect x="40" y="215" width="120" height="30" rx="4" fill="#0b1727" stroke={G} strokeWidth="2" />
      <path d="M70 70 Q100 56 130 70 Q100 84 70 70 Z" fill="none" stroke="#fff1b8" strokeWidth="2" />
      <path d="M78 96 Q100 86 122 96" fill="none" stroke="#fff1b8" strokeWidth="1.4" opacity="0.7" />
      <path d="M100 8 L104 18 L114 18 L106 24 L109 34 L100 28 L91 34 L94 24 L86 18 L96 18 Z" fill="#fff1b8" />
      <circle cx="100" cy="230" r="6" fill={accent} />
      <path d="M64 232 H88 M112 232 H136" stroke={accent} strokeWidth="1.5" opacity="0.7" />
    </svg>
  );
}
