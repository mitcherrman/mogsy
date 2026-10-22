/**
 * UX-7 — the Worlds Dynasty campaign journey (`/dev/dynasty-v2?view=campaign`).
 *
 * The run is the live E3B campaign (`LiveCampaignClient`); every BO5 inside it
 * is the UX-6 management series, played by the unchanged `Bo5Flow` through a
 * transport pinned to the campaign's open series. The screen is chosen from
 * the campaign `phase` (and the open series' phase), never from local rules:
 *
 *   no run         → start (organization branding, qualification policy) or pick among several
 *   series         → headquarters: the window (prep days, condition, opponent, stakes, map,
 *                    story) → the BO5; refresh inside a started BO5 re-enters it
 *   series_result  → the series is over and unrecorded: one click records it (`settle_series`)
 *   after a settle → the transition (what was decided, exactly what carried), then headquarters
 *   completed      → the ending: championship (trophy) or elimination, with the legacy recap
 *   abandoned      → the ending, owner-abandoned
 *
 * Local state is presentation only: which org crest to wear, whether the BO5 is on
 * screen, and device-local "seen" marks for one-time cinematics.
 */
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { browserStore } from "@/lib/dynasty/e1/fixtureServer";
import { STAGE_IDENTITY, STAGE_TITLE, oppShort, type CampaignPolicy, type CampaignSnapshot } from "@/lib/dynasty/e1/campaignContracts";
import { CampaignSeriesTransport, LiveCampaignClient } from "@/lib/dynasty/e1/campaignTransport";
import { useDynastyCampaign, type DynastyCampaign } from "@/lib/dynasty/e1/useDynastyCampaign";
import { cn } from "@/lib/utils";
import { installDynastyAudioUnlock, playMoment } from "../audio";
import { AmbienceButton } from "../ambience";
import { SimTag, useStinger } from "../broadcast";
import { FullFrame } from "../cinematics";
import type { EnvState } from "../environments";
import { ORGS } from "../fixtures";
import { Btn, Crest, Eyebrow, ORG_ACCENT, PLATE, Plate, Rule, Screen, accentStyle } from "../parts";
import { Scene } from "../scenes";
import { OrgScreen } from "../screens";
import { Bo5Flow, type Bo5CampaignFrame } from "../bo5/Bo5Flow";
import { readBrand, writeBrand } from "../bo5/brand";
import { ROLE_ORDER } from "../bo5/present";
import { AbandonControl, CampaignBanner, CampaignMap, CampaignStory, HistoryList, LegacyRecap, OpponentCard, RosterCondition, StakesPlate, StandingLine, TransitionPanel, WindowPanel } from "./CampaignParts";
import { historyOf, isFinalRound, lastFive, markSeen, seen, stageNow } from "./campaignView";

const POLICIES: { id: CampaignPolicy; title: string }[] = [
  { id: "broad_mid_win", title: "Broad (Mid win)" },
  { id: "narrow_early_mid_combo", title: "Narrow (Early + Mid)" },
];
const policyParam = (): CampaignPolicy => { try { return new URLSearchParams(window.location.search).get("policy") === "narrow_early_mid_combo" ? "narrow_early_mid_combo" : "broad_mid_win"; } catch { return "broad_mid_win"; } };

function ErrorPanel({ c }: { c: DynastyCampaign }) {
  if (!c.error && !c.notice) return null;
  return (
    <div role="alert" data-testid="campaign-error" data-code={c.error?.code ?? "notice"} className={cn(PLATE, "flex flex-wrap items-center gap-2 border-rose-400/40 px-3 py-2 text-[13px]", !c.error && "border-sky-300/30")}>
      <span className="min-w-0 flex-1 text-white/85">{c.error ? (c.error.code === "SCHEMA_MISSING" ? "The campaign tables are not set up on this backend (owner-gated migration)." : c.error.code === "AUTH" ? "Owner sign-in required." : c.error.message) : c.notice}</span>
      {c.error?.retryable ? <Btn primary testId="campaign-retry" disabled={!!c.busy} className="min-h-[36px] px-3 py-1 text-xs" onClick={() => void c.retry()}>Retry</Btn> : null}
      {c.error && !c.error.retryable ? <Btn testId="campaign-reload" disabled={!!c.busy} className="min-h-[36px] px-3 py-1 text-xs" onClick={() => void c.reload()}>Reload the run</Btn> : null}
      {!c.error && c.notice ? <Btn testId="campaign-notice-ok" className="min-h-[36px] px-3 py-1 text-xs" onClick={c.clearNotice}>OK</Btn> : null}
    </div>
  );
}

