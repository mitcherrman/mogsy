/**
 * PPQ2-D — the premium statistical reveal, driven by the REAL frozen payloads
 * (`PRO_PLAY_SAMPLES`, all 14) through PPQ2-C's production slot path.
 *
 * Load-bearing: nothing renders before a grade; candidates stay in server
 * order with symmetric structure; `display` is verbatim; the support line is
 * the legacy one; missing evidence never becomes an invented number.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProPlayEvidence from "@/components/pro-play/ProPlayEvidence";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PRO_PLAY_SAMPLES } from "@/lib/pro-play/__fixtures__/proPlaySamples";
import { asEvidence, asQuestionContext, type ProPlayEvidence as Evidence } from "@/lib/pro-play/contract";
import type { AnswerOptionView } from "@/lib/ranked-core/viewTypes";
import { proPlayAnswerSlots } from "../ProPlayOptionContent";
import {
  REVEAL_EMPTY_VALUE,
  REVEAL_VALUE_DELAY_MS,
  REVEAL_VALUE_STAGGER_MS,
  ProPlayRevealFooter,
  buildProPlayReveal,
  buildProPlayRevealModel,
  revealSupportLine,
  revealValuesOnTablets,
  splitExplanation,
  verdictSentence,
  type ProPlayRevealInput,
} from "./index";

const mocks = vi.hoisted(() => ({ manifest: null as unknown }));
vi.mock("@/hooks/useChampionAssets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useChampionAssets")>();
  return { ...actual, useChampionAssets: () => ({ data: mocks.manifest }) };
});

const ALL = Object.keys(PRO_PLAY_SAMPLES);

type Grade = "real" | "correct" | "wrong";

/**
 * One fixture as PPQ2-B projects it: options in server order (id = index),
 * and a reveal shaped like `projection.reveal`. "real" is the server's own
 * grade; "correct"/"wrong" re-grade the same payload (correct id from the
 * server's `correct_answer`; wrong = the first other option).
 */
function fixture(key: string, grade: Grade = "real", evidenceOverride?: Evidence | null) {
  const sample = PRO_PLAY_SAMPLES[key];
  const q = sample.question;
  const r = sample.result;
  const context = asQuestionContext(q.context)!;
  const options: AnswerOptionView[] = q.choices.map((label, index) => ({ id: String(index), index, label }));
  const correctOptionId = String(q.choices.indexOf(r.correct_answer));
  const wrongId = options.find((o) => o.id !== correctOptionId)!.id;
  const selectedOptionId = grade === "real"
    ? String(q.choices.indexOf(r.selected_answer))
    : grade === "correct" ? correctOptionId : wrongId;
  const reveal: ProPlayRevealInput = {
    isCorrect: grade === "real" ? r.is_correct : grade === "correct",
    selectedOptionId,
    correctOptionId,
    explanation: r.explanation,
    evidence: evidenceOverride === undefined ? asEvidence(r.evidence) : evidenceOverride,
  };
  return { sample, context, options, reveal, correctOptionId, selectedOptionId };
}

/** The tablets as the canonical grid hosts them, plus the footer. */
function renderRevealed(key: string, grade: Grade = "real", evidenceOverride?: Evidence | null) {
  const f = fixture(key, grade, evidenceOverride);
  const reveal = buildProPlayReveal({ options: f.options, reveal: f.reveal })!;
  const slots = proPlayAnswerSlots({
    options: f.options, context: f.context, revealed: true, revealSlots: reveal.revealSlots,
  });
  const utils = render(
    <TooltipProvider>
      <div data-testid="cells">
        {(slots.optionContent ?? []).map((node, i) => <div key={i} data-cell={i}>{node}</div>)}
      </div>
      <ProPlayRevealFooter model={reveal.model} valuesOnTablets={revealValuesOnTablets(reveal, slots)}
        action={<span data-testid="next-action">Next</span>} />
    </TooltipProvider>,
  );
  return { ...utils, ...f, reveal, slots };
}

const cells = () => [...document.querySelectorAll<HTMLElement>("[data-cell]")];

beforeEach(() => {
  mocks.manifest = { ok: true, champions: {} };
  document.documentElement.classList.remove("reduce-motion");
});
afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("reduce-motion");
});

