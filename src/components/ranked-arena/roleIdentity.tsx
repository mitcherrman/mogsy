/**
 * QUIZ1 Phase 11 — presentation-only identity for the five League ROLES.
 *
 * Deliberately NOT the class identity (`classIdentity.ts`). R1 froze role and
 * class as orthogonal facts and forbade a mapping between them in either
 * direction, so this file contains no reference to tank/mage/marksman and
 * cannot fall back to them.
 *
 * ART GAP — CLOSED (AI1 Phase 2)
 * ──────────────────────────────
 * This file used to record that there was no role mascot art, and drew a lane
 * sigil in the framed slot a portrait would occupy, noting that "when real
 * role art lands, only `RoleCrest` changes — nothing that consumes it does."
 * LC1 landed that art (five dedicated role characters in `MOGZY_ROLE_ASSETS`,
 * disjoint from the three CLASS characters, so no class→role mapping is
 * created), and this is that change: `RoleCrest` now renders the reusable
 * `RoleMascot` in the same slot, and nothing that consumes `RoleCrest` moved.
 *
 * The sigils below are NOT dead. They remain the crest for a duelist with no
 * role at all — a pre-R1 match, or an account that never chose — where there
 * is no role and therefore no role art to draw. That branch never guesses.
 *
 * `RoleCrest` names an intent (`action`) and a direction (`mirrored`); it owns
 * none of the motion. Distances, durations, easing and keyframes all live in
 * `RoleMascot`, so the same mascot behaves identically anywhere else in Mogzy.
 *
 * Accessibility: the sigil is `aria-hidden` and the role LABEL is always
 * rendered beside it, so a role is never communicated by shape or colour
 * alone (the R1 contract in `roles.ts`).
 */
import { isRankedRole, RANKED_ROLE_LABELS, type RankedRole } from "@/lib/ranked-public/roles";
import { RoleMascot, type RoleMascotAction } from "@/components/mascot/RoleMascot";

export interface RoleIdentity {
  role: RankedRole | null;
  /** Always renderable: the role label, or "Duelist" when there is no role. */
  label: string;
  accent: string;
  accentSoft: string;
}

/** Restrained accents from the existing academy palette — no new brand colour. */
const ROLE_ACCENTS: Record<RankedRole, { accent: string; accentSoft: string }> = {
  top: { accent: "#d5b66f", accentSoft: "rgba(213,182,111,0.16)" },
  jungle: { accent: "#8fd0a0", accentSoft: "rgba(143,208,160,0.14)" },
  mid: { accent: "#7fd6ef", accentSoft: "rgba(127,214,239,0.14)" },
  adc: { accent: "#e8b98a", accentSoft: "rgba(232,185,138,0.14)" },
  support: { accent: "#c6a8e8", accentSoft: "rgba(198,168,232,0.14)" },
};

const NEUTRAL = { accent: "rgba(233,220,190,0.55)", accentSoft: "rgba(233,220,190,0.10)" };

/** Visual identity for a role id off the wire. Fails soft to a neutral crest. */
export function roleIdentityFor(roleId: string | null | undefined): RoleIdentity {
  if (!isRankedRole(roleId)) {
    return { role: null, label: "Duelist", ...NEUTRAL };
  }
  return { role: roleId, label: RANKED_ROLE_LABELS[roleId], ...ROLE_ACCENTS[roleId] };
}

/**
 * The lane sigil. One 24×24 viewBox per role, all built from the same three
 * primitives (the map diagonal, a lane bar, a marker) so the five read as one
 * set rather than five borrowed icons.
 */
