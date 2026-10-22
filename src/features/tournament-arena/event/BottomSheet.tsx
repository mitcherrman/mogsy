/**
 * A phone bottom sheet (forked from the Worlds experience's `BottomSheet`):
 * a focus-trapped Radix dialog with drag-to-dismiss. Never scrolls the page.
 */
import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, type PanInfo } from "framer-motion";

import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { cn } from "@/lib/utils";

export function BottomSheet({ open, onClose, title, testId, children, landscape = false }: {
  open: boolean;
  onClose: () => void;
  title: string;
  testId: string;
  children: ReactNode;
  landscape?: boolean;
}) {
  const reduced = useReducedMotionPreference();
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 96 || info.velocity.y > 600) onClose();
  };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-[61] outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300 motion-reduce:animate-none"
          data-testid={testId}
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <motion.div
            drag={reduced ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
            className={cn(
              "ta mx-auto flex w-full flex-col overflow-clip rounded-t-3xl border border-b-0 border-white/10 bg-[hsl(214_50%_8%)] pb-[env(safe-area-inset-bottom)] text-foreground shadow-[0_-24px_60px_-20px_rgba(0,0,0,0.9)]",
              landscape ? "max-h-[calc(100dvh-0.5rem)] max-w-3xl" : "max-h-[min(88dvh,46rem)] max-w-lg",
            )}
          >
            <div className={cn("flex shrink-0 justify-center pb-1", landscape ? "pt-1.5" : "pt-2.5")} aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-white/20" />
            </div>
            <div className="ta-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
