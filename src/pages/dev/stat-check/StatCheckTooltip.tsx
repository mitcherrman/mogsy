import * as React from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The board is icon-only, so every symbol needs its explanation reachable
 * without rendering the wording. Radix's tooltip covers hover and keyboard
 * focus but never opens on a plain touch tap, so open state is controlled
 * here and driven by all three inputs: hover, focus, and tap.
 *
 * The trigger is always a real <button>, so the explanation is reachable by
 * keyboard on every surface; `aria-label` carries the same text for screen
 * readers, which never see the popup itself.
 *
 * Renders its own TooltipProvider so the board works when mounted outside the
 * app shell (the page tests render StatCheckPage directly).
 */
export function BoardTooltip({
  label,
  ariaLabel,
  testId,
  side = "top",
  className,
  buttonClassName,
  onClick,
  ariaExpanded,
  children,
}: {
  /** Visible-on-interaction explanation. */
  label: string;
  /** Accessible name, when it should differ from the visible tooltip text. */
  ariaLabel?: string;
  testId?: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  buttonClassName?: string;
  /** Action to run when the trigger is activated (e.g. the dock lever). */
  onClick?: () => void;
  ariaExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid={testId}
            aria-label={ariaLabel ?? label}
            aria-expanded={ariaExpanded}
            // Tap toggles. Radix closes on pointerdown, which fires before
            // click, so the toggle here lands on a closed tooltip and opens it.
            onClick={() => {
              onClick?.();
              setOpen((current) => !current);
            }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            className={cn(
              "outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-0",
              buttonClassName,
            )}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          data-testid={testId ? `${testId}-tooltip` : undefined}
          className={cn(
            "max-w-[240px] border-[#d6b55d]/45 bg-[#080d16] text-xs font-semibold text-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.6)]",
            className,
          )}
        >
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
