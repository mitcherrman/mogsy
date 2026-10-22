/**
 * Small shared pieces of the Tournament Arena: the motion gate class, the
 * entrant avatar (role mascot or monogram, with tier crown), pills, buttons
 * and the SIMULATED marker every fixture-driven screen carries.
 */
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { FlaskConical } from "lucide-react";

import { RoleMascot } from "@/components/mascot/RoleMascot";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";

import type { ArenaEntrant } from "../contracts";
import { accentFor, accentStyle, entrantCrown, entrantRole, initials } from "../identity";

/** The class that turns the stylesheet's keyframes on. */
export function useMotionClass(): string | false {
  return useMotionAllowed() && "ta--motion";
}

export function Eyebrow({ children, className, tone = "gold" }: { children: ReactNode; className?: string; tone?: "gold" | "muted" }) {
  return <p className={cn("ta-eyebrow", tone === "muted" && "text-[rgba(215,205,180,0.55)]", className)}>{children}</p>;
}

export function SimulatedBadge({ label = "Simulated", className }: { label?: string; className?: string }) {
  return (
    <span data-testid="ta-simulated" title="Fixture data for design review. Not a real event." className={cn("ta-pill ta-pill--sim", className)}>
      <FlaskConical className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

export const Btn = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "ghost" | "danger"; size?: "sm" | "md" | "lg" }>(
  function Btn({ tone = "ghost", size = "md", className, type = "button", ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn("ta-btn", tone === "primary" && "ta-btn--primary", tone === "danger" && "ta-btn--danger", size === "sm" && "ta-btn--sm", size === "lg" && "ta-btn--lg", className)}
        {...rest}
      />
    );
  },
);

export function Pill({ tone = "muted", children, className }: { tone?: "live" | "gold" | "ready" | "muted" | "sim"; children: ReactNode; className?: string }) {
  return <span className={cn("ta-pill", `ta-pill--${tone}`, className)}>{children}</span>;
}

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
const AVATAR_PX: Record<AvatarSize, number> = { xs: 24, sm: 32, md: 44, lg: 64, xl: 96 };

/**
 * An entrant's mark: the role mascot (cropped to the face, in the entrant's
 * accent) when they have a Ranked role, else a Cinzel monogram. The tier crown
 * sits on the corner where there is one. Decorative: the name is always
 * written beside it.
 */
export function EntrantAvatar({ entrant, size = "md", hex = false, crown = true, facing = "right", className, style }: {
  entrant: Pick<ArenaEntrant, "profile_id" | "display_name" | "role_emblem" | "tier"> | null;
  size?: AvatarSize;
  hex?: boolean;
  crown?: boolean;
  facing?: "left" | "right";
  className?: string;
  style?: CSSProperties;
}) {
  const px = AVATAR_PX[size];
  const role = entrantRole(entrant);
  const crownSrc = crown ? entrantCrown(entrant) : null;
  return (
    <span
      className={cn("ta-avatar", hex && "ta-avatar--hex", !role && "ta-avatar--mono", className)}
      style={{ width: px, height: px, fontSize: px * 0.36, ...accentStyle(entrant?.profile_id), ...style }}
      aria-hidden="true"
      data-testid="ta-avatar"
      data-role={role ?? "none"}
    >
      {entrant ? (
        role ? (
          <RoleMascot role={role} art="compact" fit="cover" facing={facing} loading="lazy" className="relative h-full w-full" imageClassName="object-[50%_12%]" />
        ) : (
          <span className="relative">{initials(entrant.display_name)}</span>
        )
      ) : (
        <span className="relative text-[rgba(215,205,180,0.5)]">?</span>
      )}
      {crownSrc && size !== "xs" && size !== "sm" && <img src={crownSrc} alt="" className="ta-crown" style={{ width: Math.max(18, px * 0.42) }} />}
    </span>
  );
}

export function accentOf(entrant: Pick<ArenaEntrant, "profile_id"> | null | undefined) {
  return entrant ? accentFor(entrant.profile_id) : null;
}

/** A VS medallion (the Ranked entry intro's ring, enlarged). */
export function VersusMark({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("ta-title relative inline-flex items-center justify-center rounded-full border border-[rgba(213,182,111,0.5)] bg-[radial-gradient(70%_70%_at_50%_40%,rgba(201,168,76,0.18),transparent_76%)] text-[#f1dc9c] shadow-[0_0_28px_-6px_rgba(201,168,76,0.6)]", className)}
      style={{ width: size, height: size, fontSize: size * 0.34, letterSpacing: "0.1em" }}
    >
      VS
    </span>
  );
}