// ─── Pre-answer: nothing exists ───────────────────────────────────────────

describe("before a server grade", () => {
  it("has no model and no slots", () => {
    const { options } = fixture("t1_lineage");
    expect(buildProPlayRevealModel(options, null)).toBeNull();
    expect(buildProPlayRevealModel(options, undefined)).toBeNull();
    expect(buildProPlayReveal({ options, reveal: null })).toBeNull();
    // A reveal-shaped object without the server's verdict is not a grade.
    const ungraded = { ...fixture("t1_lineage").reveal, isCorrect: undefined } as unknown as ProPlayRevealInput;
    expect(buildProPlayReveal({ options, reveal: ungraded })).toBeNull();
  });

  it.each(ALL)("leaks no value into the tablets, even if slots were built (%s)", (key) => {
    const f = fixture(key);
    const built = buildProPlayReveal({ options: f.options, reveal: f.reveal })!;
    // A caller that wrongly passes slots while ungraded still gets nothing.
    const slots = proPlayAnswerSlots({
      options: f.options, context: f.context, revealed: false, revealSlots: built.revealSlots,
    });
    const { container } = render(
      <TooltipProvider>{(slots.optionContent ?? []).map((n, i) => <div key={i}>{n}</div>)}</TooltipProvider>,
    );
    expect(container.querySelector("[data-pp-reveal-slot], [data-pp-reveal-value]")).toBeNull();
    // Byte-identical to the tablets rendered with no reveal input at all.
    // React `useId` (the team shield gradients) differs per mount.
    const norm = (h: string) => h.replace(/(id="|url\(#)[^"\-)]+/g, "$1ID");
    const html = norm(container.innerHTML);
    cleanup();
    const bare = proPlayAnswerSlots({ options: f.options, context: f.context });
    const { container: plain } = render(
      <TooltipProvider>{(bare.optionContent ?? []).map((n, i) => <div key={i}>{n}</div>)}</TooltipProvider>,
    );
    expect(html).toBe(norm(plain.innerHTML));
    // And no formatted value (counts may legitimately sit inside season spans).
    const text = plain.textContent ?? "";
    for (const s of asEvidence(f.sample.result.evidence)!.subjects) {
      if (s.display && /[.%]/.test(s.display)) expect(text).not.toContain(s.display);
    }
  });

  it("the integration recipe yields nothing at all while projection.reveal is null", () => {
    const f = fixture("champion_player");
    const reveal = buildProPlayReveal({ options: f.options, reveal: null });
    const slots = proPlayAnswerSlots({
      options: f.options, context: f.context, revealed: reveal !== null, revealSlots: reveal?.revealSlots,
    });
    const { container } = render(
      <TooltipProvider>
        {(slots.optionContent ?? []).map((n, i) => <div key={i}>{n}</div>)}
        {reveal ? <ProPlayRevealFooter model={reveal.model} valuesOnTablets /> : null}
      </TooltipProvider>,
    );
    expect(container.querySelector("[data-pp-reveal-slot], [data-pp-reveal-footer]")).toBeNull();
  });
});

// ─── The model ────────────────────────────────────────────────────────────