function Sigil({ role }: { role: RankedRole | null }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-full w-full",
    "aria-hidden": true,
  };
  switch (role) {
    case "top":
      // Upper-left lane: the corner the solo laner owns.
      return (
        <svg {...common}>
          <path d="M4 20L20 4" opacity="0.35" />
          <path d="M4 14V4h10" />
          <circle cx="7.5" cy="7.5" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "jungle":
      // Between the lanes: the diagonal plus the camps either side of it.
      return (
        <svg {...common}>
          <path d="M4 20L20 4" opacity="0.35" />
          <path d="M12 20c0-4 2-6 5-7-1 4-2 6-5 7z" />
          <path d="M12 20c0-4-2-6-5-7 1 4 2 6 5 7" opacity="0.6" />
        </svg>
      );
    case "mid":
      // The centre line, marked at the middle.
      return (
        <svg {...common}>
          <path d="M4 20L20 4" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
      );
    case "adc":
      // Lower-right lane with the carry's marker on the outside.
      return (
        <svg {...common}>
          <path d="M4 20L20 4" opacity="0.35" />
          <path d="M20 10v10H10" />
          <circle cx="16.5" cy="16.5" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "support":
      // The same lower-right lane, two markers: the partner, not the carry.
      return (
        <svg {...common}>
          <path d="M4 20L20 4" opacity="0.35" />
          <path d="M20 10v10H10" />
          <circle cx="14" cy="18" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="18" cy="14" r="1.4" fill="currentColor" stroke="none" opacity="0.65" />
        </svg>
      );
    default:
      // No role (a pre-R1 match, or an account that never chose). A neutral
      // crossed-blades mark — never a guessed role.
      return (
        <svg {...common}>
          <path d="M5 5l14 14M19 5L5 19" opacity="0.5" />
        </svg>
      );
  }
}

/**
 * The framed role crest that sits at the TOP of a duelist column, above HP.
 *
 * Fixed geometry at every state: the frame is the same box whether a role
 * arrived or not, so a match with no role cannot change the column's height
 * (the §14 common-vertical-rhythm constraint).
 */
export function RoleCrest({
  identity,
  mirrored,
  size = "md",
  action = null,
  actionId = null,
}: {
  identity: RoleIdentity;
  /** Opponent crests mirror so both duelists face the arena centre. */
  mirrored: boolean;
  size?: "sm" | "md";
  /**
   * AI1 Phase 2 — a transient mascot reaction to play. The crest passes the
   * INTENT straight through and knows nothing about what it looks like.
   * Ignored by the no-role sigil branch, which has no mascot to move.
   */
  action?: RoleMascotAction | null;
  /** Changes once per event; see `RoleMascot`'s `actionId`. */
  actionId?: string | number | null;
}) {
  const box = size === "sm" ? "h-10 w-10" : "h-14 w-14 min-[1500px]:h-16 min-[1500px]:w-16";
  return (
    <span
      aria-hidden
      data-testid="role-crest"
      data-role={identity.role ?? "none"}
      // The FRAME no longer mirrors when it holds a mascot: mirroring the box
      // would also mirror its inset shadow and gradient, and — the reason it
      // matters here — it would flip the mascot's own action transforms, so a
      // lunge forward on the right column would travel the wrong way. The
      // mascot carries its own facing instead. The sigil branch keeps the
      // original box mirror, unchanged.
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#0b1727] ${box} ${
        mirrored && identity.role === null ? "-scale-x-100" : ""
      }`}
      style={{
        color: identity.accent,
        boxShadow: `inset 0 0 0 1px ${identity.accent}33, inset 0 -8px 12px -8px rgba(0,0,0,0.8)`,
        backgroundImage: `radial-gradient(80% 70% at 50% 30%, ${identity.accentSoft}, transparent 75%)`,
      }}
    >
      {identity.role !== null ? (
        // The mascot is INSET inside the frame (h-4/5 of the box, centred)
        // rather than filling it. The frame is `overflow-hidden` and must stay
        // that way — it is the panel's framed-bust geometry — so the inset is
        // what buys the lunge and the recoil room to travel without either
        // clipping at the border or forcing the frame to grow. Motion stays
        // inside the box; the box never changes size.
        <RoleMascot
          role={identity.role}
          // Both duelists face the arena centre: the left column's mascot
          // looks right, the mirrored right column's looks left. This is the
          // only direction the arena states — `attack` and `hit` derive
          // forward and backward from it.
          facing={mirrored ? "left" : "right"}
          action={action}
          actionId={actionId}
          // Sized for CLEARANCE, not just for fit. At the peak of a lunge the
          // art is translated `--role-mascot-attack-reach` (16%) of its own
          // width and the hit recoil also rotates it, so the worst-case corner
          // is ~(0.5·cos4° + 0.5·sin4°)·w + 0.16·w ≈ 0.64·w from centre. Keeping
          // w at 40px inside a 56px frame leaves that corner ~2.8px clear of
          // the border; at 44px it grazed it. Measured, not guessed.
          className={size === "sm" ? "h-7 w-7" : "h-10 w-10 min-[1500px]:h-11 min-[1500px]:w-11"}
          data-testid="role-crest-mascot"
        />
      ) : (
        <span className={size === "sm" ? "h-5 w-5" : "h-7 w-7"}>
          <Sigil role={identity.role} />
        </span>
      )}
    </span>
  );
}
