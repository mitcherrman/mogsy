/**
 * PAV1 — the lab's STAND-IN SERVER for Pro Play Assembly rounds. DEVELOPMENT
 * ONLY.
 *
 * It plays the part the backend (PA2's `assembly.v1`) will play: it reads
 * PA1's frozen capture (certified candidates and audited trays), issues a
 * round whose card tokens are opaque and per-round, keeps the answer map in
 * a secret the primitive never receives, and grades a locked board into a
 * `PositionalAssemblyReveal` — one whole-board outcome with per-position
 * correction evidence, worded here. Nothing in this file is imported by the
 * primitive, and its source test pins that.
 */
import capture from "@/lib/pro-play-assembly/__fixtures__/pa1AssemblyCapture.json";
import {
  ASSEMBLY_SLOT_LABELS, ASSEMBLY_SLOT_ORDER, ASSEMBLY_SLOT_ROLE, slotForRole,
  type AssemblyCapture, type AssemblyFamily, type AssemblyRole, type AssemblySlotId, type CapturedRound, type CapturedTray,
} from "@/lib/pro-play-assembly/capture";
import type {
  AssemblyCard, AssemblyPosition, PositionalAssemblyPublic, PositionalAssemblyResponse, PositionalAssemblyReveal,
} from "@/lib/interaction-grammar/types";
import { monogramFor } from "@/lib/interaction-grammar/positionalAssembly";
import { getChampionSquareIconUrl } from "@/lib/combat-lab/abilityIcons";
import { resolveAssetUrl } from "@/hooks/useChampionAssets";
import { ROLE_EMBLEM_SRC } from "@/components/ranked-arena/RoleEmblem";

export const ASSEMBLY_CAPTURE = capture as unknown as AssemblyCapture;

export interface LabOptions {
  /** Tray size, 10 or 15. Default 10. */
  size?: 10 | 15;
  /** Roster Lock only: include the bench tier (the prompt asks who STARTED, so PA1 allows it). Default true. */
  bench?: boolean;
}

/** A deterministic 32-bit hash (FNV-1a) for per-round token minting and ordering. */
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function labRounds(family?: AssemblyFamily): CapturedRound[] {
  return ASSEMBLY_CAPTURE.rounds.filter((r) => !family || r.family === family);
}

export function findRound(id: string): CapturedRound | null {
  return ASSEMBLY_CAPTURE.rounds.find((r) => r.id === id) ?? null;
}

/** A deterministic order through a family's rounds for a seed. */
export function roundOrder(seed: string, family: AssemblyFamily): CapturedRound[] {
  return [...labRounds(family)].sort((a, b) => fnv(`${seed}:${a.id}`) - fnv(`${seed}:${b.id}`));
}

export interface LabSecret {
  /** position id → the token that belongs there. */
  answer: Record<string, string>;
  /** token → PA1's private card metadata (tier, role anchor). */
  cards: Record<string, { tier: string; roleAnchor: AssemblyRole }>;
  round: CapturedRound;
  tray: CapturedTray;
}

export interface LabRound {
  id: string;
  content: PositionalAssemblyPublic;
  secret: LabSecret;
}

const stageWord = (s: string | null) => (s === "Finals" ? "Final" : s === "Semifinals" ? "Semifinal" : s === "Quarterfinals" ? "Quarterfinal" : "");
const eventWord = (r: CapturedRound) => `${r.subject.season} World Championship ${stageWord(r.subject.stage)}`.trim();

export function promptFor(r: CapturedRound): string {
  const team = r.display.team;
  if (r.family === "roster_lock") return `Reconstruct ${team}'s starting lineup in the ${eventWord(r)}.`;
  return `Reconstruct ${team}'s Game ${r.subject.game_number} composition in the ${eventWord(r)}.`;
}

export function eyebrowFor(r: CapturedRound): string {
  const base = `Worlds ${r.subject.season} ${r.subject.stage ?? ""}`.trim();
  return r.family === "roster_lock" ? `Roster Lock · ${base}` : `Draft Memory · ${base} · Game ${r.subject.game_number}`;
}

