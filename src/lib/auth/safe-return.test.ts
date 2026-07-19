import { describe, expect, it } from "vitest";
import { safeReturnPath, DEFAULT_RETURN_PATH } from "./safe-return";

describe("safeReturnPath", () => {
  it("accepts ordinary same-origin absolute paths", () => {
    expect(safeReturnPath("/quiz")).toBe("/quiz");
    expect(safeReturnPath("/profile")).toBe("/profile");
    expect(safeReturnPath("/lol/history?tab=recent")).toBe("/lol/history?tab=recent");
  });

  it("rejects protocol-relative open-redirect targets", () => {
    expect(safeReturnPath("//evil.com")).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("//evil.com/path")).toBe(DEFAULT_RETURN_PATH);
  });

  it("rejects backslash-smuggled hosts", () => {
    expect(safeReturnPath("/\\evil.com")).toBe(DEFAULT_RETURN_PATH);
  });

  it("rejects absolute URLs", () => {
    expect(safeReturnPath("https://evil.com")).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("http://evil.com")).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("javascript:alert(1)")).toBe(DEFAULT_RETURN_PATH);
  });

  it("rejects control-character / whitespace smuggling", () => {
    expect(safeReturnPath("/quiz\n//evil.com")).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath(" /quiz")).toBe(DEFAULT_RETURN_PATH);
  });

  it("falls back for empty / null / non-string input", () => {
    expect(safeReturnPath(null)).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath(undefined)).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("")).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("relative")).toBe(DEFAULT_RETURN_PATH);
  });

  it("honors a custom fallback", () => {
    expect(safeReturnPath("//evil.com", "/home")).toBe("/home");
  });
});
