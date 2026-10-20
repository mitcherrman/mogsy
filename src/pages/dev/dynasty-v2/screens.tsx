/**
 * UX-1 / VIS-F1 — the non-game screens of the synthetic Dynasty flow: home, org,
 * stars, roster, season hub, recruitment, preparation, scouting, draft, results.
 * Presentational: all state lives in `DynastyV2Prototype.tsx`.
 *
 * VIS-F1 restyles every screen on the broadcast language (see `parts.tsx` and
 * `vis.css`). Flow, props and every test id are unchanged from UX-1.
 */
import { useMemo, type CSSProperties } from "react";
import { Lock, Sparkles } from "lucide-react";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import { RoleEmblem } from "@/components/ranked-arena/RoleEmblem";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import {
  applyPrep, availableChamps, readComposition, recruitOffers, previewSigning, revealedOppLanes, TACTICS,
  type Game, type GameSummary, type PrepPick, type Run,
} from "./engine";
import {
  CHAMP_BY_ID, CHAMPS_BY_ROLE, ORGS, PREP_ACTIONS, RARE_TOP_CHAMP, ROLES, ROLE_LABEL, SEASON, STAGE_LABEL, TAG_LABEL, TAGS,
  type Org, type Player, type Role, type Stage,
} from "./fixtures";
import { EventCard } from "./GameView";
import { CasterPop, ChatBurst } from "./broadcast";
import { ChampionCard, PlayerCard } from "./cards";
import { PanelArt, StoryBeat } from "./story";
import { CineFrame } from "./cinematics";
import {
  Btn, ConfidenceDiamonds, Crest, Delta, Eyebrow, FatigueBars, KindRibbon, Monogram, ORG_ACCENT, PLATE, Pips, Plate, PlayerRow, ProtoBanner,
  RANKED_ROLE, RolePill, Rule, Screen, SourceChip, StateLabel, accentStyle,
} from "./parts";

const stageChip = (s: Stage) => <span key={s} className={cn("rounded-sm border px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-[0.14em]", s === "early" ? "border-sky-300/40 text-sky-200" : s === "mid" ? "border-[#e3c66f]/40 text-[#f2dc98]" : "border-orange-300/40 text-orange-200")}>{STAGE_LABEL[s]}</span>;

// ───────────────────────────────────────────────────────────── home

