/**
 * PPQ2-C — the QUESTION DOSSIER, the arena's left `panel` flank.
 *
 * It explains what is being compared, in the server's own words: the
 * relationship, the anchor, each scope chip WITH its full name ("LPL —
 * Tencent LoL Pro League"), and the metric with its definition. The plate in
 * the stage carries the short chips; this panel is where they are spelled
 * out, so no tooltip is needed to understand the question on desktop.
 *
 * Desktop only by contract: the arena hides `panel` flanks below `lg`, where
 * the anchor plate's chips (each a keyboard/touch disclosure) carry the same
 * facts.
 *
 * Pre-answer content only. Nothing here depends on which option is correct.
 */
import { RoleEmblem } from "@/components/ranked-arena/RoleEmblem";
import type { ProPlayQuestionContext, ProPlaySubject } from "@/lib/pro-play/contract";
import { cn } from "@/lib/utils";
import { GoldHairline } from "./ArenaOrnaments";
import {
  EMPTY_VALUE,
  isRecent,
  leagueChips,
  rankedRoleFor,
  roleLabel,
  scopeTags,
  seasonsLabel,
  teamChips,
} from "./proPlayArenaModel";

export interface ProPlayQuestionDossierProps {
  context: ProPlayQuestionContext | null;
  /** The question's topic ("Champion" | "Player" | "Team"), shown when no context exists. */
  topic?: string | null;
  className?: string;
}

const TAG_TYPE_LABEL: Record<string, string> = {
  league: "League",
  tournament: "Tournament",
  pro_play: "Competition",
  year: "Season",
  patch: "Patch",
  all_time: "Window",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-1.5">
      <h4 className="text-[9px] font-bold uppercase leading-none tracking-[0.24em] text-white/45">{title}</h4>
      {children}
    </section>
  );
}

/**
 * The anchor's identity, spelled out: a player's teams IN THIS SCOPE with
 * their own spans, a team's leagues by full name. The plate shows the short
 * codes; this is where they are explained. Same contract fields, no more.
 */
function AnchorLedger({ anchor }: { anchor: ProPlaySubject }) {
  if (anchor.kind === "player") {
    const { shown, hidden } = teamChips(anchor);
    const role = rankedRoleFor(anchor);
    return (
      <div data-testid="dossier-anchor-ledger" className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/80">
          {role ? <RoleEmblem role={role} size="sm" decorative /> : null}
          <span className="text-[#e8c97a]">{roleLabel(anchor)}</span>
          <span aria-hidden className="text-white/30">·</span>
          <span>{seasonsLabel(anchor)}</span>
        </p>
        <ul className="space-y-1">
          {shown.map((t) => (
            <li key={t.id ?? t.label} className="flex min-w-0 items-baseline gap-2 text-[11px]">
              <span className="w-9 shrink-0 font-bold text-[#f0dcae]">{t.short ?? EMPTY_VALUE}</span>
              <span className="min-w-0 flex-1 truncate text-white/75" title={t.label}>{t.label}</span>
              <span className="shrink-0 tabular-nums text-white/50">{t.seasons?.label ?? EMPTY_VALUE}</span>
            </li>
          ))}
          {hidden > 0 ? <li className="text-[11px] text-white/50">+{hidden} more in this scope</li> : null}
        </ul>
      </div>
    );
  }
  if (anchor.kind === "team") {
    const { shown, hidden } = leagueChips(anchor);
    return (
      <div data-testid="dossier-anchor-ledger" className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/80">
          <span className="text-[#e8c97a]">{anchor.short ?? EMPTY_VALUE}</span>
          <span aria-hidden className="mx-1.5 text-white/30">·</span>
          <span>{anchor.region?.trim() || EMPTY_VALUE}</span>
          <span aria-hidden className="mx-1.5 text-white/30">·</span>
          <span>{seasonsLabel(anchor)}</span>
        </p>
        <ul className="space-y-1">
          {shown.map((l) => (
            <li key={l.id} className="flex min-w-0 items-baseline gap-2 text-[11px]">
              <span className="w-9 shrink-0 font-bold text-[#f0dcae]">{l.label}</span>
              <span className="min-w-0 flex-1 truncate text-white/75" title={l.tooltip ?? l.label}>{l.tooltip ?? l.label}</span>
            </li>
          ))}
          {hidden > 0 ? <li className="text-[11px] text-white/50">+{hidden} more in this scope</li> : null}
        </ul>
      </div>
    );
  }
  return null;
}