describe("buildProPlayRevealModel", () => {
  it.each(ALL.flatMap((k) => (["real", "correct", "wrong"] as const).map((g) => [k, g] as const)))(
    "server order, server verdict and server pick (%s, %s)", (key, grade) => {
      const f = fixture(key, grade);
      const model = buildProPlayRevealModel(f.options, f.reveal)!;
      expect(model.candidates.map((c) => c.label)).toEqual(f.sample.question.choices);
      expect(model.candidates.map((c) => c.letter)).toEqual(["A", "B", "C", "D"].slice(0, f.options.length));
      expect(model.candidates.filter((c) => c.correct).map((c) => c.optionId)).toEqual([f.correctOptionId]);
      expect(model.candidates.filter((c) => c.picked).map((c) => c.optionId)).toEqual([f.selectedOptionId]);
      expect(model.isCorrect).toBe(f.reveal.isCorrect);
    });

  it.each(ALL)("uses the server's display verbatim for every option (%s)", (key) => {
    const f = fixture(key);
    const model = buildProPlayRevealModel(f.options, f.reveal)!;
    const evidence = asEvidence(f.sample.result.evidence)!;
    expect(model.evidenceState).toBe("complete");
    for (const c of model.candidates) {
      expect(c.value?.display).toBe(evidence.subjects.find((s) => s.label === c.label)!.display);
    }
  });

  it.each(ALL)("support line is the legacy ProPlayEvidence line, character for character (%s)", (key) => {
    const f = fixture(key);
    const evidence = asEvidence(f.sample.result.evidence)!;
    render(<ProPlayEvidence evidence={evidence} />);
    const legacy = [...document.querySelectorAll("[data-pro-play-evidence-subject]")].map((li) => {
      const ps = li.querySelectorAll("p");
      return ps.length > 1 ? ps[1].textContent : null;
    });
    expect(evidence.subjects.map((s) => revealSupportLine(s, evidence.metric.id))).toEqual(legacy);
  });

  it("covers every metric the fixtures carry", () => {
    const metrics = new Set(ALL.map((k) => asEvidence(PRO_PLAY_SAMPLES[k].result.evidence)!.metric.id));
    expect([...metrics].sort()).toEqual(
      expect.arrayContaining(["bans", "champion_share", "games_played", "picks", "win_rate", "wins"]),
    );
    const forms = new Set(ALL.map((k) => asEvidence(PRO_PLAY_SAMPLES[k].result.evidence)!.form));
    expect(forms).toEqual(new Set(["pairwise", "ranking"]));
  });

  it("joins evidence by exact label, so evidence order never moves a value", () => {
    const f = fixture("t1_lineage");
    const evidence = asEvidence(f.sample.result.evidence)!;
    const reversed = { ...evidence, subjects: [...evidence.subjects].reverse() };
    const a = buildProPlayRevealModel(f.options, f.reveal)!;
    const b = buildProPlayRevealModel(f.options, { ...f.reveal, evidence: reversed })!;
    expect(b.candidates).toEqual(a.candidates);
  });

  it("evidence absent: no values, absent state, all slots null", () => {
    const f = fixture("pro_play", "real", null);
    const reveal = buildProPlayReveal({ options: f.options, reveal: f.reveal })!;
    expect(reveal.model.evidenceState).toBe("absent");
    expect(reveal.model.candidates.every((c) => c.value === null)).toBe(true);
    expect(reveal.revealSlots).toEqual([null, null, null, null]);
    expect(reveal.model.metric).toBeNull();
    expect(reveal.model.authority).toBeNull();
  });

  it("evidence partial: the unnamed option gets no value, never a guess", () => {
    const f = fixture("t1_lineage");
    const evidence = asEvidence(f.sample.result.evidence)!;
    const missing = f.options[2].label;
    const partial = { ...evidence, subjects: evidence.subjects.filter((s) => s.label !== missing) };
    const model = buildProPlayRevealModel(f.options, { ...f.reveal, evidence: partial })!;
    expect(model.evidenceState).toBe("partial");
    expect(model.candidates[2].value).toBeNull();
    expect(model.candidates.filter((c) => c.value).length).toBe(3);
  });

  it("an ambiguous (duplicated) subject and a null display are not filled in", () => {
    const f = fixture("champion_player");
    const evidence = asEvidence(f.sample.result.evidence)!;
    const dup = { ...evidence, subjects: [...evidence.subjects, { ...evidence.subjects[0], display: "99.9%" }] };
    const m1 = buildProPlayRevealModel(f.options, { ...f.reveal, evidence: dup })!;
    expect(m1.candidates[0].value).toBeNull();
    expect(m1.candidates[1].value).not.toBeNull();
    const noDisplay = { ...evidence, subjects: evidence.subjects.map((s, i) => (i === 1 ? { ...s, display: null } : s)) };
    const m2 = buildProPlayRevealModel(f.options, { ...f.reveal, evidence: noDisplay })!;
    expect(m2.candidates[1].value?.display).toBe(REVEAL_EMPTY_VALUE);
    expect(m2.candidates[1].value?.support).toBe(m1.candidates[1].value?.support);
  });

  it("never marks a tablet from evidence.correct_label", () => {
    const f = fixture("champion_player");
    const evidence = asEvidence(f.sample.result.evidence)!;
    const lying = { ...evidence, correct_label: f.options.find((o) => o.id !== f.correctOptionId)!.label };
    const model = buildProPlayRevealModel(f.options, { ...f.reveal, evidence: lying })!;
    expect(model.candidates.filter((c) => c.correct).map((c) => c.optionId)).toEqual([f.correctOptionId]);
  });

  it("authority revisions follow server option order, only for named options", () => {
    const f = fixture("champion_player");
    const model = buildProPlayRevealModel(f.options, f.reveal)!;
    expect(model.authority).toEqual({
      revision: null,
      revisions: [{ label: "H4cker", revision: 1 }, { label: "Weiwei", revision: 2 }],
      metricDefinitionVersion: "player_champion_v1",
      policyVersion: "pro_default_v1",
    });
  });
});

