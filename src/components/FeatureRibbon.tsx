/**
 * Reusable, manually placed status ribbon for Academy destinations and modes.
 * Presentation only: accessibility and gating belong to the hosting control.
 * There is deliberately no route registry or automatic status inference.
 */
export type FeatureRibbonLabel = "BETA" | "COMING SOON";
export type FeatureRibbonSize = "book" | "tab" | "mobile";

const SIZE_CLASS: Record<FeatureRibbonSize, string> = {
  book: "right-[-2.75rem] top-[1.85rem] w-[11rem] py-1.5 text-[11px] tracking-[0.16em]",
  tab: "right-[-1.65rem] top-[0.28rem] w-[6rem] py-[1px] text-[7px] tracking-[0.03em]",
  mobile: "right-[-0.85rem] top-[0.4rem] w-[5rem] py-[1px] text-[8px] tracking-[0.07em]",
};

export default function FeatureRibbon({
  label,
  size = "book",
}: {
  label: FeatureRibbonLabel;
  size?: FeatureRibbonSize;
}) {
  return (
    <span
      aria-hidden="true"
      data-testid={`feature-ribbon-${label === "BETA" ? "beta" : "coming-soon"}`}
      className={`pointer-events-none absolute z-20 block origin-center rotate-45 border-y border-[#fff0c4]/60 bg-gradient-to-b from-[#946829] to-[#583b17] text-center font-black uppercase leading-tight text-[#fff5d6] shadow-[0_2px_7px_rgba(0,0,0,0.45)] ${SIZE_CLASS[size]}`}
    >
      {label}
    </span>
  );
}
