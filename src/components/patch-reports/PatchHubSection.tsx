import type {
  ReportEntityNode,
  ReportSectionNode,
} from "@/lib/patch-reports/report-structure";
import { PatchReportEntityCard, type PatchReportHeadingLevel } from "./PatchReportEntityCard";
import type { PatchReportEntrySlots } from "./PatchReportEntrySlots";
import { PatchReportSectionIntro } from "./PatchReportSectionIntro";

const GOLD = "#c9a84c";

type Props = {
  section: ReportSectionNode;
  /**
   * Extension seams for future per-entry systems (PatchImpactAnalysis, quiz,
   * history, Graph1, Combat Lab, share). Absent today on purpose: no
   * placeholder controls until an owning system exists.
   */
  slots?: PatchReportEntrySlots;
};

const Entries = ({
  entities,
  headingLevel,
  inBucket,
  slots,
}: {
  entities: ReportEntityNode[];
  headingLevel: PatchReportHeadingLevel;
  inBucket: boolean;
  slots?: PatchReportEntrySlots;
}) => (
  <div className="flex flex-col gap-4">
    {entities.map((entity) => (
      <PatchReportEntityCard
        key={entity.anchor}
        entity={entity}
        headingLevel={headingLevel}
        hideSectionBadge
        // Inside a Buffs/Nerfs/Adjustments bucket the heading already states
        // the direction; the chip remains only to label Mogzy's inference.
        showDirection={inBucket && entity.editorial.inferred}
        slots={slots}
      />
    ))}
  </div>
);

/**
 * One official patch section: heading, Riot's section intro once, then its
 * entries — grouped Buffs → Nerfs → Adjustments → Other changes when the
 * canonical structure says the section is direction-grouped, flat otherwise.
 *
 * Heading outline: h1 Patch Hub › h2 Patch Report › h3 section ›
 * (h4 direction ›) entity › ability.
 */
export const PatchHubSection = ({ section, slots }: Props) => {
  const count = section.entities.length;
  return (
    <section
      id={section.anchor}
      aria-labelledby={`${section.anchor}-heading`}
      data-testid="patch-hub-section"
      data-section-key={section.key}
      className="mb-10 scroll-mt-4"
    >
      <h3
        id={`${section.anchor}-heading`}
        className="mb-3 break-words border-b pb-2 text-xl font-bold"
        style={{ borderColor: `${GOLD}40` }}
      >
        {section.title}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          <span className="sr-only">(</span>
          {count}
          <span className="sr-only"> {count === 1 ? "entry" : "entries"})</span>
        </span>
      </h3>

      {section.sharedContext && <PatchReportSectionIntro text={section.sharedContext} />}

      {section.directionBuckets ? (
        section.directionBuckets.map((bucket) => (
          <div
            key={bucket.direction}
            id={bucket.anchor}
            data-direction={bucket.direction}
            className="mb-6 scroll-mt-4"
          >
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {bucket.label}
              <span className="ml-2 font-normal normal-case">{bucket.entities.length}</span>
            </h4>
            <Entries entities={bucket.entities} headingLevel={5} inBucket slots={slots} />
          </div>
        ))
      ) : (
        <Entries entities={section.entities} headingLevel={4} inBucket={false} slots={slots} />
      )}
    </section>
  );
};