describe("splitExplanation", () => {
  it.each(ALL)("lifts only the provenance tail out of the primary copy (%s)", (key) => {
    const raw = PRO_PLAY_SAMPLES[key].result.explanation;
    const { primary, provenance } = splitExplanation(raw);
    expect(primary).not.toMatch(/authority revision/i);
    expect(provenance).toMatch(/^authority revision/);
    // Nothing else changed: primary + tail is the server's sentence.
    expect(raw.replace(/\s*\([^()]*\)(\.?)\s*$/, "$1")).toBe(primary);
  });

  it("leaves a sentence without the tail untouched, and empty as null", () => {
    expect(splitExplanation("Kennen led with 54 bans.")).toEqual({ primary: "Kennen led with 54 bans.", provenance: null });
    expect(splitExplanation("Keeps (other) parentheses (here).")).toEqual({ primary: "Keeps (other) parentheses (here).", provenance: null });
    expect(splitExplanation("")).toEqual({ primary: null, provenance: null });
  });
});

describe("verdictSentence", () => {
  it("states the server's verdict, pick and answer", () => {
    const right = buildProPlayRevealModel(fixture("champion_player", "correct").options, fixture("champion_player", "correct").reveal)!;
    expect(verdictSentence(right)).toBe("Correct. The answer is B, Weiwei.");
    const wrong = buildProPlayRevealModel(fixture("champion_player").options, fixture("champion_player").reveal)!;
    expect(verdictSentence(wrong)).toBe("Incorrect. You picked A, H4cker. The answer is B, Weiwei.");
  });
});

// ─── In the tablets ───────────────────────────────────────────────────────

/** Tag + data-* attribute NAMES of every element; text ignored. */
const signature = (el: Element) => [...el.querySelectorAll("*")]
  .map((n) => `${n.tagName}[${[...n.attributes].map((a) => a.name).filter((a) => a.startsWith("data-")).sort().join(",")}]`)
  .join(" ");

