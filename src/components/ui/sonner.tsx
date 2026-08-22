import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      toastOptions={{
        classNames: {
          /*
           * `pointer-events-auto` is load-bearing, not decoration.
           *
           * A Radix modal locks the page behind it with `body { pointer-events:
           * none }`, and `pointer-events` INHERITS — so every toast raised while
           * a dialog is open, and every button inside it, computed to `none`.
           * The toast still drew above the overlay and still read as
           * interactive, but its action could not be clicked at all: the
           * topmost element at those coordinates was the dialog's own veil, so
           * the click dismissed the dialog instead.
           *
           * Measured on the PLAY1 match-entry record, whose signup gate raises a
           * persistent toast WHILE the record is open — the one moment its
           * "Create Account" action has to work. Set on the toast rather than on
           * the toaster container so only real toasts take clicks; an empty
           * toaster still captures nothing.
           */
          toast:
            "group toast pointer-events-auto group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton: "group-[.toast]:bg-background group-[.toast]:text-foreground group-[.toast]:border-border",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
