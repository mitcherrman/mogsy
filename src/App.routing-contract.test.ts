/**
 * Routing guarantees that are security- or privacy-relevant, pinned against
 * the route declarations in App.tsx.
 *
 * These are asserted against the source rather than a rendered tree because
 * App mounts BrowserRouter and every provider itself, so it cannot be rendered
 * at an arbitrary path in jsdom. The declaration IS the contract here: if
 * someone unwraps `/user/:profileId` or re-points `/multiplayer` at the
 * retired lobby, that is exactly the regression worth catching.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

/** The single JSX line declaring a given route path. */
function routeLine(path: string): string {
  const line = source
    .split("\n")
    .find((l) => l.includes(`path="${path}"`) && l.includes("<Route"));
  if (!line) throw new Error(`no <Route> declared for ${path}`);
  return line;
}

describe("route authentication contract", () => {
  it("puts the public profile behind authentication", () => {
    expect(routeLine("/user/:profileId")).toContain("<ProtectedRoute>");
  });

  it("keeps the owner's own profile behind authentication", () => {
    expect(routeLine("/profile")).toContain("<ProtectedRoute>");
  });
});

describe("retired legacy multiplayer routes", () => {
  it("redirects the lobby instead of rendering it", () => {
    expect(routeLine("/multiplayer")).toContain("<Navigate");
    expect(routeLine("/multiplayer")).not.toContain("<Multiplayer");
  });

  it("redirects the in-game route instead of rendering it", () => {
    expect(routeLine("/multiplayer/game/:gameId")).toContain("<Navigate");
    expect(routeLine("/multiplayer/game/:gameId")).not.toContain("<MultiplayerGame");
  });

  it("does not bind the retired lobby components at all", () => {
    // Keeps the stub "Invite Friend" surface out of the bundle entirely.
    expect(source).not.toMatch(/const Multiplayer\s*=/);
    expect(source).not.toMatch(/const MultiplayerGame\s*=/);
  });
});
