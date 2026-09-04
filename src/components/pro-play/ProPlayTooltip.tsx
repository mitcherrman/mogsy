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
  children: React.ReactNode;
}

export default function ProPlayTooltip({
  label,
  tooltip,
  className,
  testId,
  children,
}: ProPlayTooltipProps) {
  if (!tooltip || tooltip === label) {
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
            aria-label={`${label} — ${tooltip}`}
            className={cn(
              "cursor-default rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60",
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