export function HomeScreen({ run, seed, onSeed, onNew, onResume }: { run: Run | null; seed: string; onSeed: (s: string) => void; onNew: () => void; onResume: () => void }) {
  const motion = useMotionAllowed();
  return (
    <Screen testId="screen-home" eyebrow="Mogzy presents · an esports management roguelike" title="Worlds Dynasty" hero kicker="Build a roster. Take it to Worlds.">
      <ProtoBanner />
      {run ? (
        <Plate ornate accent testId="resume-card" className="flex flex-col gap-3 p-4" style={accentStyle(run.org.id)}>
          <div className="flex items-center gap-3">
            <Crest org={run.org} size={56} />
            <div className="min-w-0 flex-1">
              <Eyebrow>Resume run</Eyebrow>
              <p className="dyn-title mt-0.5 text-[20px] font-semibold leading-tight text-white">{run.org.name}</p>
              <p className="text-[12.5px] text-white/65">{run.finished ? "Run finished" : `Next: ${SEASON[Math.min(run.nodeIdx, SEASON.length - 1)].label}`} · Cohesion <Pips n={run.cohesion} max={5} label="Cohesion" /></p>
            </div>
            <Btn primary beckon testId="home-resume" onClick={onResume}>Continue</Btn>
          </div>
        </Plate>
      ) : null}
      <div className={cn("grid gap-3 sm:grid-cols-[1.4fr_1fr]", motion && "dyn-stagger")}>
        <Plate ornate className="flex flex-col gap-3 p-4" style={{ "--i": 1 } as CSSProperties}>
          <Eyebrow>New campaign</Eyebrow>
          <p className="text-sm leading-relaxed text-white/80">Sign two stars, fill the gaps with academy stand-ins, prepare between series and draft Fearless through eight best-of-fives. Every run varies with its seed; the season remembers what you did.</p>
          <ol className="grid grid-cols-4 gap-1 text-center text-[10px] uppercase tracking-[0.14em] text-white/55" aria-label="The loop">
            {["Recruit", "Prepare", "Draft", "Play"].map((w, i) => <li key={w} className="rounded-md border border-white/10 bg-white/[0.03] py-1.5"><span className="dyn-title block text-[13px] text-[#f2dc98]">{i + 1}</span>{w}</li>)}
          </ol>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.14em] text-white/55">Run seed <span className="normal-case tracking-normal text-white/40">(same seed and same choices replay identically)</span>
            <input data-testid="seed-input" value={seed} onChange={(e) => onSeed(e.target.value)} className="dyn-num min-h-[44px] rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm normal-case tracking-normal text-white focus:border-[#e3c66f]/60 focus:outline-none" />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Btn primary beckon testId="home-new" onClick={onNew}>New run</Btn>
            <Btn testId="home-legacy" disabled>Legacy shelf (later)</Btn>
          </div>
        </Plate>
        <Plate className="flex flex-col gap-2 p-4" style={{ "--i": 2 } as CSSProperties}>
          <Eyebrow tone="muted">The road</Eyebrow>
          <ul className="flex flex-col gap-1.5 text-[12.5px] text-white/75">
            {[["Regular season", "4 series · losses cost condition"], ["Playoffs", "2 series · elimination"], ["Worlds", "Semi and Final · the title"]].map(([a, b], i) => (
              <li key={a} className="flex items-center gap-2"><span className={cn("h-2 w-2 rotate-45 rounded-[1px]", i === 2 ? "bg-[#e3c66f]" : "bg-white/35")} /><span className="font-semibold text-white">{a}</span><span className="ml-auto text-right text-white/50">{b}</span></li>
            ))}
          </ul>
          <Rule className="my-2" />
          <p className="text-[11px] text-white/45">Version pin: <code className="text-white/65">syn.ux1</code> · prototype rules, synthetic catalog, event fixtures.</p>
        </Plate>
      </div>
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────── org

export function OrgScreen({ onChoose }: { onChoose: (o: Org) => void }) {
  const motion = useMotionAllowed();
  return (
    <Screen testId="screen-org" eyebrow="New run · 1 of 2" title="Choose your organization" kicker="Each org brings a playstyle, a region and three star candidates. The trait is a Dynasty rule, not a claim about a real team.">
      <div className={cn("grid gap-3 sm:grid-cols-3", motion && "dyn-stagger")}>
        {ORGS.map((o, i) => {
          const a = ORG_ACCENT[o.id];
          return (
            <Plate key={o.id} ornate accent testId={`org-${o.id}`} className="flex flex-col gap-3 p-4" style={{ ...accentStyle(o.id), "--i": i } as CSSProperties}>
              <div className="flex items-center gap-3">
                <Crest org={o} size={64} />
                <div className="min-w-0">
                  <p className="dyn-title text-[19px] font-semibold leading-tight text-white">{o.name.replace(/^SYN /, "")}</p>
                  <p className="mt-1 inline-flex rounded-sm border border-white/15 px-1.5 text-[9.5px] font-bold uppercase tracking-[0.16em] text-white/55">{o.region}</p>
                </div>
              </div>
              <p className="text-[13px] italic leading-snug text-white/70">“{a.motto}”</p>
              <Rule />
              <p className="text-sm font-medium text-white/90">{o.trait}</p>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {o.strengths.map((s) => <span key={s} className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-emerald-200">▲ {s}</span>)}
                <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-rose-200">▼ {o.weakness}</span>
              </div>
              <div>
                <Eyebrow tone="muted">Star candidates</Eyebrow>
                <div className="mt-1.5 flex items-center gap-2">
                  {o.starCandidates.map((p) => <span key={p.id} className="flex items-center gap-1.5 text-[11px] text-white/70"><Monogram p={p} size={28} /><span className="hidden sm:inline">{ROLE_LABEL[p.role]}</span></span>)}
                </div>
              </div>
              <SourceChip kind="rules" />
              <Btn primary testId={`org-choose-${o.id}`} className="mt-auto" onClick={() => onChoose(o)}>Choose {o.name.replace("SYN ", "")}</Btn>
            </Plate>
          );
        })}
      </div>
    </Screen>
  );
}

export function StarsScreen({ org, selected, onToggle, onConfirm }: { org: Org; selected: string[]; onToggle: (id: string) => void; onConfirm: () => void }) {
  const motion = useMotionAllowed();
  return (
    <Screen testId="screen-stars" eyebrow={`New run · 2 of 2 · ${org.name.replace(/^SYN /, "")}`} title="Pick your two stars"
      kicker="The other three starting roles are filled by academy stand-ins. You will recruit more as the season goes."
      actions={<Btn primary beckon testId="stars-confirm" disabled={selected.length !== 2} onClick={onConfirm}>Build the roster ({selected.length}/2)</Btn>}>
      <div className={cn("grid gap-3 sm:grid-cols-3", motion && "dyn-stagger")}>
        {org.starCandidates.map((p, i) => {
          const on = selected.includes(p.id);
          return (
            <button key={p.id} type="button" data-testid={`star-${p.id}`} aria-pressed={on} onClick={() => onToggle(p.id)} style={{ "--i": i } as CSSProperties}
              className="rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]">
              <PlayerRow p={p} compact selected={on}>
                <p className={cn("text-[11px]", on ? "font-semibold text-[#f2dc98]" : "text-white/55")}>{on ? "✓ Selected" : "Tap to select"} · pool of {p.prof.filter(Boolean).length} comfortable champions</p>
              </PlayerRow>
            </button>
          );
        })}
      </div>
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────── roster

export function RosterList({ run, columns }: { run: Run; columns?: boolean }) {
  return (
    <div className="flex flex-col gap-2" data-testid="roster-list">
      <div className={cn("grid gap-2", columns && "sm:grid-cols-2")}>{ROLES.map((r) => <PlayerCard key={r} p={run.starters[r]} testId={`roster-${r}`} hierarchy />)}</div>
      <Eyebrow tone="muted" className="mt-1">Bench ({run.bench.length}/2)</Eyebrow>
      <div className={cn("grid gap-2", columns && "sm:grid-cols-2")}>{[0, 1].map((i) => run.bench[i] ? <PlayerCard key={i} p={run.bench[i]} size="bench" showCondition={false} compactMeta /> : <div key={i} className="rounded-xl border border-dashed border-white/15 px-3 py-3 text-sm text-white/40">Open bench slot</div>)}</div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-white/55">Team cohesion <Pips n={run.cohesion} max={5} label="Cohesion" /></p>
    </div>
  );
}

export function RosterScreen({ run, onNext }: { run: Run; onNext: () => void }) {
  return (
    <Screen testId="screen-roster" eyebrow={run.org.name} title="Your starting roster"
      kicker="Two stars, three academy stand-ins, and an open bench. Early / Mid / Late bars show each player's phase strength (synthetic)."
      actions={<Btn primary beckon testId="roster-continue" onClick={onNext}>Enter the season</Btn>}>
      <StoryBeat id="run.start" title="A new campaign" panels={[
        { art: <PanelArt kind="crest" accent={ORG_ACCENT[run.org.id]?.hex} />, kicker: "Day one.", caption: `${run.org.name.replace(/^SYN /, "")} opens the house for a new season.` },
        { art: <PanelArt kind="house" accent={ORG_ACCENT[run.org.id]?.hex} />, caption: "Two stars move in. Three academy names fill the gaps, for now." },
        { art: <PanelArt kind="draft" accent={ORG_ACCENT[run.org.id]?.hex} />, kicker: "The road:", caption: "four regular series, playoffs, then Worlds. Losses in the first four cost condition; after that they end the run." },
      ]} />
      <CasterPop moment="run.start" k={run.seed} ctx={{ org: run.org.name.replace(/^SYN /, "") }} compact />
      <RosterList run={run} columns />
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────── season hub

export function SeasonScreen({ run, onBegin }: { run: Run; onBegin: () => void }) {
  const cur = run.nodeIdx;
  const motion = useMotionAllowed();
  return (
    <Screen testId="screen-season" eyebrow={run.org.name} title="The road to Worlds"
      kicker="Eight series, all best-of-five. Regular-season losses cost condition; playoff and Worlds losses end the run. (Counts and rules are open decisions.)"
      actions={run.finished ? null : <Btn primary beckon testId="season-begin" onClick={onBegin}>Begin {SEASON[cur].label} · vs {SEASON[cur].opp.name.replace(/^SYN /, "")}</Btn>}>
      <ol className={cn("relative grid gap-2 sm:grid-cols-4", motion && "dyn-stagger")} aria-label="Season path">
        {SEASON.map((n, i) => {
          const res = run.results[i];
          const state = res ? "done" : i === cur && !run.finished ? "current" : "upcoming";
          const kindLabel = n.kind === "regular" ? "Season" : n.kind === "playoff" ? "Playoffs · elimination" : "Worlds · elimination";
          return (
            <li key={n.label} data-testid={`node-${i}`} data-state={state} aria-current={state === "current" ? "step" : undefined} style={{ "--i": i } as CSSProperties}
              className={cn("relative flex items-stretch gap-3 rounded-xl border p-3 sm:flex-col sm:gap-2",
                state === "current" ? "dyn-node--current border-[#e3c66f]/70 bg-[linear-gradient(180deg,rgba(227,198,111,0.12),rgba(227,198,111,0.03))]"
                  : state === "done" ? "border-white/12 bg-white/[0.03]"
                  : "border-white/10 bg-white/[0.015] opacity-75",
                n.kind === "worlds" && state !== "done" && "border-[#e3c66f]/30")}>
              {/* connector on phones (vertical) and desktop (horizontal) */}
              {i < SEASON.length - 1 ? <span aria-hidden className={cn("dyn-path-line absolute", "left-[23px] top-full h-2 w-px sm:left-full sm:top-[22px] sm:h-px sm:w-2", i % 4 === 3 && "sm:hidden")} /> : null}
              <span className={cn("dyn-title flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full border text-[12px] font-bold sm:self-start",
                state === "done" ? (res === "W" ? "border-[#e3c66f] bg-[linear-gradient(180deg,#f6dd8f,#d9b85a)] text-[#1a1406]" : "border-rose-400/60 bg-rose-400/15 text-rose-200")
                  : state === "current" ? "border-[#e3c66f] text-[#f2dc98] shadow-[0_0_16px_-2px_rgba(227,198,111,0.8)]" : "border-white/20 text-white/50")}>
                {state === "done" ? res : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-white">{n.label}</span>
                  {n.kind === "worlds" ? <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#e3c66f]" aria-hidden /> : null}
                </div>
                <span className="block text-[12.5px] text-white/70">vs {n.opp.name.replace(/^SYN /, "")}</span>
                <span className="mt-1 block text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/45">{kindLabel}</span>
                <span className="block text-[11px] text-white/50">{res ? (res === "W" ? "Won the series" : "Lost the series") : n.window ? "Transfer window before this series" : "Preparation before this series"}</span>
                <span className="sr-only">{state}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────── recruit

export function RecruitScreen({ run, picked, onPick, onSign, onSkip }: { run: Run; picked: string | null; onPick: (id: string) => void; onSign: (p: Player) => void; onSkip: () => void }) {
  const offers = useMemo(() => recruitOffers(run), [run]);
  const sel = offers.find((o) => o.id === picked) ?? null;
  const prev = sel ? previewSigning(run, sel) : null;
  const motion = useMotionAllowed();
  return (
    <Screen testId="screen-recruit" eyebrow="Transfer window" title="Recruit a player" kicker="Three offers. A signing costs a roster slot and some cohesion, and brings a honeymoon."
      actions={<><Btn testId="recruit-skip" onClick={onSkip}>Skip the window</Btn><Btn primary beckon testId="recruit-sign" disabled={!sel} onClick={() => sel && onSign(sel)}>{sel ? `Sign ${sel.name.replace("SYN-", "")}` : "Pick an offer"}</Btn></>}>
      <div className={cn("grid gap-3 sm:grid-cols-3", motion && "dyn-stagger")}>
        {offers.map((o, i) => (
          <button key={o.id} type="button" data-testid={`offer-${o.id}`} aria-pressed={picked === o.id} onClick={() => onPick(o.id)} style={{ "--i": i } as CSSProperties}
            className="rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]">
            <PlayerRow p={o} compact selected={picked === o.id}><p className="text-[11px] text-white/55">{o.note}</p></PlayerRow>
          </button>
        ))}
      </div>
      {prev ? (
        <Plate ornate accent testId="sign-preview" className={cn("flex flex-col gap-2 p-4 text-sm", motion && "dyn-enter-fast")}>
          <Eyebrow>Swap preview</Eyebrow>
          <div className="flex items-center gap-3">
            <Monogram p={prev.incoming} size={40} />
            <span className="text-[#e3c66f]">→</span>
            <Monogram p={prev.displaced} size={32} />
            <p className="min-w-0 flex-1 text-white/85">{prev.incoming.name.replace(/^SYN-/, "")} replaces {prev.displaced.name.replace(/^SYN-/, "")} in {ROLE_LABEL[prev.incoming.role]}. {prev.displaced.name.replace(/^SYN-/, "")} {prev.displacedGoesTo === "bench" ? "moves to the bench." : "is released (bench is full)."}</p>
          </div>
          <p className="flex flex-wrap items-center gap-x-2 text-white/70">Cohesion <Pips n={prev.cohesionBefore} max={5} label="Cohesion before" /> → <Pips n={prev.cohesionAfter} max={5} label="Cohesion after" /> <span className="text-white/50">(new pairings need time)</span> <span className="rounded-full border border-[#e3c66f]/40 bg-[#e3c66f]/10 px-2 py-0.5 text-[10.5px] font-semibold text-[#e3c66f]">Honeymoon · Confidence +1</span></p>
          <SourceChip kind="rules" />
        </Plate>
      ) : null}
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────── prep

export function PrepScreen({ run, picks, onToggle, onTarget, onConfirm }: {
  run: Run; picks: PrepPick[]; onToggle: (id: string) => void; onTarget: (id: string, playerId: string) => void; onConfirm: () => void;
}) {
  const full = picks.length >= 2;
  const needsTarget = picks.some((p) => PREP_ACTIONS.find((a) => a.id === p.id)?.target === "player" && !p.playerId);
  const preview = useMemo(() => applyPrep(run, picks.filter((p) => !(PREP_ACTIONS.find((a) => a.id === p.id)?.target === "player" && !p.playerId))), [run, picks]);
  const motion = useMotionAllowed();
  const left = 2 - picks.length;
  return (
    <Screen testId="screen-prep" eyebrow={`Before ${SEASON[run.nodeIdx].label} · vs ${SEASON[run.nodeIdx].opp.name.replace(/^SYN /, "")}`} title={`Preparation · ${left} action${left === 1 ? "" : "s"} left`}
      kicker="Two slots. Each action says who it helps, which phase, and what it costs, before you commit."
      actions={<Btn primary beckon testId="prep-confirm" disabled={needsTarget} onClick={onConfirm}>{picks.length ? "Run preparation" : "Skip preparation"}</Btn>}>
      {run.signedThisWindow ? (() => {
        const signed = ROLES.map((r) => run.starters[r]).find((x) => x.traits.includes("Honeymoon"));
        return signed ? (
          <>
            <CineFrame kind="signing" accent={ORG_ACCENT[run.org.id]?.hex} kicker="Transfer window" title={`${signed.name.replace(/^SYN-/, "")} signs for ${run.org.name.replace(/^SYN /, "")}`} caption="New pairings need time: cohesion dips, the honeymoon lifts confidence for one series." />
            <CasterPop moment="player.sign" k={`${run.seed}|${run.nodeIdx}|sign`} ctx={{ player: signed.name.replace(/^SYN-/, "") }} compact />
          </>
        ) : null;
      })() : null}
      <div className={cn("grid gap-2 sm:grid-cols-3", motion && "dyn-stagger")}>
        {PREP_ACTIONS.map((a, i) => {
          const sel = picks.find((p) => p.id === a.id);
          return (
            <Plate key={a.id} selected={!!sel} testId={`prep-${a.id}`} className={cn("flex flex-col gap-1.5 p-3", !sel && full && "opacity-60")} style={{ "--i": i } as CSSProperties}>
              <div className="flex items-center justify-between gap-2">
                <span className="dyn-title text-[15px] font-semibold text-white">{a.name}</span>
                {a.knowledge ? <span className="rounded-full border border-sky-400/35 bg-sky-400/10 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-sky-200">Knowledge</span> : null}
              </div>
              <p className="text-[12px] leading-snug text-white/65">{a.blurb}</p>
              <p className="flex flex-wrap items-center gap-1 text-[11px] text-white/55">{a.helps.length ? <>Helps {a.helps.map(stageChip)}</> : <span>Condition / cohesion</span>}</p>
              <p className="text-[11px] text-white/50">{a.cost}</p>
              {a.knowledge ? <p className="text-[10.5px] text-white/40">In the real product this opens a hosted Mogzy activity; here it resolves instantly.</p> : null}
              {sel && a.target === "player" ? (
                <label className="flex flex-col gap-1 text-[11px] text-white/60">Who?
                  <select data-testid={`prep-target-${a.id}`} value={sel.playerId ?? ""} onChange={(e) => onTarget(a.id, e.target.value)} className="min-h-[44px] rounded-lg border border-white/15 bg-[#0b1727] px-2 text-sm text-white">
                    <option value="">Choose a player</option>
                    {ROLES.map((r) => <option key={r} value={run.starters[r].id}>{run.starters[r].name} ({ROLE_LABEL[r]})</option>)}
                  </select>
                </label>
              ) : null}
              <Btn testId={`prep-toggle-${a.id}`} ariaLabel={`${sel ? "Remove" : "Choose"} ${a.name}`} disabled={!sel && full} onClick={() => onToggle(a.id)} className={cn("mt-auto min-h-[40px]", sel && "border-[#e3c66f]/50 text-[#f2dc98]")}>{sel ? "Remove" : "Choose"}</Btn>
            </Plate>
          );
        })}
      </div>
      <Plate testId="condition-preview" className="flex flex-col gap-2 p-3">
        <Eyebrow>Condition preview</Eyebrow>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {preview.changes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-[12.5px] text-white/80">
              <span className="truncate">{c.name.replace(/^SYN-/, "")}</span>
              <span className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/55">Conf <Delta v={c.confDelta} /> Fatigue <Delta v={c.fatigueDelta} invert /> {c.phaseNote ? <span className="normal-case tracking-normal text-[#f2dc98]/80">{c.phaseNote}</span> : null}</span>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-white/65">Cohesion <Delta v={preview.cohesionDelta} /> · Scouting tier <Delta v={preview.scoutDelta} /> · {preview.notes.join(" ") || "No diminishing returns yet."}</p>
      </Plate>
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────── scout

export function ScoutScreen({ run, onNext }: { run: Run; onNext: () => void }) {
  const node = SEASON[run.nodeIdx];
  const tier = run.series!.scoutTier;
  const lanes = revealedOppLanes(tier);
  return (
    <Screen testId="screen-scout" eyebrow={`${node.label} · scouting report`} title={node.opp.name.replace(/^SYN /, "")} kicker="Their draft is already committed; scouting only reveals it. Nothing beyond your tier is invented."
      actions={<Btn primary beckon testId="scout-continue" onClick={onNext}>To the draft</Btn>}>
      <Plate ornate className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/60" data-testid="scout-tier">Scouting tier <b className="dyn-num text-white">{tier}</b> of 3 <Pips n={tier} max={3} label="Scouting tier" tone="blue" /></p>
          <span className="rounded-sm border border-white/15 px-1.5 text-[9.5px] font-bold uppercase tracking-[0.16em] text-white/55">{node.opp.region}</span>
        </div>
        <Rule />
        <div><Eyebrow tone="muted">Identity · tier 1</Eyebrow><div className="mt-1.5 flex flex-wrap gap-1.5">{node.opp.tags.map((t) => <span key={t} className="rounded-full border border-white/20 bg-white/[0.04] px-2.5 py-0.5 text-xs text-white/85">{t}</span>)}</div></div>
        <div><Eyebrow tone="muted">Weakness · tier 2</Eyebrow>
          <p className={cn("mt-1 flex items-center gap-2 text-sm", tier >= 2 ? "text-white/90" : "text-white/40")} data-testid="scout-warning">{tier >= 2 ? node.opp.warning : <><Lock className="h-3.5 w-3.5" aria-hidden /> Locked: needs one more scouting tier (VOD Review).</>}</p></div>
        <div><Eyebrow tone="muted">Likely first-game picks · tier 2+ reveals two lanes per tier</Eyebrow>
          <ul className="mt-1.5 grid grid-cols-5 gap-1.5 sm:grid-cols-5">
            {ROLES.map((r) => {
              const open = lanes.includes(r);
              return (
                <li key={r} className={cn("flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-center text-[11px]", open ? "border-white/15 bg-white/[0.04]" : "border-dashed border-white/10")}>
                  <RoleEmblem role={RANKED_ROLE[r]} size="md" decorative className={cn(!open && "opacity-40")} />
                  <span data-testid={`scout-pick-${r}`} className={cn("truncate", open ? "text-white" : "text-white/30")}>{open ? CHAMP_BY_ID[CHAMPS_BY_ROLE[r][(node.opp.offset + run.series!.games.length + ROLES.indexOf(r)) % 5].id].name.replace("SynChamp-", "Syn ") : "Hidden"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </Plate>
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────── draft

export function DraftScreen({ run, picks, onPick, onLock }: { run: Run; picks: Partial<Record<Role, string>>; onPick: (r: Role, id: string) => void; onLock: () => void }) {
  const node = SEASON[run.nodeIdx];
  const s = run.series!;
  const chosen = ROLES.map((r) => picks[r]).filter(Boolean) as string[];
  const ro = readComposition(chosen, node.opp.tags);
  const lanes = revealedOppLanes(s.scoutTier);
  const motion = useMotionAllowed();
  return (
    <Screen testId="screen-draft" eyebrow={`Game ${s.games.length + 1} of up to 5 · Fearless · series ${s.wins}–${s.losses}`} title="Draft your champions"
      actions={<Btn primary beckon testId="draft-lock" disabled={chosen.length < 5} onClick={onLock}>{chosen.length < 5 ? `Pick ${5 - chosen.length} more` : "Lock draft and play"}</Btn>}>
      {node.kind === "worlds" && node.label === "Worlds Final" && s.games.length === 0 ? (
        <>
          <StoryBeat id="finals.intro" title="Worlds Final" holdMs={5200} panels={[
            { art: <PanelArt kind="tunnel" />, kicker: "The tunnel.", caption: `${run.org.name.replace(/^SYN /, "")} walk out for the last series of the season.` },
            { art: <PanelArt kind="stage" />, caption: `${node.opp.name.replace(/^SYN /, "")} wait on the other side of the stage. Best of five, Fearless.` },
            { art: <PanelArt kind="trophy" />, kicker: "One trophy.", caption: "Whoever lifts it, the season remembers." },
          ]} />
          <CasterPop moment="finals.intro" k={`${run.seed}|final`} ctx={{ team: run.org.name.replace(/^SYN /, ""), opp: node.opp.name.replace(/^SYN /, "") }} compact />
        </>
      ) : null}
      <Plate testId="fearless-strip" className="flex flex-col gap-1 p-3 text-[12px] text-white/65">
        <div className="flex flex-wrap items-center gap-2"><Eyebrow tone="muted">Fearless: used earlier this series</Eyebrow><span className="ml-auto text-[10.5px] uppercase tracking-wider text-white/45">Game {s.games.length + 1}</span></div>
        <p className="flex flex-wrap gap-1">{s.used.length ? s.used.map((u) => <span key={u} className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-white/50 line-through">{u.replace("SynChamp-", "Syn ")}</span>) : "Nothing used yet."}</p>
        {lanes.length ? <p className="text-white/50">Scouted: they are expected to play {lanes.map((r) => `${ROLE_LABEL[r]} ${CHAMPS_BY_ROLE[r][(node.opp.offset + s.games.length + ROLES.indexOf(r)) % 5].name.replace("SynChamp-", "Syn ")}`).join(", ")}.</p> : null}
      </Plate>
      <div className={cn("flex flex-col gap-2", motion && "dyn-stagger")}>
        {ROLES.map((r, ri) => {
          const p = run.starters[r];
          const pool = CHAMPS_BY_ROLE[r];
          const avail = new Set(availableChamps(run, r).map((c) => c.id));
          const locked = picks[r];
          return (
            <fieldset key={r} data-testid={`draft-row-${r}`} className={cn(PLATE, "flex min-w-0 flex-col gap-2 p-3", locked && "border-[#e3c66f]/30")} style={{ "--i": ri } as CSSProperties}>
              <legend className="sr-only">{ROLE_LABEL[r]} pick for {p.name}</legend>
              <div className="flex items-center gap-2">
                <Monogram p={p} size={30} />
                <RolePill role={r} />
                <span className="truncate text-sm font-semibold text-white">{p.name.replace(/^SYN-/, "")}</span>
                {locked ? <span className="ml-auto rounded-full border border-[#e3c66f]/50 bg-[#e3c66f]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#f2dc98]">Locked</span> : <span className="ml-auto text-[10px] uppercase tracking-wider text-white/40">Pick</span>}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
                {pool.map((c, ci) => {
                  const ok = avail.has(c.id);
                  const prof = p.prof[ci] ?? 0;
                  const scouted = lanes.includes(r);
                  const relevance = r === "top" && c.id === RARE_TOP_CHAMP ? "Rare play possible" : scouted && c.phase.early >= 4 && /early/i.test(node.opp.tags.join(" ")) ? "Matches their tempo" : null;
                  return <ChampionCard key={c.id} c={c} prof={prof} picked={picks[r] === c.id} used={!ok} onPick={() => onPick(r, c.id)} testId={`pick-${r}-${c.id}`} name={`pick-${r}`} relevance={relevance} />;
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
      <Plate ornate testId="comp-readout" className="flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><Eyebrow>Composition</Eyebrow><span className="dyn-title rounded-full border border-[#e3c66f]/40 bg-[#e3c66f]/[0.08] px-3 py-0.5 text-[12px] text-[#f2dc98]" data-testid="comp-identity">{ro.identity}</span></div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px] sm:grid-cols-4">
          {TAGS.map((t) => (
            <li key={t} className="flex items-center justify-between gap-2 text-white/75"><span>{TAG_LABEL[t]}</span>
              <span className="flex gap-0.5" role="img" aria-label={`${TAG_LABEL[t]} ${ro.tagLevels[t]} of 2`}>{[0, 1].map((k) => <span key={k} aria-hidden className={cn("h-1.5 w-4 rounded-sm", k < ro.tagLevels[t] ? "bg-[#e3c66f] shadow-[0_0_6px_rgba(227,198,111,0.6)]" : "bg-white/15")} />)}</span>
            </li>
          ))}
        </ul>
        {ro.strengths.length || ro.warnings.length ? <Rule /> : null}
        {ro.strengths.map((x, i) => <p key={i} className="flex items-start gap-2 text-[13px] text-emerald-200" data-testid="comp-strength"><span aria-hidden>✔</span><span>{x.text} {stageChip(x.stage)}</span></p>)}
        {ro.warnings.map((x, i) => <p key={i} className="flex items-start gap-2 text-[13px] text-amber-200" data-testid="comp-warning"><span aria-hidden>⚠</span><span>{x.text}{x.stage ? <> {stageChip(x.stage)}</> : null}</span></p>)}
        {chosen.length < 3 ? <p className="text-[12px] text-white/45">Pick three or more champions for a read-out.</p> : null}
        <SourceChip kind="rules" />
      </Plate>
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────── results

export function BoPips({ wins, losses }: { wins: number; losses: number }) {
  const motion = useMotionAllowed();
  const mp = wins === 2 && losses < 2, theirMp = losses === 2 && wins < 2;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm text-white/80" data-testid="bo-pips">
      <span className="text-[10px] uppercase tracking-[0.16em] text-white/50">You</span> <Pips n={wins} max={3} label="Your wins" />
      <b className="dyn-title dyn-num text-[18px] text-white">{wins}–{losses}</b>
      <Pips n={losses} max={3} label="Their wins" tone="red" /> <span className="text-[10px] uppercase tracking-[0.16em] text-white/50">Them</span>
      {mp ? <span className={cn("rounded-full bg-[linear-gradient(180deg,#f6dd8f,#d9b85a)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#1a1406]", motion && "dyn-matchpoint")}>Match point</span>
        : theirMp ? <span className={cn("rounded-full bg-rose-400/85 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black", motion && "dyn-matchpoint")}>They have match point</span> : null}
    </span>
  );
}

export function GameResultScreen({ run, game, summary, onNext }: { run: Run; game: Game; summary: GameSummary; onNext: () => void }) {
  const s = run.series!;
  const motion = useMotionAllowed();
  return (
    <Screen testId="screen-result" eyebrow={`Game ${game.idx} · ${SEASON[run.nodeIdx].label} · vs ${SEASON[run.nodeIdx].opp.name.replace(/^SYN /, "")}`} title={summary.won ? "Game won" : "Game lost"}
      actions={<Btn primary beckon testId="result-continue" onClick={onNext}>{summary.seriesOver ? "Series result" : "Between-game decision"}</Btn>}>
      {summary.won && (s.losses === 2 || SEASON[run.nodeIdx].kind === "worlds") ? (
        <CineFrame kind="elim_victory" accent={ORG_ACCENT[run.org.id]?.hex} kicker={s.losses === 2 ? "Facing elimination" : SEASON[run.nodeIdx].label} title={`Victory · ${s.wins}–${s.losses}`} caption={s.wins >= 3 ? "Series won." : "Still alive. One more."} />
      ) : null}
      <Plate ornate testId="game-timeline" data-won={summary.won} data-ended={summary.endedAt}
        className={cn("dyn-hero flex flex-col gap-3 p-4", summary.won ? "dyn-hero--victory border-[#e3c66f]/50" : "dyn-hero--defeat border-rose-400/35")}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <MogzyMascot pose={summary.won ? "cheering" : "defeated"} scale="compact" decorative className="h-16 w-12 shrink-0 object-contain object-bottom sm:h-20 sm:w-16" />
          <div className="min-w-0 flex-1">
            <p className={cn("dyn-title whitespace-nowrap text-[30px] font-bold leading-none sm:text-[36px]", summary.won ? "dyn-title--gold" : "text-rose-200", motion && "dyn-hero-word")}>{summary.won ? "Victory" : "Defeat"}</p>
            <p className="mt-1 text-[12.5px] text-white/70">{summary.endedAt === "mid" ? "Closed out at Mid" : "Decided in Late"}</p>
          </div>
          <div className="w-full sm:ml-auto sm:w-auto"><BoPips wins={s.wins} losses={s.losses} /></div>
        </div>
        <Rule />
        <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${game.stages.length}, minmax(0, 1fr))` }} aria-label="Stage timeline">
          {game.stages.map((st) => (
            <li key={st.stage} className="flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-1 py-2 text-center">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">{STAGE_LABEL[st.stage]}</span>
              <span className="dyn-title dyn-num text-[18px] font-bold text-white">{st.ours}–{st.theirs}</span>
              <StateLabel label={st.label} />
            </li>
          ))}
        </ol>
        <p className="text-sm text-white/85" data-testid="game-reason">{summary.reason}.{summary.endedAt === "mid" ? " No Late stage was played." : ""}</p>
        <div className="grid gap-2 sm:grid-cols-[1.3fr_1fr]">
          <CasterPop moment={summary.won ? "game.win" : "game.loss"} k={`${run.seed}|${run.nodeIdx}|${game.idx}`} ctx={{ team: run.org.name.replace(/^SYN /, ""), opp: SEASON[run.nodeIdx].opp.name.replace(/^SYN /, ""), score: `${s.wins}–${s.losses}` }} compact />
          <ChatBurst moment={s.wins === 2 && s.losses < 2 ? "series.point" : summary.won ? "game.win" : "game.loss"} k={`${run.seed}|${run.nodeIdx}|${game.idx}`} n={3} />
        </div>
      </Plate>
      <Plate testId="deltas" className="flex flex-col gap-2 p-3">
        <Eyebrow>Player condition · before → after</Eyebrow>
        <ul className="flex flex-col gap-1.5">
          {summary.deltas.map((d, i) => (
            <li key={d.id} data-testid={`delta-${d.role}`} style={{ "--i": i } as CSSProperties} className={cn("grid gap-x-3 gap-y-1 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[13px] text-white/85 sm:grid-cols-[8.5rem_auto_1fr] sm:items-center", motion && "dyn-delta-row")}>
              <span className="flex items-center gap-2 font-medium"><RoleEmblem role={RANKED_ROLE[d.role]} size="sm" decorative /><span className="truncate">{d.name.replace(/^SYN-/, "")}</span></span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/55">Conf <ConfidenceDiamonds n={d.confAfter} from={d.confBefore} /> <span className={cn(motion && "dyn-delta-chip")}><Delta v={d.confAfter - d.confBefore} /></span></span>
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/55">Fatigue <FatigueBars n={d.fatAfter} from={d.fatBefore} /> <span className={cn(motion && "dyn-delta-chip")}><Delta v={d.fatAfter - d.fatBefore} invert /></span></span>
                {d.traitAdded ? <span className="rounded-full border border-[#e3c66f]/40 bg-[#e3c66f]/10 px-2 py-0.5 text-[10.5px] font-semibold text-[#e3c66f]">New: {d.traitAdded} next game</span> : null}
                {d.traitRemoved ? <span className="text-[11px] text-white/50">{d.traitRemoved} cleared</span> : null}
              </span>
              <span className="text-[11px] leading-snug text-white/45 sm:text-right">{d.causes.join(", ")}</span>
            </li>
          ))}
        </ul>
        <p className="text-[12px] uppercase tracking-[0.14em] text-white/60">Team cohesion <Pips n={summary.cohesionBefore} max={5} label="Cohesion before" /> → <Pips n={summary.cohesionAfter} max={5} label="Cohesion after" /> <Delta v={summary.cohesionAfter - summary.cohesionBefore} /></p>
      </Plate>
      <details className={cn(PLATE, "p-3")} data-testid="ledger">
        <summary className="cursor-pointer text-sm font-semibold text-white">Event ledger ({game.ledger.length})</summary>
        <div className="mt-2 flex flex-col gap-2">{game.ledger.map((l, i) => <div key={i}><p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-white/40">{STAGE_LABEL[l.stage]}</p><EventCard item={l} compact /></div>)}</div>
      </details>
    </Screen>
  );
}

export function TacticScreen({ run, onChoose }: { run: Run; onChoose: (id: string | null) => void }) {
  const s = run.series!;
  const motion = useMotionAllowed();
  return (
    <Screen testId="screen-tactic" eyebrow={`Between games · series ${s.wins}–${s.losses} · game ${s.games.length + 1} next`} title="One adjustment before the next game"
      kicker="A single call. It shapes the next game only." actions={<Btn testId="tactic-skip" onClick={() => onChoose(null)}>No change</Btn>}>
      <div className={cn("grid gap-3 sm:grid-cols-2", motion && "dyn-stagger")}>
        {TACTICS.map((t, i) => (
          <Plate key={t.id} testId={`tactic-${t.id}`} className="flex flex-col gap-2 p-3" style={{ "--i": i } as CSSProperties}>
            <p className="dyn-title text-[16px] font-semibold text-white">{t.name}</p>
            <p className="text-[12.5px] text-white/65">{t.blurb}</p>
            <div className="flex flex-wrap gap-1.5">{t.chips.map((c) => <span key={c} className="rounded-full border border-white/20 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/80">{c}</span>)}</div>
            <Btn primary className="mt-auto" testId={`tactic-pick-${t.id}`} onClick={() => onChoose(t.id)}>Choose</Btn>
          </Plate>
        ))}
      </div>
    </Screen>
  );
}

export function SeriesScreen({ run, onNext }: { run: Run; onNext: () => void }) {
  const s = run.series!;
  const won = s.wins >= 3;
  const node = SEASON[run.nodeIdx];
  const elim = !won && node.kind !== "regular";
  const motion = useMotionAllowed();
  return (
    <Screen testId="screen-series" eyebrow={`${node.label} · vs ${node.opp.name.replace(/^SYN /, "")}`} title={won ? `Series won ${s.wins}–${s.losses}` : `Series lost ${s.wins}–${s.losses}`}
      actions={<Btn primary beckon testId="series-continue" onClick={onNext}>{elim ? "See your run" : "Back to the season"}</Btn>}>
      <Plate ornate className={cn("dyn-hero flex flex-col gap-3 p-4", won ? "dyn-hero--victory border-[#e3c66f]/50" : "dyn-hero--defeat border-rose-400/35")}>
        <div className="flex items-center gap-3">
          <MogzyMascot pose={won ? "cheering" : "defeated"} scale="compact" decorative className="h-16 w-12 shrink-0 object-contain object-bottom sm:h-20 sm:w-16" />
          <div className="min-w-0 flex-1">
            <p className={cn("dyn-title whitespace-nowrap text-[26px] font-bold leading-none sm:text-[32px]", won ? "dyn-title--gold" : "text-rose-200", motion && "dyn-hero-word")}>{won ? "Series won" : "Series lost"}</p>
            <div className="mt-2"><BoPips wins={s.wins} losses={s.losses} /></div>
          </div>
        </div>
        <Rule />
        <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${s.games.length}, minmax(0, 1fr))` }} aria-label="Games">
          {s.games.map((g) => (
            <li key={g.idx} className={cn("flex flex-col items-center gap-0.5 rounded-lg border px-1 py-2 text-center", g.won ? "border-[#e3c66f]/40 bg-[#e3c66f]/[0.07]" : "border-rose-400/30 bg-rose-400/[0.05]")}>
              <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-white/50">Game {g.idx}</span>
              <span className={cn("dyn-title text-[16px] font-bold", g.won ? "text-[#f2dc98]" : "text-rose-200")}>{g.won ? "W" : "L"}</span>
              <span className="text-[10px] text-white/50">{g.endedAt === "mid" ? "at Mid" : "in Late"}</span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-white/75">{elim ? "This was an elimination series. The run ends here." : won ? "Your condition carries forward. Players recover a little between series." : "A regular-season loss costs momentum, not the run."}</p>
        <CasterPop moment={won ? "game.win" : "game.loss"} k={`${run.seed}|${run.nodeIdx}|series`} ctx={{ team: run.org.name.replace(/^SYN /, ""), opp: node.opp.name.replace(/^SYN /, ""), score: `${s.wins}–${s.losses}` }} compact />
      </Plate>
    </Screen>
  );
}

export function EndScreen({ run, onHome }: { run: Run; onHome: () => void }) {
  const wins = run.results.filter((r) => r === "W").length;
  const champion = run.alive && run.results[SEASON.length - 1] === "W";
  const played = run.results.map((r, i) => (r ? i : -1)).filter((i) => i >= 0);
  const furthest = SEASON[played.length ? played[played.length - 1] : 0].label;
  const motion = useMotionAllowed();
  return (
    <Screen testId="screen-end" eyebrow={champion ? "Run complete · the title" : "Run complete"} title={champion ? "Worlds champions (synthetic)" : "Run over"} hero={champion}
      actions={<Btn primary beckon testId="end-home" onClick={onHome}>Back to Dynasty home</Btn>}>
      {champion ? (
        <StoryBeat id="championship" title="Worlds Dynasty champions" holdMs={6000} panels={[
          { art: <PanelArt kind="stage" />, kicker: "Final game.", caption: `${run.org.name.replace(/^SYN /, "")} close the series on the biggest stage of the year.` },
          { art: <PanelArt kind="trophy" />, kicker: "The lift.", caption: "The cup comes up. The house that started with three academy names is a dynasty." },
          { art: <PanelArt kind="crest" accent={ORG_ACCENT[run.org.id]?.hex} />, caption: "This roster goes on the legacy card. Only stored facts appear." },
        ]} />
      ) : (
        <StoryBeat id="run.defeat" title="The run ends" tone="cold" holdMs={5000} panels={[
          { art: <PanelArt kind="rain" />, kicker: "Backstage.", caption: `${run.org.name.replace(/^SYN /, "")} walk off after an elimination series.` },
          { art: <PanelArt kind="house" accent={ORG_ACCENT[run.org.id]?.hex} />, caption: "The house stays. The duo stays. The next seed starts a new story." },
        ]} />
      )}
      {champion ? (
        <div className="flex justify-center" aria-hidden>
          <svg viewBox="0 0 120 120" width="112" height="112" className={cn("dyn-trophy-glow", motion && "dyn-trophy-rise")} data-slot="trophy.cup">
            <defs><linearGradient id="cup-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3c4" /><stop offset="0.55" stopColor="#e3c66f" /><stop offset="1" stopColor="#9a7a2f" /></linearGradient></defs>
            <path d="M36 14 H84 V46 C84 66 72 78 60 80 C48 78 36 66 36 46 Z" fill="url(#cup-g)" stroke="#b8913f" />
            <path d="M36 22 C18 22 18 50 38 52 M84 22 C102 22 102 50 82 52" fill="none" stroke="#e3c66f" strokeWidth="4" strokeLinecap="round" />
            <rect x="52" y="80" width="16" height="14" fill="#b8913f" /><rect x="38" y="94" width="44" height="10" rx="3" fill="url(#cup-g)" /><rect x="30" y="104" width="60" height="8" rx="2" fill="#0b1727" stroke="#e3c66f" strokeOpacity="0.6" />
            <path d="M60 30 L63 38 L71 38 L65 43 L67 51 L60 46 L53 51 L55 43 L49 38 L57 38 Z" fill="#fff3c4" fillOpacity="0.9" />
          </svg>
        </div>
      ) : null}
      <Plate ornate accent testId="legacy-card" className={cn("dyn-hero flex flex-col gap-3 p-4 sm:p-5", champion ? "dyn-hero--victory border-[#e3c66f]/60" : "dyn-hero--defeat")}>
        <div className="flex items-center gap-3">
          <Crest org={run.org} size={64} />
          <div className="min-w-0 flex-1">
            <Eyebrow>Legacy card · synthetic</Eyebrow>
            <p className="dyn-title mt-0.5 text-[22px] font-semibold leading-tight text-white sm:text-[26px]">{run.org.name}</p>
            <p className="text-[12.5px] text-white/70">{wins} of {SEASON.length} series won · furthest: {furthest} · cohesion <Pips n={run.cohesion} max={5} label="Cohesion" /></p>
          </div>
          <MogzyMascot pose={champion ? "cheering" : "defeated"} scale="compact" decorative className="hidden h-20 w-16 shrink-0 object-contain object-bottom sm:block" />
        </div>
        {champion ? (
          <div className="flex items-center justify-center gap-3 py-1" aria-hidden>
            <span className="h-px w-16 bg-gradient-to-r from-transparent to-[#e3c66f]/70" />
            <svg viewBox="0 0 64 40" width="64" height="40" className="dyn-sigil" style={{ "--dyn-light": "44 90% 62%" } as CSSProperties}>
              <path d="M6 32 L10 12 L22 22 L32 6 L42 22 L54 12 L58 32 Z" fill="url(#crown-g)" stroke="#f6dd8f" strokeWidth="1.5" strokeLinejoin="round" />
              <rect x="8" y="32" width="48" height="4" rx="1" fill="#e3c66f" />
              <circle cx="32" cy="26" r="2.5" fill="#fff3c4" /><circle cx="18" cy="27" r="1.8" fill="#fff3c4" /><circle cx="46" cy="27" r="1.8" fill="#fff3c4" />
              <defs><linearGradient id="crown-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3c4" /><stop offset="1" stopColor="#b8913f" /></linearGradient></defs>
            </svg>
            <span className="h-px w-16 bg-gradient-to-l from-transparent to-[#e3c66f]/70" />
          </div>
        ) : null}
        <ol className="grid grid-cols-8 gap-1" aria-label="Series record">
          {SEASON.map((n, i) => {
            const r = run.results[i];
            return <li key={n.label} title={n.label} className={cn("dyn-title flex h-7 items-center justify-center rounded-md border text-[11px] font-bold", r === "W" ? "border-[#e3c66f]/60 bg-[#e3c66f]/15 text-[#f2dc98]" : r === "L" ? "border-rose-400/50 bg-rose-400/10 text-rose-200" : "border-white/10 text-white/30")}>{r ?? "·"}<span className="sr-only"> {n.label}</span></li>;
          })}
        </ol>
        <Rule />
        <ul className={cn("grid gap-1.5 sm:grid-cols-5", motion && "dyn-stagger")}>
          {ROLES.map((r, i) => {
            const p = run.starters[r];
            return (
              <li key={r} style={{ "--i": i } as CSSProperties} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[12.5px] text-white/85 sm:flex-col sm:text-center">
                <Monogram p={p} size={34} />
                <span className="min-w-0 flex-1 sm:flex-none">
                  <span className="block truncate font-semibold text-white">{p.name.replace(/^SYN-/, "")}</span>
                  <span className="flex flex-wrap items-center gap-1 text-[10px] uppercase tracking-wider text-white/50 sm:justify-center">{ROLE_LABEL[r]}<KindRibbon kind={p.kind} /></span>
                  {p.traits.length ? <span className="block text-[10.5px] text-[#f2dc98]/80">{p.traits.join(", ")}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-white/45">Invented players and results. Only stored facts appear on a real legacy card.</p>
      </Plate>
      <div className="grid gap-2 sm:grid-cols-[1.3fr_1fr]">
        <CasterPop moment={champion ? "championship" : "run.defeat"} k={`${run.seed}|end`} ctx={{ team: run.org.name.replace(/^SYN /, "") }} compact />
        <ChatBurst moment={champion ? "championship" : "run.defeat"} k={`${run.seed}|end`} n={4} />
      </div>
    </Screen>
  );
}
