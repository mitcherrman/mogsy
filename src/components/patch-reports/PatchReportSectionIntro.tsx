/**
 * Riot copy written once for a whole official section (Arena, Classic,
 * ARAM: Mayhem, …). The canonical report structure hoists it out of the
 * exploded entities (`ReportSectionNode.sharedContext`), so it appears here
 * once, directly beneath the section heading, instead of on every entity.
 */
export const PatchReportSectionIntro = ({ text }: { text: string }) => (
  <p
    data-testid="patch-report-section-intro"
    className="mb-4 max-w-3xl whitespace-pre-line border-l-2 border-[#c9a84c]/60 pl-3 text-sm italic leading-relaxed text-muted-foreground [overflow-wrap:anywhere]"
  >
    {text}
  </p>
);