type View = "auto" | "hq" | "series";

export function CampaignFlow({ client }: { client?: LiveCampaignClient }) {
  const cl = useMemo(() => client ?? new LiveCampaignClient(), [client]);
  const c = useDynastyCampaign(cl);
  const sting = useStinger();
  const [brand, setBrand] = useState<string | null>(() => readBrand());
  const [picking, setPicking] = useState(false);
  const [startNew, setStartNew] = useState(false);
  const [policy, setPolicy] = useState<CampaignPolicy>(() => policyParam());
  /** "auto": the BO5 is entered by itself only when the open series is already under way (a refresh mid-series) */
  const [view, setView] = useState<View>("auto");
  /** bumps when a one-time mark is stored, so the screen re-reads it */
  const [, setTick] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  const run = c.campaign;
  const org = ORGS.find((o) => o.id === brand) ?? ORGS[0];
  const cs = run?.current_series ?? null;
  const t = run?.last_transition ?? null;

  useEffect(() => installDynastyAudioUnlock(), []);
  const mark = useCallback((m: string) => { if (run) { markSeen(run.campaign_id, m); setTick((x) => x + 1); } }, [run]);

  const transitionPending = !!run && !!t && !seen(run.campaign_id, `t${t.from_series}`) && (run.phase === "series" ? cs?.series.phase === "preparation" : run.phase === "completed");
  // The BO5 is on screen when asked for, or by itself only when a refresh lands inside a started series.
  const inSeries = !!run && !!cs && (run.phase === "series" || run.phase === "series_result") && (view === "series" || (view === "auto" && run.phase === "series" && cs.series.phase !== "preparation"));

  const screen = c.loading && !run ? "loading"
    : !run ? (c.choices ? "pick" : picking ? "org" : "start")
    : transitionPending ? "transition"
    : run.phase === "series" ? (inSeries ? "series" : "hq")
    : run.phase === "series_result" ? (inSeries ? "series" : "result")
    : "ending";

  useEffect(() => {
    if (screen === "series") return;
    window.scrollTo?.(0, 0);
    mainRef.current?.querySelector<HTMLElement>("h2[tabindex]")?.focus({ preventScroll: true });
  }, [screen, run?.seq]);

  // A stage change announced once (from the settlement's decision, never derived).
  const stage = run ? stageNow(run) : "regular";
  const prevStage = useRef<string | null>(null);
  useEffect(() => {
    if (!run) { prevStage.current = null; return; }
    if (prevStage.current && prevStage.current !== stage && run.status === "active") sting({ id: `stage.${stage}`, kicker: "The run moves on", title: STAGE_TITLE[stage], sub: cs?.round_title, tone: stage === "worlds" ? "violet" : stage === "playoffs" ? "ember" : "ice", ms: 2400, cue: "dynasty.season.segment" });
    prevStage.current = stage;
  }, [stage, run, cs?.round_title, sting]);

  const seriesTransport = useMemo(() => (cs ? new CampaignSeriesTransport(cs.series_id, { store: browserStore(), qualificationPolicy: run?.pins.qualification_policy as CampaignPolicy }) : null), [cs?.series_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const recordResult = useCallback(async () => {
    const out = await c.settle();
    if (out) setView("hq");
  }, [c]);

  const frame: Bo5CampaignFrame | null = run && cs ? {
    label: `${cs.round_title}${cs.elimination_if_lost ? " · must win" : ""} · vs ${oppShort(cs.opponent.name)}`,
    banner: <div className="flex flex-col gap-2"><CampaignBanner c={run} compact /><ErrorPanel c={c} /></div>,
    onExit: () => { setView("hq"); void c.refresh(); },
    onSeriesDone: () => void recordResult(),
    busy: c.busy === "settle" || c.busy === "refresh",
  } : null;

  const accent = ORG_ACCENT[org.id]?.hex;
  const id = STAGE_IDENTITY[stage];
  const env: EnvState = {
    accent, mono: ORG_ACCENT[org.id]?.mono, team: org.name, opp: run?.next_opponent?.name ?? run?.ending?.opponent?.name,
    roster: ROLE_ORDER.map((r) => {
      const p = run?.roster?.players.find((x) => x.role === r && x.core);
      return { name: p?.name ?? `SYN t_user-${r}`, role: r, kind: "signed" as const };
    }),
    results: run?.history.slice(-5).map((h) => (h.result === "won" ? "W" as const : "L" as const)),
    cohesion: run?.roster ? Math.max(0, Math.min(5, Math.round((run.roster.cohesion - 0.3) * 10))) : undefined,
    mood: stage === "worlds" ? "worlds" : run?.history.length ? (run.history[run.history.length - 1].result === "won" ? "win" : "loss") : "neutral",
  };

  // ── the BO5 itself: UX-6, unchanged, inside the campaign frame
  if (screen === "series" && run && cs && seriesTransport && frame) {
    return <div style={{ ...accentStyle(org.id), ["--dyn-stage" as string]: id.accent }} data-testid="dynasty-campaign" data-screen="series" data-phase={run.phase} data-seq={run.seq} data-stage={stage} data-series={cs.series_index} data-series-id={cs.series_id}>
      <Bo5Flow key={cs.series_id} transport={seriesTransport} campaign={frame} />
    </div>;
  }

  let body: ReactNode = null;
  /** full-frame cinematics render at the page root (a transformed screen would trap `position: fixed`) */
  let cine: ReactNode = null;
  let sceneId: "hq" | "warroom" | "backstage" | "trophy" | "tunnel" = "hq";
  if (screen === "loading") {
    body = <Plate className="p-4" testId="campaign-loading"><p className="text-sm text-white/70" role="status">Connecting to the campaign…</p></Plate>;
  } else if (screen === "start") {
    body = (
      <Screen testId="campaign-start" eyebrow="Worlds Dynasty · the campaign" title="From the regional split to Worlds" hero
        kicker="Eight best-of-fives at most, played and decided by the server. Your squad carries everything from series to series: fatigue, cohesion, practised champions and form."
        actions={<Btn primary beckon testId="campaign-begin" disabled={!!c.busy} onClick={() => setPicking(true)}>Begin a run</Btn>}>
        <Plate ornate className="flex flex-col gap-2 p-4 text-sm text-white/80">
          <p><b className="text-white">Regional split.</b> Three series; two wins qualify. A 3–0 split earns a bye past the playoff semifinal.</p>
          <p><b className="text-white">Regional playoffs.</b> Knockout: the semifinal is a rematch with the first split team that beat you, then the regional final.</p>
          <p><b className="text-white">Worlds.</b> Quarterfinal, semifinal, final. Any loss ends the run.</p>
          <p className="text-[12px] text-white/50">The format, opponents and numbers are the server's provisional E3B values (synthetic, uncalibrated).</p>
        </Plate>
        <Plate className="flex flex-col gap-2 p-3" testId="policy-choice">
          <div className="flex items-center gap-2"><Eyebrow>Baron qualification policy</Eyebrow><SimTag>Owner decision pending</SimTag></div>
          <p className="text-[12px] text-white/60">Required by the server and pinned for the whole run. A three-question Baron appears only when the server qualifies it.</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Qualification policy">
            {POLICIES.map((p) => <button key={p.id} type="button" role="radio" aria-checked={policy === p.id} data-testid={`policy-${p.id}`} onClick={() => setPolicy(p.id)}
              className={cn("min-h-[40px] rounded-lg border px-3 text-[12.5px]", policy === p.id ? "border-[#e3c66f]/70 bg-[#e3c66f]/15 text-white" : "border-white/15 text-white/70 hover:border-white/30")}>{p.title}</button>)}
          </div>
        </Plate>
        <PastRuns c={c} />
      </Screen>
    );
  } else if (screen === "org") {
    body = (
      <div className="flex flex-col gap-2">
        <p className="text-[12px] text-white/55" data-testid="org-branding-note">Organization = your broadcast identity (crest, colours, name). The squad is the server's synthetic ten whichever you pick.</p>
        <OrgScreen onChoose={async (o) => {
          setBrand(o.id); writeBrand(o.id);
          const out = await c.start(policy, startNew ? "create" : "refuse");
          setPicking(false); setStartNew(false);
          if (out) sting({ id: "run.start", kicker: "A new run", title: o.name.replace(/^SYN /, ""), sub: out.current_series?.round_title, tone: "gold", cue: "dynasty.org.choose" });
        }} />
      </div>
    );
  } else if (screen === "pick" && c.choices) {
    body = (
      <Screen testId="campaign-pick" eyebrow="Worlds Dynasty · the campaign" title="Resume a run"
        kicker={`The server holds ${c.choices.length} active runs for you. Pick one; none is resumed automatically.`}
        actions={<Btn testId="campaign-new" disabled={!!c.busy} onClick={() => { c.dismissChoices(); setStartNew(true); setPicking(true); }}>Start a new run</Btn>}>
        <ol className="flex flex-col gap-2" data-testid="campaign-choices">
          {c.choices.map((r) => (
            <li key={r.campaign_id}>
              <button type="button" data-testid="campaign-choice" data-campaign={r.campaign_id} disabled={!!c.busy} onClick={() => void c.pick(r.campaign_id)}
                className={cn(PLATE, "flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left transition-colors hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]")}>
                <b className="dyn-title text-[15px] text-white">{r.current_series ? `Series ${r.current_series.series_index}` : r.phase}</b>
                <span className="text-[12.5px] text-white/70">{r.current_series?.round ?? ""}{r.phase === "series_result" ? " · result to record" : r.current_series ? ` · ${r.current_series.series_phase}` : ""}</span>
                <span className="dyn-num text-[12px] text-white/60">Split {r.standing.regular?.[0] ?? 0}–{r.standing.regular?.[1] ?? 0}</span>
                <span className="ml-auto text-[11px] text-white/50">{new Date(r.updated_at).toLocaleString()}</span>
                <code className="w-full truncate text-[10.5px] text-white/40">{r.campaign_id} · {r.qualification_policy}</code>
              </button>
            </li>
          ))}
        </ol>
        <PastRuns c={c} />
      </Screen>
    );
  } else if (screen === "transition" && run && t) {
    const h = historyOf(run, t.from_series);
    const won = t.result === "won";
    sceneId = won ? "hq" : "backstage";
    body = (
      <Screen testId="campaign-transition" eyebrow={`Series ${t.from_series} recorded · ${h?.round_title ?? ""}`} title={`${won ? "Won" : "Lost"} ${t.score.you}–${t.score.opponent}${h ? ` against ${oppShort(h.opponent.name)}` : ""}`} hero={won}
        kicker={t.decided.kind === "ending" ? "The settlement decided the run." : "Recorded once on the campaign; the next checkpoint is open."}
        actions={<Btn primary beckon testId="transition-next" onClick={() => mark(`t${t.from_series}`)}>{t.decided.kind === "ending" ? "To the ending" : "Into headquarters"}</Btn>}>
        <CampaignStory c={run} id={`beats-t${t.from_series}`} title="The story so far" accent={id.accent} tone={id.tone}
          beats={run.story.beats.filter((b) => b.series_index === t.from_series || b.kind === "rematch" || b.kind === "fatigue_building")} />
        <TransitionPanel c={run} t={t} />
        <CampaignMap c={run} />
      </Screen>
    );
  } else if (screen === "hq" && run && cs) {
    const w = run.between_series;
    const final = isFinalRound(run);
    const started = cs.series.phase !== "preparation";
    sceneId = "hq";
    if (final && !seen(run.campaign_id, `finals${cs.series_index}`)) cine = <FullFrame key={`finals${cs.series_index}`} kind="finals_intro" org={org} team={org.name.replace(/^SYN /, "")} opp={cs.opponent.name} cue="dyn.series.finals_intro" detail={`Best of ${run.format.best_of} · series ${cs.series_index} of this run`} onDone={() => mark(`finals${cs.series_index}`)} />;
    body = (
      <Screen testId="campaign-hq" eyebrow={`Headquarters · ${STAGE_TITLE[cs.stage]}`} title={started ? `${cs.round_title} in progress` : `Preparing for ${cs.round_title}`}
        kicker={<>Series {cs.series_index} · vs <b className="text-white/85">{oppShort(cs.opponent.name)}</b>{started ? <> · {cs.series.score.you}–{cs.series.score.opponent} after {cs.series.games_played} game{cs.series.games_played === 1 ? "" : "s"}</> : null}</>}
        actions={<>
          {c.busy ? <span className="text-[11px] text-white/50" role="status">Talking to the server…</span> : null}
          <Btn primary beckon testId="hq-enter" onClick={() => setView("series")}>{started ? "Back to the series" : w ? `Plan the ${w.slots} days` : "To the series"}</Btn>
        </>}>
        <StakesPlate c={run} />
        <CampaignStory c={run} id={`beats-s${cs.series_index}`} title={final ? "Before the Worlds final" : "Before this series"} accent={id.accent} tone={id.tone}
          beats={run.story.beats.filter((b) => b.kind !== "previous_series" || cs.series_index - 1 === b.series_index)} />
        <div className="grid gap-3 md:grid-cols-2">
          <OpponentCard c={run} o={cs.opponent} />
          <RosterCondition c={run} compact />
        </div>
        {w && !started ? <WindowPanel w={w} action={<Btn testId="window-plan" onClick={() => setView("series")}>Open the practice room</Btn>} /> : null}
        <CampaignMap c={run} />
        <HistoryList c={run} limit={3} />
        <Rule />
        <div className="flex flex-wrap items-center gap-3">
          <AbandonControl busy={!!c.busy} onAbandon={() => void c.abandon()} />
          <button type="button" data-testid="hq-switch" onClick={() => { setView("auto"); c.close(); }} className="min-h-[36px] text-[11.5px] text-white/45 underline-offset-2 hover:text-white/70 hover:underline">Other runs</button>
        </div>
      </Screen>
    );
  } else if (screen === "result" && run && cs) {
    const won = cs.series.score.you > cs.series.score.opponent;
    sceneId = "backstage";
    body = (
      <Screen testId="campaign-result" eyebrow={`${cs.round_title} · series over`} title={`${cs.series.score.you}–${cs.series.score.opponent} against ${oppShort(cs.opponent.name)}`} hero={won}
        kicker="The series is complete on the server. Recording it carries your squad into the next checkpoint (or decides the run)."
        actions={<Btn primary beckon testId="result-record" disabled={!!c.busy} onClick={() => void recordResult()}>{c.busy === "settle" ? "Recording…" : "Record the result"}</Btn>}>
        <StakesPlate c={run} />
        <RosterCondition c={run} compact />
        <Btn testId="result-review" className="self-start" onClick={() => setView("series")}>Review the series</Btn>
      </Screen>
    );
  } else if (screen === "ending" && run && run.ending) {
    const e = run.ending;
    const champ = e.kind === "champion";
    const last = historyOf(run, e.series_index);
    sceneId = champ ? "trophy" : e.kind === "abandoned" ? "hq" : "backstage";
    if (champ && !seen(run.campaign_id, "trophy")) cine = <FullFrame key="trophy" kind="championship" org={org} team={org.name.replace(/^SYN /, "")} roster={lastFive(run, last)} score={last ? `${last.score.you}–${last.score.opponent}` : undefined} cue="dyn.end.championship" onDone={() => mark("trophy")} />;
    body = (
      <Screen testId="campaign-ending" eyebrow={`The run is over · ${e.round_title}`} title={e.placement ?? (e.kind === "abandoned" ? "Run abandoned" : "Eliminated")} hero
        kicker={e.text}
        actions={<Btn primary beckon testId="ending-new" disabled={!!c.busy} onClick={() => { setView("auto"); setStartNew(true); c.close(); }}>Start a new run</Btn>}>
        {e.kind === "eliminated" ? <DefeatCue id={run.campaign_id} /> : null}
        <Plate ornate className="flex flex-wrap items-center gap-3 p-3" testId="ending-card" data-kind={e.kind}>
          <Crest org={org} size={48} />
          <div className="min-w-0 flex-1">
            <p className="dyn-title text-[18px] font-semibold text-white">{org.name.replace(/^SYN /, "")} · {e.placement ?? "Abandoned"}</p>
            <p className="text-[12px] text-white/60">{e.opponent ? `${champ ? "Final" : "Last"} opponent: ${oppShort(e.opponent.name)}` : ""}{last ? ` · ${last.score.you}–${last.score.opponent}` : ""}</p>
          </div>
          <SimTag>Synthetic run</SimTag>
        </Plate>
        <CampaignStory c={run} id={`beats-end`} title={champ ? "How the title was won" : "How the run ended"} accent={champ ? "#e3c66f" : id.accent} tone={champ ? "gold" : "cold"}
          beats={run.story.beats} />
        <CampaignMap c={run} />
        <LegacyRecap c={run} e={e} />
      </Screen>
    );
  }

  return (
    <div className="dyn min-h-screen pt-11" data-testid="dynasty-campaign" data-screen={screen} data-phase={run?.phase ?? "none"} data-seq={run?.seq ?? -1} data-stage={stage} style={{ ...accentStyle(org.id), ["--dyn-stage" as string]: id.accent }}>
      {run ? (
        <div className="sticky top-11 z-20 border-b border-white/10 bg-[#07111f]/90 backdrop-blur" data-testid="campaign-bar">
          <div className="mx-auto flex h-11 max-w-4xl items-center gap-2.5 px-4 text-xs">
            <Crest org={org} size={26} />
            <span className={cn("truncate text-[10.5px] font-bold uppercase tracking-[0.16em]", id.ink)} data-testid="campaign-bar-stage">{STAGE_TITLE[stage]}</span>
            <span className="hidden sm:inline"><StandingLine c={run} stage={stage} /></span>
            <span className="ml-auto whitespace-nowrap text-white/60" data-testid="campaign-bar-series">Series {cs?.series_index ?? run.ending?.series_played ?? run.history.length}</span>
            <AmbienceButton />
          </div>
        </div>
      ) : <div className="fixed right-3 top-[3.25rem] z-20"><AmbienceButton /></div>}
      <main ref={mainRef} className="mx-auto flex max-w-4xl flex-col gap-4 px-4 pb-8 pt-4" data-testid="dynasty-campaign-main">
        <CampaignBanner c={run} />
        <ErrorPanel c={c} />
        <Scene id={sceneId} caption env={env} champion={screen === "ending" && run?.ending?.kind === "champion"} variant={stage === "worlds" ? "finals" : stage === "playoffs" ? "elimination" : "normal"}>
          <ScreenBoundary key={`${screen}|${run?.seq ?? -1}`} onReload={() => void c.reload()}>{body}</ScreenBoundary>
        </Scene>
      </main>
      {cine}
    </div>
  );
}

/** A screen that cannot be drawn from the served data says so and offers a reload, instead of blanking the route. */
class ScreenBoundary extends Component<{ children: ReactNode; onReload: () => void }, { failed: string | null }> {
  state = { failed: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { failed: e instanceof Error ? e.message : String(e) }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Plate className="flex flex-col gap-2 p-4" testId="campaign-draw-error">
        <p className="text-sm text-white/80">This screen could not be drawn from the server's campaign data. Nothing was changed on the server.</p>
        <code className="text-[11px] text-white/45">{this.state.failed}</code>
        <Btn primary testId="campaign-draw-reload" className="self-start" onClick={() => { this.setState({ failed: null }); this.props.onReload(); }}>Reload the run</Btn>
      </Plate>
    );
  }
}

/** Finished runs (the legacy shelf): each opens its ending, read from the server. */
function PastRuns({ c }: { c: DynastyCampaign }) {
  if (!c.finished.length) return null;
  return (
    <Plate className="flex flex-col gap-1.5 p-3" testId="past-runs">
      <Eyebrow>Past runs</Eyebrow>
      <ul className="flex flex-col gap-1">
        {c.finished.slice(0, 8).map((r) => (
          <li key={r.campaign_id}>
            <button type="button" data-testid="past-run" data-campaign={r.campaign_id} data-ending={r.ending ?? ""} disabled={!!c.busy} onClick={() => void c.pick(r.campaign_id)}
              className="flex min-h-[40px] w-full flex-wrap items-center gap-2 rounded-lg border border-white/10 px-2.5 text-left text-[12px] text-white/70 hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]">
              <b className="text-white">{r.placement ?? (r.ending === "abandoned" ? "Abandoned" : r.ending)}</b><span>{r.series_played} series</span>
              <span className="ml-auto text-[11px] text-white/45">{new Date(r.updated_at).toLocaleDateString()}</span>
            </button>
          </li>
        ))}
      </ul>
    </Plate>
  );
}

/** The defeat sting, once per run (presentation only). */
function DefeatCue({ id }: { id: string }) {
  useEffect(() => { if (!seen(id, "defeat")) { markSeen(id, "defeat"); playMoment("dyn.end.defeat"); } }, [id]);
  return null;
}
