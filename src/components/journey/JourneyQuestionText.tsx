/**
 * JP4 — THE QUESTION'S WORDS, with League-native subject icons, fitted to the
 * fixed prompt box.
 *
 * ICONS REINFORCE NOUNS; THEY NEVER REPLACE THEM. A small icon sits before the
 * word it identifies — the ability being asked about, the champion whose stat
 * is asked, the stat itself (by its mnemonic). Which nouns get one is a rule
 * per question kind, not a text scan for everything recognisable:
 *
 *   Combat    the ability (its icon) · the TARGET champion (the attacker is
 *             already identified by the ability's own icon)
 *   Stat      the champion · the stat's mnemonic
 *   Formula   the ability
 *   Other     the champions named (at most two)
 *
 * Each noun is marked once (its first occurrence), at most three per
 * sentence. The icons are `aria-hidden`: the sentence reads exactly as before.
 *
 * FIXED BOX, ADAPTIVE TYPE (`useFittedQuestion`). The prompt region's height is
 * the stage's (`--jq-prompt-h`); the sentence takes the LARGEST size between
 * the stage's `--jq-q-min` and `--jq-q-max` at which it fits, centred in the
 * box. It is measured before paint (a layout effect), so a question never
 * appears at one size and jumps to another.
 */
import { useLayoutEffect, type ReactNode, type RefObject } from "react";
import type { AbilitySlot } from "@/lib/journey/contract";
import type { StatMnemonic } from "@/lib/journey/statIcons";
import { AbilityIcon, ChampionIcon, StatMnemonicIcon } from "./JourneyIcons";

export type PromptSubject =
  | { kind: "ability"; text: string; champion: string; slot: AbilitySlot }
  | { kind: "champion"; text: string; championId: string }
  | { kind: "stat"; text: string; mnemonic: StatMnemonic };

/** At most this many icons in one sentence. */
export const PROMPT_ICON_LIMIT = 3;

/** A letter or digit (Latin, with accents): what a whole-word match may not touch. */
const WORD_CHAR = /[A-Za-z0-9À-ɏ]/;
const isWordChar = (c: string | undefined) => c !== undefined && WORD_CHAR.test(c);

/** The first whole-word occurrence of `word` (no regex is built per call). */
function wholeWordAt(sentence: string, word: string): number {
  for (let at = sentence.indexOf(word); at >= 0; at = sentence.indexOf(word, at + 1)) {
    if (!isWordChar(sentence[at - 1]) && !isWordChar(sentence[at + word.length])) return at;
  }
  return -1;
}

/** Where each subject first occurs as a whole word; overlaps and repeats dropped. */
export function locateSubjects(sentence: string, subjects: readonly PromptSubject[]) {
  const hits: { at: number; end: number; subject: PromptSubject }[] = [];
  for (const subject of subjects) {
    if (!subject.text) continue;
    const at = wholeWordAt(sentence, subject.text);
    if (at < 0) continue;
    const end = at + subject.text.length;
    if (hits.some((h) => at < h.end && end > h.at)) continue;
    hits.push({ at, end, subject });
  }
  return hits.sort((a, b) => a.at - b.at).slice(0, PROMPT_ICON_LIMIT);
}

function SubjectIcon({ subject }: { subject: PromptSubject }) {
  if (subject.kind === "ability") {
    return <AbilityIcon champion={subject.champion} slot={subject.slot} size="inline" testId="journey-q-icon-ability" />;
  }
  if (subject.kind === "champion") {
    return <ChampionIcon championId={subject.championId} championName={subject.text} size="inline" testId="journey-q-icon-champion" />;
  }
  return <StatMnemonicIcon mnemonic={subject.mnemonic} size="inline" testId="journey-q-icon-stat" />;
}

/**
 * "Rank 1" is one unit, and it belongs to the ability after it: a line never
 * breaks inside it or between it and the ability's icon. Display only (the
 * words are unchanged; the breaks become non-breaking).
 */
const bindRank = (text: string) => text.replace(/\bRank (\d+) /g, "Rank\u00a0$1\u00a0");

