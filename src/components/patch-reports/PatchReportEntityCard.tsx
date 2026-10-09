import type { ReportEntityNode } from "@/lib/patch-reports/report-structure";
import { PatchReportAbilityGroup } from "./PatchReportAbilityGroup";
import { PatchReportEntityHeader } from "./PatchReportEntityHeader";
import type { PatchReportEntrySlots } from "./PatchReportEntrySlots";

// Re-exported: other surfaces (e.g. mechanics UI) follow this tone map.
export { StatusBadge } from "./PatchReportStatus";

export type PatchReportHeadingLevel = 2 | 3 | 4 | 5;

/**
 * One report entry, open by default and read like a League patch note:
 *
 *   identity  →  Riot rationale  →  ability / system group  →  exact changes
 *
 * Nothing the player needs to read the patch sits behind a disclosure. Mogzy
 * evidence (current value, reconciliation detail) is a compact per-change
 * disclosure, and the entity-level Mogzy status is a quiet marker, so Riot's
 * truth leads and Mogzy's truth stays visible without dominating.
 *
 * The entity node comes from the canonical report structure
 * (`@/lib/patch-reports/report-structure`), which has already decided what is
 * this entity's own rationale and what was hoisted to its section — this
 * component never strips or dedupes context itself.
 *
 * Later systems attach through `slots` (see PatchReportEntrySlots) rather than
 * by editing this component.
 */
export const PatchReportEntityCard = ({
  entity,
  hideSectionBadge = false,
  showDirection = true,
  headingLevel = 3,
  slots,
}: {
  entity: ReportEntityNode;
  /** The page already names the official section above this entry. */
  hideSectionBadge?: boolean;
  /** Show the backend editorial direction chip when the backend provides one. */
  showDirection?: boolean;
  /** Heading level of the entity name; ability headings sit one level below. */
  headingLevel?: PatchReportHeadingLevel;
  slots?: PatchReportEntrySlots;
}) => {
  const ctx = { entity };
  const abilityLevel = (headingLevel + 1) as 3 | 4 | 5 | 6;

  return (
    <article
      id={entity.anchor}
      data-testid="patch-report-card"
      aria-labelledby={`${entity.anchor}-title`}
      // One quiet edge per entry (PHSR4): the card boundary is kept for
      // scanning, but at a lower contrast than the content it frames.
      className="scroll-mt-24 overflow-hidden rounded-xl border border-border/45 bg-card"
    >
      <PatchReportEntityHeader
        ctx={ctx}
        headingLevel={headingLevel}
        hideSectionBadge={hideSectionBadge}
        showDirection={showDirection}
        slots={slots}
      />

      {entity.context && (
        <blockquote
          data-testid="patch-report-rationale"
          className="mx-4 mt-3 border-l-2 border-[#c9a84c]/60 pl-3 text-sm italic leading-relaxed text-muted-foreground [overflow-wrap:anywhere] sm:mx-5"
        >
          {entity.context}
          {entity.pairedWith.length > 0 && (
            <span className="mt-1 block text-xs not-italic">
              Riot wrote this for {[entity.card.entity_name, ...entity.pairedWith].join(" / ")}.
            </span>
          )}
        </blockquote>
      )}

      <div className="mt-3 pb-2">
        {entity.groups.map((group) => (
          <PatchReportAbilityGroup
            key={group.anchor}
            group={group}
            ctx={ctx}
            headingLevel={abilityLevel}
            slots={slots}
          />
        ))}
        {entity.groups.length === 0 && (
          <p className="px-4 pb-4 text-sm italic text-muted-foreground sm:px-5">
            Riot published no itemised changes for this entry.
          </p>
        )}
      </div>
    </article>
  );
};
