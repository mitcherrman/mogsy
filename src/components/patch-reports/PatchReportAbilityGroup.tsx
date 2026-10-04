import { useState } from "react";
import { cn } from "@/lib/utils";
import { PatchReportChangeLine } from "./PatchReportChangeLine";
import type { ReportGroupNode as AbilityGroupModel } from "@/lib/patch-reports/report-structure";
import type { PatchReportEntityContext, PatchReportEntrySlots } from "./PatchReportEntrySlots";

/**
 * The ability (or system part) icon. The real icon is shown when Riot/Mogzy
 * supplies one; otherwise the slot letter carries the same visual weight, so a
 * passive without a published icon still reads as an ability heading.
 */
const AbilityMark = ({ group }: { group: AbilityGroupModel }) => {
  const [errored, setErrored] = useState(false);
  const showImage = Boolean(group.iconUrl) && !errored;
  if (!showImage && !group.slot) {
    return (
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rotate-45 bg-[#c9a84c]/80"
        data-testid="patch-report-group-marker"
      />
    );
  }
  return (
    <span className="relative inline-flex h-11 w-11 shrink-0" data-testid="patch-report-ability-icon">
      {showImage ? (
        <img
          src={group.iconUrl as string}
          alt=""
          aria-hidden
          loading="lazy"
          onError={() => setErrored(true)}
          className="h-11 w-11 rounded-md border border-[#c9a84c]/50 object-cover shadow-sm"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-11 w-11 items-center justify-center rounded-md border border-[#c9a84c]/40 bg-[#c9a84c]/10 text-lg font-bold text-[#d8bd70]"
        >
          {group.slot}
        </span>
      )}
      {showImage && group.slot && (
        <span
          aria-hidden
          className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded border border-[#c9a84c]/60 bg-background px-0.5 text-[10px] font-bold leading-none text-[#d8bd70]"
        >
          {group.slot}
        </span>
      )}
    </span>
  );
};

export const PatchReportAbilityGroup = ({
  group,
  ctx,
  headingLevel,
  slots,
}: {
  group: AbilityGroupModel;
  ctx: PatchReportEntityContext;
  headingLevel: 3 | 4 | 5 | 6;
  slots?: PatchReportEntrySlots;
}) => {
  const Heading = `h${headingLevel}` as "h3" | "h4" | "h5" | "h6";
  const groupCtx = { ...ctx, group };
  const named = Boolean(group.title);
  // "Passive" / "Q" kicker reads like Riot's "Q - Name" without repeating the
  // prefix in the name; non-ability groups ("Base Stats") have neither.
  const name = group.slot ? group.name || group.title : group.title;

  return (
    <div
      id={group.anchor}
      role={named ? "group" : undefined}
      data-testid="patch-report-ability-group"
      data-ability-slot={group.slot ?? undefined}
      aria-labelledby={named ? `${group.anchor}-title` : undefined}
      className="scroll-mt-24 border-t border-border/70 px-4 pb-1 pt-3 first:border-t-0 sm:px-5"
    >
      {named && (
        <div className="flex items-center gap-3">
          <AbilityMark group={group} />
          <Heading
            id={`${group.anchor}-title`}
            className="flex min-w-0 flex-1 flex-col text-base font-semibold leading-tight sm:flex-row sm:items-baseline sm:gap-2"
          >
            {group.slotLabel && group.slotLabel !== group.slot && (
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#c9a84c]">
                {group.slotLabel}
              </span>
            )}
            <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
          </Heading>
          {slots?.groupActions?.(groupCtx)}
        </div>
      )}
      <ul className={cn("divide-y divide-border/50", named && "mt-1")}>
        {group.changes.map((node) => (
          <PatchReportChangeLine
            key={node.anchor}
            ctx={{ ...groupCtx, node, change: node.change }}
            slots={slots}
          />
        ))}
      </ul>
    </div>
  );
};
