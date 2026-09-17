/**
 * RQ1 — the ONE small role emblem: Top / Jungle / Mid / ADC / Support.
 *
 * Three role systems exist in Mogzy and this file is only one of them:
 *
 *  * the large role MASCOTS (`RoleMascot`, `RoleCrest`) — a player's identity
 *    on a stage. Untouched by this component;
 *  * this EMBLEM — the small, flat role mark, used for whichever role a
 *    surface names: a picker option, or the role(s) a QUESTION applies to;
 *  * question FAMILY card art — a separate, future system. Not here.
 *
 * The art is the five shipped SVGs under `public/assets/ranked/mogzy-role-icons/`,
 * drawn as-is. The canonical wire id `adc` deliberately maps to `bot.svg`; that
 * file name is the art's, and never leaks back into the role vocabulary.
 *
 * Geometry: every size is a fixed square with explicit `width`/`height`, so
 * the box is laid out before the file arrives and nothing shifts on load.
 */
import {
  RANKED_ROLES, RANKED_ROLE_LABELS, type RankedRole,
} from "@/lib/ranked-public/roles";

const ROLE_EMBLEM_DIR = "/assets/ranked/mogzy-role-icons";

export const ROLE_EMBLEM_SRC: Record<RankedRole, string> = {
  top: `${ROLE_EMBLEM_DIR}/top.svg`,
  jungle: `${ROLE_EMBLEM_DIR}/jungle.svg`,
  mid: `${ROLE_EMBLEM_DIR}/mid.svg`,
  adc: `${ROLE_EMBLEM_DIR}/bot.svg`,
  support: `${ROLE_EMBLEM_DIR}/support.svg`,
};

export type RoleEmblemSize = "xs" | "card" | "sm" | "md" | "lg";

const SIZE_PX: Record<RoleEmblemSize, number> = { xs: 11, card: 13, sm: 14, md: 20, lg: 28 };

export function RoleEmblem({
  role, size = "sm", decorative = false, className = "",
}: {
  role: RankedRole;
  size?: RoleEmblemSize;
  /** True when a visible label or a parent's accessible name already says the role. */
  decorative?: boolean;
  className?: string;
}) {
  const px = SIZE_PX[size];
  return (
    <img
      src={ROLE_EMBLEM_SRC[role]}
      alt={decorative ? "" : RANKED_ROLE_LABELS[role]}
      aria-hidden={decorative || undefined}
      width={px}
      height={px}
      draggable={false}
      data-testid="role-emblem"
      data-role={role}
      className={`block shrink-0 select-none object-contain ${className}`}
      style={{ width: px, height: px }}
    />
  );
}

/** Canonical lane order, duplicates and unknown values dropped. */
export function orderedRoles(roles: readonly unknown[] | null | undefined): RankedRole[] {
  if (!roles || roles.length === 0) return [];
  const present = new Set(roles);
  return RANKED_ROLES.filter((role) => present.has(role));
}

/**
 * Spacing for a cluster. An overlapping cluster lives in a tiny slot: the 36px
 * timeline plate, with the marks pinned 2px in from its right edge, leaves
 * 34px. Eleven-pixel marks tuck harder as they multiply so the cluster always
 * fits: 3 -> 27px, 4 -> 32px (4px tuck), 5 -> 31px (6px tuck).
 */
function overlapClass(overlap: boolean, count: number): string {
  if (!overlap) return "gap-[3px]";
  if (count >= 5) return "-space-x-[6px]";
  return count === 4 ? "-space-x-[4px]" : "-space-x-[3px]";
}

/**
 * The role(s) a QUESTION applies to, as one compact horizontal cluster.
 *
 * Renders NOTHING for no roles: a neutral question has no mark, never a
 * placeholder. The cluster carries one accessible name ("Question role: Top")
 * and its emblems are decorative inside it, so a reader hears it once.
 */
export function QuestionRoleEmblems({
  roles, size = "sm", overlap = false, backed = false, className = "",
  testId = "question-role-emblems",
}: {
  roles: readonly RankedRole[] | null | undefined;
  size?: RoleEmblemSize;
  /** Tuck each emblem slightly under the previous one, for tiny slots. */
  overlap?: boolean;
  /**
   * Seat each emblem on a small navy tile. The art is gold lane-highlight
   * over a faint WHITE map, drawn for a dark ground; on a light surface (the
   * Ranked parchment folio) only the gold survives without this.
   */
  backed?: boolean;
  className?: string;
  testId?: string;
}) {
  const ordered = orderedRoles(roles);
  if (ordered.length === 0) return null;
  const names = ordered.map((role) => RANKED_ROLE_LABELS[role]).join(", ");
  return (
    <span
      role="img"
      aria-label={`Question ${ordered.length === 1 ? "role" : "roles"}: ${names}`}
      data-testid={testId}
      data-roles={ordered.join(" ")}
      data-count={ordered.length}
      className={`inline-flex shrink-0 items-center ${overlapClass(overlap, ordered.length)} ${className}`}
    >
      {ordered.map((role) => (backed ? (
        <span key={role} data-testid="role-emblem-tile"
          className="flex shrink-0 items-center justify-center rounded-[3px] bg-[#0b1727] p-[2px] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.35)]">
          <RoleEmblem role={role} size={size} decorative />
        </span>
      ) : (
        <RoleEmblem key={role} role={role} size={size} decorative />
      )))}
    </span>
  );
}
