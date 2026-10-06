/**
 * Catch-Up presentation model (PH3-D). Pure: no React, no fetch, no storage.
 *
 * Turns the PH3-B `CatchUpReport` into what the Catch-Up view renders:
 * official section › entry (alphabetical) › patch step (oldest first) › Riot
 * group › Riot line. It never creates, drops, merges or reorders Riot lines
 * inside an appearance, and it never invents continuity: Mogzy notes come only
 * from `report.continuity.chains`, and only while `continuity.status` is
 * "available". See docs/PATCH_HUB_PH3_CATCHUP_DESIGN.md §7–§12.
 */
import type {
  CatchUpEmptyCard,
  CatchUpEntity,
  CatchUpParameterChain,
  CatchUpReport,
  CatchUpRiotLine,
  CatchUpSection,
  NetComponent,
} from "@/lib/patch-catchup";
import type { CatchUpLoader } from "@/lib/patch-catchup-loader";
import type { PatchReportCard } from "@/lib/patch-reports/api";
import {
  buildPatchReportStructure,
  isDirectionGroupedCard,
  resolveCardEditorial,
  type EditorialResolution,
} from "@/lib/patch-reports/report-structure";
import { slugifySegment } from "@/lib/patch-reports/semantic-ids";

/** Generic Summoner's Rift sections, pinned first (the only reordering Catch-Up does). */
export const PINNED_SECTION_KEYS = ["patch-champions", "patch-items", "patch-runes"] as const;

/** A non-chainable section with MORE than this many Riot lines starts collapsed. */
export const COLLAPSE_LINE_THRESHOLD = 40;

/** Sections where Riot publishes changes that touch many champions at once. */
const CROSS_REFERENCE_SECTION_KEYS = [
  "patch-systems",
  "patch-game-systems",
  "patch-support-adjustments",
] as const;

/* -------------------------------------------------------------------------- */
/* Model types                                                                */
/* -------------------------------------------------------------------------- */

export type CatchUpLineGroupModel = {
  /** The Patch Report's group anchor (unique within the appearance). */
  key: string;
  /** Riot's group title, verbatim; empty for headless change lists (items). */
  title: string;
  lines: CatchUpRiotLine[];
};

export type CatchUpStepModel = {
  /** `<patch>#<cardIndex>`: unique within the entry. */
  key: string;
  patch: string;
  /** The Patch Report's own entity anchor for this card. */
  entityAnchor: string;
  card: PatchReportCard;
  lineCount: number;
  groups: CatchUpLineGroupModel[];
  /** Direction claim, only for SR champion/item cards (same gate as the report). */
  editorial: EditorialResolution | null;
  /** The card's own Riot rationale; null when absent or hoisted to the section. */
  riotNote: string | null;
};

export type CatchUpEntryModel = {
  key: string;
  /** DOM id, `cu-<entity key slug>`; unique per view. */
  id: string;
  name: string;
  entityType: CatchUpEntity["entityType"];
  sectionKey: string;
  /** Distinct patches, oldest first. */
  patches: string[];
  lineCount: number;
  steps: CatchUpStepModel[];
  /** Newest appearance's card (image, type). */
  card: PatchReportCard;
  /** Proven chains for this entry; always empty when continuity is withheld. */
  chains: CatchUpParameterChain[];
  /** Folded text used by search. */
  searchText: string;
};

export type CatchUpSectionIntro = { patch: string; text: string };

export type CatchUpSectionModel = {
  key: string;
  /** DOM id, `cu-s-<section key>`. */
  id: string;
  /** Riot's title as published in the newest patch that has lines here. */
  title: string;
  chainable: boolean;
  /** Total Riot lines in the range (never reduced by search). */
  lineCount: number;
  entryCount: number;
  /** Patches with lines in this section, oldest first. */
  patches: string[];
  /** §10.2: non-chainable and more than 40 lines. */
  defaultCollapsed: boolean;
  intros: CatchUpSectionIntro[];
  entries: CatchUpEntryModel[];
};

