import type { ReactNode } from "react";
import type { PatchReportChange } from "@/lib/patch-reports/api";
import type {
  ReportChangeNode,
  ReportEntityNode,
  ReportGroupNode,
} from "@/lib/patch-reports/report-structure";

/**
 * Extension seams for a report entry. Later systems (PatchImpactAnalysis,
 * quiz / history / graph / Combat Lab / share actions) attach here by render
 * prop, so the entry itself never needs to be rewritten and never owns the
 * behaviour of another system.
 *
 * Every slot is optional and receives stable semantic anchors plus the
 * untouched backend objects. Slot output renders *after* the Riot text it
 * annotates, so analysis can never displace or reorder the published change.
 */
export type PatchReportEntityContext = {
  entity: ReportEntityNode;
};

export type PatchReportGroupContext = PatchReportEntityContext & {
  group: ReportGroupNode;
};

export type PatchReportChangeContext = PatchReportGroupContext & {
  node: ReportChangeNode;
  change: PatchReportChange;
};

export type PatchReportEntrySlots = {
  /** Header row, beside the entity identity (e.g. "Quiz this champion"). */
  entityActions?: (ctx: PatchReportEntityContext) => ReactNode;
  /** Ability/system heading row (e.g. "Ability history"). */
  groupActions?: (ctx: PatchReportGroupContext) => ReactNode;
  /** Directly under a change's exact values (e.g. PatchImpactAnalysis). */
  changeAnalysis?: (ctx: PatchReportChangeContext) => ReactNode;
  /** After a change's evidence row (e.g. "Quiz this change", "Graph it"). */
  changeActions?: (ctx: PatchReportChangeContext) => ReactNode;
};
