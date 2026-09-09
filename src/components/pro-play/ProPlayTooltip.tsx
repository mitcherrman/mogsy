/**
 * A self-sufficient tooltip trigger for Pro Play chips and glyphs.
 *
 * WHY IT CARRIES ITS OWN PROVIDER. Radix's `Tooltip` THROWS ("`Tooltip` must
 * be used within `TooltipProvider`") rather than degrading when no provider is
 * mounted. The app mounts one in `App.tsx`, so the live page is fine — but a
 * component that hard-crashes when rendered anywhere else is a trap for every
 * future reuse, and it made the card untestable in isolation. Providers nest
 * harmlessly, so the safe choice is to bring one.
 *
 * WHY IT IS A BUTTON. A tooltip on a hover-only element is invisible to
 * keyboard and touch users. The trigger is a real focusable button with an
 * `aria-label` that states both the visible label and the hidden detail, plus
 * a native `title` as the touch fallback where hover does not exist. It is
 * `cursor-default` because nothing happens on click: it is a disclosure, not
 * an action.
 */
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface ProPlayTooltipProps {
  /** The visible text, used in the accessible name. */
  label: string;
  /** The hidden detail. When absent or identical, no tooltip is attached. */
  tooltip?: string | null;
  className?: string;
  testId?: string;
  /** When given the trigger becomes a real action rather than a disclosure. */
  onClick?: () => void;
  /** Reflected as `aria-pressed` so a selected trigger is announced as one. */
  pressed?: boolean;
  children: React.ReactNode;
}

export default function ProPlayTooltip({
  label,
  tooltip,
  className,
  testId,
  onClick,
  pressed,
  children,
}: ProPlayTooltipProps) {
  if (!tooltip || tooltip === label) {
    // Still a button when it DOES something — a clickable span is invisible to
    // the keyboard.
    if (onClick) {
      return (
        <button
          type="button"
          data-testid={testId}
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className={cn("rounded", className)}
        >
          {children}
        </button>
      );
    }
    return (
      <span data-testid={testId} className={className}>
        {children}
      </span>
    );
  }
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid={testId}
            title={tooltip}
            // The accessible name is the visible label plus the hidden detail
            // — unless the detail already opens with the label, which is the
            // normal shape for a chip whose tooltip leads with the thing it is
            // naming. Prefixing there produced "Jayce — Jayce · 13g · …".
            aria-label={
              tooltip.startsWith(label) ? tooltip : `${label} — ${tooltip}`
            }
            aria-pressed={pressed}
            onClick={onClick}
            className={cn(
              "rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60",
              // `cursor-default` only while nothing happens on click. With a
              // handler it is an action and must look like one.
              onClick ? "cursor-pointer" : "cursor-default",
              className,
            )}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
