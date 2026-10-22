/**
 * MATCH HOST PORTAL — the organizer's create wizard.
 *
 * Five steps on one fixed frame: Event → Game → Rules → Players → Launch.
 * Every choice is a pressed card or chip (no dropdowns); the review step is
 * the whole configuration read back; "Launch" plays the launch transition
 * and lands in the new event's lobby.
 *
 * The person running the event is the ORGANIZER in code and in copy next to
 * Ranked surfaces (handoff §4 naming); "host" means `MatchHost` provenance.
 * Everything a step validates is also what the backend would validate
 * server-side (`RankedFormat.validate`, `apply_ruleset`); the portal never
 * decides a rule the server would refuse.
 *
 * The portal draws from a `PortalSource`: the fixture gateway in the DEV
 * harness, or the real `GET /api/arena/catalog` and the owner's friends in
 * Admin. On a real source the steps show only what the server applies (no
 * public visibility, no content filters it does not honour yet, its own
 * timer bounds and no-show deadline), and Launch waits for the server.
 */
import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion as fm } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Crown, Rocket, Search, Swords, Trophy, Users, X } from "lucide-react";
import { Link } from "react-router-dom";

import { DESKTOP_QUERY, useMediaQuery } from "@/components/pro-play/worlds-experience/ExperienceContext";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";

import { LaunchTransition } from "../ceremony/LaunchTransition";
import type { ArenaBestOf, ArenaEntrant, ArenaEventKind, ArenaRules } from "../contracts";
import { GAME_TYPES, gameTypeById, TOPICS, type ArenaGameType } from "../fixtures/catalog";
import { DEFAULT_RULES } from "../fixtures/scenarios";
import type { ArenaGateway } from "../gateway/types";
import { accentStyle } from "../identity";
import { fixturePortalSource, type PortalSource } from "./portalSource";
import { ease, slideTransition, slideVariants } from "../motion";
import { Btn, EntrantAvatar, Eyebrow, SimulatedBadge } from "../ui/parts";

export interface HostDraft {
  kind: ArenaEventKind;
  title: string;
  visibility: "private" | "link" | "public";
  rules: ArenaRules;
  best_of: ArenaBestOf;
  size: number;
  invitees: string[];
  readyDeadlineMin: number;
  /** The organizer also takes a seat (a real event asks; the fixture assumes). */
  organizerPlays: boolean;
}

const STEPS = ["Event", "Game", "Rules", "Players", "Launch"] as const;
type Step = 0 | 1 | 2 | 3 | 4;

const KINDS: { kind: ArenaEventKind; title: string; blurb: string; icon: ReactNode; size: number; best_of: ArenaBestOf }[] = [
  { kind: "duel", title: "Custom duel", blurb: "One match, one friend, a preset game type. Challenge and play.", icon: <Swords className="h-5 w-5" />, size: 2, best_of: 1 },
  { kind: "match", title: "Custom match", blurb: "A 1v1 series with rules you set: modules, timers, best of three or five.", icon: <Crown className="h-5 w-5" />, size: 2, best_of: 3 },
  { kind: "tournament", title: "Tournament", blurb: "Four to thirty-two players in a single-elimination bracket. Byes for the top seeds.", icon: <Trophy className="h-5 w-5" />, size: 8, best_of: 3 },
];