export function teamMark(teamKey: string): { media: { src: string; alt: string } | null; monogram: string } {
  const m = ASSEMBLY_CAPTURE.team_media[teamKey];
  const src = m?.state === "art" && m.asset_path ? resolveAssetUrl(m.asset_path) : null;
  return { media: src ? { src, alt: "" } : null, monogram: m?.label ?? monogramFor(teamKey) };
}

export function positionsFor(): AssemblyPosition[] {
  return ASSEMBLY_SLOT_ORDER.map((id) => ({
    id, label: ASSEMBLY_SLOT_LABELS[id].label, short: ASSEMBLY_SLOT_LABELS[id].short,
    emblem: { src: ROLE_EMBLEM_SRC[id], alt: "" },
  }));
}

function pickTray(r: CapturedRound, seed: string, opts: LabOptions): CapturedTray {
  const size = opts.size ?? 10;
  const bench = opts.bench ?? true;
  const pool = r.trays.filter((t) => t.size === size && (r.family !== "roster_lock" || Boolean(t.include_bench) === bench));
  const list = pool.length ? pool : r.trays;
  return list[fnv(`${seed}:${r.id}:tray`) % list.length];
}

export function buildLabRound(r: CapturedRound, seed: string, opts: LabOptions = {}): LabRound {
  const tray = pickTray(r, seed, opts);
  const mint = (t: string) => `pa_${fnv(`${seed}:${r.content_id}:${t}`).toString(36)}`;
  const kind = r.family === "roster_lock" ? "identity" : "icon";
  const cards: AssemblyCard[] = tray.cards.map((c) => {
    // PA1's display name disambiguates same-handle players with a parenthetical
    // ("Blank (Kang Sun-gu)"); the card leads with the handle and keeps the rest under it.
    const { handle, rest } = splitHandle(c.label);
    return {
      token: mint(c.token),
      label: c.entity_type === "player" ? handle : c.label,
      sublabel: c.entity_type === "player" ? rest : null,
      media: c.entity_type === "champion" ? { src: getChampionSquareIconUrl(c.entity_key) ?? "", alt: "" } : null,
      monogram: c.entity_type === "player" ? monogramFor(handle) : null,
    };
  });
  const mark = teamMark(r.subject.team_key);
  const content: PositionalAssemblyPublic = {
    prompt: promptFor(r),
    eyebrow: eyebrowFor(r),
    subject: {
      label: r.display.team,
      sublabel: `vs ${r.display.opponent ?? r.subject.opponent_key} · ${r.subject.tournament_name}`,
      media: mark.media, monogram: mark.monogram,
    },
    cardKind: kind,
    positions: positionsFor(),
    cards,
    footnote: `${ASSEMBLY_CAPTURE.authority.contract_version} · rules ${ASSEMBLY_CAPTURE.authority.rules_version}`,
  };
  const answer: Record<string, string> = {};
  for (const slot of ASSEMBLY_SLOT_ORDER) answer[slot] = mint(tray.private.answer[slot]);
  const meta: Record<string, { tier: string; roleAnchor: AssemblyRole }> = {};
  for (const [t, m] of Object.entries(tray.private.cards)) meta[mint(t)] = { tier: m.tier, roleAnchor: m.role_anchor };
  return { id: r.id, content, secret: { answer, cards: meta, round: r, tray } };
}

/** "Blank (Kang Sun-gu)" → handle "Blank", rest "Kang Sun-gu". */
export function splitHandle(label: string): { handle: string; rest: string | null } {
  const m = /^(.*?)\s*\((.+)\)\s*$/.exec(label);
  return m ? { handle: m[1].trim() || label, rest: m[2].trim() } : { handle: label, rest: null };
}

const roleNoun: Record<AssemblyRole, string> = { Top: "top laner", Jungle: "jungler", Mid: "mid laner", Bot: "bot laner", Support: "support" };

