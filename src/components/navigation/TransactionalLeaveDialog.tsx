import { useCallback, useEffect, useRef, type ReactNode } from "react";
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

export type TransactionalLeaveDialogProps = {
  open: boolean;
  title: ReactNode;
  body: ReactNode;
  stayLabel: string;
  leaveLabel: string;
  onStay: () => void;
  onLeave: () => void;
  busy?: boolean;
};

/** Presentation and accessibility only; transactional policy stays with owner. */
export function TransactionalLeaveDialog({
  open,
  title,
  body,
  stayLabel,
  leaveLabel,
  onStay,
  onLeave,
  busy = false,
}: TransactionalLeaveDialogProps) {
  const handlingRef = useRef(false);

  useEffect(() => {
    if (!open) handlingRef.current = false;
  }, [open]);

  const handleStay = useCallback(() => {
    if (busy || handlingRef.current) return;
    handlingRef.current = true;
    onStay();
  }, [busy, onStay]);

  const handleLeave = useCallback(() => {
    if (busy || handlingRef.current) return;
    handlingRef.current = true;
    onLeave();
  }, [busy, onLeave]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleStay();
      }}
    >
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{body}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:space-x-0">
          <AlertDialogCancel disabled={busy} onClick={handleStay}>
            {stayLabel}
          </AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={handleLeave}>
            {leaveLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