export function HostPortal({ gateway, source: given, onLaunched, backHref }: {
  /** The DEV harness's fixture gateway (used when `source` is absent). */
  gateway?: ArenaGateway;
  /** Where the catalog, friends and Launch come from. */
  source?: PortalSource;
  /** Called after the launch transition with the created event's id. */
  onLaunched: (eventId: string) => void;
  backHref: string;
}) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const reduced = useReducedMotionPreference();
  const motion = useMotionAllowed();
  const source = useMemo(() => given ?? fixturePortalSource(gateway as ArenaGateway), [given, gateway]);
  const fixture = source.source === "fixture";
  const gameTypes = source.gameTypes.length ? source.gameTypes : GAME_TYPES;
  const [step, setStep] = useState<Step>(0);
  const [dir, setDir] = useState(0);
  const [draft, setDraft] = useState<HostDraft>(() => {
    const first = gameTypes.find((g) => g.availability === "eligible") ?? gameTypes[0];
    const rules = fixture ? { ...DEFAULT_RULES } : { ...DEFAULT_RULES, game_type: first.id, modules: first.defaultModules, question_seconds: null, topics: [] };
    return { kind: "tournament", title: "", visibility: "private", rules, best_of: 3, size: Math.min(8, source.sizes[source.sizes.length - 1] ?? 8), invitees: [], readyDeadlineMin: source.readyDeadlineMinutes ?? 10, organizerPlays: fixture };
  });
  const [launch, setLaunch] = useState<{ id: string; title: string } | null>(null);
  const [launching, setLaunching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const friends = source.friends;
  const go = (to: Step) => { setDir(to > step ? 1 : -1); setStep(to); };
  const patch = (p: Partial<HostDraft>) => setDraft((d) => ({ ...d, ...p }));
  const patchRules = (p: Partial<ArenaRules>) => setDraft((d) => ({ ...d, rules: { ...d.rules, ...p } }));
  const game = gameTypes.find((g) => g.id === draft.rules.game_type) ?? gameTypeById(draft.rules.game_type);
  const [secMin, secMax] = source.secondsRange(game.id);
  const title = draft.title.trim() || defaultTitle(draft, game);
  const valid: Record<Step, boolean> = {
    0: true,
    1: game.availability === "eligible" && (!source.contentApplied || draft.rules.topics.length > 0),
    2: draft.rules.modules >= game.modulesRange[0] && draft.rules.modules <= game.modulesRange[1],
    3: draft.kind === "tournament" ? draft.size >= Math.min(4, source.sizes[0] ?? 4) : true,
    4: !launching,
  };
  const doLaunch = async () => {
    if (launching) return;
    setLaunching(true);
    setNotice(null);
    try {
      const out = await source.create(draft, title);
      if (out.warnings?.length) setNotice(out.warnings.join(" "));
      setLaunch({ id: out.event_id, title: out.title });
    } catch (e) {
      setNotice(source.errorCopy(e));
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className={cn("ta ta-stage flex min-h-[var(--app-viewport-h)] flex-col", motion && "ta--motion")} data-testid="ta-portal" data-step={step}>
      <header className="flex items-center gap-3 px-4 pt-3 pb-2">
        <Link to={backHref} className="ta-btn ta-btn--sm !px-2" aria-label="Back to the Arena"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><Eyebrow>Match Host Portal</Eyebrow>{fixture ? <SimulatedBadge label="Fixture gateway" /> : <span className="ta-pill ta-pill--muted">Admin · real event</span>}</div>
          <h1 className="ta-title ta-title--gold truncate text-[20px] font-bold leading-tight sm:text-[26px]">Create an event</h1>
        </div>
      </header>

      <div className={cn("flex min-h-0 flex-1 gap-5 px-4 pb-4", desktop ? "flex-row" : "flex-col")}>
        {/* stepper */}
        <nav aria-label="Steps" className={cn(desktop ? "flex w-48 shrink-0 flex-col gap-4 pt-2" : "flex shrink-0 items-center justify-between gap-1")}>
          {STEPS.map((s, i) => {
            const state = i === step ? "current" : i < step ? "done" : "todo";
            return (
              <button key={s} type="button" className="ta-step text-left outline-none focus-visible:[&>span:first-child]:ring-2 focus-visible:[&>span:first-child]:ring-[#c9a84c]" data-state={state} data-testid="ta-step" onClick={() => i < step && go(i as Step)} disabled={i > step}>
                <span className="ta-step__n">{state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
                <span className={cn("text-[12.5px] font-semibold", !desktop && i !== step && "sr-only")}>{s}</span>
              </button>
            );
          })}
          {desktop && (
            <div className="ta-plate mt-auto p-3 text-[11.5px] leading-snug text-[rgba(215,205,180,0.65)]">
              <Eyebrow tone="muted" className="mb-1">So far</Eyebrow>
              <p className="font-semibold text-white">{title}</p>
              <p>{KINDS.find((k) => k.kind === draft.kind)?.title} · {game.title}</p>
              <p>Bo{draft.best_of} · {draft.rules.modules} {game.unit} · {draft.rules.ruleset.replace("_", " ")}</p>
              {draft.kind === "tournament" && <p>{draft.size} players · {draft.invitees.length} invited</p>}
            </div>
          )}
        </nav>

        {/* step body */}
        <div className="relative min-h-0 flex-1 overflow-clip">
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <fm.div key={step} custom={dir} variants={slideVariants(40, reduced)} initial="enter" animate="center" exit="exit" transition={slideTransition(reduced)} className="ta-scroll absolute inset-0 overflow-y-auto pr-1">
              {step === 0 && (
                <StepFrame title="What are you running?" blurb="Every Arena match is one player against one player on the Ranked engine. Pick the shape of the event.">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {KINDS.map((k) => (
                      <button key={k.kind} type="button" aria-pressed={draft.kind === k.kind} className="ta-option flex flex-col gap-2 p-4" onClick={() => patch({ kind: k.kind, size: k.size, best_of: k.best_of })} style={{ "--ta-accent": "#e3c66f", "--ta-accent-rgb": "227 198 111" } as React.CSSProperties} data-testid="ta-kind">
                        <span className="ta-option__check"><Check className="h-3 w-3" /></span>
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(201,168,76,0.14)] text-[#f1dc9c]">{k.icon}</span>
                        <span className="ta-title text-[16px] font-bold text-white">{k.title}</span>
                        <span className="text-[12px] leading-snug text-[rgba(215,205,180,0.7)]">{k.kind === "tournament" && !fixture ? `Up to ${source.sizes[source.sizes.length - 1] ?? 16} players in a single-elimination bracket. Byes for the top seeds.` : k.blurb}</span>
                      </button>
                    ))}
                  </div>
                  <Field label="Event name" hint={`Leave blank for "${defaultTitle(draft, game)}"`}>
                    <input className="ta-input" value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder={defaultTitle(draft, game)} maxLength={48} data-testid="ta-title" />
                  </Field>
                  <Field label="Who can find it">
                    <div className="flex flex-wrap gap-2">
                      {(source.allowPublic ? (["private", "link", "public"] as const) : (["private", "link"] as const)).map((v) => (
                        <button key={v} type="button" aria-pressed={draft.visibility === v} className="ta-chip" onClick={() => patch({ visibility: v })} data-testid="ta-visibility">{v === "private" ? "Invite only" : v === "link" ? (fixture ? "Anyone with the code" : "Anyone with the link can watch") : "Public"}</button>
                      ))}
                    </div>
                  </Field>
                </StepFrame>
              )}
              {step === 1 && (
                <StepFrame title="Game and content" blurb="One game type for the whole event, so every match is the same test. Then the knowledge it draws on.">
                  <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {gameTypes.map((g) => (
                      <GameCard key={g.id} game={g} pressed={draft.rules.game_type === g.id} onPick={() => patchRules({ game_type: g.id, modules: g.defaultModules, question_seconds: fixture ? g.defaultSeconds : null, ruleset: "standard" })} />
                    ))}
                  </div>
                  {!source.contentApplied && (
                    <p className="text-[12px] leading-snug text-[rgba(215,205,180,0.6)]" data-testid="ta-content-note">Content draws on the game type's standard pool. Topic and difficulty filters are not applied by the server yet, so they are not offered.</p>
                  )}
                  {source.contentApplied && <>
                  <Field label="Question content" hint="At least one topic. Mixed topics keep a bracket fair across matches.">
                    <div className="flex flex-wrap gap-2">
                      {TOPICS.map((t) => {
                        const on = draft.rules.topics.includes(t.id);
                        return <button key={t.id} type="button" aria-pressed={on} className="ta-chip" onClick={() => patchRules({ topics: on ? draft.rules.topics.filter((x) => x !== t.id) : [...draft.rules.topics, t.id] })} data-testid="ta-topic">{t.label}</button>;
                      })}
                    </div>
                  </Field>
                  <Field label="Difficulty">
                    <div className="flex flex-wrap gap-2">
                      {(["mixed", "easy", "hard"] as const).map((d) => <button key={d} type="button" aria-pressed={draft.rules.difficulty === d} className="ta-chip capitalize" onClick={() => patchRules({ difficulty: d })}>{d === "mixed" ? "Mixed · ladder weighting" : d}</button>)}
                    </div>
                  </Field>
                  </>}
                </StepFrame>
              )}
              {step === 2 && (
                <StepFrame title="Rules, scoring and timers" blurb={`How long a ${game.title} match is and how it scores. The server validates the same format before any match is created.`}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={`Length · ${draft.rules.modules} ${game.unit}`} hint={`${game.modulesRange[0]}–${game.modulesRange[1]} ${game.unit}`}>
                      <input type="range" className="ta-range" min={game.modulesRange[0]} max={game.modulesRange[1]} value={draft.rules.modules} onChange={(e) => patchRules({ modules: Number(e.target.value) })} aria-label="Modules" data-testid="ta-modules" />
                    </Field>
                    <Field label={draft.rules.question_seconds == null && !fixture ? "Timer · format default" : `Timer · ${draft.rules.question_seconds ?? game.defaultSeconds}s each`} hint="Server-authoritative; the client timer is display only.">
                      <input type="range" className="ta-range" min={secMin} max={secMax} step={5} value={Math.min(secMax, Math.max(secMin, draft.rules.question_seconds ?? game.defaultSeconds))} onChange={(e) => patchRules({ question_seconds: Number(e.target.value) })} aria-label="Seconds per question" />
                      {!fixture && (
                        <button type="button" aria-pressed={draft.rules.question_seconds == null} className="ta-chip self-start" onClick={() => patchRules({ question_seconds: draft.rules.question_seconds == null ? Math.min(secMax, Math.max(secMin, game.defaultSeconds)) : null })} data-testid="ta-timer-default">Format default</button>
                      )}
                    </Field>
                  </div>
                  <Field label="Series" hint={draft.kind === "tournament" ? "Rounds before the final play one game shorter when the final is Bo5." : undefined}>
                    <div className="flex flex-wrap gap-2">
                      {([1, 3, 5] as const).map((b) => <button key={b} type="button" aria-pressed={draft.best_of === b} className="ta-chip" onClick={() => patch({ best_of: b })} data-testid="ta-bestof">Best of {b}</button>)}
                    </div>
                  </Field>
                  <Field label="Ruleset" hint="Time Trial and Survival apply to single-question formats only.">
                    <div className="grid gap-2 sm:grid-cols-3">
                      {([["standard", "Standard", "Points per module; correct answers score, speed adds one."], ["time_trial", "Time Trial", "One shared time bank. Wrong answers burn it."], ["survival", "Survival", "Three strikes and the match is over."]] as const).map(([id, name, blurb]) => {
                        const allowed = game.rulesets.includes(id);
                        return (
                          <button key={id} type="button" aria-pressed={draft.rules.ruleset === id} disabled={!allowed} className="ta-option flex flex-col gap-1 p-3 disabled:opacity-40" onClick={() => patchRules({ ruleset: id })} data-testid="ta-ruleset">
                            <span className="ta-option__check"><Check className="h-3 w-3" /></span>
                            <span className="text-[13.5px] font-bold text-white">{name}</span>
                            <span className="text-[11.5px] leading-snug text-[rgba(215,205,180,0.65)]">{allowed ? blurb : `Not available for ${game.title}`}</span>
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Scoring">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" aria-pressed className="ta-chip" disabled>Points</button>
                        <button type="button" aria-pressed={draft.rules.speed_bonus} className="ta-chip" onClick={() => patchRules({ speed_bonus: !draft.rules.speed_bonus })}>Speed bonus {draft.rules.speed_bonus ? "on" : "off"}</button>
                      </div>
                    </Field>
                    <Field label={`No-show deadline · ${draft.readyDeadlineMin} min`} hint={source.readyDeadlineMinutes != null ? "Set by the server for every event. If only one player is ready at the deadline, they advance; if neither is, you resolve the match." : "A player who never presses Play forfeits the node."}>
                      {source.readyDeadlineMinutes == null && (
                        <input type="range" className="ta-range" min={2} max={30} step={1} value={draft.readyDeadlineMin} onChange={(e) => patch({ readyDeadlineMin: Number(e.target.value) })} aria-label="Ready deadline in minutes" />
                      )}
                    </Field>
                  </div>
                </StepFrame>
              )}
              {step === 3 && (
                <StepFrame title="Players and challenges" blurb={draft.kind === "tournament" ? "Pick the field size, then challenge friends. Open seats fill by join code." : "Challenge the friend you want to play. They accept from their inbox."}>
                  {draft.kind === "tournament" && (
                    <Field label="Field size" hint="Byes go to the top seeds when the field is not a power of two.">
                      <div className="flex flex-wrap gap-2">
                        {source.sizes.map((n) => <button key={n} type="button" aria-pressed={draft.size === n} className="ta-chip" onClick={() => patch({ size: n })} data-testid="ta-size">{n} players</button>)}
                      </div>
                    </Field>
                  )}
                  {source.organizerSeatChoice && (
                    <Field label="Your seat" hint={draft.kind === "tournament" ? "Run the bracket without playing, or take seat one yourself." : "A duel or match is you against one other player, or two players you admit."}>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" aria-pressed={draft.organizerPlays} className="ta-chip" onClick={() => patch({ organizerPlays: true })} data-testid="ta-organizer-plays">I play in it</button>
                        <button type="button" aria-pressed={!draft.organizerPlays} className="ta-chip" onClick={() => patch({ organizerPlays: false })} data-testid="ta-organizer-runs">I only run it</button>
                      </div>
                    </Field>
                  )}
                  <InvitePicker friends={friends} picked={draft.invitees} max={draft.size - (draft.organizerPlays ? 1 : 0)} onChange={(invitees) => patch({ invitees })} ttlLabel={source.inviteTtlLabel} />
                </StepFrame>
              )}
              {step === 4 && (
                <StepFrame title="Review and launch" blurb="Everything below is frozen into the event when you launch. The server owns the bracket from there.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Review label="Event" rows={[["Name", title], ["Kind", KINDS.find((k) => k.kind === draft.kind)!.title], ["Visibility", draft.visibility], ["Rated", "No · for fun"]]} />
                    <Review label="Game" rows={source.contentApplied ? [["Type", game.title], ["Topics", draft.rules.topics.map((t) => TOPICS.find((x) => x.id === t)?.label).join(", ")], ["Difficulty", draft.rules.difficulty]] : [["Type", game.title], ["Content", "Standard pool"]]} />
                    <Review label="Rules" rows={[["Series", `Best of ${draft.best_of}`], ["Length", `${draft.rules.modules} ${game.unit}`], ["Timer", draft.rules.question_seconds == null && !fixture ? "Format default" : `${draft.rules.question_seconds ?? game.defaultSeconds}s`], ["Ruleset", draft.rules.ruleset.replace("_", " ")], ["Speed bonus", draft.rules.speed_bonus ? "On" : "Off"], ["No-show", `${draft.readyDeadlineMin} min`]]} />
                    <Review label="Players" rows={[["Field", `${draft.kind === "tournament" ? draft.size : 2} players`], ["Organizer", draft.organizerPlays ? "Plays seat one" : "Runs it only"], ["Challenged", draft.invitees.length ? friends.filter((f) => draft.invitees.includes(f.profile_id)).map((f) => f.display_name).join(", ") : "None yet"], ["Open seats", `${Math.max(0, (draft.kind === "tournament" ? draft.size : 2) - (draft.organizerPlays ? 1 : 0) - draft.invitees.length)} by join ${fixture ? "code" : "link"}`]]} />
                  </div>
                  <div className="flex flex-col items-center gap-2 pt-2">
                    <Btn tone="primary" size="lg" onClick={doLaunch} disabled={launching} data-testid="ta-launch-btn"><Rocket className="h-5 w-5" aria-hidden="true" />{launching ? "Creating…" : `Launch ${KINDS.find((k) => k.kind === draft.kind)!.title.toLowerCase()}`}</Btn>
                    {notice && <p role="alert" className="max-w-md text-center text-[12px] text-[#f6c3cc]" data-testid="ta-portal-notice">{notice}</p>}
                    <p className="text-center text-[11px] text-[rgba(215,205,180,0.5)]">No real-money prizes or entry fees exist in the Arena. {fixture ? "Fixture gateway: the event lives in this tab only." : "The server creates the event; nothing is real until it answers."}</p>
                  </div>
                </StepFrame>
              )}
            </fm.div>
          </AnimatePresence>
        </div>
      </div>

      {/* footer nav */}
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3">
        <Btn onClick={() => go(Math.max(0, step - 1) as Step)} disabled={step === 0}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back</Btn>
        <p className="text-[11px] uppercase tracking-[0.16em] text-[rgba(215,205,180,0.5)]">Step {step + 1} of {STEPS.length}</p>
        {step < 4 ? (
          <Btn tone="primary" onClick={() => go((step + 1) as Step)} disabled={!valid[step]} data-testid="ta-next">Continue<ArrowRight className="h-4 w-4" aria-hidden="true" /></Btn>
        ) : <span className="w-24" />}
      </footer>

      {launch && <LaunchTransition title={launch.title} onDone={() => onLaunched(launch.id)} sfxId={`arena:${launch.id}:launch`} />}
    </div>
  );
}

function defaultTitle(d: HostDraft, g: ArenaGameType) {
  return d.kind === "duel" ? `${g.title} Duel` : d.kind === "match" ? `${g.title} Bo${d.best_of}` : `${g.title} Cup`;
}

function StepFrame({ title, blurb, children }: { title: string; blurb: string; children: ReactNode }) {
  const reduced = useReducedMotionPreference();
  return (
    <section className="flex flex-col gap-5">
      <fm.div initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={ease(0.3)}>
        <h2 className="ta-title text-[20px] font-bold text-white sm:text-[24px]">{title}</h2>
        <p className="mt-1 max-w-2xl text-[13px] leading-snug text-[rgba(215,205,180,0.7)]">{blurb}</p>
      </fm.div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[rgba(243,233,207,0.7)]">{label}</p>
        {hint && <p className="text-[11px] text-[rgba(215,205,180,0.5)]">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function GameCard({ game, pressed, onPick }: { game: ArenaGameType; pressed: boolean; onPick: () => void }) {
  const rgb = hexToRgb(game.accent);
  const later = game.availability === "later";
  return (
    <button type="button" aria-pressed={pressed} disabled={later} className="ta-option flex items-start gap-3 p-3 disabled:opacity-45" onClick={onPick} style={{ "--ta-accent": game.accent, "--ta-accent-rgb": rgb } as React.CSSProperties} data-testid="ta-game" data-game={game.id}>
      <span className="ta-option__check"><Check className="h-3 w-3" /></span>
      <span aria-hidden="true" className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `rgb(${rgb} / 0.16)`, color: game.accent, boxShadow: `inset 0 0 0 1px rgb(${rgb} / 0.45)` }}>
        <span className="ta-title text-[13px] font-black">{game.title.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[13.5px] font-bold text-white">{game.title}{later && <span className="ta-pill ta-pill--muted">Later</span>}</span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-[rgba(215,205,180,0.65)]">{later ? game.note : game.blurb}</span>
      </span>
    </button>
  );
}

function InvitePicker({ friends, picked, max, onChange, ttlLabel }: { friends: readonly ArenaEntrant[]; picked: string[]; max: number; onChange: (ids: string[]) => void; ttlLabel: string }) {
  const [q, setQ] = useState("");
  const shown = friends.filter((f) => f.display_name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string) => {
    if (picked.includes(id)) onChange(picked.filter((x) => x !== id));
    else if (picked.length < max) onChange([...picked, id]);
  };
  return (
    <Field label={`Challenge friends · ${picked.length}/${max}`} hint={`Friends only; blocks fail closed; ${ttlLabel} challenge TTL.`}>
      <div className="flex flex-wrap gap-1.5" aria-live="polite">
        {picked.map((id) => {
          const f = friends.find((x) => x.profile_id === id);
          if (!f) return null;
          return (
            <span key={id} className="ta-chip !pl-1" style={accentStyle(id)}>
              <EntrantAvatar entrant={f} size="xs" crown={false} />{f.display_name}
              <button type="button" aria-label={`Remove ${f.display_name}`} className="ml-0.5 rounded-full p-0.5 hover:bg-white/10" onClick={() => toggle(id)}><X className="h-3 w-3" /></button>
            </span>
          );
        })}
        {!picked.length && <span className="text-[12px] text-[rgba(215,205,180,0.5)]">No one challenged yet.</span>}
      </div>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgba(215,205,180,0.5)]" aria-hidden="true" />
        <input className="ta-input !pl-9" placeholder="Search friends" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search friends" data-testid="ta-friend-search" />
      </label>
      <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Friends">
        {shown.map((f) => {
          const on = picked.includes(f.profile_id);
          return (
            <li key={f.profile_id}>
              <button type="button" aria-pressed={on} className="ta-option flex w-full items-center gap-2.5 px-2.5 py-2" style={accentStyle(f.profile_id)} onClick={() => toggle(f.profile_id)} disabled={!on && picked.length >= max} data-testid="ta-friend">
                <EntrantAvatar entrant={f} size="sm" />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[12.5px] font-semibold text-white">{f.display_name}</span>
                  <span className="block text-[10px] uppercase tracking-[0.14em] text-[rgba(215,205,180,0.55)]">{f.tier ?? "Unranked"}{f.role_emblem ? ` · ${f.role_emblem}` : ""}</span>
                </span>
                <span className={cn("ta-pill", on ? "ta-pill--gold" : "ta-pill--muted")}>{on ? "Challenged" : <><Users className="h-3 w-3" aria-hidden="true" />Add</>}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Field>
  );
}

function Review({ label, rows }: { label: string; rows: [string, string][] }) {
  return (
    <div className="ta-plate p-3.5">
      <Eyebrow className="mb-2">{label}</Eyebrow>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[rgba(215,205,180,0.55)]">{k}</dt>
            <dd className="truncate font-semibold capitalize text-white" title={v}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