describe("reveal values inside the tablets", () => {
  it.each(ALL.flatMap((k) => (["correct", "wrong"] as const).map((g) => [k, g] as const)))(
    "every tablet shows its own server display, in server order (%s, %s)", (key, grade) => {
      const { options, sample } = renderRevealed(key, grade);
      const evidence = asEvidence(sample.result.evidence)!;
      const ts = cells();
      expect(ts).toHaveLength(options.length);
      ts.forEach((cell, i) => {
        expect(cell.querySelector("[data-pp-tablet-name]")?.textContent).toBe(options[i].label);
        const expected = evidence.subjects.find((s) => s.label === options[i].label)!;
        expect(cell.querySelector("[data-pp-reveal-display]")?.textContent).toBe(expected.display);
        const support = revealSupportLine(expected, evidence.metric.id);
        expect(cell.querySelector("[data-pp-reveal-support]")?.textContent).toBe(support ?? REVEAL_EMPTY_VALUE);
      });
    });

  it.each(ALL)("every candidate draws the identical structure (%s)", (key) => {
    renderRevealed(key, "wrong");
    const values = cells().map((c) => c.querySelector("[data-pp-reveal-slot]")!);
    expect(values.every(Boolean)).toBe(true);
    expect(new Set(values.map(signature)).size).toBe(1);
    // Correctness lives on the canonical button, not in the value: the
    // correct candidate's slot has the same attributes and classes.
    const shape = (v: Element) => v.innerHTML
      .replace(/>[^<]*</g, "><")
      .replace(/title="[^"]*"/g, "")
      .replace(/animation-delay:[^;"]*;?/g, "");
    expect(new Set(values.map(shape)).size).toBe(1);
  });

  it.each(ALL)("replaces the identity facts in place and adds nothing interactive (%s)", (key) => {
    renderRevealed(key);
    for (const facts of document.querySelectorAll("[data-pp-tablet-facts]")) {
      expect(facts.className).toContain("invisible");
      expect(facts.getAttribute("aria-hidden")).toBe("true");
    }
    expect(screen.getByTestId("cells").querySelector("button, a, input, [tabindex]")).toBeNull();
  });

  it("partial evidence keeps the same structure with a dash for the missing option", () => {
    const f = fixture("t1_lineage");
    const evidence = asEvidence(f.sample.result.evidence)!;
    const missing = f.options[1].label;
    renderRevealed("t1_lineage", "real", { ...evidence, subjects: evidence.subjects.filter((s) => s.label !== missing) });
    const values = cells().map((c) => c.querySelector("[data-pp-reveal-value]")!);
    expect(values.map((v) => v.getAttribute("data-pp-reveal-value"))).toEqual(["present", "missing", "present", "present"]);
    expect(values[1].querySelector("[data-pp-reveal-display]")?.textContent).toBe(REVEAL_EMPTY_VALUE);
    expect(new Set(values.map(signature)).size).toBe(1);
  });

  it("absent evidence leaves the identity facts visible and mounts no slot", () => {
    renderRevealed("team_champion", "real", null);
    expect(document.querySelector("[data-pp-reveal-slot]")).toBeNull();
    for (const facts of document.querySelectorAll("[data-pp-tablet-facts]")) {
      expect(facts.className).not.toContain("invisible");
    }
  });

  it("pairs stack value over support; 3–4-way tablets keep it to one line", () => {
    renderRevealed("champion_player");
    for (const v of document.querySelectorAll("[data-pp-reveal-value]")) expect(v.className).toContain("flex-col");
    cleanup();
    renderRevealed("pro_play");
    for (const v of document.querySelectorAll("[data-pp-reveal-value]")) {
      expect(v.className).not.toContain("flex-col");
      expect(v.querySelector("[data-pp-reveal-support]")!.className).toContain("truncate");
    }
  });

  it("draws no bar, rank or position", () => {
    for (const key of ALL) {
      const { container, unmount } = renderRevealed(key);
      const html = [...container.querySelectorAll("[data-pp-reveal-slot], [data-pp-reveal-footer]")]
        .map((el) => el.outerHTML).join("");
      expect(html).not.toMatch(/role="progressbar"|<meter|<progress/);
      expect(html).not.toMatch(/(width|height):\s*\d/);
      expect((container.textContent ?? "").toLowerCase()).not.toMatch(/\b(1st|2nd|3rd|4th|#1|rank(ed)?)\b/);
      unmount();
    }
  });
});

// ─── The footer ───────────────────────────────────────────────────────────

describe("answer footer", () => {
  it.each(ALL)("shows the metric, the evidence scope and the explanation without provenance (%s)", (key) => {
    const { sample } = renderRevealed(key);
    const evidence = asEvidence(sample.result.evidence)!;
    const footer = document.querySelector("[data-pp-reveal-footer]")!;
    expect(within(footer as HTMLElement).getByText(evidence.metric.label)).toBeInTheDocument();
    expect(footer.querySelector("[data-pp-reveal-scope]")!.textContent).toContain(evidence.scope_label!);
    const explanation = footer.querySelector("[data-pp-reveal-explanation]")!.textContent!;
    expect(explanation).toBe(splitExplanation(sample.result.explanation).primary);
    expect(explanation).not.toMatch(/authority/i);
    expect(screen.getByTestId("next-action")).toBeInTheDocument();
  });

  it.each(ALL)("lists every option's statistic for screen readers, in server order (%s)", (key) => {
    const { options, sample } = renderRevealed(key);
    const readout = document.querySelector<HTMLElement>('[data-pp-reveal-readout="sr-only"]')!;
    expect(readout.className).toContain("sr-only");
    const items = [...readout.querySelectorAll("li")];
    expect(items.map((li) => li.getAttribute("data-pp-reveal-row"))).toEqual(options.map((o) => o.id));
    const evidence = asEvidence(sample.result.evidence)!;
    items.forEach((li, i) => {
      expect(li.textContent).toContain(`${String.fromCharCode(65 + i)}. ${options[i].label}: `);
      expect(li.textContent).toContain(evidence.subjects.find((s) => s.label === options[i].label)!.display!);
    });
    expect(items.filter((li) => li.textContent!.includes("Correct answer"))).toHaveLength(1);
    expect(items.filter((li) => li.textContent!.includes("Your pick"))).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toMatch(/^(Correct|Incorrect)\. /);
  });

  it("draws the list visibly when the tablets could not carry the values", () => {
    const f = fixture("t1_lineage");
    const reveal = buildProPlayReveal({ options: f.options, reveal: f.reveal })!;
    // PPQ2-C's plain fallback: asymmetric identities → no rich content.
    const slots = proPlayAnswerSlots({
      options: f.options, context: { ...f.context, subjects: f.context.subjects.slice(1) },
      revealed: true, revealSlots: reveal.revealSlots,
    });
    expect(slots.optionContent).toBeNull();
    expect(revealValuesOnTablets(reveal, slots)).toBe(false);
    render(<TooltipProvider><ProPlayRevealFooter model={reveal.model} valuesOnTablets={false} /></TooltipProvider>);
    const readout = document.querySelector<HTMLElement>('[data-pp-reveal-readout="visible"]')!;
    expect(readout.className).not.toContain("sr-only");
    const rows = [...readout.querySelectorAll("li")];
    expect(rows.map((r) => r.getAttribute("data-correct"))).toEqual(
      f.options.map((o) => (o.id === f.correctOptionId ? "true" : "false")),
    );
    expect(new Set(rows.map(signature)).size).toBeLessThanOrEqual(3); // marks differ only by correct/pick
  });

  it("says plainly when evidence is missing, and invents nothing", () => {
    renderRevealed("pro_play", "real", null);
    const footer = document.querySelector("[data-pp-reveal-footer]")!;
    expect(footer.getAttribute("data-pp-evidence-state")).toBe("absent");
    expect(footer.querySelector("[data-pp-reveal-note]")!.textContent).toMatch(/No per-option statistics/);
    expect(footer.querySelector("[data-pp-reveal-readout]")).toBeNull();
    expect(footer.querySelector("[data-pp-reveal-explanation]")).not.toBeNull();
    // The explanation still carries provenance → the disclosure has it.
    expect(footer.querySelector("[data-pp-reveal-source]")).not.toBeNull();
  });

  it("keeps provenance behind an accessible disclosure", () => {
    const { reveal } = renderRevealed("champion_player");
    const trigger = screen.getByRole("button", { name: "Evidence source and authority" });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.getAttribute("type")).toBe("button");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.body.textContent).not.toContain("pro_default_v1");
    act(() => { trigger.focus(); fireEvent.click(trigger); });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const panel = document.querySelector<HTMLElement>("[data-pp-reveal-source-panel]")!;
    expect(panel.textContent).toContain("pro_default_v1");
    expect(panel.textContent).toContain("player_champion_v1");
    expect(panel.textContent).toContain("Share of games won in this scope");
    expect(panel.textContent).toMatch(/H4cker: 1.*Weiwei: 2/);
    expect(panel.textContent).toContain(reveal.model.explanationVerbatim!);
    act(() => { fireEvent.keyDown(panel, { key: "Escape" }); });
    expect(document.querySelector("[data-pp-reveal-source-panel]")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("carries no opponent, rating, health or clock vocabulary", () => {
    for (const key of ALL) {
      const { container, unmount } = renderRevealed(key);
      const text = (container.textContent ?? "").toLowerCase();
      for (const word of ["opponent", "elo", "hp", "health", "damage", "streak", "rating", "timer", "seconds", "victory", "defeat"]) {
        expect(text).not.toMatch(new RegExp(`\\b${word}\\b`));
      }
      unmount();
    }
  });
});

// ─── Motion ───────────────────────────────────────────────────────────────

describe("motion", () => {
  it("stages values by server position, briefly, then the footer", () => {
    renderRevealed("t1_lineage");
    const values = [...document.querySelectorAll<HTMLElement>("[data-pp-reveal-value]")];
    expect(values.map((v) => v.dataset.ppRevealMotion)).toEqual(["staged", "staged", "staged", "staged"]);
    expect(values.map((v) => v.style.animationDelay)).toEqual(
      [0, 1, 2, 3].map((i) => `${REVEAL_VALUE_DELAY_MS + i * REVEAL_VALUE_STAGGER_MS}ms`),
    );
    const footer = document.querySelector<HTMLElement>("[data-pp-reveal-footer]")!;
    expect(parseInt(footer.style.animationDelay, 10)).toBeLessThan(700);
  });

  it("is fully static under the app's Reduce Motion", () => {
    document.documentElement.classList.add("reduce-motion");
    renderRevealed("t1_lineage");
    for (const el of document.querySelectorAll<HTMLElement>("[data-pp-reveal-value], [data-pp-reveal-footer]")) {
      expect(el.dataset.ppRevealMotion).toBe("static");
      expect(el.className).not.toContain("animate-in");
      expect(el.style.animationDelay).toBe("");
    }
  });

  it("is fully static under the OS reduced-motion preference", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      ...original(query), matches: query.includes("prefers-reduced-motion"),
    })) as typeof window.matchMedia;
    try {
      renderRevealed("champion_player");
      for (const el of document.querySelectorAll<HTMLElement>("[data-pp-reveal-value], [data-pp-reveal-footer]")) {
        expect(el.dataset.ppRevealMotion).toBe("static");
        expect(el.className).not.toContain("animate-in");
      }
    } finally {
      window.matchMedia = original;
    }
  });
});

// ─── Density (static guarantees; pixels are in the handoff captures) ─────

describe("density", () => {
  it("the values hold no fixed height and never scroll", () => {
    for (const key of ALL) {
      const { container, unmount } = renderRevealed(key);
      for (const el of container.querySelectorAll("[data-pp-reveal-slot] *")) {
        expect(el.getAttribute("class") ?? "").not.toMatch(/(^|\s)(min-h|max-h|h)-/);
      }
      const scoped = "[data-pp-reveal-slot], [data-pp-reveal-slot] *, [data-pp-reveal-footer], [data-pp-reveal-footer] *";
      for (const el of container.querySelectorAll(scoped)) {
        expect(el.getAttribute("class") ?? "").not.toMatch(/overflow-(auto|scroll|y-auto|x-auto)/);
      }
      unmount();
    }
  });
});

// ─── Source guards ────────────────────────────────────────────────────────

describe("source guards", () => {
  const dir = __dirname;
  const sources = readdirSync(dir)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes(".test."))
    // Comments may name what the code must not read; scan code only.
    .map((f) => ({
      f,
      src: readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""),
    }));

  it("reads only the graded reveal: no legacy presentation, raw result or label verdict", () => {
    expect(sources.length).toBeGreaterThanOrEqual(4);
    for (const { f, src } of sources) {
      expect(src, f).not.toMatch(/\.presentation\b|\bcorrect_answer\b|\bis_correct\b|\bselected_answer\b|asEvidence/);
      expect(src, f).not.toMatch(/\.correct_label\b/);
    }
  });

  it("never sorts, reverses or ranks", () => {
    for (const { f, src } of sources) {
      expect(src, f).not.toMatch(/\.(sort|reverse|toSorted|toReversed)\(/);
      expect(src, f).not.toMatch(/\b(win_rate|champion_share|presence)\s*[-*/<>]/);
    }
  });

  it("stays out of the answer path and the files this workstream may not change", () => {
    for (const { f, src } of sources) {
      expect(src, f).not.toMatch(/data-quiz-choice=\{/);
      expect(src, f).not.toMatch(/(?:function|const)\s+\w*Answer(?:Grid|Options)\b/);
      expect(src, f).not.toMatch(/from "@\/pages\/ProPlayQuiz"|from "@\/lib\/pro-play\/arena/);
    }
  });
});