/** The sentence, each located subject preceded by its icon (kept with its word). */
export function JourneyQuestionText({ sentence: served, subjects }: { sentence: string; subjects: readonly PromptSubject[] }) {
  const sentence = bindRank(served);
  const hits = locateSubjects(sentence, subjects);
  const parts: ReactNode[] = [];
  let at = 0;
  hits.forEach((h, i) => {
    let before = sentence.slice(at, h.at);
    // An ability keeps its "Rank N" on its own line with it and its icon.
    const rank = h.subject.kind === "ability" ? /Rank\u00a0\d+\u00a0$/.exec(before) : null;
    if (rank) before = before.slice(0, rank.index);
    if (before) parts.push(before);
    parts.push(
      <span key={i} className="journey-q-subject" data-subject-kind={h.subject.kind}>
        {rank?.[0]}<SubjectIcon subject={h.subject} />{sentence.slice(h.at, h.end)}
      </span>,
    );
    at = h.end;
  });
  if (at < sentence.length) parts.push(sentence.slice(at));
  return <span data-testid="journey-question-text" data-icons={hits.length}>{parts}</span>;
}

const px = (v: string, fallback: number) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Fit the question into its fixed box: the largest size in [min, max] (half
 * pixels) at which the prompt's content fits the reserved height. Writes
 * `--jq-q-fs` on the host; re-fits when the box's width changes or web fonts
 * finish loading. `key` changes with the sentence.
 */
export function useFittedQuestion(hostRef: RefObject<HTMLElement>, key: string) {
  useLayoutEffect(() => {
    const host = hostRef.current;
    const header = host?.querySelector<HTMLElement>('[data-surface-region="prompt"]');
    const title = header?.querySelector<HTMLElement>("h2");
    if (!host || !header || !title) return;
    let lastWidth = -1;
    /** Fit once; true when the content fits the box at the size chosen. */
    const fitOnce = (): boolean => {
      const cs = getComputedStyle(host);
      const min = px(cs.getPropertyValue("--jq-q-min"), 17);
      const max = px(cs.getPropertyValue("--jq-q-max"), 24);
      const room = px(getComputedStyle(header).minHeight, header.clientHeight);
      const shown = ([...header.children] as HTMLElement[]).filter((c) => c === title || c.offsetParent !== null);
      const gap = px(getComputedStyle(header).rowGap, 0);
      // The content's REAL extent — the first shown element's top to the last's
      // bottom, so the margins between them (a stated formula under the
      // question) count. Without layout (jsdom) it falls back to the heights.
      const used = () => {
        const extent = shown[shown.length - 1].getBoundingClientRect().bottom - shown[0].getBoundingClientRect().top;
        return extent > 0 ? extent
          : shown.reduce((n, c, i) => n + c.offsetHeight + (i > 0 ? gap : 0), 0);
      };
      // A yielding block (the live chain) must also fit the box's WIDTH; the
      // type size cannot help it there.
      const wide = () => shown.some((c) => c.hasAttribute("data-yields") && c.scrollWidth > c.clientWidth + 1);
      let lo = min * 2;
      let hi = max * 2;
      host.style.setProperty("--jq-q-fs", `${max}px`);
      if (used() <= room) { host.dataset.qFit = String(max); return !wide(); }
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        host.style.setProperty("--jq-q-fs", `${mid / 2}px`);
        if (used() <= room) lo = mid; else hi = mid - 1;
      }
      host.style.setProperty("--jq-q-fs", `${lo / 2}px`);
      host.dataset.qFit = String(lo / 2);
      return used() <= room && !wide();
    };
    // JP5 — THE BOX NEVER GROWS. A block marked `data-yields` (the live
    // Reasoning Chain) takes its room from the question's type. Where the
    // question cannot fit beside it even at its smallest size, the block steps
    // down — first to its one-line form (`inline`), then away (`yielded`) — and
    // the question is fitted again. The prompt box, and so the answers under
    // it, never move for it.
    const fit = () => {
      delete host.dataset.liveFit;
      if (!header.querySelector("[data-yields]")) { fitOnce(); return; }
      for (const tier of ["inline", "yielded"] as const) {
        if (fitOnce()) return;
        host.dataset.liveFit = tier;
      }
      fitOnce();
    };
    fit();
    lastWidth = header.clientWidth;
    let cancelled = false;
    void document.fonts?.ready.then(() => { if (!cancelled) fit(); });
    if (typeof ResizeObserver === "undefined") return () => { cancelled = true; };
    const ro = new ResizeObserver(() => {
      if (header.clientWidth === lastWidth) return;
      lastWidth = header.clientWidth;
      fit();
    });
    ro.observe(header);
    return () => { cancelled = true; ro.disconnect(); };
  }, [hostRef, key]);
}
