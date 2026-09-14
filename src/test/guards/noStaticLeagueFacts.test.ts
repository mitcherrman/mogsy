/**
 * QCA5 — no hand-maintained League fact may live in production frontend source.
 *
 * Why this guard exists
 * ---------------------
 * `src/lib/quiz-broadcast/mock-questions.ts` held five hand-written League
 * questions — champion cooldowns, item stat lines, a summoner-spell cooldown,
 * two item recipes — each with its own `correct_answer` literal and a
 * `patch: "14.20"` stamp. It was the admin Broadcast Studio's offline
 * fallback, which is precisely why nobody noticed it had gone stale: a
 * fallback is the path you only see when something else is already broken.
 *
 * League facts have canonical owners in the backend and reach this app over
 * `/api/quiz/questions`. A copy in frontend source is a second authority that
 * nothing reconciles, and the copy always loses eventually.
 *
 * What this asserts
 * -----------------
 * 1. No production source file (anything that is not a test and not an
 *    explicitly-named fixture) declares a non-empty `correct_answer` string
 *    literal.
 * 2. The Broadcast Studio's offline fallback names no League entity at all, so
 *    an operator who sees it on screen can tell instantly that it is a
 *    placeholder rather than an answer.
 *
 * If a real question ever needs to ship in this repo, it fails here first —
 * which is the whole point. Fetch it, or put it in a file this guard can see
 * is a fixture.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { MOCK_BROADCAST_QUESTIONS } from "@/lib/quiz-broadcast/mock-questions";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** A path is exempt when its own name says it is a test or a fixture. */
const EXEMPT = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /__fixtures__[/\\]/,
  /[Ff]ixtures?\.[tj]sx?$/,
  /[Ff]ixtures?[/\\]/,
  /capturedPlaytestPayloads\.ts$/,
  /sample-data\.ts$/,
  /[/\\]test[/\\]/,
  // The Broadcast Studio's offline fallback. It is a fixture — the whole
  // point of QCA5's change to it — and the second test below is the guard
  // that keeps it one, by reading its DATA rather than its source text.
  /quiz-broadcast[/\\]mock-questions\.ts$/,
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    const rel = relative(ROOT, full);
    if (EXEMPT.some((pattern) => pattern.test(rel))) continue;
    out.push(rel);
  }
  return out;
}

/**
 * `correct_answer: "something"` / `correctAnswer: 'something'` with a
 * non-empty value. An empty string is a declared-but-unset field, not a fact,
 * and `src/pages/Quiz.tsx` legitimately has one.
 */
const ANSWER_LITERAL = /\b(correct_answer|correctAnswer)\s*:\s*(["'])(?!\2)[^\n]*?\2/g;

describe("no static League facts in production frontend source", () => {
  it("declares no non-empty correct_answer literal outside tests and fixtures", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(join(ROOT, file), "utf8");
      for (const match of source.matchAll(ANSWER_LITERAL)) {
        offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(
      offenders,
      "A League answer written into production source is an authority nothing " +
        "reconciles. Fetch it from /api/quiz/questions, or move it into a file " +
        "whose name says it is a fixture.",
    ).toEqual([]);
  });

  it("keeps the Broadcast Studio's offline fallback free of League content", () => {
    // The DATA, not the source text: this file's own comments necessarily name
    // the League entities the deleted questions asserted, and a text scan
    // would be a guard that fails on its own explanation.
    const blob = JSON.stringify(MOCK_BROADCAST_QUESTIONS).toLowerCase();

    // A sample across the entity kinds those questions covered — champion,
    // items, item components, a summoner spell — plus the `patch` stamp that
    // made the staleness invisible.
    const LEAGUE_TERMS = [
      "ahri", "rabadon", "infinity edge", "bloodthirster", "sheen",
      "trinity force", "b.f. sword", "pickaxe", "flash", "ignite",
      "amplifying tome", "sapphire crystal", "ruby crystal", "long sword",
      "cloak of agility", "vampiric scepter", "orb of deception",
      "ability power", "attack damage", "cooldown", "\"patch\"",
    ];
    for (const term of LEAGUE_TERMS) {
      expect(
        blob,
        `the offline fallback mentions ${term}; it must be recognisably synthetic`,
      ).not.toContain(term);
    }

    // And it must still be a usable fixture: every entry answerable, and the
    // answer one of its own options.
    for (const question of MOCK_BROADCAST_QUESTIONS) {
      const answer = (question.metadata as Record<string, unknown> | undefined)
        ?.correct_answer;
      expect(typeof answer).toBe("string");
      expect(question.choices).toContain(answer);
    }
  });
});
