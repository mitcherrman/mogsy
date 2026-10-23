/**
 * ATL-CS-UX-001 — the four center views.
 *
 * Overview: who is on the table and what the index knows about them.
 * Abilities & stats: level 1–18, slot and rank, per-rank sheets (DEMO).
 * Questions: collection, facets, truthful state panel, results, B.1 related.
 * Compare: side-by-side on shared units only; champion × item is an
 * equipment association, never a combat prediction.
 */
import { ChevronRight, Lock, LockOpen, Minus, Plus, RotateCcw, ShieldAlert } from "lucide-react";
import { useMemo } from "react";
import { CHAMPIONS, DEMO_DATA_LABEL, FAMILIES, findSubject, statAtLevel, type ChampionAbility, type ChampionSubject, type ItemSubject, type Subject } from "@/lib/atlas-cross-section/fixtures";
import { appliedFilters, clampRank, relationshipOf, type CrossSectionAction, type CrossSectionState } from "@/lib/atlas-cross-section/query";
import { ABILITY_SLOTS, COLLECTION_LABELS, TOPICS, type AbilitySlot, type Collection, type CrossSectionResponse, type Persona, type QuestionResult, type SubjectRef } from "@/lib/atlas-cross-section/types";
import { AbilityIcon, SubjectIcon } from "./icons";

export interface ViewProps {
  state: CrossSectionState;
  dispatch: (action: CrossSectionAction) => void;
  response: CrossSectionResponse | null;
  loading: boolean;
  persona: Persona;
  compact: boolean;
}

const DEMO_SEAL = <span className="acs-seal">{DEMO_DATA_LABEL}</span>;

