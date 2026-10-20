/**
 * VIS-F2 — the media slot registry.
 *
 * Every piece of environment, character or broadcast art the cinematic layer
 * draws goes through a named SLOT. A slot resolves to either an existing
 * Mogzy asset (checked in under `public/`, Mogzy's own art) or `null`, which
 * means the slot is currently painted in CSS / inline SVG by `scenes.tsx`.
 * Swapping a slot for real production art is a one-line change here; the
 * handoff lists every slot so the art pass knows exactly what to make.
 *
 * Provenance rule: only Mogzy-owned art is referenced. `public/themes/lol-bg.png`
 * (Summoner's Rift wallpaper) is deliberately NOT used.
 */

export type SceneId = "hq" | "practice" | "warroom" | "tunnel" | "stadium" | "backstage" | "trophy";

export interface MediaSlot {
  id: string;
  /** What the slot shows and where it is drawn. */
  purpose: string;
  /** Existing Mogzy asset path, or null when CSS / SVG paints it. */
  src: string | null;
  /** How the current fill was made. */
  fill: "mogzy-asset" | "css-svg";
  /** The art brief for a future production asset. */
  brief: string;
}

export const MEDIA_SLOTS: Record<string, MediaSlot> = {
  "scene.hq": { id: "scene.hq", purpose: "Team HQ backdrop (home, roster, season hub)", src: "/assets/ranked/ranked-academy-duel-bg-960w.webp", fill: "mogzy-asset", brief: "Gaming-house common room at night: city window, trophy shelf, team banner in the org accent." },
  "scene.practice": { id: "scene.practice", purpose: "Practice / scrim room backdrop (preparation, transfer window)", src: "/images/lol-hub/leaguecraft-classroom-bg.png", fill: "mogzy-asset", brief: "Scrim room: five monitors glowing, whiteboard with a draft, headsets on the desk." },
  "scene.warroom": { id: "scene.warroom", purpose: "Draft / war-room backdrop (scouting, draft)", src: null, fill: "css-svg", brief: "War room: a dark table with a lit map grid, opponent dossier pinned up, coach's tablet." },
  "scene.tunnel": { id: "scene.tunnel", purpose: "Arena tunnel (draft lock to game, finals intro)", src: null, fill: "css-svg", brief: "Players' tunnel: converging walls, stage light at the end, crowd roar beyond." },
  "scene.stadium": { id: "scene.stadium", purpose: "Main stage / stadium backdrop (the game)", src: null, fill: "css-svg", brief: "Stadium: light rig and beams, LED ribbon with both team names, crowd silhouettes." },
  "scene.backstage": { id: "scene.backstage", purpose: "Backstage / postgame (game result, between-game tactic, series result)", src: null, fill: "css-svg", brief: "Backstage: warm bulb row, equipment cases, a monitor replaying the game." },
  "scene.trophy": { id: "scene.trophy", purpose: "Trophy / legacy room (run end)", src: null, fill: "css-svg", brief: "Trophy hall: a single spotlight on a pedestal, the legacy card framed, confetti settled on the floor." },
  "caster.analyst": { id: "caster.analyst", purpose: "Analyst caster portrait in caster pop-ins", src: "/mascot/mogzy-explaining-transparent-192.webp", fill: "mogzy-asset", brief: "Fictional analyst caster portrait (desk, headset)." },
  "caster.hype": { id: "caster.hype", purpose: "Play-by-play caster portrait in caster pop-ins", src: "/mascot/mogzy-raising-hand-transparent-192.webp", fill: "mogzy-asset", brief: "Fictional play-by-play caster portrait (mid-shout)." },
  "chat.avatar": { id: "chat.avatar", purpose: "Chat pop-in avatar", src: "/mascot/mogzy-peeking-transparent-192.webp", fill: "mogzy-asset", brief: "Small viewer avatar set (6-8 fictional avatars)." },
  "hero.victory": { id: "hero.victory", purpose: "Victory mascot on result, series and legacy heroes", src: "/mascot/mogzy-cheering-transparent-240.webp", fill: "mogzy-asset", brief: "Team celebration key art in the org accent." },
  "hero.defeat": { id: "hero.defeat", purpose: "Defeat mascot on result and series heroes", src: "/mascot/mogzy-defeated-transparent.png", fill: "mogzy-asset", brief: "Quiet backstage key art after a loss." },
  "objective.dragon": { id: "objective.dragon", purpose: "Dragon pit map moment", src: null, fill: "css-svg", brief: "Dragon pit at night, ember light from below, the drake's silhouette rising." },
  "objective.baron": { id: "objective.baron", purpose: "Baron pit map moment", src: null, fill: "css-svg", brief: "Baron pit, violet mist, the worm's eye lit." },
  "objective.elder": { id: "objective.elder", purpose: "Elder pit map moment", src: null, fill: "css-svg", brief: "Elder pit, ice light, frost in the air." },
  "objective.teamfight": { id: "objective.teamfight", purpose: "Decisive teamfight map moment", src: null, fill: "css-svg", brief: "Mid-lane fight silhouette, gold flash." },
  "champion.class": { id: "champion.class", purpose: "Class glyphs on champion cards (6 classes)", src: null, fill: "css-svg", brief: "Six class glyphs: Tank, Fighter, Assassin, Marksman, Mage, Enchanter, in gold line art." },
  "player.portrait": { id: "player.portrait", purpose: "Player portrait slot on player cards", src: null, fill: "css-svg", brief: "Painted portraits per synthetic player (monogram fallback stays)." },
  "trophy.cup": { id: "trophy.cup", purpose: "The championship trophy on the champions ending", src: null, fill: "css-svg", brief: "The Worlds Dynasty cup, gold, on a navy plinth." },
};

export const SCENE_META: Record<SceneId, { name: string; caption: string }> = {
  hq: { name: "Team HQ", caption: "The gaming house" },
  practice: { name: "Practice room", caption: "Scrim block" },
  warroom: { name: "War room", caption: "Draft and scouting" },
  tunnel: { name: "Arena tunnel", caption: "Walking out" },
  stadium: { name: "Main stage", caption: "Live" },
  backstage: { name: "Backstage", caption: "Postgame" },
  trophy: { name: "Trophy hall", caption: "Legacy" },
};

/** A tiny deterministic hash for synthetic broadcast lines (no engine draws touched). */
export function pick<T>(items: readonly T[], key: string): T {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return items[(h >>> 0) % items.length];
}
