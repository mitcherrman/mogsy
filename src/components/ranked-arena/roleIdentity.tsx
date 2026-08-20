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
 * The role presentation at the TOP of a duelist column, above HP.
 *
 * Two shapes, one component:
 *
 *  * `sm` / `md` — the original framed 56px crest. An `overflow-hidden` box
 *    with the mascot INSET inside it, unchanged, and still the only shape a
 *    role-less duelist can have (the sigil branch).
 *  * `stage` (AI1 Phase 2B) — the frame is GONE. The owner's verdict on the
 *    crest was that it made a character read as a role icon, so at this size
 *    there is no box to be inside and no border to clip against: the panel
 *    itself is the frame, the mascot is simply large, and the only thing left
 *    behind it is a soft accent glow that seats it on the card. That is what
 *    buys the attack and the hit room to be big enough to see, instead of
 *    tuning them down to fit a 56px box.
 *
 * Fixed geometry WITHIN a match, in both shapes: the slot is the same height
 * whatever the mascot is doing, because every keyframe it plays is a transform
 * and transforms do not lay out. So no round, no reveal and no click can shift
 * the column (the §14 common-vertical-rhythm constraint).
 *
 * The two SHAPES do differ in height, and that is deliberate: a pre-R1 match
 * with no roles has no mascot to stand up and keeps the original inline crest
 * header. Which shape a column gets is frozen when the match is created, so it
 * is a constant for the whole match, and both columns of one match always
 * agree — the §14 constraint is about a column moving, not about two different
 * matches looking alike.
 *
 * `RoleCrest` names an intent (`action`) and a direction (`mirrored`); it owns
 * none of the motion. Distances, durations, easing, keyframes and the whole of
 * the click reaction live in `RoleMascot`, so the same mascot behaves
 * identically anywhere else in Mogzy.
 */
export function RoleCrest({
  identity,
  mirrored,
  size = "md",
  action = null,
  actionId = null,
  interactive = false,
}: {
  identity: RoleIdentity;
  /** Opponent crests mirror so both duelists face the arena centre. */
  mirrored: boolean;
  size?: "sm" | "md" | "stage";
  /**
   * AI1 Phase 2 — a transient mascot reaction to play. The crest passes the
   * INTENT straight through and knows nothing about what it looks like.
   * Ignored by the no-role sigil branch, which has no mascot to move.
   */
  action?: RoleMascotAction | null;
  /** Changes once per event; see `RoleMascot`'s `actionId`. */
  actionId?: string | number | null;
  /**
   * AI1 Phase 2B — let the mascot answer a click. The crest only says WHETHER
   * the mascot is touchable; what a touch looks like is the component's, and
   * there is no callback here for a surface to hang anything on.
   */
  interactive?: boolean;
}) {
  const stage = size === "stage";
  if (stage && identity.role !== null) {
    return (
      <span
        aria-hidden
        data-testid="role-crest"
        data-role={identity.role}
        // `overflow-visible` is the whole point of this shape: RESERVED SPACE,
        // not a clip, is what keeps the motion tidy. The top padding is that
        // reserve — it is what the click reaction hops into, so the hop stays
        // inside the card instead of poking out over its border. It is a
        // PERCENTAGE for the same reason the mascot is: padding percentages
        // resolve against this box's width, which is also what sizes the mascot,
        // so the reserve tracks the mascot instead of being right at one width
        // and wrong at the next. 12% here is ~20% of the mascot's height, which
        // is what the hop plus its stretch reach, plus a margin.
        // The slot takes whatever height the mascot's aspect gives it, and
        // nothing inside can change it: every keyframe here is a transform, and
        // transforms do not lay out.
        className="relative flex shrink-0 items-end justify-center overflow-visible pt-[12%]"
      >
        {/* Seating glow. A background only — it never moves, never clips, and
            is drawn well wider than the mascot so a lunge stays over it. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 top-2 rounded-2xl"
          style={{
            backgroundImage:
              `radial-gradient(58% 52% at 50% 62%, ${identity.accentSoft}, transparent 72%)`,
          }}
        />
        <RoleMascot
          role={identity.role}
          // Both duelists face the arena centre: the left column's mascot
          // looks right, the mirrored right column's looks left. This is the
          // only direction the arena states — `attack` and `hit` derive
          // forward and backward from it.
          facing={mirrored ? "left" : "right"}
          action={action}
          actionId={actionId}
          interactive={interactive}
          // The plate is 2:3 with roughly a fifth of its height empty above
          // the head and a fifth below the feet; `contain` in a box this tall
          // spends that emptiness and draws a small figure in a big frame.
          // `cover` in a 6:7 box crops the empty bands (11% top and bottom —
          // measured against the most generous of the five silhouettes, which
          // starts at 16%) and nothing else, so the CHARACTER is what fills
          // the slot. No horizontal crop is possible: the source is taller
          // than the box in every case.
          fit="cover"
          // Sized as a FRACTION of the column, not in fixed steps, because the
          // clearance the motion needs is a fraction of the mascot: at 52% of
          // the slot the art keeps 24% of the slot free on each side, and the
          // widest thing it ever does — a lunge of 30% of its own width, plus
          // the impact bulge — reaches about 17% of the slot. That margin holds
          // at every width, which fixed per-breakpoint sizes did not: a column
          // narrows faster than a stepped size does, and a 110px mascot in the
          // 162px column a 1024px stage can produce overran the card by 28px.
          className="relative aspect-[6/7] w-[52%] min-w-[3.5rem] max-w-[9rem]"
          // The column art is the first thing on screen in a match; it should
          // not arrive a beat late.
          loading="eager"
          data-testid="role-crest-mascot"
        />
      </span>
    );
  }
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
          facing={mirrored ? "left" : "right"}
          action={action}
          actionId={actionId}
          interactive={interactive}
          // Sized for CLEARANCE, not just for fit, and re-measured for the
          // Phase 2B distances: at the peak of a lunge the art is translated
          // 30% of its own width and the recoil also rotates it, so the
          // worst-case corner now sits ~0.80·w from centre. At 28px inside a
          // 56px frame that corner clears the border by ~5.6px.
          className={size === "sm" ? "h-5 w-5" : "h-7 w-7 min-[1500px]:h-8 min-[1500px]:w-8"}
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
