/**
 * Screen 02 — the Stage Explorer (UX1).
 *
 * A stage switcher (Play-In · Swiss · Knockouts, each carrying its dates,
 * venue and the progress the phase certifies) over a two-part workspace: the
 * stage's own presentation on the left, and the adaptive context column on
 * the right (`Detail.tsx`): the selected match, the stage brief when the
 * reader keeps it open, otherwise a slim rail. Switching stage slides in the
 * direction of the stage order.
 *
 * NO SCROLLING (UX4). Each stage's presentation fits the stage area: the whole
 * bracket or map where it is readable at that size, else focused regions,
 * rounds or views with explicit controls (`fit.tsx`). Nothing is drawn wider
 * or taller than its box.
 *
 * On a phone the switcher is a segmented control, the stage's brief is one
 * line with the full brief a tap away, each stage has its own one-round-at-a-
 * time presentation, and the match detail is a bottom sheet.
 */
import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Check, Info } from "lucide-react";

import { useKit } from "@/components/pro-play/tournament/TournamentParts";
import { dateRange } from "@/lib/pro-play/tournamentView";
import { stageOf, stageProgress } from "@/lib/pro-play/tournamentV2View";
import { stageStakes } from "@/lib/pro-play/worldsExperience/experienceView";
import { stageLabel } from "@/lib/pro-play/worldsExperience/navigation";
import { cn } from "@/lib/utils";

import { BottomSheet, ContextColumn, MatchSheet } from "./Detail";
import { useExperience } from "./ExperienceContext";
import { KnockoutWorkspace } from "./KnockoutWorkspace";
import { StageBrief } from "./MatchDetail";
import { DURATION, OFFSET, slideTransition, slideVariants } from "./motion";
import { SURFACE, rovingKeys } from "./parts";
import { PlayInWorkspace } from "./PlayInWorkspace";
import { SwissWorkspace } from "./SwissWorkspace";

const pad2 = (n: number) => String(n).padStart(2, "0");

const CHIP: Record<"current" | "complete" | "next", { label: string; cls: string }> = {
  current: { label: "Now", cls: "bg-emerald-500 text-emerald-950" },
  complete: { label: "Done", cls: "bg-white/10 text-foreground/80" },
  next: { label: "Next", cls: "border border-cyan-400/70 text-cyan-300" },
};

/* ── switcher ───────────────────────────────────────────────────────────── */

