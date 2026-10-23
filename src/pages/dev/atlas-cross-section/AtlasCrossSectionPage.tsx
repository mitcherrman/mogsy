/**
 * ATL-CS-UX-001 — Atlas cross-section research table.
 *
 * OWNER ONLY. Registered in App.tsx at `/admin/atlas-cross-section` behind
 * the parent AdminRoute and at the DEV-only twin `/lol/dev/atlas-cross-section`.
 * All questions, counts and stat values come from the fixture adapter and are
 * labelled DEMO DATA. No network, no persistence beyond the URL.
 *
 * The table: axis A down the left, axis B (with its B.1 socket) across the
 * top, the intersection in the center. State lives in one reducer and is
 * mirrored to the URL so A/B/B.1 and filters persist through navigation:
 *
 *   ?a=champion:Ahri&b=champion:Syndra&b1=3157&view=questions&topic=mana
 *   &slot=Q&level=9&rank=3&collection=discovered&persona=account&motion=reduce
 */
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowLeftRight, Compass, FlaskConical, Grid2x2, Layers, ListChecks, Scale, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { APP_REDUCE_MOTION_CLASS, useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { createFixtureAdapter } from "@/lib/atlas-cross-section/fixtureAdapter";
import { DEMO_DATA_LABEL, FEATURED_INVESTIGATION, findSubject } from "@/lib/atlas-cross-section/fixtures";
import { INITIAL_STATE, availableViews, reduceCrossSection, relationshipLabel, relationshipOf, type CrossSectionAction, type CrossSectionState } from "@/lib/atlas-cross-section/query";
import { COLLECTIONS, DEFAULT_TOPIC_CATALOG, MAX_ABILITY_RANK, relationUnsupported, type AbilityRank, type AbilitySlot, type CenterView, type Collection, type CrossSectionAdapter, type CrossSectionResponse, type Persona, type SessionContext, type SubjectRef, type TopicId } from "@/lib/atlas-cross-section/types";
import { SubjectIcon } from "./icons";
import { SubjectRail } from "./SubjectRail";
import { AbilitiesView, CompareView, OverviewView, QuestionsView } from "./Views";
import { useAtlasViewport } from "../atlas-p1c/useAtlasViewport";
import "./atlas-cross-section.css";

const VIEWS: { id: CenterView; label: string; icon: typeof Compass }[] = [
  { id: "overview", label: "Overview", icon: Compass },
  { id: "abilities", label: "Abilities & stats", icon: Sparkles },
  { id: "questions", label: "Questions", icon: ListChecks },
  { id: "compare", label: "Compare", icon: Scale },
];

const PERSONAS: { id: Persona; label: string }[] = [
  { id: "anonymous", label: "Anonymous" },
  { id: "account", label: "Account" },
  { id: "premium", label: "Premium" },
  { id: "owner", label: "Owner" },
];

function parseSubject(raw: string | null): SubjectRef | null {
  if (!raw) return null;
  const [kind, id] = raw.split(":");
  if ((kind === "champion" || kind === "item") && id && findSubject({ kind, id })) return { kind, id };
  return null;
}

function stateFromParams(params: URLSearchParams): CrossSectionState {
  const a = parseSubject(params.get("a"));
  const b = parseSubject(params.get("b"));
  const b1 = params.get("b1");
  const topics = params.getAll("topic").filter((t): t is TopicId => DEFAULT_TOPIC_CATALOG.some((c) => c.id === t));
  const slotRaw = params.get("slot");
  const slot = slotRaw && ["P", "Q", "W", "E", "R"].includes(slotRaw) ? (slotRaw as AbilitySlot) : null;
  const level = params.get("level") ? Number(params.get("level")) : null;
  const rankRaw = params.get("rank");
  const rankNumber = rankRaw && rankRaw !== "max" ? Number(rankRaw) : null;
  const rank: AbilityRank | null = rankRaw === "max" ? "max" : rankNumber !== null && Number.isInteger(rankNumber) && rankNumber >= 1 && rankNumber <= MAX_ABILITY_RANK ? rankNumber : null;
  const collectionRaw = params.get("collection");
  const collection = collectionRaw && (COLLECTIONS as readonly string[]).includes(collectionRaw) ? (collectionRaw as Collection) : "catalog";
  const viewRaw = params.get("view");
  const view = viewRaw && ["overview", "abilities", "questions", "compare"].includes(viewRaw) ? (viewRaw as CenterView) : undefined;
  return reduceCrossSection(INITIAL_STATE, {
    type: "load",
    state: { a, b, b1ItemId: b?.kind === "champion" && b1 && findSubject({ kind: "item", id: b1 }) ? b1 : null, topics, abilitySlot: slot, championLevel: Number.isFinite(level) ? level : null, abilityRank: rank, collection, view },
  });
}

function paramsFromState(state: CrossSectionState, persona: Persona, keep: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams();
  const q = state.query;
  if (q.a) p.set("a", `${q.a.kind}:${q.a.id}`);
  if (q.b) p.set("b", `${q.b.kind}:${q.b.id}`);
  if (q.b1ItemId) p.set("b1", q.b1ItemId);
  if (state.view !== "overview") p.set("view", state.view);
  for (const t of q.topics) p.append("topic", t);
  if (q.abilitySlot) p.set("slot", q.abilitySlot);
  if (q.championLevel !== null) p.set("level", String(q.championLevel));
  if (q.abilityRank !== null) p.set("rank", String(q.abilityRank));
  if (q.collection !== "catalog") p.set("collection", q.collection);
  if (persona !== "owner") p.set("persona", persona);
  if (keep.get("motion")) p.set("motion", keep.get("motion")!);
  return p;
}

export interface AtlasCrossSectionPageProps {
  adapter?: CrossSectionAdapter;
}

export default function AtlasCrossSectionPage({ adapter: adapterProp }: AtlasCrossSectionPageProps) {
  const [params, setParams] = useSearchParams();
  const adapter = useMemo(() => adapterProp ?? createFixtureAdapter({ latencyMs: 120 }), [adapterProp]);
  const [state, dispatchRaw] = useReducer(reduceCrossSection, params, stateFromParams);
  const personaRaw = params.get("persona");
  const [persona, setPersona] = useState<Persona>(personaRaw && ["anonymous", "account", "premium", "owner"].includes(personaRaw) ? (personaRaw as Persona) : "owner");
  const [premiumLookup, setPremiumLookup] = useState<SessionContext["premiumLookup"]>("ok");
  const [response, setResponse] = useState<CrossSectionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const requestSeq = useRef(0);
  const forceReduce = params.get("motion") === "reduce";
  const reduced = useReducedMotionPreference() || forceReduce;
  const { viewport, short } = useAtlasViewport();
  const compact = viewport === "phone" || short;
  const rel = relationshipOf(state.query);
  const views = availableViews(state.query);

  useEffect(() => {
    if (!forceReduce) return;
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    return () => document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
  }, [forceReduce]);

  useEffect(() => {
    const previous = document.title;
    document.title = "Atlas · cross-section";
    return () => {
      document.title = previous;
    };
  }, []);

  const announceSeq = useRef(0);
  // A trailing marker alternates so identical sentences still re-announce.
  const announce = useCallback((text: string) => {
    announceSeq.current += 1;
    setAnnouncement(`${text}${announceSeq.current % 2 ? "" : " "}`);
  }, []);

  const dispatch = useCallback(
    (action: CrossSectionAction) => {
      dispatchRaw(action);
      switch (action.type) {
        case "setA":
          announce(action.subject ? `Axis A: ${findSubject(action.subject)?.name}.` : "Axis A cleared.");
          break;
        case "setB":
          announce(action.subject ? `Axis B: ${findSubject(action.subject)?.name}.` : "Axis B cleared.");
          break;
        case "setB1":
          announce(action.itemId ? `B.1: ${findSubject({ kind: "item", id: action.itemId })?.name} equipped on B.` : "B.1 item removed.");
          break;
        case "swap":
          announce("Axes swapped.");
          break;
        case "setView":
          announce(`${VIEWS.find((v) => v.id === action.view)?.label} view.`);
          break;
        default:
          break;
      }
    },
    [announce],
  );

  // Invalidation sentences come from the reducer; speak them once.
  useEffect(() => {
    if (state.lastInvalidation) announce(state.lastInvalidation);
  }, [state.lastInvalidation, announce]);

  // URL mirror: replace, never push, so Back leaves the admin area cleanly.
  useEffect(() => {
    const next = paramsFromState(state, persona, params);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, persona]);

  // Adapter call: every semantic change re-queries; stale answers are dropped.
  useEffect(() => {
    if (rel.kind === "none") {
      setResponse(null);
      return;
    }
    const seq = ++requestSeq.current;
    setLoading(true);
    setRequestFailed(false);
    adapter.search(state.query, { persona, premiumLookup }).then(
      (res) => {
        if (seq !== requestSeq.current) return;
        setResponse(res);
        setLoading(false);
      },
      () => {
        // A rejected or invalid answer is "unavailable", never an empty result.
        if (seq !== requestSeq.current) return;
        setResponse(null);
        setRequestFailed(true);
        setLoading(false);
      },
    );
  }, [adapter, state.query, persona, premiumLookup, rel.kind]);

  const loadFeatured = () => {
    dispatchRaw({ type: "load", state: { a: FEATURED_INVESTIGATION.a, b: FEATURED_INVESTIGATION.b, b1ItemId: FEATURED_INVESTIGATION.b1ItemId, topics: FEATURED_INVESTIGATION.topics, view: "questions" } });
    announce("Featured demo investigation loaded: Ahri against Syndra holding Zhonya's Hourglass, mana questions.");
  };

  const a = findSubject(state.query.a);
  const b = findSubject(state.query.b);
  const b1 = state.query.b1ItemId ? findSubject({ kind: "item", id: state.query.b1ItemId }) : null;
  const unsupportedPair = rel.kind === "pair" && relationUnsupported(response);
  const viewProps = { state, dispatch, response, loading, persona, compact };

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <div className="acs" data-reduced={reduced} data-viewport={viewport} data-compact={compact} data-testid="acs-root">
        <header className="acs__bar">
          <span className="acs__wordmark">
            <Layers size={15} aria-hidden="true" /> ATLAS <small>cross-section</small>
          </span>
          <span className="acs-seal">{DEMO_DATA_LABEL}</span>
          <span className="acs__spacer" />
          <label className="acs__persona">
            <span className="acs-eyebrow">Preview as</span>
            <select className="acs-select" value={persona} aria-label="Preview the collections as a demo persona" onChange={(e) => setPersona(e.target.value as Persona)}>
              {PERSONAS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="acs-btn acs-btn--ghost acs-btn--sm" aria-pressed={premiumLookup === "unavailable"} onClick={() => setPremiumLookup((v) => (v === "ok" ? "unavailable" : "ok"))} title="Simulate the Premium entitlement lookup being unreachable (DEMO)">
            <FlaskConical size={13} aria-hidden="true" /> {compact ? "503" : "Premium lookup 503"}
          </button>
        </header>

        <div className="acs__table">
          <div className="acs__corner" aria-hidden="true">
            <Grid2x2 size={16} />
          </div>
          <div className="acs__b">
            <SubjectRail axis="B" orientation="horizontal" value={state.query.b} onChange={(s) => dispatch({ type: "setB", subject: s })} b1ItemId={state.query.b1ItemId} onB1Change={(id) => dispatch({ type: "setB1", itemId: id })} compact={compact} />
          </div>
          <div className="acs__a">
            <SubjectRail axis="A" orientation="vertical" value={state.query.a} onChange={(s) => dispatch({ type: "setA", subject: s })} compact={compact} />
          </div>

          <main className="acs__center" aria-label="Intersection">
            <AnimatePresence initial={false} mode="wait">
              {rel.kind === "none" ? (
                <motion.section key="empty" className="acs-empty-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0.1 : 0.22 }}>
                  <h2>Pick a subject on either axis</h2>
                  <p>A down the left, B across the top. One subject inspects itself; two meet in the middle. Attach one item to B with the B.1 socket.</p>
                  <div className="acs-empty-stage__actions">
                    <button type="button" className="acs-btn acs-btn--primary" onClick={() => dispatch({ type: "setA", subject: { kind: "champion", id: "Ahri" } })}>
                      Start with Ahri
                    </button>
                    <button type="button" className="acs-btn" onClick={loadFeatured}>
                      <Sparkles size={14} aria-hidden="true" /> {FEATURED_INVESTIGATION.label}
                    </button>
                  </div>
                  <p className="acs-why">{FEATURED_INVESTIGATION.description} Every number is {DEMO_DATA_LABEL}.</p>
                </motion.section>
              ) : (
                <motion.div key="table" className="acs-center" initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0.1 : 0.24 }}>
                  <header className="acs-center__head">
                    <div className="acs-center__subjects">
                      {a ? (
                        <span className="acs-subject" data-axis="A">
                          <SubjectIcon subject={{ kind: a.kind, id: a.id }} size={compact ? "md" : "lg"} />
                          <span className="acs-subject__name"><span className="acs-eyebrow">A</span>{a.name}</span>
                        </span>
                      ) : (
                        <span className="acs-subject acs-subject--empty" data-axis="A"><span className="acs-eyebrow">A</span><span>none</span></span>
                      )}
                      <button type="button" className="acs-btn acs-btn--icon acs-swap" aria-label="Swap A and B" onClick={() => dispatch({ type: "swap" })} disabled={!a && !b}>
                        <ArrowLeftRight size={15} aria-hidden="true" />
                      </button>
                      {b ? (
                        <span className="acs-subject" data-axis="B">
                          <SubjectIcon subject={{ kind: b.kind, id: b.id }} size={compact ? "md" : "lg"} />
                          <span className="acs-subject__name"><span className="acs-eyebrow">B</span>{b.name}</span>
                          {b1 ? (
                            <span className="acs-subject__b1" aria-label={`B.1: ${b1.name}`} title={`B.1: ${b.name} equips ${b1.name}`}>
                              <SubjectIcon subject={{ kind: "item", id: b1.id }} size="sm" decorative />
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="acs-subject acs-subject--empty" data-axis="B"><span className="acs-eyebrow">B</span><span>none</span></span>
                      )}
                    </div>
                    <div className="acs-center__meta">
                      <span className="acs-chip acs-chip--gold">{relationshipLabel(rel)}</span>
                      {b1 ? <span className="acs-chip">{b?.name} + {b1.name}</span> : null}
                      {unsupportedPair ? <span className="acs-chip acs-chip--rose">no certified relation</span> : null}
                      {loading ? <span className="acs-chip acs-chip--quiet" role="status">loading…</span> : null}
                      {requestFailed ? <span className="acs-chip acs-chip--rose" role="alert">Question index unavailable</span> : null}
                    </div>
                  </header>

                  <nav className="acs-tabs" aria-label="Center view">
                    {VIEWS.map((v) => {
                      const Icon = v.icon;
                      const enabled = views.includes(v.id);
                      return (
                        <button key={v.id} type="button" className="acs-tab" aria-current={state.view === v.id ? "page" : undefined} disabled={!enabled} title={!enabled ? "Compare needs a subject on both axes" : undefined} onClick={() => dispatch({ type: "setView", view: v.id })}>
                          <Icon size={15} aria-hidden="true" />
                          <span>{v.label}</span>
                        </button>
                      );
                    })}
                  </nav>

                  <AnimatePresence initial={false} mode="wait">
                    <motion.div key={state.view} initial={{ opacity: 0, y: reduced ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -4 }} transition={{ duration: reduced ? 0.1 : 0.2 }}>
                      {state.view === "overview" ? <OverviewView {...viewProps} /> : null}
                      {state.view === "abilities" ? <AbilitiesView {...viewProps} /> : null}
                      {state.view === "questions" ? <QuestionsView {...viewProps} /> : null}
                      {state.view === "compare" ? <CompareView {...viewProps} /> : null}
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>

        <div className="acs-sr" role="status" aria-live="polite" aria-atomic="true" data-testid="acs-live">
          {announcement}
        </div>
      </div>
    </MotionConfig>
  );
}
