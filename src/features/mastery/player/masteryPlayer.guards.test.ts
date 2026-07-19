import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useMasteryFixtureSession } from "./useMasteryFixtureSession";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceFiles = readdirSync(here).filter(
  (f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"),
);

// Strip comments so scans judge executable code only.
const codeOf = (file: string): string =>
  readFileSync(path.join(here, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("formula-authority prohibition (player package source scan)", () => {
  it("contains no game-formula / correctness / hashing / eval logic", () => {
    const forbidden = [
      /final_cooldown\s*\(/,
      /createHash|sha256|content_hash/i,
      /100\s*\/\s*\(\s*100\s*\+/,
      /\*\s*0\.85/,
      /Math\.(pow|sqrt)\s*\(/,
      /\beval\s*\(/,
      /new\s+Function\s*\(/,
    ];
    for (const file of sourceFiles) {
      const src = codeOf(file);
      for (const pattern of forbidden) {
        expect(pattern.test(src), `${file} matched ${pattern}`).toBe(false);
      }
    }
  });

  it("makes no network / Supabase / env calls", () => {
    for (const file of sourceFiles) {
      const src = codeOf(file);
      expect(/\bfetch\s*\(/.test(src), `${file} calls fetch`).toBe(false);
      expect(/supabase/i.test(src), `${file} references supabase`).toBe(false);
      expect(/import\.meta\.env/.test(src), `${file} reads env`).toBe(false);
    }
  });

  it("never imports the reviewer artifact fixture or review contracts", () => {
    for (const file of sourceFiles) {
      const src = codeOf(file);
      expect(/reviewArtifactEnvelope/.test(src), `${file} imports reviewArtifactEnvelope`).toBe(false);
      expect(/from\s+["'][^"']*contracts\/review["']/.test(src), `${file} imports review contract`).toBe(false);
    }
  });
});

describe("session reveal gating", () => {
  it("exposes no reveal before submit and surfaces it only after submit", async () => {
    const { result } = renderHook(() => useMasteryFixtureSession());

    expect(result.current.phase).toBe("intro");
    expect(result.current.reveal).toBeNull();

    act(() => result.current.start());
    expect(result.current.phase).toBe("question");
    expect(result.current.question).not.toBeNull();
    expect(result.current.reveal).toBeNull(); // pre-submission: no answer evidence

    await act(async () => {
      result.current.submit(3);
      await Promise.resolve(); // flush the submitting → reveal microtask
    });
    expect(result.current.phase).toBe("reveal");
    expect(result.current.reveal).not.toBeNull();
    expect(result.current.reveal?.authoritativeCorrectness).toBe(true);
  });
});