function Stepper({ label, value, min, max, onChange, onClear, placeholder }: { label: string; value: number | null; min: number; max: number; onChange: (v: number) => void; onClear: () => void; placeholder: string }) {
  const current = value ?? min;
  return (
    <div className="acs-stepper" role="group" aria-label={label}>
      <span className="acs-stepper__label">{label}</span>
      <button type="button" className="acs-btn acs-btn--icon" aria-label={`${label} down`} disabled={value === null || current <= min} onClick={() => onChange(current - 1)}>
        <Minus size={14} aria-hidden="true" />
      </button>
      <input
        type="number"
        className="acs-stepper__input"
        aria-label={`${label} value`}
        min={min}
        max={max}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => (e.target.value === "" ? onClear() : onChange(Number(e.target.value)))}
      />
      <button type="button" className="acs-btn acs-btn--icon" aria-label={`${label} up`} disabled={current >= max && value !== null} onClick={() => onChange(value === null ? min : current + 1)}>
        <Plus size={14} aria-hidden="true" />
      </button>
      {value !== null ? (
        <button type="button" className="acs-btn acs-btn--icon" aria-label={`Clear ${label}`} onClick={onClear}>
          <RotateCcw size={13} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Overview                                                                  */
/* ------------------------------------------------------------------------- */

function SubjectCard({ subject, axis, level }: { subject: Subject; axis: "A" | "B"; level: number }) {
  const ref: SubjectRef = { kind: subject.kind, id: subject.id };
  return (
    <article className="acs-card" data-axis={axis} data-kind={subject.kind} style={{ ["--acs-hue" as string]: subject.hue } as React.CSSProperties}>
      <header className="acs-card__head">
        <SubjectIcon subject={ref} size="xl" />
        <div>
          <span className="acs-eyebrow">Axis {axis} · {subject.kind}</span>
          <h3 className="acs-card__title">{subject.name}</h3>
          <p className="acs-card__sub">{subject.kind === "champion" ? `${subject.title} · ${subject.role}` : `${subject.tier.replace("-", " ")} · ${subject.cost} gold`}</p>
        </div>
      </header>
      {subject.kind === "champion" ? (
        <dl className="acs-stats">
          <div><dt>HP · L{level}</dt><dd>{statAtLevel(subject.base.hp, subject.base.hpGrowth, level)}</dd></div>
          <div><dt>Mana · L{level}</dt><dd>{statAtLevel(subject.base.mana, subject.base.manaGrowth, level)}</dd></div>
          <div><dt>AD · L{level}</dt><dd>{statAtLevel(subject.base.ad, subject.base.adGrowth, level)}</dd></div>
          <div><dt>Armor · L{level}</dt><dd>{statAtLevel(subject.base.armor, subject.base.armorGrowth, level)}</dd></div>
          <div><dt>Move speed</dt><dd>{subject.base.ms}</dd></div>
          <div><dt>Range</dt><dd>{subject.base.range}</dd></div>
        </dl>
      ) : (
        <dl className="acs-stats">
          {subject.stats.map((s) => (
            <div key={s.label}><dt>{s.label}</dt><dd>{s.value}{s.unit ?? ""}</dd></div>
          ))}
          {subject.passive ? <div className="acs-stats__wide"><dt>{subject.passive.name}</dt><dd>{subject.passive.summary}</dd></div> : null}
        </dl>
      )}
      {subject.kind === "champion" ? (
        <div className="acs-card__abilities" aria-label={`${subject.name} abilities`}>
          {subject.abilities.map((ab) => (
            <AbilityIcon key={ab.slot} champion={subject.id} slot={ab.slot} name={ab.name} size="sm" />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function OverviewView({ state, response, persona, dispatch }: ViewProps) {
  const rel = relationshipOf(state.query);
  const a = findSubject(state.query.a);
  const b = findSubject(state.query.b);
  const b1 = state.query.b1ItemId ? findSubject({ kind: "item", id: state.query.b1ItemId }) : null;
  const level = state.query.championLevel ?? 1;
  if (rel.kind === "none") return null;
  return (
    <div className="acs-view acs-view--overview">
      <div className="acs-overview__cards">
        {a ? <SubjectCard subject={a} axis="A" level={level} /> : null}
        {b ? <SubjectCard subject={b} axis="B" level={level} /> : null}
        {b1 && b ? (
          <aside className="acs-equip" aria-label={`B.1: ${b.name} equips ${b1.name}`}>
            <SubjectIcon subject={{ kind: "item", id: b1.id }} size="lg" />
            <div>
              <span className="acs-eyebrow">B.1 · equipped for research</span>
              <strong>{b.name} holds {b1.name}</strong>
              <p className="acs-why">Association only. The item's stat lines are listed under Compare; no damage or outcome is computed from the pairing.</p>
            </div>
          </aside>
        ) : null}
      </div>
      <section className="acs-panel" aria-label="What the index knows">
        <header className="acs-panel__head">
          <h3>Question index</h3>
          {DEMO_SEAL}
        </header>
        {response ? (
          <ul className="acs-index">
            <li>
              <strong>{COLLECTION_LABELS.catalog}</strong>
              <span>
                {response.access.state === "allowed" && state.query.collection === "catalog" ? `${response.counts.visible_matching} indexed` : "see Questions"} · coverage {response.coverage.state}
                {response.coverage.families_total ? ` (${response.coverage.families_certified}/${response.coverage.families_total} families certified)` : ""}
              </span>
            </li>
            <li>
              <strong>{COLLECTION_LABELS.discovered}</strong>
              <span>{persona === "anonymous" ? "needs an account" : "this account's Ranked discoveries"}</span>
            </li>
            <li>
              <strong>{COLLECTION_LABELS.premium_review}</strong>
              <span>{persona === "premium" || persona === "owner" ? "your missed attempts" : "Premium-gated missed review"}</span>
            </li>
            {persona === "owner" ? (
              <li>
                <strong>{COLLECTION_LABELS.admin_inventory}</strong>
                <span>owner-only audit view</span>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="acs-why">Loading the index…</p>
        )}
        <button type="button" className="acs-btn acs-btn--primary" onClick={() => dispatch({ type: "setView", view: "questions" })}>
          Open questions <ChevronRight size={14} aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Abilities & stats                                                         */
/* ------------------------------------------------------------------------- */

function AbilitySheet({ champion, ability, rank }: { champion: ChampionSubject; ability: ChampionAbility; rank: number | null }) {
  const rows: { label: string; values: number[] | null; unit: string }[] = [
    { label: "Cooldown", values: ability.cooldown, unit: "s" },
    { label: "Cost", values: ability.cost, unit: champion.resource },
    { label: "Base damage", values: ability.baseDamage, unit: "" },
  ];
  return (
    <div className="acs-sheet">
      <header className="acs-sheet__head">
        <AbilityIcon champion={champion.id} slot={ability.slot} name={ability.name} size="lg" active />
        <div>
          <span className="acs-eyebrow">{champion.name} · {ability.slot}</span>
          <strong>{ability.name}</strong>
          <span className="acs-why">
            {ability.ratio ? `${Math.round(ability.ratio.value * 100)}% ${ability.ratio.stat}` : "no ratio"}
            {ability.range ? ` · range ${ability.range}` : ""}
          </span>
        </div>
      </header>
      {ability.cooldown ? (
        <table className="acs-table">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              {ability.cooldown.map((_, i) => (
                <th key={i} scope="col" aria-current={rank === i + 1 ? "true" : undefined}>{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.filter((r) => r.values).map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}{r.unit ? <span className="acs-unit"> {r.unit}</span> : null}</th>
                {r.values!.map((v, i) => (
                  <td key={i} data-current={rank === i + 1}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="acs-why">Passive: no rank values. Topics: {ability.topics.join(", ")}.</p>
      )}
    </div>
  );
}

export function AbilitiesView({ state, dispatch }: ViewProps) {
  const subjects = [findSubject(state.query.a), findSubject(state.query.b)].filter((s): s is Subject => Boolean(s));
  const champions = subjects.filter((s): s is ChampionSubject => s.kind === "champion");
  const items = subjects.filter((s): s is ItemSubject => s.kind === "item");
  const slot = state.query.abilitySlot ?? "Q";
  const level = state.query.championLevel ?? 1;
  const rank = state.query.abilityRank;
  return (
    <div className="acs-view acs-view--abilities">
      <div className="acs-controls" aria-label="Level, slot and rank">
        <Stepper label="Champion level" value={state.query.championLevel} min={1} max={18} onChange={(v) => dispatch({ type: "setLevel", level: v })} onClear={() => dispatch({ type: "setLevel", level: null })} placeholder="1–18" />
        <div className="acs-slots" role="radiogroup" aria-label="Ability slot">
          {ABILITY_SLOTS.map((s) => {
            const champ = champions[0];
            const name = champ?.abilities.find((ab) => ab.slot === s)?.name ?? s;
            return (
              <button key={s} type="button" role="radio" aria-checked={state.query.abilitySlot === s} aria-label={`Slot ${s}${champ ? `: ${name}` : ""}`} data-tip={`${s} · ${name}`} className="acs-slot" onClick={() => dispatch({ type: "setSlot", slot: state.query.abilitySlot === s ? null : s })}>
                {champ ? <AbilityIcon champion={champ.id} slot={s} name={name} size="sm" active={state.query.abilitySlot === s} /> : <span className="acs-icon acs-icon--ability" style={{ width: 28, height: 28 }}><span className="acs-icon__monogram">{s}</span></span>}
              </button>
            );
          })}
        </div>
        <Stepper label="Ability rank" value={rank} min={1} max={slot === "R" ? 3 : 5} onChange={(v) => dispatch({ type: "setRank", rank: clampRank(v, slot) })} onClear={() => dispatch({ type: "setRank", rank: null })} placeholder={slot === "R" ? "1–3" : "1–5"} />
        {DEMO_SEAL}
      </div>
      <div className="acs-columns" data-count={subjects.length}>
        {champions.map((champ) => {
          const ability = champ.abilities.find((ab) => ab.slot === slot) ?? champ.abilities[1];
          return (
            <section key={champ.id} className="acs-column" aria-label={`${champ.name} abilities and stats`}>
              <header className="acs-column__head">
                <SubjectIcon subject={{ kind: "champion", id: champ.id }} size="md" />
                <div>
                  <strong>{champ.name}</strong>
                  <span className="acs-why">Level {level}: {statAtLevel(champ.base.hp, champ.base.hpGrowth, level)} HP · {statAtLevel(champ.base.mana, champ.base.manaGrowth, level)} mana · {statAtLevel(champ.base.armor, champ.base.armorGrowth, level)} armor</span>
                </div>
              </header>
              <AbilitySheet champion={champ} ability={ability} rank={rank} />
            </section>
          );
        })}
        {items.map((item) => (
          <section key={item.id} className="acs-column" aria-label={`${item.name} stats`}>
            <header className="acs-column__head">
              <SubjectIcon subject={{ kind: "item", id: item.id }} size="md" />
              <div>
                <strong>{item.name}</strong>
                <span className="acs-why">{item.cost} gold · {item.tier.replace("-", " ")}</span>
              </div>
            </header>
            <dl className="acs-stats">
              {item.stats.map((s) => (
                <div key={s.label}><dt>{s.label}</dt><dd>{s.value}{s.unit ?? ""}</dd></div>
              ))}
              {item.passive ? <div className="acs-stats__wide"><dt>{item.passive.name}</dt><dd>{item.passive.summary}</dd></div> : null}
            </dl>
            <p className="acs-why">Level, slot and rank do not apply to an item; they stay on screen so the champion column keeps its meaning.</p>
          </section>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Questions                                                                 */
/* ------------------------------------------------------------------------- */

function applicabilityText(r: QuestionResult): string {
  const parts: string[] = [];
  const l = r.applicability.champion_level;
  const k = r.applicability.ability_rank;
  if (l.kind === "specific") parts.push(`level ${l.value}`);
  if (l.kind === "interval") parts.push(`levels ${l.min}–${l.max}`);
  if (k.kind === "specific") parts.push(`rank ${k.value}`);
  if (k.kind === "interval") parts.push(`ranks ${k.min}–${k.max}`);
  return parts.length ? parts.join(" · ") : "any level or rank";
}

function ResultRow({ r, champion }: { r: QuestionResult; champion: string | null }) {
  return (
    <li className="acs-result" data-status={r.source_status}>
      <div className="acs-result__lead">
        {r.ability_slot && champion ? (
          <AbilityIcon champion={champion} slot={r.ability_slot} name={`slot ${r.ability_slot}`} size="sm" />
        ) : (
          <span className="acs-result__dot" aria-hidden="true" />
        )}
      </div>
      <div className="acs-result__body">
        <p className="acs-result__prompt">{r.prompt}</p>
        <div className="acs-result__meta">
          <span className="acs-chip">{r.family_label}</span>
          {r.topics.map((t) => (
            <span key={t} className="acs-chip acs-chip--topic">{t}</span>
          ))}
          <span className="acs-chip acs-chip--quiet">{applicabilityText(r)}</span>
          {r.source_status !== "current" ? <span className="acs-chip acs-chip--warn">{r.source_status}</span> : null}
          {r.review ? <span className="acs-chip acs-chip--rose">missed · {r.review.attempted_at.slice(0, 10)}</span> : null}
          {r.inventory ? <span className="acs-chip acs-chip--quiet">{r.inventory.serve_state} · {r.inventory.answer_role_edges} answer-role edge{r.inventory.answer_role_edges === 1 ? "" : "s"}</span> : null}
        </div>
      </div>
      <div className="acs-result__state" aria-label={r.discovery.state === "unlocked" ? "Unlocked" : r.discovery.state === "locked" ? "Not yet unlocked" : "Discovery not applicable"} title={r.discovery.state === "unlocked" ? "Unlocked by this account" : r.discovery.state === "locked" ? "Not yet unlocked; the answer is not shown" : "Sign in to track discoveries"}>
        {r.discovery.state === "unlocked" ? <LockOpen size={15} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
      </div>
    </li>
  );
}

function StatePanel({ response, loading }: { response: CrossSectionResponse | null; loading: boolean }) {
  if (loading && !response) return <div className="acs-state acs-state--loading" role="status">Searching the demo index…</div>;
  if (!response) return null;
  const { access, coverage, relation } = response;
  if (access.state !== "allowed") {
    const tone = access.state === "unavailable_entitlement" ? "warn" : access.state === "not_configured" ? "quiet" : "blocked";
    return (
      <div className={`acs-state acs-state--${tone}`} role="status">
        <ShieldAlert size={16} aria-hidden="true" />
        <div>
          <strong>
            {access.state === "requires_account" ? "Sign in required" : access.state === "denied" ? "Not available to this account" : access.state === "unavailable_entitlement" ? "Entitlement check unavailable" : "Reserved collection"}
          </strong>
          <p>{access.message}</p>
        </div>
      </div>
    );
  }
  if (relation === "unsupported") {
    return (
      <div className="acs-state acs-state--blocked" role="status">
        <ShieldAlert size={16} aria-hidden="true" />
        <div>
          <strong>No certified relation</strong>
          <p>The index holds no premise-safe question that names both subjects. Nothing was inferred from key substrings or text matching.</p>
        </div>
      </div>
    );
  }
  return (
    <div className={`acs-state acs-state--${coverage.state === "full" ? "ok" : "warn"}`} role="status">
      <div>
        <strong>
          {response.counts.visible_matching} match{response.counts.visible_matching === 1 ? "" : "es"} · coverage {coverage.state}
          {coverage.families_total ? ` · ${coverage.families_certified} of ${coverage.families_total} families certified` : ""}
        </strong>
        <p>
          {coverage.state === "partial" ? "Uncertified families are excluded, so this is not the whole bank. " : ""}
          {access.message} Counts are exact over the visible, authorized set ({DEMO_DATA_LABEL}).
        </p>
      </div>
    </div>
  );
}

export function QuestionsView({ state, dispatch, response, loading, persona }: ViewProps) {
  const q = state.query;
  const collections: Collection[] = ["catalog", "discovered", "premium_review", ...(persona === "owner" ? (["admin_inventory"] as Collection[]) : [])];
  const champion = findSubject(q.a)?.kind === "champion" ? q.a!.id : findSubject(q.b)?.kind === "champion" ? q.b!.id : null;
  const facetCount = (id: string) => response?.facets.topics.find((t) => t.id === id)?.count ?? null;
  const b1 = q.b1ItemId ? findSubject({ kind: "item", id: q.b1ItemId }) : null;
  return (
    <div className="acs-view acs-view--questions">
      <div className="acs-collections" role="radiogroup" aria-label="Question collection">
        {collections.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={q.collection === c} className="acs-collection" onClick={() => dispatch({ type: "setCollection", collection: c })}>
            {COLLECTION_LABELS[c]}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={q.collection === "premium_exclusive"} className="acs-collection acs-collection--reserved" onClick={() => dispatch({ type: "setCollection", collection: "premium_exclusive" })} title="Reserved: no Premium-exclusive supply exists yet">
          {COLLECTION_LABELS.premium_exclusive} <span className="acs-chip acs-chip--quiet">reserved</span>
        </button>
      </div>

      <div className="acs-facets" aria-label="Filters">
        <div className="acs-topics" role="group" aria-label="Topics (any of)">
          {TOPICS.map((t) => {
            const n = facetCount(t.id);
            const on = q.topics.includes(t.id);
            return (
              <button key={t.id} type="button" aria-pressed={on} className="acs-topic" onClick={() => dispatch({ type: "toggleTopic", topic: t.id })} disabled={!on && n === 0} title={!on && n === 0 ? `No ${t.label.toLowerCase()} questions in this set` : undefined}>
                {t.label}
                {n !== null ? <span className="acs-topic__n">{n}</span> : null}
              </button>
            );
          })}
          {q.topics.length ? (
            <button type="button" className="acs-btn acs-btn--ghost acs-btn--sm" onClick={() => dispatch({ type: "clearTopics" })}>
              Clear topics
            </button>
          ) : null}
        </div>
        <div className="acs-facets__row">
          <div className="acs-slots" role="radiogroup" aria-label="Ability slot">
            {ABILITY_SLOTS.map((s) => {
              const n = response?.facets.ability_slots.find((x) => x.id === s)?.count ?? null;
              const name = champion ? CHAMPIONS.find((c) => c.id === champion)?.abilities.find((ab) => ab.slot === s)?.name ?? s : s;
              return (
                <button key={s} type="button" role="radio" aria-checked={q.abilitySlot === s} aria-label={`Slot ${s}: ${name}${n !== null ? `, ${n} question${n === 1 ? "" : "s"}` : ""}`} data-tip={`${s} · ${name}${n !== null ? ` · ${n}` : ""}`} className="acs-slot" onClick={() => dispatch({ type: "setSlot", slot: q.abilitySlot === s ? null : s })}>
                  {champion ? <AbilityIcon champion={champion} slot={s} name={name} size="sm" active={q.abilitySlot === s} /> : <span className="acs-icon acs-icon--ability" style={{ width: 28, height: 28 }}><span className="acs-icon__monogram">{s}</span></span>}
                </button>
              );
            })}
          </div>
          <Stepper label="Champion level" value={q.championLevel} min={1} max={18} onChange={(v) => dispatch({ type: "setLevel", level: v })} onClear={() => dispatch({ type: "setLevel", level: null })} placeholder="any" />
          <Stepper label="Ability rank" value={q.abilityRank} min={1} max={q.abilitySlot === "R" ? 3 : 5} onChange={(v) => dispatch({ type: "setRank", rank: v })} onClear={() => dispatch({ type: "setRank", rank: null })} placeholder="any" />
          <span className="acs-chip">patch · current</span>
        </div>
        <p className="acs-applied" aria-live="polite">
          Applied: {appliedFilters(q).join(" · ")}
        </p>
      </div>

      <StatePanel response={response} loading={loading} />

      {response && response.access.state === "allowed" && response.relation !== "unsupported" ? (
        <>
          {response.results.length === 0 ? (
            <p className="acs-empty">No matches in {COLLECTION_LABELS[q.collection]} with these filters. Zero is a real count here, not missing coverage.</p>
          ) : (
            <ol className="acs-results" aria-label="Matching questions" data-loading={loading}>
              {response.results.map((r) => (
                <ResultRow key={r.handle} r={r} champion={champion} />
              ))}
            </ol>
          )}
          {response.page.has_more ? (
            <p className="acs-why">
              Showing {response.results.length} of {response.counts.visible_matching}. Paging is part of the contract; the prototype shows the first page.
            </p>
          ) : null}
          {b1 ? (
            <section className="acs-related" aria-label={`Related: questions about ${b1.name}`}>
              <header className="acs-panel__head">
                <h3>Related · about {b1.name} (B.1)</h3>
                <span className="acs-chip acs-chip--quiet">not part of the A × B intersection</span>
              </header>
              {response.related_results.length ? (
                <ol className="acs-results">
                  {response.related_results.map((r) => (
                    <ResultRow key={r.handle} r={r} champion={null} />
                  ))}
                </ol>
              ) : (
                <p className="acs-empty">No {COLLECTION_LABELS[q.collection].toLowerCase()} questions about {b1.name} with these filters.</p>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Compare                                                                   */
/* ------------------------------------------------------------------------- */

function delta(a: number, b: number): string {
  const d = Math.round((b - a) * 100) / 100;
  return d > 0 ? `+${d}` : String(d);
}

export function CompareView({ state, response }: ViewProps) {
  const rel = relationshipOf(state.query);
  const slot = state.query.abilitySlot ?? "Q";
  const level = state.query.championLevel ?? 1;
  const rank = state.query.abilityRank;
  const body = useMemo(() => {
    if (rel.kind !== "pair") return null;
    const a = findSubject(rel.a)!;
    const b = findSubject(rel.b)!;
    const b1 = rel.b1ItemId ? (findSubject({ kind: "item", id: rel.b1ItemId }) as ItemSubject | null) : null;
    if (a.kind === "champion" && b.kind === "champion") {
      const aa = a.abilities.find((x) => x.slot === slot)!;
      const bb = b.abilities.find((x) => x.slot === slot)!;
      const rows: { label: string; va: number[] | null; vb: number[] | null }[] = [
        { label: "Cooldown (s)", va: aa.cooldown, vb: bb.cooldown },
        { label: `Cost (${a.resource})`, va: aa.cost, vb: bb.cost },
        { label: "Base damage", va: aa.baseDamage, vb: bb.baseDamage },
      ];
      const stats = [
        ["HP", statAtLevel(a.base.hp, a.base.hpGrowth, level), statAtLevel(b.base.hp, b.base.hpGrowth, level)],
        ["Mana", statAtLevel(a.base.mana, a.base.manaGrowth, level), statAtLevel(b.base.mana, b.base.manaGrowth, level)],
        ["Armor", statAtLevel(a.base.armor, a.base.armorGrowth, level), statAtLevel(b.base.armor, b.base.armorGrowth, level)],
        ["Range", a.base.range, b.base.range],
      ] as const;
      return (
        <>
          <table className="acs-table acs-table--compare">
            <caption>Base stats at level {level}</caption>
            <thead><tr><th scope="col">Stat</th><th scope="col">{a.name}</th><th scope="col">{b.name}</th><th scope="col">Δ (B − A)</th></tr></thead>
            <tbody>
              {stats.map(([label, va, vb]) => (
                <tr key={label}><th scope="row">{label}</th><td>{va}</td><td>{vb}</td><td className="acs-delta" data-sign={Math.sign(vb - va)}>{delta(va, vb)}</td></tr>
              ))}
            </tbody>
          </table>
          <table className="acs-table acs-table--compare">
            <caption>
              Slot {slot}: {aa.name} vs {bb.name}{rank ? ` · rank ${rank}` : " · all ranks"}
            </caption>
            <thead><tr><th scope="col">Row</th><th scope="col">{a.name}</th><th scope="col">{b.name}</th><th scope="col">Δ (B − A)</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                if (!r.va || !r.vb) return <tr key={r.label}><th scope="row">{r.label}</th><td colSpan={3} className="acs-why">not comparable: one side has no rank values</td></tr>;
                const idx = rank ? Math.min(rank, r.va.length, r.vb.length) - 1 : null;
                const va = idx === null ? r.va.join(" / ") : r.va[idx];
                const vb = idx === null ? r.vb.join(" / ") : r.vb[idx];
                return (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <td>{va}</td>
                    <td>{vb}</td>
                    <td className="acs-delta" data-sign={idx === null ? 0 : Math.sign(r.vb[idx] - r.va[idx])}>{idx === null ? "pick a rank" : delta(r.va[idx], r.vb[idx])}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {b1 ? (
            <section className="acs-equip acs-equip--compare" aria-label={`B.1: ${b.name} equips ${b1.name}`}>
              <SubjectIcon subject={{ kind: "item", id: b1.id }} size="lg" />
              <div>
                <span className="acs-eyebrow">B.1 · {b.name} equips {b1.name}</span>
                <ul className="acs-equip__lines">
                  {b1.stats.map((s) => (
                    <li key={s.label}>
                      {s.label} {s.value}{s.unit ?? ""} <span className="acs-chip acs-chip--topic">{s.topic}</span>
                      {bb.topics.includes(s.topic) ? <span className="acs-chip acs-chip--quiet">touches {bb.name}</span> : null}
                    </li>
                  ))}
                </ul>
                <p className="acs-why">Equipment intent, not a result: no combined damage, haste or outcome is computed. The item stays on B; A is untouched.</p>
              </div>
            </section>
          ) : null}
        </>
      );
    }
    if (a.kind === "item" && b.kind === "item") {
      const labels = Array.from(new Set([...a.stats, ...b.stats].map((s) => s.label)));
      return (
        <table className="acs-table acs-table--compare">
          <caption>Item stat lines</caption>
          <thead><tr><th scope="col">Stat</th><th scope="col">{a.name}</th><th scope="col">{b.name}</th><th scope="col">Δ (B − A)</th></tr></thead>
          <tbody>
            {labels.map((label) => {
              const sa = a.stats.find((s) => s.label === label);
              const sb = b.stats.find((s) => s.label === label);
              const same = sa && sb && sa.unit === sb.unit;
              return (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{sa ? `${sa.value}${sa.unit ?? ""}` : "—"}</td>
                  <td>{sb ? `${sb.value}${sb.unit ?? ""}` : "—"}</td>
                  <td className="acs-delta" data-sign={same ? Math.sign(sb!.value - sa!.value) : 0}>{same ? delta(sa!.value, sb!.value) : "—"}</td>
                </tr>
              );
            })}
            <tr><th scope="row">Gold</th><td>{a.cost}</td><td>{b.cost}</td><td className="acs-delta" data-sign={Math.sign(b.cost - a.cost)}>{delta(a.cost, b.cost)}</td></tr>
          </tbody>
        </table>
      );
    }
    const champ = (a.kind === "champion" ? a : b) as ChampionSubject;
    const item = (a.kind === "item" ? a : b) as ItemSubject;
    return (
      <section className="acs-equip acs-equip--compare" aria-label={`${champ.name} and ${item.name}`}>
        <SubjectIcon subject={{ kind: "item", id: item.id }} size="lg" />
        <div>
          <span className="acs-eyebrow">Champion × item · association</span>
          <strong>{champ.name} with {item.name}</strong>
          <ul className="acs-equip__lines">
            {item.stats.map((s) => (
              <li key={s.label}>
                {s.label} {s.value}{s.unit ?? ""} <span className="acs-chip acs-chip--topic">{s.topic}</span>
                {champ.abilities.some((ab) => ab.topics.includes(s.topic)) ? <span className="acs-chip acs-chip--quiet">touches {champ.abilities.filter((ab) => ab.topics.includes(s.topic)).map((ab) => ab.slot).join("/")}</span> : null}
              </li>
            ))}
          </ul>
          <p className="acs-why">Which stat lines touch which ability topics. No damage, build or outcome is predicted; scenario questions that name both live under Questions.</p>
        </div>
      </section>
    );
  }, [rel, slot, level, rank]);

  if (rel.kind !== "pair") return null;
  const families = FAMILIES.filter((f) => f.certified).map((f) => f.label);
  return (
    <div className="acs-view acs-view--compare">
      <div className="acs-compare__meta">
        {DEMO_SEAL}
        <span className="acs-chip">{rel.shape.replace(/_/g, " ")}</span>
        {response ? <span className="acs-chip acs-chip--quiet">{response.relation === "unsupported" ? "no certified question relation" : `${response.counts.visible_matching} intersection question${response.counts.visible_matching === 1 ? "" : "s"}`}</span> : null}
        <span className="acs-chip acs-chip--quiet">certified families: {families.join(", ")}</span>
      </div>
      {body}
    </div>
  );
}