/** What a placed card WAS — the server's own words beside a wrong pick. */
function noteFor(secret: LabSecret, token: string): string | null {
  const m = secret.cards[token];
  if (!m) return null;
  const r = secret.round;
  const team = r.display.team;
  const opp = r.display.opponent ?? r.subject.opponent_key;
  const role = m.roleAnchor;
  if (r.family === "roster_lock") {
    switch (m.tier) {
      case "answer": return `${team}'s ${roleNoun[role]} in this series — right player, wrong position.`;
      case "opponent": return `${opp}'s ${roleNoun[role]} in this series.`;
      case "bench": return `On ${team}'s roster at ${role} that day, but did not start.`;
      default: return `A ${roleNoun[role]} for another team at Worlds ${r.subject.season}.`;
    }
  }
  switch (m.tier) {
    case "answer": return `${team} did play it in this game — at ${role}.`;
    case "series": return `${team}'s ${role} pick in another game of this series.`;
    case "opponent": return `${opp}'s ${role} pick in this game.`;
    default: return `A ${role} pick elsewhere at Worlds ${r.subject.season}.`;
  }
}

function contextFor(secret: LabSecret): PositionalAssemblyReveal["context"] {
  const r = secret.round;
  const team = r.display.team;
  const opp = r.display.opponent ?? r.subject.opponent_key;
  const title = `${team} vs ${opp} · ${r.subject.tournament_name} · ${r.subject.stage ?? ""}`.trim();
  const lines: string[] = [];
  if (r.family === "roster_lock") {
    const dates = [...new Set(r.subject.games.map((g) => g.game_date.slice(0, 10)))];
    lines.push(`Best of ${r.subject.games.length}: games 1–${r.subject.games.length} · ${dates.join(", ")}`);
    lines.push("The same five started every game; each is corroborated by a dated registry tenure.");
  } else {
    const s = r.subject;
    lines.push(`Game ${s.game_number} · ${s.game_date.slice(0, 10)} · patch ${s.patch ?? "?"} · ${s.side} side`);
    lines.push("Champion–role assignment only; no pick order is recorded or implied.");
    if (r.provenance.path === "source_recovered") lines.push("Recovered from historical source picks (canonical side was short).");
  }
  return { title, lines, source: { label: `Leaguepedia via Mogzy's canonical pro layer · PA1 ${ASSEMBLY_CAPTURE.authority.rules_version}`, url: null } };
}

/** The server's grader: every position compared to its own answer. One whole-board outcome. */
export function gradeLabRound(secret: LabSecret, response: PositionalAssemblyResponse): PositionalAssemblyReveal {
  const positionCorrect: Record<string, boolean> = {};
  let right = 0;
  for (const slot of ASSEMBLY_SLOT_ORDER) {
    const placed = response.assignment[slot];
    if (placed === undefined) throw new Error(`lab: response has no card at ${slot}`);
    if (!secret.cards[placed]) throw new Error("lab: response names a card this round never dealt");
    const ok = placed === secret.answer[slot];
    positionCorrect[slot] = ok;
    if (ok) right++;
  }
  const total = ASSEMBLY_SLOT_ORDER.length;
  const isCorrect = right === total;
  const cardNotes: Record<string, string> = {};
  for (const slot of ASSEMBLY_SLOT_ORDER) {
    if (positionCorrect[slot]) continue;
    const t = response.assignment[slot];
    const note = noteFor(secret, t);
    if (note) cardNotes[t] = note;
  }
  const verdictText = isCorrect
    ? (secret.round.family === "roster_lock" ? "Every position right — the lineup holds." : "Every position right — the composition holds.")
    : `${right} of ${total} in position.`;
  return {
    assignment: { ...response.assignment },
    canonical: { ...secret.answer },
    positionCorrect, isCorrect, verdictText, cardNotes,
    context: contextFor(secret),
  };
}

/** Pre-arranged boards for capture states. */
export function arrangedBoard(round: LabRound, kind: "right" | "wrong"): Record<string, string> {
  const a = round.secret.answer;
  if (kind === "right") return { ...a };
  // Two positions swapped and one filled with a distractor: three wrong, two right.
  const out: Record<string, string> = { ...a };
  [out.top, out.mid] = [a.mid, a.top];
  const answerTokens = new Set(Object.values(a));
  const distractor = round.content.cards.find((c) => !answerTokens.has(c.token));
  if (distractor) out.support = distractor.token;
  return out;
}

export const SLOT_ROLE = ASSEMBLY_SLOT_ROLE;
export const roleSlot = slotForRole;
