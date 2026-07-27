import { memo } from "react";

/**
 * The Academy's main entrance.
 *
 * A dark pointed wooden double door is barely visible inside the surrounding
 * darkness. The door remains secondary to Mogzy: most of its shape is revealed
 * only by the faint light around the mascot and entrance.
 */

const GOLD_BRIGHT = "#f0d78c";

/**
 * Pointed gothic doorway.
 *
 * The two quadratic curves meet at a narrow peak rather than forming the
 * previous broad rounded arch.
 */
const DOOR_SHAPE =
  "M 58 400 L 58 180 Q 58 92 150 26 Q 242 92 242 180 L 242 400 Z";

interface AcademyDoorwayProps {
  /** Brightens the entrance slightly during hover/focus. */
  lit: boolean;
  /** During entry, the doorway fills with light. */
  entering: boolean;
  /** Suppresses the slow breathing light. */
  still: boolean;
  /** Controls how visible the faint stone edge is. */
  outline: number;
}

const AcademyDoorway = memo(function AcademyDoorway({
  lit,
  entering,
  still,
  outline,
}: AcademyDoorwayProps) {
  const glow = entering ? 1 : lit ? 0.7 : 0.46;
  const detailOpacity = entering ? 0.46 : lit ? 0.3 : 0.17;

  return (
    <svg
      className="h-auto w-full"
      viewBox="0 0 300 400"
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-testid="academy-doorway"
    >
      <defs>
        {/* Dark wood with only a slight warm lift near the centre. */}
        <linearGradient id="academy-door-wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#080707" />
          <stop offset="0.48" stopColor="#17110d" />
          <stop offset="1" stopColor="#070606" />
        </linearGradient>

        {/* Local light around Mogzy, not a bright portal filling the door. */}
        <radialGradient id="academy-door-light" cx="0.5" cy="0.43" r="0.55">
          <stop offset="0" stopColor={GOLD_BRIGHT} stopOpacity="0.32" />
          <stop offset="0.34" stopColor={GOLD_BRIGHT} stopOpacity="0.09" />
          <stop offset="1" stopColor={GOLD_BRIGHT} stopOpacity="0" />
        </radialGradient>

        <clipPath id="academy-door-clip">
          <path d={DOOR_SHAPE} />
        </clipPath>

        {/* The lower doorway still disappears gradually into the darkness. */}
        <linearGradient id="academy-door-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.62" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.94" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>

        <mask id="academy-door-fade-mask">
          <rect
            x="0"
            y="0"
            width="300"
            height="400"
            fill="url(#academy-door-fade)"
          />
        </mask>
      </defs>

      <g mask="url(#academy-door-fade-mask)">
        {/* Very faint surrounding entrance glow. */}
        <ellipse
          cx="150"
          cy="192"
          rx="132"
          ry="176"
          fill="url(#academy-door-light)"
          opacity={glow}
          style={{ transition: "opacity 450ms ease" }}
        >
          {!still && !entering && (
            <animate
              attributeName="ry"
              values="176;188;176"
              dur="7s"
              repeatCount="indefinite"
            />
          )}
        </ellipse>

        {/* Wooden double door. */}
        <path
          d={DOOR_SHAPE}
          fill="url(#academy-door-wood)"
          opacity={entering ? 0.52 : 0.88}
          style={{ transition: "opacity 450ms ease" }}
        />

        <g clipPath="url(#academy-door-clip)">
          {/* Minimal vertical plank suggestions. */}
          {[82, 106, 130, 170, 194, 218].map((x) => (
            <path
              key={x}
              d={`M ${x} 88 V 398`}
              stroke="#71563a"
              strokeWidth="1"
              opacity={detailOpacity * 0.42}
              style={{ transition: "opacity 450ms ease" }}
            />
          ))}

          {/* Centre seam between the two doors. */}
          <path
            d="M 150 28 V 398"
            stroke="#9b7950"
            strokeWidth="1"
            opacity={detailOpacity * 0.75}
            style={{ transition: "opacity 450ms ease" }}
          />

          {/* Restrained iron hinge marks. */}
          <g
            stroke="#806b4d"
            strokeWidth="2"
            strokeLinecap="round"
            opacity={detailOpacity}
            style={{ transition: "opacity 450ms ease" }}
          >
            <path d="M 68 230 H 126" />
            <path d="M 174 230 H 232" />
            <path d="M 68 308 H 126" />
            <path d="M 174 308 H 232" />
          </g>

          {/* Tiny central handle detail. */}
          <circle
            cx="143"
            cy="270"
            r="2.5"
            stroke="#9a8059"
            strokeWidth="1"
            opacity={detailOpacity}
          />
          <circle
            cx="157"
            cy="270"
            r="2.5"
            stroke="#9a8059"
            strokeWidth="1"
            opacity={detailOpacity}
          />

          {/* Soft light remains concentrated around Mogzy. */}
          <ellipse
            cx="150"
            cy="178"
            rx="110"
            ry="138"
            fill="url(#academy-door-light)"
            opacity={glow * 0.72}
          />
        </g>

        {/* One faint pointed stone edge around the wooden door. */}
        <path
          d={DOOR_SHAPE}
          stroke={GOLD_BRIGHT}
          strokeWidth="1"
          opacity={outline * (entering ? 0.35 : lit ? 0.17 : 0.09)}
          style={{ transition: "opacity 450ms ease" }}
        />
      </g>
    </svg>
  );
});

export default AcademyDoorway;