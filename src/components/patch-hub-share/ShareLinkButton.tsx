import { Link2 } from "lucide-react";
import { usePatchHubShare } from "@/hooks/usePatchHubShare";
import { cn } from "@/lib/utils";

/**
 * Compact "copy link" control for Patch Hub (PH4-A). The accessible name states
 * what is copied; the visible text is optional so a row can stay an icon.
 */
export const ShareLinkButton = ({
  url,
  title,
  label,
  text,
  testId,
  className,
}: {
  url: string;
  /** Title handed to the native share sheet. */
  title: string;
  /** Accessible name, e.g. "Copy link to Vi Attack Damage change". */
  label: string;
  /** Visible text; omit for an icon-only button. */
  text?: string;
  testId?: string;
  className?: string;
}) => {
  const share = usePatchHubShare();
  return (
    <button
      type="button"
      data-testid={testId}
      data-share-url={url}
      aria-label={label}
      onClick={() => void share({ url, title })}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground",
        "hover:text-[#c9a84c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60",
        className,
      )}
    >
      <Link2 aria-hidden className="h-4 w-4 shrink-0" />
      {text}
    </button>
  );
};
