/**
 * WP1 — freeze the Word Puzzle demonstration rounds against the backend's
 * authority files. READ-ONLY on the backend; writes one JSON fixture here.
 *
 *   npx tsx scripts/word-puzzle/captureWordPuzzleRounds.ts [path-to-League_Combat_Simulator]
 *
 * Every curated answer is checked VERBATIM against an authority the repo
 * already trusts:
 *   * abilities and champions — `champion_ability_canonical/data/range_authority.json`
 *     (CHAMPDATA Pass 12, wiki-stamped: ability names + revision ids);
 *   * items — `fixtures/reconstruct_recipe_graph_rev4065930.json`
 *     (`item_canonical.canonical_name`, wiki rev 4065930).
 * An entry with no authority in the repo is written with `verified: false`
 * and the lab labels it DEVELOPMENT-ONLY. The script refuses to write if a
 * `verified` entry's answer is not found where it claims to be.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const backend = path.resolve(process.argv[2] ?? "../League_Combat_Simulator/.worktrees/reconstruct-r1-be");
const out = path.resolve("src/lib/word-puzzle/__fixtures__/wordPuzzleRounds.json");

interface AbilityRecord { champion: string; slot: string; ability: string; authority_source_url: string; authority_revision_id: number }
interface ItemCanonical { canonical_item_id: number; canonical_name: string }

const abilities = JSON.parse(readFileSync(path.join(backend, "champion_ability_canonical/data/range_authority.json"), "utf8")) as AbilityRecord[];
const recipe = JSON.parse(readFileSync(path.join(backend, "fixtures/reconstruct_recipe_graph_rev4065930.json"), "utf8")) as {
  item_canonical: ItemCanonical[]; provenance: { source_revision: number; source_url: string };
};

type Curated =
  | { id: string; family: "ability"; champion: string; slot: string; traits: string[] }
  | { id: string; family: "champion"; champion: string; clueSlot: string; traits: string[] }
  | { id: string; family: "item"; name: string; traits: string[] }
  | { id: string; family: "region"; answer: string; caption: string; traits: string[] };

/** The set validates the instrument's flexibility, not the breadth of a pool. */
const CURATED: Curated[] = [
  { id: "zephyr", family: "ability", champion: "Janna", slot: "W", traits: ["short word"] },
  { id: "kaisa", family: "champion", champion: "Kai'Sa", clueSlot: "icon", traits: ["apostrophe", "short", "recognisable clue"] },
  { id: "heimerdinger", family: "champion", champion: "Heimerdinger", clueSlot: "W", traits: ["long name", "repeated letters", "abstract clue"] },
  { id: "infinity-edge", family: "item", name: "Infinity Edge", traits: ["two words", "recognisable clue"] },
  { id: "rabadons-deathcap", family: "item", name: "Rabadon's Deathcap", traits: ["apostrophe", "two words"] },
  { id: "ace-in-the-hole", family: "ability", champion: "Caitlyn", slot: "R", traits: ["four short words"] },
  { id: "sleepy-trouble-bubble", family: "ability", champion: "Zoe", slot: "E", traits: ["repeated letters", "three words"] },
  { id: "command-shockwave", family: "ability", champion: "Orianna", slot: "R", traits: ["colon mark"] },
  { id: "life-form-disintegration-ray", family: "ability", champion: "Vel'Koz", slot: "R", traits: ["long phrase in a short viewport", "word must break on a phone"] },
  { id: "shurima", family: "region", answer: "Shurima", caption: "A desert empire of the Ascended", traits: ["abstract text-only clue", "UNVERIFIED — development only"] },
];

interface Round {
  id: string;
  family: string;
  answer: string;
  prompt: string;
  categoryLabel: string;
  clue: { champion?: string; slot?: string; itemId?: number; caption: string | null; monogram?: string };
  verified: boolean;
  source: { label: string; url: string | null; revisionId: number | null } | null;
  note: string | null;
  traits: string[];
}

const rounds: Round[] = [];
for (const c of CURATED) {
  if (c.family === "ability") {
    const r = abilities.find((a) => a.champion === c.champion && a.slot === c.slot);
    if (!r) throw new Error(`no authority record for ${c.champion} ${c.slot}`);
    rounds.push({
      id: c.id, family: "ability", answer: r.ability, prompt: "Set the name of this ability.", categoryLabel: "Ability",
      clue: { champion: r.champion, slot: r.slot, caption: `${r.champion} · ${r.slot}` },
      verified: true, source: { label: "League Wiki · ability data template", url: r.authority_source_url, revisionId: r.authority_revision_id },
      note: `${r.ability} is ${r.champion}'s ${r.slot}.`, traits: c.traits,
    });
  } else if (c.family === "champion") {
    const recs = abilities.filter((a) => a.champion === c.champion);
    if (!recs.length) throw new Error(`no authority records for champion ${c.champion}`);
    const clueRec = c.clueSlot === "icon" ? null : recs.find((a) => a.slot === c.clueSlot) ?? null;
    if (c.clueSlot !== "icon" && !clueRec) throw new Error(`no ${c.clueSlot} for ${c.champion}`);
    rounds.push({
      id: c.id, family: "champion", answer: c.champion, prompt: "Set this champion's name.", categoryLabel: "Champion",
      clue: { champion: c.champion, slot: c.clueSlot, caption: clueRec ? `Their ${clueRec.slot}: ${clueRec.ability}` : null },
      verified: true, source: { label: "League Wiki · ability data templates", url: recs[0].authority_source_url, revisionId: recs[0].authority_revision_id },
      note: clueRec ? `${clueRec.ability} is ${c.champion}'s ${clueRec.slot}.` : null, traits: c.traits,
    });
  } else if (c.family === "item") {
    const it = recipe.item_canonical.find((i) => i.canonical_name === c.name);
    if (!it) throw new Error(`item "${c.name}" is not in item_canonical at rev ${recipe.provenance.source_revision}`);
    rounds.push({
      id: c.id, family: "item", answer: it.canonical_name, prompt: "Set the name of this item.", categoryLabel: "Item",
      clue: { itemId: it.canonical_item_id, caption: "Summoner's Rift shop" },
      verified: true, source: { label: "League Wiki · Module:ItemData", url: recipe.provenance.source_url, revisionId: recipe.provenance.source_revision },
      note: null, traits: c.traits,
    });
  } else {
    rounds.push({
      id: c.id, family: "region", answer: c.answer, prompt: "Set the name of this region.", categoryLabel: "Region",
      clue: { caption: c.caption, monogram: "◈" },
      verified: false, source: null,
      note: "No region authority exists in the repository: this round is a development-only demonstration.", traits: c.traits,
    });
  }
}

let backendCommit = "unknown";
try { backendCommit = execSync("git rev-parse HEAD", { cwd: backend }).toString().trim(); } catch { /* not a git checkout */ }

const fixture = {
  capturedAt: new Date().toISOString(),
  backend: { path: path.basename(backend), commit: backendCommit },
  abilityAuthority: "champion_ability_canonical/data/range_authority.json",
  itemAuthority: `fixtures/reconstruct_recipe_graph_rev${recipe.provenance.source_revision}.json`,
  rounds,
};
writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote ${rounds.length} rounds (${rounds.filter((r) => r.verified).length} verified) to ${out}`);