function StageSwitcher() {
  const kit = useKit();
  const x = useExperience();
  const { ctx, state } = kit;
  return (
    <nav aria-label="Tournament stages" className={cn(x.desktop ? "px-6 pt-4" : "px-3 pt-3")}>
      <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${ctx.stages.length}, minmax(0, 1fr))` }} onKeyDown={rovingKeys} data-testid="stage-switcher">
        {ctx.stages.map((s, i) => {
          const active = x.stageKey === s.key;
          const progress = stageProgress(s, state, ctx);
          const chip = progress ? CHIP[progress] : null;
          const stakes = x.desktop ? stageStakes(s, state, ctx) : null;
          return (
            <li key={s.key} className="relative">
              <Link
                to={x.hrefFor({ screen: "stages", stageKey: s.key })}
                data-roving
                data-testid="stage-tab"
                data-stage={s.key}
                data-progress={progress ?? "none"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex h-full flex-col justify-center rounded-xl border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#c9a84c]/80",
                  x.desktop ? "min-h-[58px] px-4 py-2.5" : "min-h-12 items-center px-2 py-1.5 text-center",
                  active ? "border-transparent" : "border-white/[0.07] hover:border-white/15 hover:bg-white/[0.02]",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="ux1-stage-ink"
                    aria-hidden="true"
                    transition={{ duration: x.reduced ? 0 : DURATION.stage, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 rounded-xl border border-[#c9a84c]/70 bg-[linear-gradient(180deg,hsl(42_60%_45%/0.14),hsl(42_60%_45%/0.03))] shadow-[0_10px_30px_-18px_rgba(201,168,76,0.8)]"
                  />
                )}
                <span className={cn("relative flex items-center gap-2", !x.desktop && "justify-center")}>
                  {x.desktop && <span className={cn("text-[10px] tabular-nums", active ? "text-[#c9a84c]" : "text-[#c9a84c]/50")}>{pad2(i + 1)}</span>}
                  <span className={cn("font-semibold", x.desktop ? "text-[15px]" : "text-sm", active ? "text-[#f6e7b3]" : "text-foreground/85")}>{stageLabel(s)}</span>
                  {chip &&
                    (x.desktop ? (
                      <span className={cn("rounded px-1.5 py-[3px] text-[9px] font-bold uppercase leading-none tracking-[0.12em]", chip.cls)} data-testid="stage-progress">
                        {chip.label}
                      </span>
                    ) : progress === "complete" ? (
                      <Check className="h-3 w-3 text-muted-foreground" aria-label="complete" />
                    ) : (
                      <span className={cn("h-1.5 w-1.5 rounded-full", progress === "current" ? "bg-emerald-400" : "bg-cyan-300")} aria-label={chip.label} />
                    ))}
                </span>
                {x.desktop ? (
                  <span className="relative mt-1 flex items-center gap-2 truncate text-[11.5px] text-muted-foreground">
                    <span className="tabular-nums">{dateRange(s.starts, s.ends).replace(/\s\d{4}$/, "")}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{s.venue}</span>
                    {stakes?.teams ? (
                      <span className="ml-auto shrink-0 tabular-nums text-foreground/60">{stakes.teams} teams</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="relative mt-0.5 text-[10.5px] tabular-nums text-muted-foreground">{dateRange(s.starts, s.ends).replace(/\s\d{4}$/, "")}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ── stage body ─────────────────────────────────────────────────────────── */

function StageBody({ stageKey }: { stageKey: string }) {
  if (stageKey === "play_in") return <PlayInWorkspace />;
  if (stageKey === "swiss") return <SwissWorkspace />;
  if (stageKey === "knockout") return <KnockoutWorkspace />;
  return <p className="p-6 text-sm text-muted-foreground">This stage has no dedicated view yet.</p>;
}

function StageArea({ children, keyed }: { children: ReactNode; keyed: string }) {
  const x = useExperience();
  const dir = x.move.level === "stage" ? x.move.dir : 0;
  return (
    <AnimatePresence initial={false} mode="popLayout" custom={dir}>
      <motion.div
        key={keyed}
        custom={dir}
        variants={slideVariants(OFFSET.stage, x.reduced)}
        initial="enter"
        animate="center"
        exit="exit"
        transition={slideTransition(DURATION.stage, x.reduced)}
        className="h-full"
        data-testid="stage-view"
        data-stage={keyed}
        data-direction={dir}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/* ── screen ─────────────────────────────────────────────────────────────── */

/** The stage in one line; the whole brief (format, field, seeding) one tap away. */
function PhoneBrief({ stageKey }: { stageKey: string }) {
  const kit = useKit();
  const [open, setOpen] = useState(false);
  const stage = stageOf(kit.ctx, stageKey);
  if (!stage) return null;
  const s = stageStakes(stage, kit.state, kit.ctx);
  const parts = [s.teams ? `${s.teams} teams` : null, s.formats || null, s.advance !== null ? (s.nextStage ? `${s.advance} advance` : "1 champion") : null].filter(Boolean);
  return (
    <div className="flex min-h-10 shrink-0 items-center gap-2 px-0.5" data-testid="phone-brief">
      <p className="min-w-0 flex-1 text-sm font-semibold leading-tight text-foreground">{parts.join(" · ")}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="phone-brief-open"
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-xs font-semibold text-foreground/85 outline-none hover:border-white/25 focus-visible:ring-2 focus-visible:ring-[#c9a84c]"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" /> Format
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={`${stageLabel(stage)} brief`} testId="brief-sheet">
        <StageBrief stage={stage} />
      </BottomSheet>
    </div>
  );
}

export function StagesScreen() {
  const x = useExperience();
  const kit = useKit();
  const key = x.stageKey;
  const stage = key ? stageOf(kit.ctx, key) : null;
  const body = useMemo(() => (key ? <StageBody stageKey={key} /> : null), [key]);
  if (!key) return <p className="p-6 text-sm text-muted-foreground">This event has no stages.</p>;
  if (!x.desktop) {
    return (
      <div className="flex h-full flex-col" data-testid="stages">
        <StageSwitcher />
        <div className="relative min-h-0 flex-1 overflow-clip px-3 pb-3 pt-2" data-testid="stage-area">
          <StageArea keyed={key}>
            <div className="flex h-full flex-col gap-2">
              <PhoneBrief stageKey={key} />
              <div className="flex min-h-0 flex-1 flex-col">{body}</div>
            </div>
          </StageArea>
        </div>
        <MatchSheet />
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col" data-testid="stages">
      <StageSwitcher />
      <div className="mx-auto grid min-h-0 w-full max-w-[1760px] flex-1 grid-cols-[minmax(0,1fr)_auto] gap-4 px-6 pb-5 pt-3">
        <section className={cn(SURFACE, "relative min-h-0 overflow-clip")} aria-label={`${key} workspace`} data-testid="stage-area">
          <StageArea keyed={key}>{body}</StageArea>
        </section>
        {stage && <ContextColumn brief={<StageBrief stage={stage} />} briefLabel={`${stageLabel(stage)} brief`} briefKey={stage.key} />}
      </div>
    </div>
  );
}