export type CatchUpChainLineInfo = {
  chain: CatchUpParameterChain;
  stepIndex: number;
  isLast: boolean;
  /** Patch of the next step, for the trail dot's "continues in…" text. */
  nextPatch: string | null;
  /** DOM id of the note under the chain's final line. */
  noteId: string;
};

export type CatchUpOtherAnnouncement = CatchUpEmptyCard & { sectionTitle: string | null };

export type CatchUpViewModel = {
  continuityAvailable: boolean;
  sections: CatchUpSectionModel[];
  /** line id → chain membership (empty when continuity is withheld). */
  chainByLine: Map<string, CatchUpChainLineInfo>;
  otherAnnouncements: CatchUpOtherAnnouncement[];
  /** Sections the Champions cross-reference points to, in display order. */
  crossReferences: { key: string; id: string; title: string }[];
};

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

const sectionDomId = (key: string) => `cu-s-${key}`;

/** Case-, diacritic- and quote-insensitive fold shared by the search haystack and query. */
export function foldSearchText(text: string | null | undefined): string {
  return (text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const alnumOnly = (folded: string) => folded.replace(/[^a-z0-9]+/g, "");

/** Display order of sections: SR pins, then Riot's merged order (newest report as skeleton). */
export function orderSectionKeys(report: Pick<CatchUpReport, "lines" | "includedPatches">): string[] {
  const perPatch = new Map<string, string[]>();
  for (const line of report.lines) {
    let order = perPatch.get(line.patch);
    if (!order) perPatch.set(line.patch, (order = []));
    if (!order.includes(line.sectionKey)) order.push(line.sectionKey);
  }
  const patchesNewestFirst = [...report.includedPatches].reverse();
  for (const patch of perPatch.keys()) if (!patchesNewestFirst.includes(patch)) patchesNewestFirst.push(patch);

  const merged: string[] = [];
  for (const patch of patchesNewestFirst) {
    const own = perPatch.get(patch) ?? [];
    own.forEach((key, i) => {
      if (merged.includes(key)) return;
      // Insert directly after the nearest preceding section (from this patch's own
      // order) that is already placed; at the front when there is none.
      let at = 0;
      for (let j = i - 1; j >= 0; j--) {
        const k = merged.indexOf(own[j]);
        if (k !== -1) {
          at = k + 1;
          break;
        }
      }
      merged.splice(at, 0, key);
    });
  }
  const pinned = PINNED_SECTION_KEYS.filter((key) => merged.includes(key));
  return [...pinned, ...merged.filter((key) => !(PINNED_SECTION_KEYS as readonly string[]).includes(key))];
}

/** Per-patch Patch Report structure over the cards that have lines, for context hoisting. */
function contextIndex(report: CatchUpReport) {
  const cardsByPatch = new Map<string, Map<number, PatchReportCard>>();
  for (const line of report.lines) {
    let cards = cardsByPatch.get(line.patch);
    if (!cards) cardsByPatch.set(line.patch, (cards = new Map()));
    if (!cards.has(line.cardIndex)) cards.set(line.cardIndex, line.card);
  }
  const ownNote = new Map<PatchReportCard, string | null>();
  const sharedBySection = new Map<string, Map<string, string>>(); // section → patch → text
  for (const [patch, cards] of cardsByPatch) {
    const ordered = [...cards.entries()].sort((a, b) => a[0] - b[0]).map(([, card]) => card);
    const structure = buildPatchReportStructure({ patch_version: patch, cards: ordered });
    for (const section of structure.sections) {
      if (section.sharedContext) {
        let byPatch = sharedBySection.get(section.key);
        if (!byPatch) sharedBySection.set(section.key, (byPatch = new Map()));
        byPatch.set(patch, section.sharedContext);
      }
      for (const entity of section.entities) ownNote.set(entity.card, entity.context);
    }
  }
  return { ownNote, sharedBySection };
}

function stepsOf(entity: CatchUpEntity, ownNote: Map<PatchReportCard, string | null>): CatchUpStepModel[] {
  return entity.appearances.map((appearance) => {
    const lines = entity.riotLines.filter(
      (line) => line.patch === appearance.patch && line.cardIndex === appearance.cardIndex,
    );
    const groups: CatchUpLineGroupModel[] = [];
    for (const line of lines) {
      const last = groups[groups.length - 1];
      if (last && last.key === line.target.group) last.lines.push(line);
      else groups.push({ key: line.target.group, title: (line.change.group_title ?? "").trim(), lines: [line] });
    }
    const card = lines[0].card;
    return {
      key: `${appearance.patch}#${appearance.cardIndex}`,
      patch: appearance.patch,
      entityAnchor: appearance.entityAnchor,
      card,
      lineCount: lines.length,
      groups,
      editorial: isDirectionGroupedCard(card) ? resolveCardEditorial(card) : null,
      riotNote: ownNote.get(card) ?? null,
    };
  });
}

function entrySearchText(entity: CatchUpEntity, sectionTitle: string, patches: string[]): string {
  const parts: string[] = [entity.name, sectionTitle, ...patches];
  for (const line of entity.riotLines) {
    parts.push(line.change.group_title ?? "", line.change.property_name ?? "", line.change.detail_text ?? "");
  }
  return foldSearchText(parts.join("\n"));
}

/* -------------------------------------------------------------------------- */
/* View model                                                                 */
/* -------------------------------------------------------------------------- */

export function buildCatchUpViewModel(report: CatchUpReport): CatchUpViewModel {
  // Layer 2 is decoration and is shown only when the domain made it available.
  // The domain already returns no chains when withheld; the UI asserts it too.
  const continuityAvailable = report.continuity.status === "available";
  const chains = continuityAvailable ? report.continuity.chains : [];
  const { ownNote, sharedBySection } = contextIndex(report);

  const domainSections = new Map<string, CatchUpSection>(report.sections.map((s) => [s.key, s]));
  const newestTitle = new Map<string, string>();
  for (const line of report.lines) newestTitle.set(line.sectionKey, line.sectionTitle);

  const usedIds = new Set<string>();
  const uniqueId = (base: string) => {
    let id = base;
    for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
    usedIds.add(id);
    return id;
  };

  const entriesBySection = new Map<string, CatchUpEntity[]>();
  for (const entity of report.entities) {
    let list = entriesBySection.get(entity.sectionKey);
    if (!list) entriesBySection.set(entity.sectionKey, (list = []));
    list.push(entity);
  }

  const chainByLine = new Map<string, CatchUpChainLineInfo>();
  const entryIdByKey = new Map<string, string>();

  const sections: CatchUpSectionModel[] = orderSectionKeys(report).map((key) => {
    const domain = domainSections.get(key);
    const title = newestTitle.get(key) ?? domain?.title ?? key;
    const entities = [...(entriesBySection.get(key) ?? [])].sort(
      (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.key.localeCompare(b.key),
    );
    const entries = entities.map<CatchUpEntryModel>((entity) => {
      const id = uniqueId(`cu-${slugifySegment(entity.key) || "entry"}`);
      entryIdByKey.set(entity.key, id);
      const steps = stepsOf(entity, ownNote);
      const patches = [...new Set(entity.appearances.map((a) => a.patch))];
      const newest = steps[steps.length - 1];
      return {
        key: entity.key,
        id,
        name: entity.name,
        entityType: entity.entityType,
        sectionKey: key,
        patches,
        lineCount: entity.riotLines.length,
        steps,
        card: newest.card,
        chains: chains.filter((chain) => chain.entityKey === entity.key),
        searchText: entrySearchText(entity, title, patches),
      };
    });
    const shared = sharedBySection.get(key);
    const patches = domain?.patches ?? [...new Set(entities.flatMap((e) => e.appearances.map((a) => a.patch)))];
    const chainable = domain?.chainable ?? false;
    const lineCount = domain?.lineCount ?? entities.reduce((n, e) => n + e.riotLines.length, 0);
    return {
      key,
      id: uniqueId(sectionDomId(key)),
      title,
      chainable,
      lineCount,
      entryCount: entries.length,
      patches,
      defaultCollapsed: !chainable && lineCount > COLLAPSE_LINE_THRESHOLD,
      intros: shared ? patches.filter((p) => shared.has(p)).map((p) => ({ patch: p, text: shared.get(p) as string })) : [],
      entries,
    };
  });

  for (const chain of chains) {
    const entryId = entryIdByKey.get(chain.entityKey) ?? "cu-entry";
    const noteId = uniqueId(`${entryId}--note-${slugifySegment(chain.id).slice(0, 48) || "chain"}`);
    chain.steps.forEach((step, i) => {
      chainByLine.set(step.line.id, {
        chain,
        stepIndex: i,
        isLast: i === chain.steps.length - 1,
        nextPatch: chain.steps[i + 1]?.patch ?? null,
        noteId,
      });
    });
  }

  const sectionTitleOf = new Map(sections.map((s) => [s.key, s.title]));
  const otherAnnouncements = report.cardsWithoutChanges.map((card) => ({
    ...card,
    sectionTitle: sectionTitleOf.get(card.sectionKey) ?? null,
  }));

  const crossReferences = sections
    .filter((s) => (CROSS_REFERENCE_SECTION_KEYS as readonly string[]).includes(s.key))
    .map((s) => ({ key: s.key, id: s.id, title: s.title }));

  return { continuityAvailable, sections, chainByLine, otherAnnouncements, crossReferences };
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

export type CatchUpSearchResult = {
  active: boolean;
  sections: CatchUpSectionModel[];
  entryCount: number;
};

/**
 * One search box (§12, owner decision 8): entity, section, group, property,
 * Riot detail text and patch version. A matching entry keeps ALL its lines;
 * sections and entries keep their order; sections without matches are dropped.
 * Never creates or removes continuity: it only narrows what is shown.
 */
export function searchCatchUp(model: Pick<CatchUpViewModel, "sections">, query: string): CatchUpSearchResult {
  const q = foldSearchText(query);
  if (!q) {
    return {
      active: false,
      sections: model.sections,
      entryCount: model.sections.reduce((n, s) => n + s.entries.length, 0),
    };
  }
  const qAlnum = alnumOnly(q);
  const matches = (entry: CatchUpEntryModel) =>
    entry.searchText.includes(q) || (qAlnum !== "" && alnumOnly(entry.searchText).includes(qAlnum));
  const sections = model.sections
    .map((section) => ({ ...section, entries: section.entries.filter(matches) }))
    .filter((section) => section.entries.length > 0);
  return { active: true, sections, entryCount: sections.reduce((n, s) => n + s.entries.length, 0) };
}

/* -------------------------------------------------------------------------- */
/* Continuity wording (§9; PH3-B §11; owner decision 9)                       */
/* -------------------------------------------------------------------------- */

const MINUS = "−";

function signed(delta: string): string {
  const trimmed = delta.trim();
  if (/^-?0+(\.0+)?$/.test(trimmed)) return "0";
  return trimmed.startsWith("-") ? `${MINUS}${trimmed.slice(1)}` : `+${trimmed.replace(/^\+/, "")}`;
}

const isPercent = (raw: string) => raw.includes("%");
const isSeconds = (raw: string) => /\d\s*(s|sec|seconds?)\b/i.test(raw);

/** The computed part of a net note, from `net.components` only. Null when unavailable. */
export function formatNetDelta(chain: CatchUpParameterChain): { note: string; chip: string } | null {
  const components: NetComponent[] | null = chain.net.components;
  if (!components || components.length === 0) return null;
  const property = (chain.steps[chain.steps.length - 1].change.property_name ?? "").trim();
  const percent = isPercent(chain.net.startRaw) || isPercent(chain.net.endRaw);
  const seconds = !percent && isSeconds(chain.net.startRaw) && isSeconds(chain.net.endRaw);
  if (components.length === 1) {
    const d = signed(components[0].delta);
    if (percent) {
      return { note: `${property} ${d} percentage points`, chip: `${property} ${d} pts` };
    }
    const unit = seconds ? "s" : "";
    return { note: `${d}${unit} ${property}`, chip: `${property} ${d}${unit}` };
  }
  const per = components.map((c) => signed(c.delta)).join(" / ");
  const suffix = percent ? " percentage points" : "";
  return { note: `${property} per rank ${per}${suffix}`, chip: `${property} per rank ${per}` };
}

export type ContinuityWording = {
  /** One line under the chain's final Riot line. */
  note: string;
  /** Short entry-header chip. */
  chip: string;
  /** "How?" disclosure: identity provenance sentence. */
  identity: string;
  /** "How?" disclosure: verbatim Riot steps. */
  steps: string[];
  /** "How?" disclosure: concurrent mechanical caveat, when flagged. */
  mechanical: string | null;
};

/**
 * Wording for a proven chain. Values are Riot's verbatim strings
 * (`net.startRaw/endRaw`, each step's `before_raw/after_raw`); computed numbers
 * come only from `net.components`. Never "reverted", "undone", "rolled back",
 * buff/nerf, or intent.
 */
export function continuityWording(
  chain: CatchUpParameterChain,
  context: { sincePatch: string; clampedToCoverageFloor: boolean },
): ContinuityWording {
  const first = chain.steps[0];
  const last = chain.steps[chain.steps.length - 1];
  const property = (last.change.property_name ?? "").trim();
  const n = new Set(chain.steps.map((s) => s.patch)).size;
  // A baseline below the coverage floor has unseen patches before the first
  // step, so the net is stated against the value before the first step instead.
  const since = context.clampedToCoverageFloor ? `before ${first.patch}` : context.sincePatch;
  const delta = formatNetDelta(chain);
  const { startRaw, endRaw } = chain.net;

  let note: string;
  let chip: string;
  switch (chain.valueState) {
    case "returns_to_start_value":
      note = `Back to ${startRaw}, its value before ${first.patch}`;
      chip = `${property} back to ${startRaw}`;
      break;
    case "changed":
    case "partially_returns_toward_start":
    case "moves_beyond_start":
    case "multi_step_non_monotonic":
      if (delta) {
        const tail =
          chain.valueState === "partially_returns_toward_start"
            ? ` — part of the way back to ${startRaw}`
            : chain.valueState === "moves_beyond_start"
              ? ` — now past ${startRaw}`
              : chain.valueState === "multi_step_non_monotonic"
                ? " (changed direction along the way)"
                : "";
        note = `Net since ${since}: ${delta.note}${tail}`;
        chip = `${delta.chip} since ${since}`;
        break;
      }
      note = `Changed across ${n} patches: ${startRaw} → ${endRaw}`;
      chip = `${property} changed across ${n} patches`;
      break;
    case "net_unavailable":
    default:
      note = `Changed across ${n} patches: ${startRaw} → ${endRaw}`;
      chip = `${property} changed across ${n} patches`;
      break;
  }

  let identity: string;
  if (chain.identityProvenance === "approved_alias") {
    const renamed = chain.steps.find((s, i) => i > 0 && s.linkFromPrevious?.kind === "approved_alias");
    const prev = renamed ? chain.steps[chain.steps.indexOf(renamed) - 1] : first;
    const to = renamed ?? last;
    identity =
      `Riot renamed ${(prev.change.property_name ?? "").trim()} (${prev.patch}) to ` +
      `${(to.change.property_name ?? "").trim()} (${to.patch}). Mogzy links these two lines from a ` +
      "reviewed rename record; the values are Riot's.";
  } else {
    const group = (first.change.group_title ?? "").trim();
    identity =
      `Same parameter in every step: ${group ? `${group} · ` : ""}${property}. ` +
      "Each patch's “before” matches the previous patch's “after”.";
  }

  const steps = chain.steps.map(
    (s) => `${s.patch}: ${(s.change.before_raw ?? "").trim()} → ${(s.change.after_raw ?? "").trim()}`,
  );
  const mechanicalPatch = chain.concurrentMechanical ? last.patch : null;
  const mechanical = mechanicalPatch
    ? "Riot also changed how this part of the kit works in this range. This note is about the number only."
    : null;

  return { note, chip, identity, steps, mechanical };
}

/* -------------------------------------------------------------------------- */
/* Range line and coverage notices (§6, §11)                                  */
/* -------------------------------------------------------------------------- */

export function rangeText(first: string | null, through: string | null): string | null {
  if (!through) return null;
  if (!first || first === through) return `Showing changes in ${through}`;
  return `Showing changes in ${first} – ${through}`;
}

const joinVersions = (versions: string[]) =>
  versions.length <= 1
    ? (versions[0] ?? "")
    : `${versions.slice(0, -1).join(", ")} and ${versions[versions.length - 1]}`;

export type CoverageNotice = {
  kind: "missing" | "withheld" | "adjacency" | "floor";
  tone: "warning" | "info";
  title: string;
  body: string | null;
  /** Offer the loader's retry() (PH3-C: re-requests only failed resources). */
  retry: boolean;
};

/**
 * Banner model from the loader and the domain — never from the state name
 * alone (PH3-C §10.3). Empty for a complete range with continuity available.
 */
export function coverageNotices(
  loader: Pick<CatchUpLoader, "resources" | "issues">,
  report: CatchUpReport,
): CoverageNotice[] {
  const notices: CoverageNotice[] = [];
  const failed = loader.resources
    .filter((r) => r.status === "failed" || r.status === "malformed" || r.status === "conflicting")
    .map((r) => r.version);
  const notListed = loader.issues.filter((i) => i.kind === "through_not_listed").map((i) => i.version);
  const domainMissing = report.coverage.missingPatches.filter((v) => !failed.includes(v) && !notListed.includes(v));

  if (failed.length > 0 || domainMissing.length > 0) {
    const versions = [...failed, ...domainMissing];
    notices.push({
      kind: "missing",
      tone: "warning",
      title: `${versions.length === 1 ? "Patch" : "Patches"} ${joinVersions(versions)} didn't load.`,
      body:
        `${versions.length === 1 ? "Its" : "Their"} changes are missing below, and Mogzy notes are hidden ` +
        "until every patch in the range loads.",
      retry: failed.length > 0,
    });
  }
  if (notListed.length > 0) {
    notices.push({
      kind: "missing",
      tone: "warning",
      title: `Patch ${joinVersions(notListed)} isn't available yet.`,
      body: "Mogzy notes are hidden until every patch in the range is available.",
      retry: false,
    });
  }
  if (report.continuity.status === "withheld" && failed.length === 0 && domainMissing.length === 0 && notListed.length === 0) {
    notices.push({
      kind: "withheld",
      tone: "warning",
      title: "Mogzy notes are hidden for this range.",
      body: "Mogzy couldn't confirm these patches are consecutive. Every Riot change that loaded is shown.",
      retry: false,
    });
  }
  for (const issue of report.coverage.issues) {
    if (issue.kind !== "unverified_adjacency" || issue.versions.length < 2) continue;
    notices.push({
      kind: "adjacency",
      tone: "info",
      title: `Mogzy notes don't cross ${issue.versions[0]} → ${issue.versions[1]}.`,
      body: "Mogzy can't confirm those patches are back to back.",
      retry: false,
    });
  }
  if (report.range.clampedToCoverageFloor && report.range.coverageFloor) {
    notices.push({
      kind: "floor",
      tone: "info",
      title: `Mogzy's patch reports start at ${report.range.coverageFloor}, so this starts there.`,
      body: null,
      retry: false,
    });
  }
  return notices;
}

/** Words Catch-Up must never use about Mogzy continuity (owner decision 9). */
export const FORBIDDEN_CONTINUITY_WORDS = /\b(revert\w*|undo\w*|undone|rolled back|roll back|walked back)\b/i;
