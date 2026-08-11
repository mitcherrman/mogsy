import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type CombatLabToolbarProps = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Fires only after the user confirms (or when no confirmation is needed). */
  onResetInputs: () => void;
  /** True when the inputs already equal the canonical defaults. */
  atDefaults: boolean;
  sectionLabel: string;
  /** 0-based index of the active section. */
  sectionIndex: number;
  sectionCount: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Latest action feedback ("Undid item change", "Runes section", …). */
  announcement: string;
  /** Bumped on every action so a repeated message still re-shows the status. */
  announcementNonce: number;
};

const isMacPlatform = (): boolean =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");

/**
 * Compact input-navigation toolbar for the Combat Lab sandbox: undo/redo,
 * reset-to-defaults, and previous/next section controls with a "2 of 6"
 * indicator. Purely presentational — history and section state live with the
 * caller.
 *
 * Feedback is a single polite live region rather than toasts: routine
 * undo/navigation actions should inform assistive tech without stacking
 * notifications. Disabled controls keep their width so the row's geometry
 * never shifts as availability changes.
 */
export default function CombatLabToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onResetInputs,
  atDefaults,
  sectionLabel,
  sectionIndex,
  sectionCount,
  canPrev,
  canNext,
  onPrev,
  onNext,
  announcement,
  announcementNonce,
}: CombatLabToolbarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  // The visible status fades out after a few seconds; the live region keeps
  // its text (clearing it would be a second, pointless announcement).
  const [statusVisible, setStatusVisible] = useState(false);
  useEffect(() => {
    if (!announcement) return;
    setStatusVisible(true);
    const t = setTimeout(() => setStatusVisible(false), 4000);
    return () => clearTimeout(t);
  }, [announcement, announcementNonce]);

  const mac = isMacPlatform();
  const undoShortcut = mac ? "⌘Z" : "Ctrl+Z";
  const redoShortcut = mac ? "⇧⌘Z" : "Ctrl+Y / Ctrl+Shift+Z";

  const iconButton = "h-8 w-8 p-0";

  const control = (
    label: string,
    shortcut: string | null,
    disabled: boolean,
    onClick: () => void,
    keyshortcuts: string | null,
    icon: React.ReactNode
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* span keeps the tooltip working on disabled buttons */}
        <span className="inline-flex">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={iconButton}
            disabled={disabled}
            onClick={onClick}
            aria-label={shortcut ? `${label} (${shortcut})` : label}
            aria-keyshortcuts={keyshortcuts ?? undefined}
          >
            {icon}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {shortcut ? `${label} — ${shortcut}` : label}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="toolbar"
        aria-label="Input history and section navigation"
        data-combat-lab-toolbar
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1.5 backdrop-blur-sm"
      >
        <div className="flex items-center gap-1.5">
          {control(
            "Undo",
            undoShortcut,
            !canUndo,
            onUndo,
            mac ? "Meta+Z" : "Control+Z",
            <Undo2 className="h-4 w-4" aria-hidden="true" />
          )}
          {control(
            "Redo",
            redoShortcut,
            !canRedo,
            onRedo,
            mac ? "Meta+Shift+Z" : "Control+Y Control+Shift+Z",
            <Redo2 className="h-4 w-4" aria-hidden="true" />
          )}
          {control(
            "Reset inputs",
            null,
            atDefaults,
            () => setConfirmOpen(true),
            null,
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {control(
            "Previous section",
            null,
            !canPrev,
            onPrev,
            null,
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          )}
          <span
            data-combat-lab-section-indicator
            className="min-w-[7.5rem] text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            {sectionCount > 0
              ? `${Math.min(sectionIndex + 1, sectionCount)} of ${sectionCount} · ${sectionLabel}`
              : ""}
          </span>
          {control(
            "Next section",
            null,
            !canNext,
            onNext,
            null,
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </div>

        {/* aria-live alone (no role="status") — the Combat Lab already has a
            role="status" defeat banner that tests and AT address uniquely. */}
        <span
          aria-live="polite"
          aria-atomic="true"
          data-combat-lab-toolbar-status
          className={`min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground transition-opacity duration-300 ${
            statusVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          {announcement}
        </span>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all inputs?</AlertDialogTitle>
            <AlertDialogDescription>
              This restores the attacker, defender, ability ranks and summoner
              spells to their defaults. You can undo the reset afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                onResetInputs();
              }}
            >
              Reset inputs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
