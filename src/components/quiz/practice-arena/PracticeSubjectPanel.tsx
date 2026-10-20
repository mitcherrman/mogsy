/**
 * PM1 — the Practice arena's LEFT flank: what this run is, and what it earns.
 *
 * The arena's `panel` member (desktop only, by the arena's own rule; below
 * `lg` the header carries the subject and the score). It states four things,
 * all of them already on the page before PM1:
 *
 *   - the subject or set the run is drawn from, with its Quick Study art when
 *     it was started from a Quick Study tile;
 *   - the question on stage's category badges (the legacy header's chips);
 *   - the XP the backend has awarded THIS run, summed from its own responses;
 *   - the account's rank / total XP / streak exactly as the latest answer or
 *     the progress endpoint reported them — never computed here.
 *
 * Nothing in it names an opponent, a rating or a Daily score, because a
 * Practice run has none of them.
 */
import type { ReactNode } from "react";
import { BookOpen, Sparkles } from "lucide-react";
import { GoldHairline } from "@/components/pro-play/arena/ArenaOrnaments";
import type { QuizQuestion } from "@/lib/quiz/api";
import { cn } from "@/lib/utils";
import { questionBadges } from "./practiceCategoryStyle";

export interface PracticeProgressionView {
  rankName: string | null;
  rankIcon: string | null;
  totalXp: number | null;
  streak: number | null;
}

export interface PracticeSubjectPanelProps {
  subject: string | null;
  /** Resolved Quick Study art for a category run, else null. */
  subjectIcon: string | null;
  /** "missed" when the run replays the questions the player just missed. */
  runKind: "fresh" | "missed";
  total: number;
  question: QuizQuestion | null;
  /** XP the backend awarded this run, or null before any award arrived. */
  sessionXp: number | null;
  progression: PracticeProgressionView | null;
  /** The way back to the League hub, from `lg` (the chrome carries it below). */
  exit?: ReactNode;
  className?: string;
}

export function PracticeSubjectPanel({
  subject, subjectIcon, runKind, total, question, sessionXp, progression, exit, className,
}: PracticeSubjectPanelProps) {
  const badges = question ? questionBadges(question) : [];
  const hasProgression = progression
    && (progression.rankName || progression.totalXp !== null || (progression.streak ?? 0) > 0);
  return (
    <aside
      aria-label="This practice run"
      data-testid="practice-subject-panel"
      className={cn("ranked-panel flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 text-left xl:p-5", className)}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="ranked-eyebrow">{runKind === "missed" ? "Practice · Missed questions" : "Practice"}</div>
          {exit}
        </div>
        <GoldHairline className="w-full" />
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg p-[2px]
            shadow-[0_0_18px_-6px_rgba(240,215,140,0.55)]"
          style={{ background: "linear-gradient(145deg, #f0d78c 0%, #c9a84c 45%, #6f5320 100%)" }}
        >
          <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-[6px] bg-[#06101d]">
            {subjectIcon ? (
              <img src={subjectIcon} alt="" draggable={false} className="h-full w-full object-cover"
                onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
            ) : (
              <BookOpen className="h-6 w-6 text-[#e2c877]" />
            )}
          </span>
        </span>
        <div className="min-w-0">
          <p data-testid="practice-subject-name"
            className="ranked-title break-words text-lg font-semibold leading-tight text-[#f0e6d2] xl:text-xl">
            {subject ?? "Practice"}
          </p>
          <p className="mt-0.5 text-[11px] text-white/55">
            {total} {total === 1 ? "question" : "questions"} · no timer
          </p>
        </div>
      </div>

      {badges.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-white/45">This question</p>
          <ul data-testid="practice-question-badges" className="flex flex-wrap gap-1.5">
            {badges.map(({ key, label, icon: Icon, className: tone }) => (
              <li key={key}
                className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", tone)}>
                {Icon && <Icon className="h-3 w-3" />}
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto space-y-3">
        <div data-testid="practice-session-xp"
          className="rounded-md border border-[#c9a84c]/25 bg-white/[0.03] px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/45">XP this run</p>
          <p className="ranked-title mt-1 flex items-center gap-1.5 leading-none text-[#f0dcae]">
            <Sparkles aria-hidden className="h-4 w-4 text-[#e8c97a]" />
            <span className="text-[1.5rem] font-bold tabular-nums">
              {sessionXp === null ? "—" : `+${sessionXp.toLocaleString()}`}
            </span>
          </p>
        </div>
        {hasProgression && (
          <div data-testid="practice-progression" className="flex items-center gap-2.5 text-[11px] text-white/60">
            {progression!.rankIcon && (
              <img src={progression!.rankIcon} alt="" aria-hidden="true"
                className="h-9 w-9 shrink-0 object-contain drop-shadow-[0_0_8px_rgba(201,168,76,0.4)]"
                onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            <p className="min-w-0 leading-snug">
              {progression!.rankName && (
                <span className="block font-semibold text-[#f0e6d2]/90">{progression!.rankName}</span>
              )}
              {progression!.totalXp !== null && <span>{progression!.totalXp.toLocaleString()} XP total</span>}
              {(progression!.streak ?? 0) > 0 && (
                <span>{progression!.totalXp !== null ? " · " : ""}{progression!.streak} streak</span>
              )}
            </p>
          </div>
        )}
        <p className="text-[10px] leading-snug text-white/40">
          Unrated practice. Your Ranked rating is never at stake here.
        </p>
      </div>
    </aside>
  );
}
