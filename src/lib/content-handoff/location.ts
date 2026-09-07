/**
 * CON1 Step 3A — where the local Content Workspace lives, and how Admin links
 * into it.
 *
 * PURE module. It holds the loopback port and route as constants so there is
 * one owner: `scripts/quiz-screenshots/server.ts` imports the port to start
 * vite on it, and Admin imports it to build the link. A second literal `5199`
 * is how those two silently diverge.
 *
 * WHY A PLAIN LINK AND NOTHING ELSE
 * Deployed Admin is served over https and the workspace is loopback http. A
 * top-level navigation across that boundary is allowed; a `fetch` is not
 * (mixed content, then CORS, then the private-network rules). So Admin CANNOT
 * know whether the workspace is running, and does not pretend to: the link is
 * always offered, it opens in a new tab, and if nothing is listening the
 * operator sees their browser's own connection error and still has the
 * deterministic Copy command and Copy config beside it. No probe, no
 * extension, no native handler, no daemon.
 *
 * The URL carries only the handoff (`./schema`), which by construction can
 * hold no credential, no backend URL and no diagnostic gate override.
 */

import {
  encodeContentHandoffParams,
  type ContentHandoff,
} from "./schema";

/** Loopback port the render/UI dev server listens on (`npm run content-studio`). */
export const CONTENT_WORKSPACE_PORT = 5199;

/** Loopback host. Never a hostname that could resolve off-machine. */
export const CONTENT_WORKSPACE_HOST = "127.0.0.1";

/** The workspace route inside this same app. */
export const CONTENT_WORKSPACE_PATH = "/dev/content-studio";

export const CONTENT_WORKSPACE_ORIGIN = `http://${CONTENT_WORKSPACE_HOST}:${CONTENT_WORKSPACE_PORT}`;

/** The command that starts the workspace, quoted in the UI when it is not up. */
export const CONTENT_WORKSPACE_START_COMMAND = "npm run content-studio";

/**
 * The deterministic workspace URL for a handoff. Same handoff → byte-identical
 * URL. The origin is a fixed loopback literal, never taken from configuration
 * or from the payload: a handoff that could choose its own host would be an
 * open redirect with a question list attached.
 */
export function buildContentWorkspaceUrl(handoff: ContentHandoff): string {
  return `${CONTENT_WORKSPACE_ORIGIN}${CONTENT_WORKSPACE_PATH}?${encodeContentHandoffParams(handoff)}`;
}
