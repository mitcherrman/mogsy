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

  // Equivalence guard for the char-code check that replaced the 0x00-0x20
  // character-class regex: every code unit in that range must still reject,
  // at any position in the path.
  it("rejects every control character and space in the 0x00-0x20 range", () => {
    for (let code = 0x00; code <= 0x20; code += 1) {
      const smuggled = `/quiz${String.fromCharCode(code)}//evil.com`;
      expect(safeReturnPath(smuggled)).toBe(DEFAULT_RETURN_PATH);
      const trailing = `/quiz${String.fromCharCode(code)}`;
      expect(safeReturnPath(trailing)).toBe(DEFAULT_RETURN_PATH);
    }
  });

  it("rejects unsafe characters wherever they appear in the path", () => {
    expect(safeReturnPath("/ quiz")).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("/quiz ")).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("/qu\tiz")).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("/quiz\r\nLocation:/evil")).toBe(DEFAULT_RETURN_PATH);
    expect(safeReturnPath("/quiz //evil.com")).toBe(DEFAULT_RETURN_PATH);
  });

  it("accepts printable characters from 0x21 upward", () => {
    expect(safeReturnPath("/quiz!")).toBe("/quiz!");
    expect(safeReturnPath("/lol/history?tab=recent&sort=desc")).toBe(
      "/lol/history?tab=recent&sort=desc",
    );
    // Percent-encoded control characters are inert text and stay allowed.
    expect(safeReturnPath("/quiz%0A")).toBe("/quiz%0A");
  });
});