export default function ProPlayQuestionDossier({ context, topic, className }: ProPlayQuestionDossierProps) {
  const tags = scopeTags(context);
  const recent = context ? isRecent(context) : false;
  const recentTag = context?.editorial_tags?.find((t) => t.id === "recent_esports");
  return (
    <aside
      aria-label="Question dossier"
      data-testid="pro-play-question-dossier"
      className={cn("ranked-panel flex h-full min-h-0 flex-col gap-3.5 overflow-hidden p-4 text-left xl:p-5", className)}
    >
      <div className="space-y-2">
        <div className="ranked-eyebrow">Question dossier</div>
        <GoldHairline className="w-full" />
      </div>

      {context ? (
        <>
          <Section title="Comparison">
            <p data-testid="dossier-relationship"
              className="ranked-title text-[15px] font-bold uppercase leading-tight text-[#f0e6d2] xl:text-base">
              {context.relationship.label}
            </p>
            {context.anchor ? (
              <p className="line-clamp-2 text-xs text-white/70" title={context.anchor.label}>
                <span className="text-white/45">Anchor · </span>
                <span data-testid="dossier-anchor" className="font-semibold text-white/90">{context.anchor.label}</span>
              </p>
            ) : null}
            {context.anchor ? <AnchorLedger anchor={context.anchor} /> : null}
          </Section>

          <Section title="Scope">
            <dl className="space-y-1.5">
              {tags.map((tag) => (
                <div key={`${tag.type}:${tag.id ?? tag.label}`} data-testid="dossier-scope" data-tag-type={tag.type}
                  className="min-w-0 rounded-md border border-[#c9a84c]/20 bg-white/[0.03] px-2.5 py-1.5">
                  <dt className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className="line-clamp-2 min-w-0 text-[11px] font-bold uppercase tracking-[0.1em] text-[#f0dcae]" title={tag.label}>
                      {tag.label}
                    </span>
                    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/40">
                      {TAG_TYPE_LABEL[tag.type] ?? tag.type.replace(/_/g, " ")}
                    </span>
                  </dt>
                  {tag.tooltip && tag.tooltip !== tag.label ? (
                    <dd className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/65">{tag.tooltip}</dd>
                  ) : null}
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Measured by">
            <div data-testid="dossier-metric"
              className="rounded-md border border-sky-300/25 bg-sky-300/[0.06] px-2.5 py-1.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-sky-100">{context.metric.label}</p>
              {context.metric.tooltip ? (
                <p className="mt-0.5 text-[11px] leading-snug text-white/65">{context.metric.tooltip}</p>
              ) : null}
            </div>
          </Section>

          {recent ? (
            <p data-testid="dossier-recent"
              className="rounded-md border border-emerald-300/25 bg-emerald-300/[0.06] px-2.5 py-1.5 text-[11px] leading-snug text-emerald-50/85">
              <span className="mr-1 font-bold uppercase tracking-[0.1em] text-emerald-200">Recent</span>
              {recentTag?.tooltip ?? recentTag?.label ?? null}
            </p>
          ) : null}
        </>
      ) : (
        <Section title="Topic">
          <p className="ranked-title text-base font-bold uppercase text-[#f0e6d2]">{topic?.trim() || "Pro Play"}</p>
        </Section>
      )}
    </aside>
  );
}
