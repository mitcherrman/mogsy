import { describe, expect, it } from "vitest";
import {
  assertSafeExportRoot,
  questionSlug,
  runDirName,
  safeSegment,
  screenshotFileName,
  slideFileName,
} from "./paths";

describe("questionSlug", () => {
  it("is deterministic and zero-padded for numeric ids", () => {
    expect(questionSlug(123)).toBe("question_000123");
    expect(questionSlug(123)).toBe(questionSlug(123));
  });
  it("sanitizes string ids", () => {
    expect(questionSlug("fixture: Ahri's Q!")).toBe("question_fixture-ahri-s-q");
  });
  it("rejects ids that reduce to nothing", () => {
    expect(() => questionSlug("///")).toThrow();
  });
});

describe("screenshotFileName", () => {
  it("includes format and state", () => {
    expect(screenshotFileName("vertical", "question")).toBe("vertical_question.png");
    expect(screenshotFileName("mobile-audit", "correct")).toBe("mobile-audit_correct.png");
  });
});

describe("slideFileName", () => {
  it("zero-pads the slide index and includes the slug", () => {
    expect(slideFileName("mobile-social", 1, "question")).toBe("mobile-social_slide-01_question.png");
    expect(slideFileName("mobile-social", 2, "app-cta")).toBe("mobile-social_slide-02_app-cta.png");
    expect(slideFileName("mobile-social", 3, "community")).toBe("mobile-social_slide-03_community.png");
  });
  it("keeps carousel slides ordered lexicographically", () => {
    const names = [1, 2, 3].map((i) => slideFileName("mobile-social", i, "s"));
    expect([...names].sort()).toEqual(names);
  });
});

describe("safeSegment", () => {
  it("strips traversal characters or rejects pure-traversal input", () => {
    expect(() => safeSegment("../..")).toThrow(/safe path segment/);
    expect(safeSegment("a/../b")).toBe("a-b");
  });
});

describe("runDirName", () => {
  it("uses a validated explicit run id", () => {
    expect(runDirName("smoke-1", new Date())).toBe("smoke-1");
    expect(() => runDirName("../evil", new Date())).toThrow(/Invalid run id/);
    expect(() => runDirName("a b", new Date())).toThrow(/Invalid run id/);
  });
  it("formats timestamps deterministically", () => {
    expect(runDirName(undefined, new Date(2026, 6, 13, 2, 0, 0))).toBe("2026-07-13_020000");
  });
});

describe("assertSafeExportRoot", () => {
  it("accepts the default relative root", () => {
    expect(() => assertSafeExportRoot("quiz_content_exports")).not.toThrow();
    expect(() => assertSafeExportRoot("tmp/exports")).not.toThrow();
  });
  it("rejects absolute paths, traversal, public/, src/, empty", () => {
    expect(() => assertSafeExportRoot("C:/exports")).toThrow(/relative/);
    expect(() => assertSafeExportRoot("/exports")).toThrow(/relative/);
    expect(() => assertSafeExportRoot("../outside")).toThrow(/traversal/);
    expect(() => assertSafeExportRoot("a/../b")).toThrow(/traversal/);
    expect(() => assertSafeExportRoot("public/shots")).toThrow(/public/);
    expect(() => assertSafeExportRoot("src/shots")).toThrow(/src/);
    expect(() => assertSafeExportRoot("  ")).toThrow(/empty/);
  });
});
